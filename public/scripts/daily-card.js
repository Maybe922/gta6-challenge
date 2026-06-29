/* 今日战报卡片绘制（1080×1350 竖版）
   纯 canvas，数字用代码精准绘制，绝不写错。
   window.drawDailyCard(canvas, { data, bgImg, piggyImg, date }) */
(function () {
  "use strict";

  const W = 1080, H = 1350;

  // 颜色（与网站一致）
  const C = {
    cream: "#f8f8f0", card: "#faf7ef", soft: "#f3ecd9",
    brown: "#5a3d20", body: "#725d42", dim: "#9f927d", line: "#e6dcc5",
    mint: "#11a89b", green: "#5a9e1e", greenLt: "#6fba2c",
    gold: "#ffcc00", goldD: "#e0b800", red: "#e05a5a", border: "#cab892",
  };

  const yuan = (n) => "¥" + Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  function parseDate(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
  function ymd(dt) {
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }

  // 覆盖式绘制背景图
  function drawCover(ctx, img) {
    const ir = img.width / img.height, cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
    else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  window.drawDailyCard = function (canvas, opts) {
    const { data, bgImg, piggyImg } = opts;
    const date = opts.date || new Date();
    const cfg = data.config || {};
    const entries = data.entries || [];

    const todayStr = ymd(date);
    const todayEntries = entries.filter((e) => e.date === todayStr);
    const todaySum = todayEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const total = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const items = Array.isArray(cfg.goalItems) ? cfg.goalItems : [];
    const goal = items.length ? items.reduce((s, i) => s + (Number(i.price) || 0), 0) : Number(cfg.goalAmount) || 0;
    const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;

    const deadline = parseDate(cfg.deadline || "2026-11-19"); deadline.setHours(23, 59, 59, 999);
    const daysLeft = Math.max(0, Math.ceil((deadline - date) / 86400000));

    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // 背景
    if (bgImg) drawCover(ctx, bgImg); else { ctx.fillStyle = "#bfe9d6"; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(0, 0, W, H);

    // ── 主面板 ──
    const PX = 56, PY = 150, PW = W - 112, PH = H - 252;
    ctx.save();
    ctx.shadowColor = "rgba(60,50,30,0.28)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    rr(ctx, PX, PY, PW, PH, 44); ctx.fillStyle = C.card; ctx.fill();
    ctx.restore();
    rr(ctx, PX, PY, PW, PH, 44); ctx.lineWidth = 5; ctx.strokeStyle = C.border; ctx.stroke();

    const ix = PX + 56;            // 内容左边
    const iw = PW - 112;           // 内容宽
    let cy = PY + 56;              // 游标

    // ── 头部：小猪 + 努力奋战 + 日期 ──
    const logoS = 104;
    if (piggyImg) ctx.drawImage(piggyImg, ix, cy, logoS, logoS);
    ctx.fillStyle = C.brown; ctx.font = '900 50px Nunito, "Noto Sans SC", sans-serif'; ctx.textAlign = "left";
    ctx.fillText("努力奋战", ix + logoS + 24, cy + 46);
    ctx.fillStyle = C.dim; ctx.font = '700 30px Nunito, "Noto Sans SC", sans-serif';
    const dstr = (date.getMonth() + 1) + "月" + date.getDate() + "日 · 公开挑战日志";
    ctx.fillText(dstr, ix + logoS + 24, cy + 90);
    cy += logoS + 40;

    // ── 两个大数据块：今日进账 / 还剩天数 ──
    const gap = 24, tileW = (iw - gap) / 2, tileH = 240;
    function tile(tx, label, big, bigColor, sub) {
      rr(ctx, tx, cy, tileW, tileH, 28); ctx.fillStyle = C.soft; ctx.fill();
      rr(ctx, tx, cy, tileW, tileH, 28); ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.stroke();
      ctx.textAlign = "center"; const cx = tx + tileW / 2;
      ctx.fillStyle = C.dim; ctx.font = '800 30px Nunito, "Noto Sans SC", sans-serif';
      ctx.fillText(label, cx, cy + 56);
      ctx.fillStyle = bigColor; ctx.font = '900 96px Nunito, "Noto Sans SC", sans-serif';
      ctx.fillText(big, cx, cy + 158);
      if (sub) { ctx.fillStyle = C.body; ctx.font = '800 30px Nunito, "Noto Sans SC", sans-serif'; ctx.fillText(sub, cx, cy + 208); }
    }
    tile(ix, "今天进账", (todaySum > 0 ? "+" : "") + yuan(todaySum), todaySum > 0 ? C.green : C.dim, todaySum > 0 ? "离沙发又近一步" : "蓄力中…");
    tile(ix + tileW + gap, "距 GTA6 发售", String(daysLeft), C.red, "天");
    cy += tileH + 40;

    // ── 进度条 ──
    ctx.textAlign = "left"; ctx.fillStyle = C.body; ctx.font = '800 32px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillText("累计已攒 " + yuan(total), ix, cy + 26);
    ctx.textAlign = "right"; ctx.fillStyle = C.mint; ctx.font = '900 32px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillText("/ " + yuan(goal), ix + iw, cy + 26);
    ctx.textAlign = "left";
    cy += 50;
    const barH = 34;
    rr(ctx, ix, cy, iw, barH, 17); ctx.fillStyle = "#ece4cf"; ctx.fill();
    rr(ctx, ix, cy, iw, barH, 17); ctx.lineWidth = 3; ctx.strokeStyle = C.line; ctx.stroke();
    const fillW = Math.max(barH, (pct / 100) * iw);
    ctx.save(); rr(ctx, ix, cy, iw, barH, 17); ctx.clip();
    const grd = ctx.createLinearGradient(0, cy, 0, cy + barH);
    grd.addColorStop(0, "#86d67a"); grd.addColorStop(1, C.greenLt);
    ctx.fillStyle = grd; rr(ctx, ix, cy, fillW, barH, 17); ctx.fill();
    ctx.restore();
    cy += barH + 14;
    ctx.fillStyle = C.green; ctx.font = '900 30px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillText("已完成 " + pct.toFixed(1) + "%", ix, cy + 26);
    cy += 64;

    // ── 今日明细 ──
    ctx.fillStyle = C.brown; ctx.font = '900 34px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillText("今日进账明细", ix, cy + 24); cy += 56;
    ctx.font = '700 32px Nunito, "Noto Sans SC", sans-serif';
    if (todayEntries.length === 0) {
      ctx.fillStyle = C.dim;
      ctx.fillText("今天还没进账，明天继续努力 💪", ix, cy + 24); cy += 50;
    } else {
      todayEntries.slice(0, 4).forEach((e) => {
        ctx.fillStyle = C.body; ctx.textAlign = "left";
        let name = e.project || "进账"; if (name.length > 14) name = name.slice(0, 14) + "…";
        ctx.fillText("· " + name, ix, cy + 24);
        ctx.fillStyle = C.green; ctx.textAlign = "right"; ctx.font = '900 32px Nunito, "Noto Sans SC", sans-serif';
        ctx.fillText("+" + yuan(e.amount), ix + iw, cy + 24);
        ctx.textAlign = "left"; ctx.font = '700 32px Nunito, "Noto Sans SC", sans-serif';
        cy += 48;
      });
      if (todayEntries.length > 4) { ctx.fillStyle = C.dim; ctx.fillText("…等共 " + todayEntries.length + " 笔", ix, cy + 24); cy += 48; }
    }

    // ── 口号 + 网址（贴底） ──
    const slogan = todaySum > 0 ? "一块一块攒，11/19 沙发上见 🎮" : "慢慢来，沙发在等我 🛋️";
    ctx.textAlign = "center"; ctx.fillStyle = C.brown; ctx.font = '900 38px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillText(slogan, PX + PW / 2, PY + PH - 96);
    // 网址胶囊
    const url = "earn2play.fun"; ctx.font = '900 34px Nunito, "Noto Sans SC", sans-serif';
    const uw = ctx.measureText(url).width + 64, uh = 64, ux = PX + PW / 2 - uw / 2, uy = PY + PH - 64;
    ctx.save(); ctx.shadowColor = C.goldD; ctx.shadowBlur = 0; ctx.shadowOffsetY = 5;
    rr(ctx, ux, uy, uw, uh, 32); ctx.fillStyle = C.gold; ctx.fill(); ctx.restore();
    ctx.fillStyle = "#7a5a00"; ctx.fillText(url, PX + PW / 2, uy + 44);
  };
})();
