// SQLite 数据层（better-sqlite3，同步、单文件、零运维）
// - DB 真源：data/challenge.db（gitignore）
// - 种子：public/data/challenge.json（提交进 git，仅在 DB 为空时导入一次，运行时只读）
// - 兜底：运行时生成 public/data/challenge.js（前台 fetch 失败时回退，gitignore）
import Database from "better-sqlite3";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "data", "challenge.db");
const SEED_JSON = join(__dirname, "public", "data", "challenge.json");
const FALLBACK_JS = join(__dirname, "public", "data", "challenge.js");

let db;

export function initDb() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id      TEXT PRIMARY KEY,
      date    TEXT NOT NULL,
      project TEXT NOT NULL,
      amount  REAL NOT NULL,
      note    TEXT NOT NULL DEFAULT '',
      link    TEXT NOT NULL DEFAULT ''
    );
  `);
  const empty = db.prepare("SELECT COUNT(*) AS c FROM config").get().c === 0;
  if (empty) seedFromJson();
  writeFallback();
}

function seedFromJson() {
  let seed = { config: {}, entries: [] };
  if (existsSync(SEED_JSON)) {
    try { seed = JSON.parse(readFileSync(SEED_JSON, "utf8")); } catch (_) {}
  }
  const insC = db.prepare("INSERT OR REPLACE INTO config(key, value) VALUES(?, ?)");
  const insE = db.prepare(
    "INSERT OR IGNORE INTO entries(id, date, project, amount, note, link) VALUES(@id,@date,@project,@amount,@note,@link)"
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(seed.config || {})) insC.run(k, JSON.stringify(v));
    for (const e of seed.entries || []) {
      insE.run({
        id: e.id || crypto.randomUUID(),
        date: e.date, project: e.project,
        amount: Number(e.amount) || 0,
        note: e.note || "", link: e.link || "",
      });
    }
  })();
}

function getConfig() {
  const rows = db.prepare("SELECT key, value FROM config").all();
  const c = {};
  for (const r of rows) {
    try { c[r.key] = JSON.parse(r.value); } catch (_) { c[r.key] = r.value; }
  }
  return c;
}

function getEntries() {
  return db.prepare("SELECT id, date, project, amount, note, link FROM entries ORDER BY rowid").all();
}

export function getData() {
  return { config: getConfig(), entries: getEntries() };
}

export function addEntry(v) {
  const entry = { id: crypto.randomUUID(), ...v };
  db.prepare(
    "INSERT INTO entries(id, date, project, amount, note, link) VALUES(@id,@date,@project,@amount,@note,@link)"
  ).run(entry);
  writeFallback();
  return entry;
}

export function updateEntry(id, v) {
  const r = db.prepare(
    "UPDATE entries SET date=@date, project=@project, amount=@amount, note=@note, link=@link WHERE id=@id"
  ).run({ id, ...v });
  if (r.changes === 0) return null;
  writeFallback();
  return { id, ...v };
}

export function deleteEntry(id) {
  const r = db.prepare("DELETE FROM entries WHERE id = ?").run(id);
  if (r.changes === 0) return false;
  writeFallback();
  return true;
}

export function patchConfig(patch) {
  const ins = db.prepare("INSERT OR REPLACE INTO config(key, value) VALUES(?, ?)");
  db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) ins.run(k, JSON.stringify(v));
  })();
  writeFallback();
  return getConfig();
}

// 生成前台静态兜底（fetch /api/challenge 失败时用）
function writeFallback() {
  try {
    const json = JSON.stringify(getData(), null, 2);
    writeFileSync(
      FALLBACK_JS,
      "/* 自动生成（来自 SQLite）。改数据请用 /admin 或直接操作 data/challenge.db。 */\n" +
        "window.CHALLENGE = " + json + ";\n"
    );
  } catch (_) {}
}
