// Telegram 记账 bot —— 长轮询（getUpdates），无需公网 webhook。
// 给 bot 发「闲鱼卖资料 35」即记一笔，金额放最后，日期默认今天。
// 只认主人（TG_ALLOWED_USER_ID），别人发消息一律拒绝。
// 未配置 TG_BOT_TOKEN 时不启动，对现有 Web 服务零影响。
import { addEntry } from "./db.js";
import { dailyStats, yuanStr, DATE_RE, ymdStr } from "./stats.js";

const MAX_PROJECT = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Telegram API ────────────────────────────────────────
const apiUrl = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

async function tgCall(token, method, payload, timeoutMs = 65000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(apiUrl(token, method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function send(token, chatId, text) {
  return tgCall(
    token,
    "sendMessage",
    { chat_id: chatId, text, disable_web_page_preview: true },
    15000
  ).catch(() => {});
}

// ── 解析一行自然语言成一笔账 ────────────────────────────
// 规则：可选「前导日期」 + 项目名 + 「末尾金额」。金额放最后，
// 这样项目名里带数字（如 STM32）也不会被误当成金额。
export function parseEntry(text) {
  let rest = text.trim();
  let date = ymdStr(new Date());

  const full = rest.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b\s*/);
  const md = rest.match(/^(\d{1,2})[-/](\d{1,2})\b\s*/);
  if (full) {
    date = `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
    rest = rest.slice(full[0].length).trim();
  } else if (md) {
    const y = new Date().getFullYear();
    date = `${y}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;
    rest = rest.slice(md[0].length).trim();
  }

  const amt = rest.match(/¥?\s*(\d[\d,]*(?:\.\d+)?)\s*元?\s*$/);
  if (!amt) {
    return { error: "没看懂金额～ 把金额放最后，比如「闲鱼卖资料 35」或「6-28 闲鱼卖资料 35」" };
  }
  const amount = Number(amt[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "金额得是大于 0 的数字哦" };

  let project = rest.slice(0, amt.index).trim().replace(/\s+/g, " ");
  if (!project) return { error: "还差个项目名，比如「闲鱼卖资料 35」" };
  if (project.length > MAX_PROJECT) project = project.slice(0, MAX_PROJECT);

  if (!DATE_RE.test(date)) return { error: "日期格式不对（用 2026-06-28 或 6-28）" };
  return { value: { date, project, amount: Math.round(amount * 100) / 100, note: "", link: "" } };
}

// ── 文案 ────────────────────────────────────────────────
function helpText() {
  return [
    "🏝️ 攒钱岛记账 bot",
    "",
    "直接发一笔账（金额放最后）：",
    "· 闲鱼卖资料 35",
    "· 双吉AI 出单 9.9",
    "· 6-28 闲鱼卖资料 35  （补记某天，默认今天）",
    "",
    "/total  看当前进度",
    "/help   看帮助",
  ].join("\n");
}

function statsLine(s) {
  return (
    `今日进账 ${yuanStr(s.todaySum)} · 累计 ${yuanStr(s.total)} / ${yuanStr(s.goal)}（${s.pct.toFixed(1)}%）\n` +
    `距 GTA6 还剩 ${s.daysLeft} 天 🎮`
  );
}

async function handleMessage(token, msg) {
  const chatId = msg.chat && msg.chat.id;
  const text = (msg.text || "").trim();
  if (!chatId || !text) return;

  if (text === "/start" || text === "/help") return send(token, chatId, helpText());
  if (text === "/total" || text === "/stats") {
    return send(token, chatId, "📊 当前进度\n" + statsLine(dailyStats()));
  }
  if (text.startsWith("/")) return send(token, chatId, "没有这个命令～\n\n" + helpText());

  const parsed = parseEntry(text);
  if (parsed.error) return send(token, chatId, "⚠️ " + parsed.error);

  let entry;
  try {
    entry = addEntry(parsed.value);
  } catch (_) {
    return send(token, chatId, "❌ 没存上，稍后再发一次试试");
  }
  const s = dailyStats(entry.date);
  const reply =
    "✅ 记好啦！\n" +
    `📅 ${entry.date}\n` +
    `📝 ${entry.project}  +${yuanStr(entry.amount)}\n` +
    "————\n" +
    statsLine(s);
  return send(token, chatId, reply);
}

// ── 主循环 ──────────────────────────────────────────────
// 启动先排空积压，避免重启时把停机期间的旧消息重复记一遍。
async function drain(token) {
  try {
    const res = await tgCall(token, "getUpdates", { offset: -1, timeout: 0 }, 15000);
    const list = (res && res.ok && res.result) || [];
    if (list.length) return list[list.length - 1].update_id + 1;
  } catch (_) {}
  return 0;
}

async function loop(token, ownerId) {
  let offset = await drain(token);
  console.log("  🤖 Telegram 记账 bot 已上线");
  for (;;) {
    let updates;
    try {
      const res = await tgCall(token, "getUpdates", { offset, timeout: 50 });
      updates = (res && res.ok && res.result) || [];
    } catch (_) {
      await sleep(3000);
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message || u.edited_message;
      if (!msg || !msg.from) continue;
      if (String(msg.from.id) !== ownerId) {
        if (msg.chat && msg.chat.id) send(token, msg.chat.id, "🚫 这是私人记账 bot，不对外开放～");
        continue;
      }
      try {
        await handleMessage(token, msg);
      } catch (e) {
        console.error("[bot] 处理消息出错", e);
      }
    }
  }
}

export function startBot() {
  const token = process.env.TG_BOT_TOKEN;
  const ownerId = String(process.env.TG_ALLOWED_USER_ID || "").trim();
  if (!token) return; // 未配置则静默跳过
  if (!ownerId) {
    console.log("  ⚠️ 设了 TG_BOT_TOKEN 但缺 TG_ALLOWED_USER_ID，bot 不启动（避免谁都能往你账上记）");
    return;
  }
  loop(token, ownerId).catch((e) => console.error("[bot] 致命错误", e));
}
