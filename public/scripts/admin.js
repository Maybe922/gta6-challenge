/* 攒零钱岛 · 后台逻辑 */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => "¥" + Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  let editingId = null;

  function show(view) {
    document.querySelectorAll("[data-view]").forEach((el) => {
      el.hidden = el.dataset.view !== view;
    });
  }

  function setMsg(el, text, ok) {
    el.textContent = text || "";
    el.classList.toggle("is-err", !!text && !ok);
    el.classList.toggle("is-ok", !!text && ok);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error((body && body.error) || `请求失败 (${res.status})`);
    return body;
  }

  // ── 启动 ────────────────────────────────────────────
  async function boot() {
    try {
      const { authed } = await api("/api/session");
      if (authed) { show("dash"); await loadData(); }
      else show("login");
    } catch (_) {
      show("login");
    }
  }

  // ── 登录 ────────────────────────────────────────────
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#login-msg");
    setMsg(msg, "");
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
      $("#password").value = "";
      show("dash");
      await loadData();
    } catch (err) {
      setMsg(msg, err.message, false);
    }
  });

  $("#logout").addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST" }); } catch (_) {}
    show("login");
  });

  // ── 加载数据 ────────────────────────────────────────
  async function loadData() {
    const data = await api("/api/challenge");
    fillConfig(data.config || {});
    renderList(data.entries || [], data.config || {});
  }

  function fillConfig(c) {
    const f = $("#config-form");
    f.goalLabel.value = c.goalLabel ?? "";
    f.deadline.value = c.deadline ?? "";
    f.handle.value = c.handle ?? "";
    f.socialUrl.value = c.socialUrl ?? "";
    const items =
      Array.isArray(c.goalItems) && c.goalItems.length
        ? c.goalItems
        : [{ name: "", price: "", icon: "gift" }];
    renderItemsEditor(items);
  }

  // ── 搬家清单编辑器 ───────────────────────────────────
  const ICON_OPTS = [
    ["console", "🎮 主机"],
    ["tv", "📺 电视"],
    ["disc", "💿 游戏"],
    ["sofa", "🛋 沙发"],
    ["pc", "🖥 电脑"],
    ["gift", "🎁 其它"],
  ];

  function itemRow(it) {
    const row = document.createElement("div");
    row.className = "item-edit";
    const opts = ICON_OPTS.map(
      ([v, t]) => `<option value="${v}"${v === it.icon ? " selected" : ""}>${t}</option>`
    ).join("");
    row.innerHTML =
      `<select class="field" data-k="icon">${opts}</select>` +
      `<input class="field" data-k="name" placeholder="名称（如 电视）" value="${esc(it.name ?? "")}" />` +
      `<input class="field price" type="number" min="1" step="1" data-k="price" placeholder="价格" value="${it.price ?? ""}" />` +
      `<button type="button" class="del-item" title="删除">✕</button>`;
    row.querySelector(".del-item").addEventListener("click", () => {
      row.remove();
      recalcItems();
    });
    row.querySelectorAll("input").forEach((i) => i.addEventListener("input", recalcItems));
    return row;
  }

  function renderItemsEditor(items) {
    const box = $("#items-editor");
    box.innerHTML = "";
    items.forEach((it) => box.appendChild(itemRow(it)));
    recalcItems();
  }

  function collectItems() {
    return Array.from($("#items-editor").children).map((row) => {
      const get = (k) => row.querySelector(`[data-k="${k}"]`).value;
      return { name: get("name").trim(), price: Number(get("price")), icon: get("icon") };
    });
  }

  function recalcItems() {
    const sum = collectItems().reduce(
      (s, it) => s + (Number.isFinite(it.price) && it.price > 0 ? it.price : 0),
      0
    );
    $("#items-total").textContent = fmt(sum);
  }

  $("#add-item").addEventListener("click", () => {
    $("#items-editor").appendChild(itemRow({ name: "", price: "", icon: "gift" }));
    recalcItems();
  });

  function renderList(entries, config) {
    const list = $("#entry-list");
    const sum = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const goal = Number(config.goalAmount) || 0;
    const pct = goal ? Math.min(100, (sum / goal) * 100) : 0;
    $("#summary").innerHTML =
      `<span>已攒 <b class="pos">${fmt(sum)}</b></span>` +
      `<span>目标 <b>${fmt(goal)}</b></span>` +
      `<span>进度 <b>${pct.toFixed(1)}%</b></span>` +
      `<span>共 <b>${entries.length}</b> 笔</span>`;

    if (!entries.length) {
      list.innerHTML = `<div class="list__empty">还没有任何流水，上面加第一笔吧 🌱</div>`;
      return;
    }
    const sorted = entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i))
      .map((x) => x.e);

    list.innerHTML = "";
    for (const e of sorted) {
      const row = document.createElement("div");
      row.className = "item";
      row.innerHTML =
        `<span class="item__date">${esc(e.date)}</span>` +
        `<div class="item__main"><div class="item__project">${esc(e.project)}</div>` +
        (e.note ? `<div class="item__note">${esc(e.note)}</div>` : "") +
        `</div>` +
        `<span class="item__amt">+${fmt(e.amount)}</span>` +
        `<span class="item__ops"><button class="mini edit">改</button><button class="mini del">删</button></span>`;
      row.querySelector(".edit").addEventListener("click", () => startEdit(e));
      row.querySelector(".del").addEventListener("click", () => remove(e));
      list.appendChild(row);
    }
  }

  // ── 添加 / 编辑 ─────────────────────────────────────
  const entryForm = $("#entry-form");
  entryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#entry-msg");
    setMsg(msg, "");
    const btn = $("#entry-submit");
    btn.disabled = true;
    const payload = {
      date: entryForm.date.value,
      amount: entryForm.amount.value,
      project: entryForm.project.value,
      note: entryForm.note.value,
      link: entryForm.link.value,
    };
    try {
      if (editingId) {
        await api(`/api/entries/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        setMsg(msg, "已更新 ✓", true);
      } else {
        await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
        setMsg(msg, "已添加 ✓", true);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setMsg(msg, err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  $("#entry-cancel").addEventListener("click", resetForm);

  function startEdit(e) {
    editingId = e.id;
    entryForm.date.value = e.date;
    entryForm.amount.value = e.amount;
    entryForm.project.value = e.project;
    entryForm.note.value = e.note || "";
    entryForm.link.value = e.link || "";
    $("#entry-submit").textContent = "保存修改";
    $("#entry-cancel").hidden = false;
    entryForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetForm() {
    editingId = null;
    entryForm.reset();
    $("#entry-submit").textContent = "添加进账";
    $("#entry-cancel").hidden = true;
  }

  async function remove(e) {
    if (!confirm(`确认删除「${e.project} ${fmt(e.amount)}」这一笔？`)) return;
    try {
      await api(`/api/entries/${e.id}`, { method: "DELETE" });
      if (editingId === e.id) resetForm();
      await loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  // ── 配置 ────────────────────────────────────────────
  $("#config-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = $("#config-msg");
    setMsg(msg, "");
    try {
      await api("/api/config", {
        method: "PUT",
        body: JSON.stringify({
          goalItems: collectItems(),
          goalLabel: f.goalLabel.value,
          deadline: f.deadline.value,
          handle: f.handle.value,
          socialUrl: f.socialUrl.value,
        }),
      });
      setMsg(msg, "目标已保存 ✓", true);
      await loadData();
    } catch (err) {
      setMsg(msg, err.message, false);
    }
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ── 今日战报 ─────────────────────────────────────────
  const BG_COUNT = 3;
  let cardBgIndex = (new Date().getDate() % BG_COUNT) + 1;
  let lastCardUrl = null;
  const imgCache = {};
  function loadImg(src) {
    if (!imgCache[src]) {
      imgCache[src] = new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("图片加载失败: " + src));
        i.src = src;
      });
    }
    return imgCache[src];
  }

  async function renderCard() {
    const data = await api("/api/challenge");
    await Promise.all([
      document.fonts.load('900 100px Nunito'),
      document.fonts.load('900 100px "Noto Sans SC"'),
      document.fonts.load('700 32px "Noto Sans SC"'),
    ]).catch(() => {});
    const [bg, pig] = await Promise.all([
      loadImg("/cards/bg-" + cardBgIndex + ".jpg"),
      loadImg("/icon.png"),
    ]);
    const canvas = $("#card-canvas");
    window.drawDailyCard(canvas, { data, bgImg: bg, piggyImg: pig, date: new Date() });
    await new Promise((res) => {
      canvas.toBlob((blob) => {
        if (lastCardUrl) URL.revokeObjectURL(lastCardUrl);
        lastCardUrl = URL.createObjectURL(blob);
        const img = $("#card-img");
        img.src = lastCardUrl; img.hidden = false;
        $("#card-ph").hidden = true;
        const d = new Date();
        const ds = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
        const dl = $("#dl-card");
        dl.href = lastCardUrl; dl.download = "今日战报-" + ds + ".png"; dl.hidden = false;
        $("#cycle-bg").hidden = false;
        res();
      }, "image/png");
    });
  }

  const genBtn = $("#gen-card");
  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      const msg = $("#card-msg"); setMsg(msg, "");
      genBtn.disabled = true; const orig = genBtn.textContent; genBtn.textContent = "生成中…";
      try { await renderCard(); genBtn.textContent = "重新生成"; }
      catch (e) { setMsg(msg, e.message, false); genBtn.textContent = orig; }
      finally { genBtn.disabled = false; }
    });
    $("#cycle-bg").addEventListener("click", async () => {
      cardBgIndex = (cardBgIndex % BG_COUNT) + 1;
      try { await renderCard(); } catch (e) { setMsg($("#card-msg"), e.message, false); }
    });
  }

  boot();
})();
