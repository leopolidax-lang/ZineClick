/* Zynora · live-tv.js
   TV en vivo con plugins (capacidad «channels»). Necesita plugins.js (ZPL.live) y el reproductor de index.html (rdPlay).
   Añade el botón «TV en vivo» al menú «Más» y al menú lateral, y abre una pantalla con categorías, búsqueda y canales. */
(function () {
  "use strict";
  var W = window, D = document;
  var S = { pid: "", cat: "", cursor: null, q: "", items: [], tok: 0, busy: false, open: false, playing: false };

  function $(id) { return D.getElementById(id); }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function say(m) { try { if (typeof W.toast === "function") W.toast(m); } catch (e) {} }
  function live() { return W.ZPL && W.ZPL.live; }

  function css() {
    if ($("zlvCss")) return;
    var st = D.createElement("style"); st.id = "zlvCss";
    st.textContent =
      "#zlv{position:fixed;inset:0;z-index:700;background:#0a0c14;color:#eef1fa;display:none;flex-direction:column;font-family:inherit}" +
      "#zlv.on{display:flex}" +
      "#zlv .zh{display:flex;align-items:center;gap:12px;padding:14px 16px;padding-top:max(14px,env(safe-area-inset-top))}" +
      "#zlv .zh h2{margin:0;font-size:20px;flex:1}" +
      "#zlv button{font:inherit;color:inherit;cursor:pointer}" +
      "#zlv .zx{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:8px 14px;font-weight:700}" +
      "#zlv .zbar{display:flex;gap:8px;padding:0 16px 10px;flex-wrap:wrap}" +
      "#zlv input{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:12px;color:inherit;padding:10px 12px;font:inherit;min-width:0}" +
      "#zlv input{flex:1;min-width:140px}" +
      "#zlv .zcats{display:flex;gap:8px;overflow-x:auto;padding:0 16px 12px;scrollbar-width:none}" +
      "#zlv .zpls .zcat{border-style:dashed}" +
      "#zlv .zcat{flex:none;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);white-space:nowrap}" +
      "#zlv .zcat.on{background:linear-gradient(100deg,#64f4ff,#9da8ff);color:#071018;border-color:transparent;font-weight:700}" +
      "#zlv .zbody{flex:1;overflow:auto;padding:0 16px 24px}" +
      "#zlv .zgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}" +
      "#zlv .zch{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 10px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);text-align:center;min-width:0}" +
      "#zlv .zch:hover,#zlv .zch:focus-visible{background:rgba(255,255,255,.11);outline:none;border-color:#64f4ff}" +
      "#zlv .zlg{width:64px;height:64px;border-radius:14px;background:#141a2b;display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:800;font-size:22px;color:#9da8ff}" +
      "#zlv .zlg img{max-width:100%;max-height:100%;object-fit:contain}" +
      "#zlv .zn{font-size:13.5px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}" +
      "#zlv .zmsg{padding:40px 10px;text-align:center;color:#aab3c9}" +
      "#zlv .zmore{display:block;margin:16px auto 0;padding:12px 22px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-weight:700}";
    D.head.appendChild(st);
  }

  function shell() {
    if ($("zlv")) return;
    var d = D.createElement("div"); d.id = "zlv"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "TV en vivo");
    d.innerHTML = '<div class="zh"><h2>TV en vivo</h2><button type="button" class="zx" id="zlvX">✕ Cerrar</button></div>' +
      '<div class="zbar"><input id="zlvQ" type="search" placeholder="Buscar canal…" autocomplete="off"></div>' +
      '<div class="zcats zpls" id="zlvPls" hidden></div><div class="zcats" id="zlvCats"></div><div class="zbody" id="zlvBody"></div>';
    D.body.appendChild(d);
    $("zlvX").onclick = close;
    var t = null;
    $("zlvQ").oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { S.q = v.trim(); S.cursor = null; S.items = []; if (S.q) { markCat(""); load(false); } else if (S.cat) load(false); else paintBody(); }, 450); };
    D.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.open && !S.playing) close(); });
  }

  async function open() {
    css(); shell();
    var L = live();
    if (!L) { say("TV en vivo no está disponible (falta plugins.js)"); return; }
    var all = L.plugins(), pls = $("zlvPls");
    $("zlv").classList.add("on"); S.open = true;
    try { if ($("mnDrawer") && D.documentElement.classList.contains("mn-open")) $("mnClose").click(); } catch (e) {}
    pls.hidden = true; $("zlvQ").hidden = true; $("zlvCats").innerHTML = "";
    msg("Buscando plugins de TV en vivo…");
    var ok = [], bad = [];
    for (var i = 0; i < all.length; i++) {
      var ex = await L.exports(all[i].id);
      if (ex.indexOf("liveCategories") >= 0 && ex.indexOf("liveChannels") >= 0) ok.push(all[i]);
      else bad.push(all[i].name + (ex.length ? " (exporta: " + ex.join(", ") + ")" : ""));
    }
    if (!ok.length) {
      msg(all.length
        ? "Ningún plugin instalado es compatible con la TV en vivo de Zynora.<br>Necesitan exportar «liveCategories» y «liveChannels».<br><small>" + E(bad.join(" · ")) + "</small>"
        : "Ningún plugin instalado ofrece TV en vivo.<br>Instala uno con la capacidad «channels» (por ejemplo PlavioHD) desde Plugins.");
      return;
    }
    if (!S.pid || !ok.some(function (p) { return p.id === S.pid; })) { S.pid = ok[0].id; S.cat = ""; }
    $("zlvQ").hidden = false; pls.hidden = ok.length < 2;
    pls.innerHTML = ok.map(function (p) { return '<button type="button" class="zcat' + (p.id === S.pid ? " on" : "") + '" data-p="' + E(p.id) + '">' + E(p.name) + "</button>"; }).join("");
    Array.prototype.forEach.call(pls.querySelectorAll(".zcat"), function (b) {
      b.onclick = function () {
        S.pid = b.dataset.p; S.cat = ""; S.q = ""; $("zlvQ").value = "";
        Array.prototype.forEach.call(pls.querySelectorAll(".zcat"), function (x) { x.classList.toggle("on", x === b); });
        loadCats();
      };
    });
    loadCats();
  }
  function close() { S.open = false; S.playing = false; var z = $("zlv"); if (z) z.classList.remove("on"); }

  function msg(t) { $("zlvBody").innerHTML = '<div class="zmsg">' + t + "</div>"; }
  function markCat(id) { Array.prototype.forEach.call(D.querySelectorAll("#zlvCats .zcat"), function (b) { b.classList.toggle("on", b.dataset.c === id); }); }

  async function loadCats() {
    var tok = ++S.tok; msg("Cargando categorías…"); $("zlvCats").innerHTML = "";
    try {
      var cats = await live().categories(S.pid);
      if (tok !== S.tok) return;
      if (!cats.length) { msg("Este plugin no devolvió categorías."); return; }
      $("zlvCats").innerHTML = cats.map(function (c) { return '<button type="button" class="zcat" data-c="' + E(c.id) + '">' + E(c.title) + "</button>"; }).join("");
      Array.prototype.forEach.call(D.querySelectorAll("#zlvCats .zcat"), function (b) {
        b.onclick = function () { S.cat = b.dataset.c; S.q = ""; $("zlvQ").value = ""; S.cursor = null; S.items = []; markCat(S.cat); load(false); };
      });
      if (!S.cat || !cats.some(function (c) { return c.id === S.cat; })) S.cat = cats[0].id;
      S.cursor = null; S.items = []; markCat(S.cat); load(false);
    } catch (e) { if (tok === S.tok) msg("No se pudieron cargar las categorías: " + E(e && e.message || e)); }
  }

  async function load(more) {
    if (S.busy && more) return;
    var tok = ++S.tok; S.busy = true;
    if (!more) msg("Cargando canales…");
    try {
      var r = S.q ? await live().search(S.pid, S.q) : await live().channels(S.pid, S.cat, more ? S.cursor : null);
      if (tok !== S.tok) return;
      S.items = more ? S.items.concat(r.items) : r.items; S.cursor = S.q ? null : r.next;
      paintBody();
    } catch (e) { if (tok === S.tok) msg("No se pudieron cargar los canales: " + E(e && e.message || e)); }
    finally { if (tok === S.tok) S.busy = false; }
  }

  function paintBody() {
    var b = $("zlvBody");
    if (!S.items.length) { msg(S.q ? "Ningún canal coincide con «" + E(S.q) + "»." : "No hay canales en vivo por ahora."); return; }
    b.innerHTML = '<div class="zgrid">' + S.items.map(function (c, i) {
      return '<button type="button" class="zch" data-i="' + i + '"><div class="zlg">' + (c.logo ? '<img alt="" loading="lazy" referrerpolicy="no-referrer" src="' + E(c.logo) + '">' : E(c.title.charAt(0).toUpperCase())) + '</div><div class="zn">' + E(c.title) + "</div></button>";
    }).join("") + "</div>" + (S.cursor ? '<button type="button" class="zmore" id="zlvMore">Cargar más</button>' : "");
    Array.prototype.forEach.call(b.querySelectorAll(".zch"), function (el) { el.onclick = function () { play(S.items[+el.dataset.i]); }; });
    var m = $("zlvMore"); if (m) m.onclick = function () { load(true); };
  }

  function isNative() { try { return !!(W.ZNP && W.ZNP.available && W.ZNP.available()); } catch (e) { return false; } }
  async function play(c) {
    if (!c) return;
    say("Abriendo «" + c.title + "»…");
    try {
      var r = await live().resolve(S.pid, c.ref);
      /* Un canal en vivo no es una película: sin contexto, para que el menú de fuentes no intente «probar otra» al fallar */
      W._addonCtx = null;
      W.__zplHdr = r.headers && Object.keys(r.headers).length ? r.headers : null;
      S.playing = true; $("zlv").classList.remove("on");
      if (isNative()) { if (W.ZNP.open(r.rawUrl, c.title, null, null)) return; }
      if (typeof W.rdPlay !== "function") throw new Error("No se encontró el reproductor de la app.");
      W.rdPlay({ download: r.url }, c.title);
    } catch (e) { S.playing = false; if (S.open) $("zlv").classList.add("on"); say("No se pudo abrir el canal: " + ((e && e.message) || e)); }
  }

  /* El reproductor nativo avisa con «znp:closed»: volvemos a la lista de canales */
  function backToList() { if (S.playing && S.open) { S.playing = false; var z = $("zlv"); if (z) z.classList.add("on"); } }

  /* Al cerrar el reproductor volvemos a la lista de canales */
  function hookPlayer() {
    var orig = W.rdClosePlayer;
    if (typeof orig !== "function" || orig.__zlv) return;
    var f = function () { var r = orig.apply(this, arguments); if (S.playing && S.open) { S.playing = false; var z = $("zlv"); if (z) z.classList.add("on"); } return r; };
    f.__zlv = true; W.rdClosePlayer = f;
  }

  function addButtons() {
    var menu = $("navMoreMenu");
    if (menu && !menu.querySelector("[data-zlv]")) {
      var b = D.createElement("button"); b.type = "button"; b.setAttribute("data-zlv", "1"); b.textContent = "TV en vivo";
      b.onclick = function () { menu.hidden = true; open(); };
      menu.insertBefore(b, menu.firstChild);
    }
    var list = D.querySelector("#mnDrawer .mn-d-list");
    if (list && !list.querySelector("[data-zlv]")) {
      var d = D.createElement("button"); d.type = "button"; d.setAttribute("data-zlv", "1");
      d.innerHTML = '<i class="mi"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M9 3.5 12 6l3-2.5"/></svg></i><span>TV en vivo</span>';
      d.onclick = function () { try { $("mnClose").click(); } catch (e) {} open(); };
      list.insertBefore(d, list.firstChild);
    }
  }

  function boot() { css(); D.addEventListener("znp:closed", backToList); addButtons(); hookPlayer(); setInterval(function () { addButtons(); hookPlayer(); }, 2500); }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();
  W.ZLive = { open: open, close: close };
})();
