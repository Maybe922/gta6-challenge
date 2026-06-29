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

// ── 今日战报：调 gpt-image-2 现生成背景图（需登录） ─────
const DAILY_SCENES = [
  "golden-hour island sky with fluffy pastel clouds and gentle rolling green hills with a few cute rounded trees",
  "cozy starry night island with a big soft glowing moon, twinkling stars and fireflies, little houses with warm glowing windows along the bottom",
  "festive celebration scene with gently falling shiny gold coins, confetti ribbons, sparkles and flowers around the edges",
  "a cozy sunlit room corner with a window, leafy potted plants, soft warm light and a few gold coins on a wooden floor",
  "a pastel beach at dawn with calm water, palm trees, seashells and soft clouds",
  "a flowery green meadow at sunset with butterflies, sparkles and distant soft hills",
  "a cozy rainy window view with warm indoor light, plants and soft bokeh raindrops",
  "an autumn island with warm orange foliage, falling leaves, pumpkins and a soft sky",
];

function buildDailyPrompt() {
  const scene = DAILY_SCENES[Math.floor(Math.random() * DAILY_SCENES.length)];
  return (
    "A cozy Animal Crossing-inspired " + scene +
    ", soft cel-shaded vector game-art style, vertical portrait composition. " +
    "Palette of grass green, mint, warm cream, soft gold and gentle pastels, soft rounded shapes, " +
    "gentle shading, wholesome and dreamy mood, with a calm uncluttered area in the upper-middle for overlaying text. " +
    "No people, no animals, NO text, no words, no letters, no numbers, no UI, no logos."
  );
}

async function generateDailyBg() {
  const key = process.env.CNAI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.CNAI_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
  if (!key || !base) throw new Error("服务器未配置图像 API（CNAI_API_KEY / CNAI_BASE_URL）");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 175000);
  try {
    const r = await fetch(base + "/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model: "gpt-image-2", prompt: buildDailyPrompt(), size: "1024x1536", quality: "high", n: 1 }),
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

app.post("/api/daily-image", requireAuth, async (_req, res) => {
  try {
    res.json({ image: await generateDailyBg() });
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
