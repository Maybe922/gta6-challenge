/* 用 AI 玩上 GTA6 —— 渲染 + 动效
   数据优先从后台 API(/api/challenge) 读取，失败则回退到静态 window.CHALLENGE。 */
(async function () {
  "use strict";

  const data = await loadChallenge();
  if (!data) {
    console.error("缺少挑战数据：API 与 data/challenge.js 均不可用。");
    return;
  }

  async function loadChallenge() {
    try {
      const r = await fetch("/api/challenge", { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch (_) {
      /* 静态 / file:// 预览时回退 */
    }
    return window.CHALLENGE || null;
  }

  const { config, entries } = data;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ── 工具 ────────────────────────────────────────────
  const total = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  // 搬家清单（心愿单）：有清单则目标 = 清单各件之和
  const goalItems = Array.isArray(config.goalItems) ? config.goalItems.slice() : [];
  const goal = goalItems.length
    ? goalItems.reduce((s, it) => s + (Number(it.price) || 0), 0)
    : Number(config.goalAmount) || 0;
  const sym = config.currency || "¥";

  const fmt = (n) =>
    n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

  const fmtMoney = (n) => sym + fmt(Math.round(n * 100) / 100);

  function daysBetween(from, to) {
    const ms = to.getTime() - from.getTime();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  // 把 "YYYY-MM-DD" 解析为当天 00:00 的本地时间
  function parseDate(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  // ── 倒计时 ──────────────────────────────────────────
  const deadline = parseDate(config.deadline);
  // 截止日当天结束（发售日玩一整天）
  deadline.setHours(23, 59, 59, 999);

  const cd = {
    days: $('[data-cd="days"]'),
    hours: $('[data-cd="hours"]'),
    mins: $('[data-cd="mins"]'),
    secs: $('[data-cd="secs"]'),
  };
  const pad = (n) => String(n).padStart(2, "0");

  function tickCountdown() {
    const now = new Date();
    let diff = Math.max(0, deadline.getTime() - now.getTime());
    const d = Math.floor(diff / 86400000); diff -= d * 86400000;
    const h = Math.floor(diff / 3600000);  diff -= h * 3600000;
    const m = Math.floor(diff / 60000);    diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    if (cd.days) cd.days.textContent = d;
    if (cd.hours) cd.hours.textContent = pad(h);
    if (cd.mins) cd.mins.textContent = pad(m);
    if (cd.secs) cd.secs.textContent = pad(s);
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ── 钱板：目标、计数、进度、节奏 ──────────────────────
  const setText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };

  setText("[data-goal-label]", config.goalLabel || "");
  setText("[data-goal-amount]", fmtMoney(goal));
  setText("[data-goal-inline]", "/ " + fmt(goal));

  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0;
  const reached = total >= goal && goal > 0;

  // 进度条
  const fill = $("[data-progress-fill]");
  const bar = $("[data-progressbar]");
  if (bar) bar.setAttribute("aria-valuenow", String(Math.round(pct)));
  setText("[data-progress-pct]", pct.toFixed(pct < 10 ? 1 : 0) + "%");
  setText(
    "[data-progress-state]",
    reached ? "🎉 已达成，开玩！" : total > 0 ? "进行中" : "等待破零"
  );

  // 节奏统计
  const remaining = Math.max(0, goal - total);
  const now = new Date();
  const daysLeft = daysBetween(now, deadline);
  const ratePerDay = remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0;

  setText("[data-stat-need]", reached ? "已凑齐 ✓" : fmtMoney(remaining));
  setText("[data-stat-days]", String(daysLeft) + " 天");
  setText(
    "[data-stat-rate]",
    reached ? "—" : daysLeft > 0 ? fmtMoney(ratePerDay) : "时间到"
  );

  // 计数动画 + 进度条填充
  const counterEl = $("[data-counter]");
  function animateCounter() {
    if (prefersReduced || total === 0) {
      if (counterEl) counterEl.textContent = fmt(total);
      if (fill) fill.style.width = pct + "%";
      return;
    }
    const duration = 1400;
    let start = null;
    const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
    function step(ts) {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = easeOutExpo(p);
      if (counterEl) counterEl.textContent = fmt(total * eased);
      if (p < 1) requestAnimationFrame(step);
      else if (counterEl) counterEl.textContent = fmt(total);
    }
    requestAnimationFrame(step);
    // 进度条在下一帧触发 transition
    requestAnimationFrame(() => {
      if (fill) fill.style.width = pct + "%";
    });
  }

  // ── 流水时间线 ──────────────────────────────────────
  const timeline = $("[data-timeline]");

  // 树叶图标（动森风）
  const LEAF_SVG = `<svg class="entry__leaf" viewBox="0 0 30 30" aria-hidden="true">
      <path d="M15 3 C8 7 5 16 7 25 C15 22 23 14 25 4 C21 4 18 4 15 3Z" fill="#6fba2c"/>
      <path d="M10 23 L18 10" stroke="#5a9e1e" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  // 钱袋图标（空状态用）
  const BAG_SVG = `<svg class="empty__bag" viewBox="0 0 60 60" aria-hidden="true">
      <ellipse cx="30" cy="38" rx="22" ry="20" fill="#caa15a" stroke="#8e7d2c" stroke-width="2"/>
      <path d="M20 16 L40 16 L36 26 L24 26 Z" fill="#e6c98a" stroke="#8e7d2c" stroke-width="2" stroke-linejoin="round"/>
      <rect x="19" y="12" width="22" height="6" rx="3" fill="#a87f3c"/>
      <text x="30" y="44" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="18" fill="#fffbe7">¥</text>
    </svg>`;

  function entryNode(e) {
    const li = document.createElement("li");
    li.className = "entry";
    li.setAttribute("data-reveal", "");

    const dt = parseDate(e.date);
    const mmdd = pad(dt.getMonth() + 1) + "." + pad(dt.getDate());

    const projectInner = e.link
      ? `<a href="${e.link}" target="_blank" rel="noopener">${escapeHtml(e.project)}</a>`
      : escapeHtml(e.project);

    li.innerHTML = `
      ${LEAF_SVG}
      <div class="entry__date"><b>${mmdd}</b><span>${dt.getFullYear()}</span></div>
      <div class="entry__body">
        <div class="entry__project">${projectInner}</div>
        ${e.note ? `<div class="entry__note">${escapeHtml(e.note)}</div>` : ""}
      </div>
      <div class="entry__amt">+${fmtMoney(Number(e.amount) || 0)}</div>
    `;
    return li;
  }

  function emptyNode() {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="empty" data-reveal>
        ${BAG_SVG}
        <div class="empty__big">¥0</div>
        <p>钱袋还是空的。第一块通过 AI 攒到的零钱出现在这里时，搬家挑战才算真正开始。</p>
        <div class="empty__hint">去 /admin 后台记第一笔，钱袋就鼓起来了</div>
      </div>`;
    return li;
  }

  if (timeline) {
    if (entries.length === 0) {
      timeline.appendChild(emptyNode());
    } else {
      // 按日期倒序（最新在上），日期相同保持原顺序
      const sorted = entries
        .map((e, i) => ({ e, i }))
        .sort((a, b) => {
          const d = parseDate(b.e.date) - parseDate(a.e.date);
          return d !== 0 ? d : a.i - b.i;
        })
        .map((x) => x.e);
      sorted.forEach((e) => timeline.appendChild(entryNode(e)));
    }
  }

  // ── 项目拆分 ────────────────────────────────────────
  const breakdownSection = $("[data-breakdown]");
  const bento = $("[data-bento]");
  if (entries.length > 0 && bento && breakdownSection) {
    const byProject = new Map();
    entries.forEach((e) => {
      const key = e.project || "未命名项目";
      const cur = byProject.get(key) || { sum: 0, count: 0 };
      cur.sum += Number(e.amount) || 0;
      cur.count += 1;
      byProject.set(key, cur);
    });

    const projects = Array.from(byProject.entries()).sort(
      (a, b) => b[1].sum - a[1].sum
    );
    const max = projects[0][1].sum || 1;

    // NookPhone 波点墙纸配色（与 animal-island-ui pattern 同名取色）
    const PALETTE = [
      { bg: "#fde4e8", line: "#f8a6b2", dot: "rgba(248,166,178,0.22)", text: "#a85565" }, // pink
      { bg: "#e1f7f3", line: "#7fd6cb", dot: "rgba(127,214,203,0.28)", text: "#2b8c80" }, // teal
      { bg: "#fdf3d2", line: "#f0d57a", dot: "rgba(240,213,122,0.32)", text: "#9a7b1e" }, // yellow
      { bg: "#e7f6d9", line: "#a9d977", dot: "rgba(169,217,119,0.30)", text: "#5a8a2e" }, // green
      { bg: "#e3edfb", line: "#a9c2ec", dot: "rgba(169,194,236,0.30)", text: "#4a6aa0" }, // blue
      { bg: "#fde8d4", line: "#f3c08a", dot: "rgba(243,192,138,0.32)", text: "#b5712e" }, // orange
    ];

    projects.forEach(([name, info], idx) => {
      const card = document.createElement("article");
      card.className = "proj";
      card.setAttribute("data-reveal", "");
      const p = PALETTE[idx % PALETTE.length];
      card.style.cssText =
        `--proj-bg:${p.bg};--proj-line:${p.line};--proj-dot:${p.dot};--proj-text:${p.text}`;
      const w = Math.max(6, (info.sum / max) * 100);
      card.innerHTML = `
        <div class="proj__name">${escapeHtml(name)}</div>
        <div class="proj__count">${info.count} 笔进账 · 占比 ${((info.sum / total) * 100).toFixed(0)}%</div>
        <div class="proj__sum">${fmtMoney(info.sum)}</div>
        <div class="proj__bar"><i style="width:${w}%"></i></div>
      `;
      bento.appendChild(card);
    });
    breakdownSection.hidden = false;
  }

  // ── 搬家清单（攒够一件点亮一件，便宜的先） ──────────────
  const ICONS = {
    console: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="5"/><line x1="6.5" y1="10.5" x2="6.5" y2="13.5"/><line x1="5" y1="12" x2="8" y2="12"/><circle cx="16" cy="11" r="1.1"/><circle cx="18.5" cy="13" r="1.1"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21l2-4M16 21l-2-4"/></svg>',
    disc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/></svg>',
    sofa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/></svg>',
    pc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="11" rx="2"/><path d="M9 20h6M12 15v5"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11"/><path d="M12 9C9.5 9 8 7.5 8 6.2 8 5 9 4.5 10 5c1.3.6 2 4 2 4M12 9c2.5 0 4-1.5 4-2.8C16 5 15 4.5 14 5c-1.3.6-2 4-2 4"/></svg>',
  };

  function renderWishlist() {
    const listEl = $("[data-wishlist]");
    const card = listEl && listEl.closest(".wishlist");
    if (!listEl || !goalItems.length) {
      if (card) card.hidden = true;
      return;
    }
    // 便宜的先点亮
    const items = goalItems
      .map((it) => ({ name: it.name, price: Number(it.price) || 0, icon: it.icon }))
      .sort((a, b) => a.price - b.price);

    let cum = 0;
    let currentMarked = false;
    let doneCount = 0;
    listEl.innerHTML = "";

    for (const it of items) {
      const prev = cum;
      cum += it.price;
      const li = document.createElement("li");
      const icon = ICONS[it.icon] || ICONS.gift;
      let state, statusHtml;

      if (total >= cum) {
        state = "is-done";
        statusHtml = `<span class="wish-item__badge">已拿下</span>`;
        doneCount++;
      } else if (!currentMarked) {
        // 正在攒的这一件
        currentMarked = true;
        state = "is-current";
        const got = Math.max(0, total - prev);
        const p = Math.min(100, (got / it.price) * 100);
        statusHtml =
          `<div class="wish-item__progress"><i style="width:${p}%"></i></div>` +
          `<span class="wish-item__need">还差 ${fmtMoney(cum - total)}</span>`;
      } else {
        state = "is-locked";
        statusHtml = `<span class="wish-item__badge">${fmtMoney(it.price)}</span>`;
      }

      li.className = "wish-item " + state;
      li.innerHTML =
        `<span class="wish-item__icon">${icon}</span>` +
        `<div class="wish-item__main">` +
        `<div class="wish-item__name">${escapeHtml(it.name)}</div>` +
        `<div class="wish-item__price">${fmtMoney(it.price)}</div></div>` +
        `<div class="wish-item__status">${statusHtml}</div>`;
      listEl.appendChild(li);
    }

    setText("[data-wishlist-count]", `已拿下 ${doneCount} / ${items.length}`);
    const countEl = $("[data-wishlist-count]");
    if (countEl) countEl.innerHTML = `已拿下 <b>${doneCount}</b> / ${items.length}`;
  }
  renderWishlist();

  // ── 页脚 ────────────────────────────────────────────
  setText("[data-handle]", config.handle || "");

  // 最近更新 = 最新一条流水的日期，否则开始日
  const latest = entries.length
    ? entries.reduce((a, b) => (parseDate(a.date) >= parseDate(b.date) ? a : b)).date
    : config.startDate;
  setText("[data-updated]", latest || "—");

  const socialBtn = $("[data-social]");
  if (socialBtn && config.socialUrl) {
    socialBtn.href = config.socialUrl;
    socialBtn.hidden = false;
  }

  // 标题动态填充
  document.title = `${config.title || "用 AI 玩上 GTA6"} · 公开赚钱挑战`;

  // ── 入场动画（滚动揭示） ─────────────────────────────
  function setupReveal() {
    const items = $$("[data-reveal]");
    if (prefersReduced || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (ents) => {
        ents.forEach((ent) => {
          if (ent.isIntersecting) {
            ent.target.classList.add("is-in");
            io.unobserve(ent.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el) => io.observe(el));
  }

  // ── 转义 ────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ── 启动 ────────────────────────────────────────────
  animateCounter();
  setupReveal();
})();
