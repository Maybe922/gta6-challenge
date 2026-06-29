// 用 Claude 攒零钱玩上 GTA6 —— 前台 + 后台记账服务
// 存储：SQLite（data/challenge.db），见 db.js。
import express from "express";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initDb, getData, addEntry, updateEntry, deleteEntry, patchConfig } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");

const PORT = process.env.PORT || 3000;
// 后台密码：务必通过环境变量设置。默认值仅供本地试用。
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "gta6-island";
const COOKIE = "gta6_admin";

// 内存会话（重启即失效，需要重新登录）
const sessions = new Set();

initDb();

const app = express();
app.use(express.json());

// ── 校验 ────────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateEntry(body) {
  const errors = [];
  const date = String(body.date || "").trim();
  const project = String(body.project || "").trim();
  const amount = Number(body.amount);
  const note = body.note == null ? "" : String(body.note).trim();
  const link = body.link == null ? "" : String(body.link).trim();

  if (!DATE_RE.test(date)) errors.push("日期格式需为 YYYY-MM-DD");
  if (!project) errors.push("项目名不能为空");
  if (!Number.isFinite(amount) || amount <= 0) errors.push("金额需为大于 0 的数字");
  if (project.length > 60) errors.push("项目名过长");
  if (note.length > 200) errors.push("备注过长");
  if (link && !/^https?:\/\//.test(link)) errors.push("链接需以 http(s):// 开头");

  return { errors, value: { date, project, amount: Math.round(amount * 100) / 100, note, link } };
}

const ICON_SET = new Set(["console", "tv", "disc", "sofa", "pc", "gift"]);

function validateConfig(body) {
  const errors = [];
  const patch = {};

  // 搬家清单：清单驱动目标金额
  if (Array.isArray(body.goalItems)) {
    const items = [];
    for (const it of body.goalItems) {
      const name = String((it && it.name) || "").trim();
      const price = Number(it && it.price);
      if (!name) { errors.push("清单项名称不能为空"); continue; }
      if (!Number.isFinite(price) || price <= 0) { errors.push(`「${name}」价格需为大于 0 的数字`); continue; }
      const icon = ICON_SET.has(it && it.icon) ? it.icon : "gift";
      items.push({ name: name.slice(0, 40), price: Math.round(price), icon });
    }
    if (!errors.length) {
      if (!items.length) errors.push("搬家清单至少要有一件");
      else {
        patch.goalItems = items;
        patch.goalAmount = items.reduce((s, i) => s + i.price, 0);
      }
    }
  } else if (body.goalAmount != null) {
    const g = Number(body.goalAmount);
    if (!Number.isFinite(g) || g <= 0) errors.push("目标金额需为大于 0 的数字");
    else patch.goalAmount = Math.round(g);
  }

  if (body.deadline != null) {
    if (!DATE_RE.test(String(body.deadline))) errors.push("截止日格式需为 YYYY-MM-DD");
    else patch.deadline = body.deadline;
  }
  if (body.startDate != null && DATE_RE.test(String(body.startDate))) patch.startDate = body.startDate;
  for (const k of ["goalLabel", "title", "handle", "socialUrl", "currency"]) {
    if (body[k] != null) patch[k] = String(body[k]).slice(0, 120);
  }
  return { errors, patch };
}

// ── 鉴权 ────────────────────────────────────────────────
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  const token = parseCookies(req)[COOKIE];
  return token && sessions.has(token);
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: "未登录" });
  next();
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── 公开 API ────────────────────────────────────────────
app.get("/api/challenge", (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(getData());
  } catch (e) {
    res.status(500).json({ error: "读取数据失败" });
  }
});

// ── 鉴权 API ────────────────────────────────────────────
app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "密码错误" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.add(token);
  res.cookie?.(COOKIE, token); // express4 无内置 cookie()，下面手动设置
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 30}`
  );
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  const token = parseCookies(req)[COOKIE];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get("/api/session", (req, res) => {
  res.json({ authed: isAuthed(req) });
});

// ── 后台写入 API（需登录） ──────────────────────────────
app.post("/api/entries", requireAuth, (req, res) => {
  const { errors, value } = validateEntry(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join("；") });
  try {
    res.json({ ok: true, entry: addEntry(value) });
  } catch (e) {
    res.status(500).json({ error: "保存失败" });
  }
});

app.put("/api/entries/:id", requireAuth, (req, res) => {
  const { errors, value } = validateEntry(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join("；") });
  try {
    const entry = updateEntry(req.params.id, value);
    if (!entry) return res.status(404).json({ error: "未找到该记录" });
    res.json({ ok: true, entry });
  } catch (e) {
    res.status(500).json({ error: "更新失败" });
  }
});

app.delete("/api/entries/:id", requireAuth, (req, res) => {
  try {
    if (!deleteEntry(req.params.id)) return res.status(404).json({ error: "未找到该记录" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "删除失败" });
  }
});

app.put("/api/config", requireAuth, (req, res) => {
  const { errors, patch } = validateConfig(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join("；") });
  try {
    res.json({ ok: true, config: patchConfig(patch) });
  } catch (e) {
    res.status(500).json({ error: "保存失败" });
  }
});

// ── 今日战报：调 gpt-image-2 整张现画（含数据文字，需登录） ─────
const DAILY_SCENES = [
  "a golden-hour island sky with fluffy pastel clouds and gentle rolling green hills",
  "a cozy starry night island with a big soft glowing moon, twinkling stars and fireflies",
  "a festive scene with gently falling shiny gold coins, confetti ribbons and sparkles",
  "a cozy sunlit room corner with a window, leafy potted plants and warm light",
  "a pastel beach at dawn with calm water, palm trees and soft clouds",
  "a flowery green meadow at sunset with butterflies and sparkles",
  "an autumn island with warm orange foliage, falling leaves and a soft sky",
];

function ymdStr(dt) {
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}

// 用真实数据算出今日战报需要的数字
function dailyStats(dateStr) {
  const data = getData();
  const cfg = data.config || {};
  const entries = data.entries || [];
  const today = DATE_RE.test(String(dateStr)) ? String(dateStr) : ymdStr(new Date());

  const todayEntries = entries.filter((e) => e.date === today);
  const todaySum = todayEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gItems = Array.isArray(cfg.goalItems) ? cfg.goalItems : [];
  const goal = gItems.length ? gItems.reduce((s, i) => s + (Number(i.price) || 0), 0) : Number(cfg.goalAmount) || 0;
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const deadline = (() => {
    const [y, m, d] = String(cfg.deadline || "2026-11-19").split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1); dt.setHours(23, 59, 59, 999); return dt;
  })();
  const [ty, tm, td] = today.split("-").map(Number);
  const todayDt = new Date(ty, (tm || 1) - 1, td || 1);
  const daysLeft = Math.max(0, Math.ceil((deadline - todayDt) / 86400000));

  return { todaySum, todayEntries, total, goal, pct, daysLeft, monthDay: tm + "月" + td + "日" };
}

const yuanStr = (n) => "¥" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

// 口号随机池 —— 每次生成随机抽一句，要的就是 casual、每次都不一样的感觉
const SLOGANS_EARNED = [
  "一块一块攒，11/19 沙发上见 🎮",
  "今天又近了一步 🛋️",
  "进度条 +1，离 GTA6 更近了",
  "钱包鼓一点，沙发近一点",
  "积少成多，开机有望 💪",
  "今天的零钱已就位 ✅",
  "稳住，我们能赢 🐷",
  "离客厅四件套又近一点点",
];
const SLOGANS_IDLE = [
  "慢慢来，沙发在等我 🛋️",
  "今天歇会儿，明天接着冲",
  "没进账也不慌，路还长 🌱",
  "攒钱是场马拉松 🏃",
  "明天继续努力 💪",
  "沙发不急，我也不急 🐷",
  "蓄力中，等一个好项目",
  "稳住节奏，11/19 见",
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 整张海报（含中文 + 数字）的提示词，把真实数据嵌进去让模型直接画出来
function buildDailyPrompt(dateStr) {
  const s = dailyStats(dateStr);
  const scene = DAILY_SCENES[Math.floor(Math.random() * DAILY_SCENES.length)];
  const todayLine = s.todaySum > 0 ? "今天进账 +" + yuanStr(s.todaySum) : "今天进账 ¥0";
  const slogan = pick(s.todaySum > 0 ? SLOGANS_EARNED : SLOGANS_IDLE);

  return (
    "A cute cozy Animal Crossing-inspired vertical poster (portrait), soft cel-shaded vector game-art style. " +
    "Background: " + scene + ". " +
    "Palette of grass green, mint, warm cream and soft gold, soft rounded shapes, gentle shading, wholesome dreamy mood. " +
    "Include one cute mint-green piggy bank with a gold coin near the top. " +
    "This is a daily savings-progress poster. Render ALL of the following text large, crisp and perfectly legible, " +
    "with cute rounded bold lettering, on soft semi-transparent rounded panels so the text stays readable, " +
    "laid out top-to-bottom with clear visual hierarchy. Spell every Chinese character and every number EXACTLY as written:\n" +
    "Title (Chinese): 努力奋战\n" +
    "Subtitle (Chinese): " + s.monthDay + " · 公开挑战日志\n" +
    "Big highlighted line (Chinese + number), bright green: " + todayLine + "\n" +
    "Big highlighted line (Chinese + number), gold: 距 GTA6 发售 " + s.daysLeft + " 天\n" +
    "Progress line (Chinese + numbers): 累计已攒 " + yuanStr(s.total) + " / " + yuanStr(s.goal) + "（" + s.pct.toFixed(1) + "%）\n" +
    "A cute horizontal progress bar filled about " + Math.round(s.pct) + " percent, green fill on a light track.\n" +
    "Slogan at the bottom (Chinese): " + slogan + "\n" +
    "A small pill-shaped website tag: earn2play.fun\n" +
    "Make sure the numbers " + yuanStr(s.todaySum) + ", " + s.daysLeft + ", " + yuanStr(s.total) +
    " and the URL earn2play.fun are spelled correctly. No watermark, no extra random text."
  );
}

async function generateDailyImage(prompt) {
  const key = process.env.CNAI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.CNAI_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  if (!key || !base) throw new Error("服务器未配置图像 API（CNAI_API_KEY / CNAI_BASE_URL）");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 175000);
  try {
    const r = await fetch(base + "/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1024x1536", quality: "high", n: 1 }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error("图像 API 返回 " + r.status + (t ? "：" + t.slice(0, 120) : ""));
    }
    const j = await r.json();
    const item = j && j.data && j.data[0];
    if (item && item.b64_json) return "data:image/png;base64," + item.b64_json;
    if (item && item.url) {
      const ir = await fetch(item.url, { signal: ctrl.signal });
      const buf = Buffer.from(await ir.arrayBuffer());
      return "data:image/png;base64," + buf.toString("base64");
    }
    throw new Error("图像 API 未返回图片");
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/daily-image", requireAuth, async (req, res) => {
  try {
    const prompt = buildDailyPrompt((req.body || {}).date);
    res.json({ image: await generateDailyImage(prompt) });
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "生成超时，请重试" : (e && e.message) || "生成失败";
    res.status(502).json({ error: msg });
  }
});

// ── 静态资源 ────────────────────────────────────────────
app.get("/admin", (_req, res) => res.redirect("/admin.html"));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, p) {
    // html/js 始终重新校验，避免改了代码客户端还用旧缓存
    if (/\.(html|js)$/.test(p)) res.setHeader("Cache-Control", "no-cache");
  },
}));

app.listen(PORT, () => {
  console.log(`\n  🌴 攒零钱岛已启动`);
  console.log(`     前台:  http://localhost:${PORT}/`);
  console.log(`     后台:  http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === "gta6-island") {
    console.log(`     ⚠️  正在使用默认密码，请用 ADMIN_PASSWORD 环境变量设置自己的密码\n`);
  } else {
    console.log("");
  }
});
