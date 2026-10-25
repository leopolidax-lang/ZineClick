/* Zynora · tv.js (modo Android TV)
   Navegación con el control remoto, foco elegante, pósters compactos y teclado solo con OK.
   Se activa solo en una tele / TV Box, o la primera vez que se pulsa una flecha del control. En el celular no cambia nada. */
(function () {
  "use strict";
  var W = window, D = document, H = D.documentElement;
  function isNative() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  var FORCE = null; try { FORCE = localStorage.getItem("zynora_tv"); } catch (e) {}
  if (FORCE === "0") return;
  var UA = navigator.userAgent || "";
  var looksTv = /\b(TV|AFT[A-Z]*|BRAVIA|SmartTV|Android TV|AndroidTV|MiBOX|SHIELD|Chromecast|GoogleTV|Hisense|TCL)\b/i.test(UA) || FORCE === "1";
  var on = false, last = null;

  var CSS =
    /* --- generales --- */
    'html.tv{cursor:none;--tvglow:255,255,255}' +
    'html.tv *{-webkit-tap-highlight-color:transparent}' +
    'html.tv ::-webkit-scrollbar{display:none}' +
    'html.tv :focus{outline:none!important}' +
    /* la barra de arriba ya no se queda fija: no tapa los pósters */
    'html.tv header{position:relative!important}' +
    /* --- pósters: más pequeños, solo el nombre dentro --- */
    'html.tv .grid{grid-template-columns:repeat(8,minmax(0,1fr))!important;gap:12px!important}' +
    'html.tv .card h3,html.tv .card .sub,html.tv .card .rating,html.tv .card .type{display:none!important}' +
    'html.tv .card .poster .poster-name{bottom:9px;left:8px;right:8px;font-size:clamp(10px,.95vw,14px);font-weight:800;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    'html.tv .card .poster:before{background:linear-gradient(0deg,#070910e6,transparent 62%)}' +
    'html.tv .card .up-date{position:absolute;z-index:3;top:8px;left:8px;padding:4px 8px;border-radius:8px;background:#070910d9;border:1px solid #ffffff22;font-size:11px;font-weight:800;color:#ffe7a6;letter-spacing:.2px}' +
    /* filas de los plugins/addons: nombre dentro del póster */
    'html.tv #zacWrap .zac-card,html.tv #zplHome .zph-card{position:relative;flex:0 0 clamp(96px,11vw,128px)}' +
    'html.tv #zacWrap .zac-card b,html.tv #zplHome .zph-card b{position:absolute;left:8px;right:8px;bottom:8px;font-size:11px;font-weight:800;color:#fff;text-shadow:0 2px 8px #000;-webkit-line-clamp:3;pointer-events:none}' +
    'html.tv #zacWrap .zac-p:after,html.tv #zplHome .zph-p:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#070910e6,transparent 60%)}' +
    'html.tv #zacWrap .zac-p,html.tv #zplHome .zph-p{position:relative}' +
    /* --- foco elegante: solo el póster se agranda y brilla suave --- */
    'html.tv .card,html.tv .zac-card,html.tv .zph-card{outline:none;transition:none}' +
    'html.tv .poster,html.tv .zac-p,html.tv .zph-p,html.tv .zcw-card{transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}' +
    'html.tv .card:focus .poster,html.tv .zac-card:focus .zac-p,html.tv .zph-card:focus .zph-p,html.tv .zcw-card:focus{transform:scale(1.08);position:relative;z-index:4;border-color:rgba(255,255,255,.55)!important;box-shadow:0 0 0 1px rgba(255,255,255,.5),0 16px 38px rgba(0,0,0,.65),0 0 26px rgba(255,255,255,.14)}' +
    'html.tv .card:focus,html.tv .zac-card:focus,html.tv .zph-card:focus{transform:none;box-shadow:none}' +
    /* botones, pestañas y chips: se iluminan por dentro, sin borde grueso */
    'html.tv button:focus,html.tv a:focus,html.tv select:focus,html.tv [role=button]:focus,html.tv .chip:focus,html.tv .tab:focus{background-color:rgba(255,255,255,.17)!important;color:#fff!important;box-shadow:0 0 0 1px rgba(255,255,255,.42),0 6px 22px rgba(255,255,255,.08)!important;transform:none}' +
    'html.tv .btn.primary:focus,html.tv .zpl-btn.pri:focus,html.tv .zpl-row2 .pri:focus{filter:brightness(1.18);box-shadow:0 0 0 2px rgba(255,255,255,.7),0 8px 26px rgba(0,0,0,.5)!important}' +
    'html.tv header nav button:focus{background:rgba(255,255,255,.18)!important}' +
    'html.tv input:focus,html.tv textarea:focus{box-shadow:0 0 0 1px rgba(255,255,255,.5)!important;border-color:rgba(255,255,255,.55)!important}' +
    'html.tv #znpRoot button:focus{background:rgba(255,255,255,.22)!important;transform:scale(1.1)}';

  /* ---------- utilidades ---------- */
  function visible(el) {
    if (!el || el.disabled || el.hidden) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.pointerEvents !== "none";
  }
  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),.card,.zam-card,.zcw-card,.zph-card,.zac-card,.zep-row,[role=button]';
  var LAYERS = ["#znpRoot", ".zpl-sh", ".zy-dlg", "#zplRoot", "#zamRoot", "#rdPlayer", "#pfRail.open", ".modal-wrap.open", ".modal-wrap.show", ".modal-wrap:not(.hidden):not([hidden])"];
  function scope() {
    for (var i = 0; i < LAYERS.length; i++) {
      var list = D.querySelectorAll(LAYERS[i]);
      for (var j = list.length - 1; j >= 0; j--) {
        var el = list[j];
        if (!el.hidden && visible(el) && (getComputedStyle(el).position === "fixed" || getComputedStyle(el).position === "absolute")) return el;
      }
    }
    return D;
  }
  function items(root) {
    var out = [], all = root.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el) || (el.closest && el.closest("[inert]"))) continue;
      /* si hay un botón dentro de una tarjeta clicable, la tarjeta manda (un solo foco por póster) */
      if (el.tagName === "BUTTON" && el.closest && el.closest(".card,.zcw-card") && !el.matches(".zcw-card")) continue;
      out.push(el);
    }
    return out;
  }
  function rectOf(el) { return el.getBoundingClientRect(); }
  /* para las tarjetas, la "caja" que cuenta es el póster */
  function boxOf(el) { var p = el.matches && el.matches(".card") ? el.querySelector(".poster") : null; return rectOf(p || el); }

  /* Elige el siguiente elemento: primero el más cercano en la dirección pedida, y entre los que están a la misma distancia, el más alineado */
  function pick(from, fr, dir, list) {
    var horiz = dir === "ArrowLeft" || dir === "ArrowRight", cand = [];
    list.forEach(function (el) {
      if (el === from || (from && (from.contains(el) || el.contains(from)))) return;
      var r = boxOf(el), ok, main, cross, overlap;
      if (dir === "ArrowRight") { ok = r.left + r.width / 2 > fr.left + fr.width / 2 + 4 && r.left >= fr.left + fr.width * 0.3; main = Math.max(r.left - fr.right, 0); }
      else if (dir === "ArrowLeft") { ok = r.left + r.width / 2 < fr.left + fr.width / 2 - 4 && r.right <= fr.right - fr.width * 0.3; main = Math.max(fr.left - r.right, 0); }
      else if (dir === "ArrowDown") { ok = r.top + r.height / 2 > fr.top + fr.height / 2 + 4 && r.top >= fr.top + fr.height * 0.3; main = Math.max(r.top - fr.bottom, 0); }
      else { ok = r.top + r.height / 2 < fr.top + fr.height / 2 - 4 && r.bottom <= fr.bottom - fr.height * 0.3; main = Math.max(fr.top - r.bottom, 0); }
      if (!ok) return;
      if (horiz) { cross = Math.abs((r.top + r.height / 2) - (fr.top + fr.height / 2)); overlap = Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top); }
      else { cross = Math.abs((r.left + r.width / 2) - (fr.left + fr.width / 2)); overlap = Math.min(r.right, fr.right) - Math.max(r.left, fr.left); }
      cand.push({ el: el, main: main, cross: cross, overlap: overlap });
    });
    if (!cand.length) return null;
    /* se prefieren los que se solapan con el elemento actual (misma fila/columna) */
    var al = cand.filter(function (c) { return c.overlap > 0; });
    var use = al.length ? al : cand, best = null, bs = Infinity;
    use.forEach(function (c) { var s = c.main * 3 + c.cross * (al.length ? 1 : 3); if (s < bs) { bs = s; best = c.el; } });
    return best;
  }
  function focusEl(el) {
    if (!el) return;
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "0");
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    last = el;
    var r = rectOf(el), vh = innerHeight, vw = innerWidth;
    if (r.top < 90 || r.bottom > vh - 40 || r.left < 0 || r.right > vw) {
      try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" }); } catch (e) {}
    }
  }
  function firstFocus() {
    var root = scope(), l = items(root);
    /* en la pantalla principal se empieza en el primer póster / botón del contenido, no en el buscador */
    var pref = l.filter(function (e) { return !(e.closest && e.closest("header")); });
    var pool = (root === D && pref.length) ? pref : l;
    pool.sort(function (a, b) { var A = rectOf(a), B = rectOf(b); return (A.top - B.top) || (A.left - B.left); });
    var cur = pool.filter(function (e) { return rectOf(e).top >= 0; })[0] || pool[0];
    focusEl(cur);
  }
  /* si el foco se perdió (la pantalla se redibujó), vuelve al elemento más cercano a donde estaba */
  var lastC = null;
  function remember() { var a = D.activeElement; if (a && a !== D.body) { var r = boxOf(a); lastC = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } }
  function recover(list) {
    if (!lastC) return null;
    var best = null, bs = Infinity;
    list.forEach(function (el) { var r = boxOf(el), d = Math.pow(r.left + r.width / 2 - lastC.x, 2) + Math.pow(r.top + r.height / 2 - lastC.y, 2); if (d < bs) { bs = d; best = el; } });
    return best;
  }

  /* ---------- teclado solo al pulsar OK ---------- */
  var TEXTY = /^(text|search|email|url|tel|password|number)$/i;
  function lockInputs() {
    var l = D.querySelectorAll("input,textarea");
    for (var i = 0; i < l.length; i++) {
      var el = l[i];
      if (el.tagName === "INPUT" && !TEXTY.test(el.type || "text")) continue;
      if (el.getAttribute("data-tvedit") === "1") continue;
      if (!el.hasAttribute("readonly")) { el.setAttribute("readonly", ""); el.setAttribute("data-tvlock", "1"); }
    }
  }
  function startEdit(el) {
    el.setAttribute("data-tvedit", "1"); el.removeAttribute("readonly");
    el.blur(); setTimeout(function () { el.focus(); try { var n = el.value.length; el.setSelectionRange(n, n); } catch (e) {} }, 30);
  }
  function stopEdit(el) {
    el.removeAttribute("data-tvedit"); el.setAttribute("readonly", "");
    el.blur(); setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (e) {} }, 30);
  }
  function isEditing(a) { return !!(a && a.getAttribute && a.getAttribute("data-tvedit") === "1"); }
  D.addEventListener("focusout", function (e) { if (on && isEditing(e.target)) { e.target.removeAttribute("data-tvedit"); e.target.setAttribute("readonly", ""); } }, true);

  /* ---------- reproductor ---------- */
  function player() { var c = W.Capacitor; return c && c.Plugins && c.Plugins.ZinePlayer; }
  function playerKeys(e) {
    var root = D.getElementById("znpRoot"); if (!root || root.hidden || !H.classList.contains("znp-on")) return false;
    var p = player(); if (!p) return false;
    var inUi = D.activeElement && root.contains(D.activeElement) && D.activeElement !== root;
    var k = e.key;
    function showUi() { var t = root.querySelector(".znp-tap"); if (t) { try { t.click(); } catch (x) {} } }
    if (k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause" || (k === " " && !inUi)) { p.togglePlay(); showUi(); return true; }
    if (k === "MediaFastForward" || k === "MediaTrackNext") { p.seekBy({ ms: 30000 }); showUi(); return true; }
    if (k === "MediaRewind" || k === "MediaTrackPrevious") { p.seekBy({ ms: -30000 }); showUi(); return true; }
    if (inUi) return false;
    if (k === "ArrowRight") { p.seekBy({ ms: 10000 }); showUi(); return true; }
    if (k === "ArrowLeft") { p.seekBy({ ms: -10000 }); showUi(); return true; }
    if (k === "Enter") { p.togglePlay(); showUi(); return true; }
    if (k === "ArrowUp" || k === "ArrowDown") { showUi(); setTimeout(function () { var bs = items(root); if (bs.length) focusEl(bs[0]); }, 60); return true; }
    return false;
  }

  /* ---------- fecha dentro del póster (solo Estrenos) ---------- */
  var MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function shortDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); if (!m) return "";
    return Number(m[3]) + "/" + MES[Number(m[2]) - 1] + "/" + m[1].slice(2);
  }
  function patchUpcoming() {
    var orig = W.cardUp; if (typeof orig !== "function" || orig.__tv) return;
    var f = function (t) {
      var h = orig(t), d = shortDate(t && t.releaseDate);
      return d ? h.replace('<span class="poster-name">', '<span class="up-date">' + d + '</span><span class="poster-name">') : h;
    };
    f.__tv = true; W.cardUp = f;
    /* si Estrenos ya se dibujó, se vuelve a dibujar */
    try { if (typeof W.renderUpcoming === "function") W.renderUpcoming(); } catch (e) {}
  }

  function enable() {
    if (on) return; on = true;
    H.classList.add("tv");
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    lockInputs();
    try { new MutationObserver(function () { lockInputs(); patchUpcoming(); }).observe(D.body, { childList: true, subtree: true }); } catch (e) {}
    patchUpcoming();
    setTimeout(function () { if (!D.activeElement || D.activeElement === D.body) firstFocus(); }, 500);
  }

  D.addEventListener("keydown", function (e) {
    var dpad = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!on) { if (dpad && isNative()) { enable(); firstFocus(); e.preventDefault(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (playerKeys(e)) { e.preventDefault(); return; }
    var a = D.activeElement, isInput = a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && (a.tagName === "TEXTAREA" || TEXTY.test(a.type || "text"));
    /* escribiendo: las flechas mueven el cursor; OK / Buscar cierra el teclado */
    if (isInput && isEditing(a)) {
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); stopEdit(a); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); stopEdit(a); }
      else return;
    }
    if (e.key === "Enter" && isInput && !isEditing(a)) { e.preventDefault(); startEdit(a); return; }
    if (dpad) {
      if (a && a.tagName === "INPUT" && a.type === "range" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      var root = scope(), list = items(root);
      if (!a || a === D.body || !root.contains(a) || !visible(a)) {
        var back = recover(list); if (back) focusEl(back); else firstFocus();
        e.preventDefault(); return;
      }
      var nxt = pick(a, boxOf(a), e.key, list);
      if (nxt) focusEl(nxt);
      remember();
      e.preventDefault();
    } else if (e.key === "Enter" && a && a !== D.body && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) {
      e.preventDefault(); a.click();
    }
  }, true);
  D.addEventListener("focusin", function () { if (on) remember(); }, true);

  if (looksTv && isNative()) {
    if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", enable); else enable();
  }
  W.ZTV = { enable: enable, isOn: function () { return on; } };
})();
