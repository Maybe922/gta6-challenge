/* 今日战报卡片绘制（1080×1350 竖版）—— 电影海报式
   AI 现画的图当主视觉铺满，数据用暗角渐变 + 白字融进画面，不要大白卡。
   数字用代码精准绘制，绝不写错。
   window.drawDailyCard(canvas, { data, bgImg, piggyImg, date }) */
(function () {
  "use strict";

  const W = 1080, H = 1350;
  const yuan = (n) => "¥" + Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  function parseDate(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
  function ymd(dt) { return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0"); }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }
  function drawCover(ctx, img) {
    const ir = img.width / img.height, cr = W / H;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0; }
    else { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  // 带柔和阴影的文字（保证任意背景上都清晰）
  function shadowText(ctx, text, x, y, blur) {
    ctx.save();
    ctx.shadowColor = "rgba(20,14,6,0.55)"; ctx.shadowBlur = blur || 12; ctx.shadowOffsetY = 2;
    ctx.fillText(text, x, y);
    ctx.restore();
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
    const gItems = Array.isArray(cfg.goalItems) ? cfg.goalItems : [];
    const goal = gItems.length ? gItems.reduce((s, i) => s + (Number(i.price) || 0), 0) : Number(cfg.goalAmount) || 0;
    const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
    const deadline = parseDate(cfg.deadline || "2026-11-19"); deadline.setHours(23, 59, 59, 999);
    const daysLeft = Math.max(0, Math.ceil((deadline - date) / 86400000));

    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";

    // 背景：AI 图铺满
    if (bgImg) drawCover(ctx, bgImg); else { ctx.fillStyle = "#bfe9d6"; ctx.fillRect(0, 0, W, H); }

    // 顶部轻微压暗（给品牌头）
    let g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, "rgba(20,14,6,0.42)"); g.addColorStop(1, "rgba(20,14,6,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 240);

    // 下半部分暗角渐变（数据区，融进画面，不是白盒）
    g = ctx.createLinearGradient(0, 560, 0, H);
    g.addColorStop(0, "rgba(24,16,8,0)");
    g.addColorStop(0.42, "rgba(24,16,8,0.55)");
    g.addColorStop(1, "rgba(20,12,4,0.9)");
    ctx.fillStyle = g; ctx.fillRect(0, 560, W, H - 560);

    const PADX = 72;

    // ── 顶部品牌头 ──
    if (piggyImg) {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
      ctx.drawImage(piggyImg, PADX, 56, 96, 96); ctx.restore();
    }
    ctx.textAlign = "left"; ctx.fillStyle = "#fff";
    ctx.font = '900 50px Nunito, "Noto Sans SC", sans-serif';
    shadowText(ctx, "努力奋战", PADX + 116, 110, 14);
    ctx.font = '700 30px Nunito, "Noto Sans SC", sans-serif'; ctx.fillStyle = "rgba(255,255,255,0.92)";
    shadowText(ctx, (date.getMonth() + 1) + "月" + date.getDate() + "日 · 公开挑战日志", PADX + 116, 150, 10);

    // ── 两个大数据（无盒，直接白字大号 + 暗角衬底） ──
    const colMid = W / 2;
    const labY = 800, numY = 905;
    ctx.textAlign = "center";
    // 左：今日进账
    ctx.fillStyle = "rgba(255,255,255,0.86)"; ctx.font = '800 34px Nunito, "Noto Sans SC", sans-serif';
    shadowText(ctx, "今天进账", PADX + (colMid - PADX) / 2 + 0, labY, 10);
    ctx.font = '900 116px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillStyle = todaySum > 0 ? "#9fe870" : "#ffffff";
    shadowText(ctx, (todaySum > 0 ? "+" : "") + yuan(todaySum), (PADX + colMid) / 2, numY, 18);
    // 右：还剩天数
    ctx.fillStyle = "rgba(255,255,255,0.86)"; ctx.font = '800 34px Nunito, "Noto Sans SC", sans-serif';
    shadowText(ctx, "距 GTA6 发售", (colMid + W - PADX) / 2, labY, 10);
    ctx.fillStyle = "#ffd24d"; ctx.font = '900 116px Nunito, "Noto Sans SC", sans-serif';
    const dxc = (colMid + W - PADX) / 2;
    ctx.save(); ctx.shadowColor = "rgba(20,14,6,0.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
    const dStr = String(daysLeft), dW = ctx.measureText(dStr).width;
    ctx.font = '900 116px Nunito, "Noto Sans SC", sans-serif';
    ctx.textAlign = "left"; ctx.fillText(dStr, dxc - dW / 2 - 18, numY);
    ctx.font = '900 44px Nunito, "Noto Sans SC", sans-serif';
    ctx.fillText("天", dxc + dW / 2 - 6, numY);
    ctx.restore();
    ctx.textAlign = "center";

    // 分隔竖线
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(colMid, labY - 26); ctx.lineTo(colMid, numY - 6); ctx.stroke();

    // ── 进度条 ──
    let cy = 985;
    ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = '800 32px Nunito, "Noto Sans SC", sans-serif';
    shadowText(ctx, "累计已攒 " + yuan(total), PADX, cy, 8);
    ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,0.85)";
    shadowText(ctx, "/ " + yuan(goal) + " · " + pct.toFixed(1) + "%", W - PADX, cy, 8);
    ctx.textAlign = "left";
    cy += 26;
    const barW = W - PADX * 2, barH = 22;
    rr(ctx, PADX, cy, barW, barH, 11); ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill();
    const fillW = Math.max(barH, (pct / 100) * barW);
    ctx.save(); rr(ctx, PADX, cy, barW, barH, 11); ctx.clip();
    const grd = ctx.createLinearGradient(0, cy, 0, cy + barH);
    grd.addColorStop(0, "#aef07f"); grd.addColorStop(1, "#6fba2c");
    ctx.fillStyle = grd; rr(ctx, PADX, cy, fillW, barH, 11); ctx.fill(); ctx.restore();
    cy += barH + 52;

    // ── 今日明细 ──
    ctx.fillStyle = "#fff"; ctx.font = '900 32px Nunito, "Noto Sans SC", sans-serif';
    shadowText(ctx, "今日进账明细", PADX, cy, 8); cy += 46;
    ctx.font = '700 30px Nunito, "Noto Sans SC", sans-serif';
    if (todayEntries.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      shadowText(ctx, "今天还没进账，明天继续努力 💪", PADX, cy, 8); cy += 44;
    } else {
      todayEntries.slice(0, 3).forEach((e) => {
        ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.textAlign = "left";
        let name = e.project || "进账"; if (name.length > 13) name = name.slice(0, 13) + "…";
        shadowText(ctx, "· " + name, PADX, cy, 8);
        ctx.fillStyle = "#9fe870"; ctx.textAlign = "right"; ctx.font = '900 30px Nunito, "Noto Sans SC", sans-serif';
        shadowText(ctx, "+" + yuan(e.amount), W - PADX, cy, 8);
        ctx.textAlign = "left"; ctx.font = '700 30px Nunito, "Noto Sans SC", sans-serif';
        cy += 44;
      });
      if (todayEntries.length > 3) { ctx.fillStyle = "rgba(255,255,255,0.7)"; shadowText(ctx, "…共 " + todayEntries.length + " 笔", PADX, cy, 8); cy += 44; }
    }

    // ── 口号 + 网址（贴底） ──
    const slogan = todaySum > 0 ? "一块一块攒，11/19 沙发上见 🎮" : "慢慢来，沙发在等我 🛋️";
    ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = '900 38px Nunito, "Noto Sans SC", sans-serif';
    shadowText(ctx, slogan, W / 2, H - 116, 12);
    const url = "earn2play.fun"; ctx.font = '900 34px Nunito, "Noto Sans SC", sans-serif';
    const uw = ctx.measureText(url).width + 64, uh = 62, ux = W / 2 - uw / 2, uy = H - 86;
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    rr(ctx, ux, uy, uw, uh, 31); ctx.fillStyle = "#ffcc00"; ctx.fill(); ctx.restore();
    ctx.fillStyle = "#6b4e00"; ctx.fillText(url, W / 2, uy + 43);
  };
})();
