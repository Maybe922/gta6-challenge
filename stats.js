// 公共统计：被 server.js（今日战报）与 bot.js（Telegram 记账）共用。
// 单一真源，避免两处各算一套导致口径不一致。
import { getData } from "./db.js";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ymdStr(dt) {
  return (
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}

export const yuanStr = (n) =>
  "¥" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });

// 用真实数据算出某天的进度快照（默认今天）
export function dailyStats(dateStr) {
  const data = getData();
  const cfg = data.config || {};
  const entries = data.entries || [];
  const today = DATE_RE.test(String(dateStr)) ? String(dateStr) : ymdStr(new Date());

  const todayEntries = entries.filter((e) => e.date === today);
  const todaySum = todayEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gItems = Array.isArray(cfg.goalItems) ? cfg.goalItems : [];
  const goal = gItems.length
    ? gItems.reduce((s, i) => s + (Number(i.price) || 0), 0)
    : Number(cfg.goalAmount) || 0;
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

  const deadline = (() => {
    const [y, m, d] = String(cfg.deadline || "2026-11-19").split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    dt.setHours(23, 59, 59, 999);
    return dt;
  })();
  const [ty, tm, td] = today.split("-").map(Number);
  const todayDt = new Date(ty, (tm || 1) - 1, td || 1);
  const daysLeft = Math.max(0, Math.ceil((deadline - todayDt) / 86400000));

  return { today, todaySum, todayEntries, total, goal, pct, daysLeft, monthDay: tm + "月" + td + "日" };
}
