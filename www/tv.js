/* Zynora · tv.js
   Modo Android TV: navegación con el control remoto (flechas + OK), foco visible y controles del reproductor.
   Se activa solo en un Android TV / TV Box, o la primera vez que se pulsa una flecha del control en la app.
   En el celular no cambia nada. */
(function () {
  "use strict";
  var W = window, D = document, H = D.documentElement;
  function isNative() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  var FORCE = null; try { FORCE = localStorage.getItem("zynora_tv"); } catch (e) {}
  if (FORCE === "0") return;
  var UA = navigator.userAgent || "";
  var looksTv = /\b(TV|AFT[A-Z]*|BRAVIA|SmartTV|Android TV|AndroidTV|MiBOX|SHIELD|Chromecast|GoogleTV|Hisense|TCL)\b/i.test(UA) || FORCE === "1";
  var on = false;

  var CSS =
    'html.tv{--tvring:var(--cyan,#64f4ff);cursor:none}' +
    'html.tv *{-webkit-tap-highlight-color:transparent}' +
    'html.tv :focus{outline:3px solid var(--tvring)!important;outline-offset:3px;border-radius:12px}' +
    'html.tv input:focus,html.tv textarea:focus{outline-offset:1px}' +
    'html.tv button:focus,html.tv [tabindex]:focus,html.tv .card:focus,html.tv .zam-card:focus,html.tv .zcw-card:focus,html.tv .zph-card:focus,html.tv .zac-card:focus,html.tv .zpl-card:focus{transform:scale(1.04);box-shadow:0 0 0 3px var(--tvring),0 14px 40px rgba(0,0,0,.55);transition:transform .12s}' +
    'html.tv #znpRoot button:focus{transform:scale(1.12)}' +
    'html.tv ::-webkit-scrollbar{display:none}' +
    'html.tv body{overscroll-behavior:none}';

  function visible(el) {
    if (!el || el.disabled || el.hidden) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    if (r.bottom < 0 || r.top > innerHeight + 2000 && false) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.pointerEvents !== "none";
  }
  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),[onclick],.card,.zam-card,.zcw-card,.zph-card,.zac-card,.zep-row,.zam-chip,.tab,.chip,[role=button]';

  /* la capa que está encima (menús, fichas, reproductor, diálogos) limita a dónde puede ir el foco */
  function scope() {
    var layers = ["#znpRoot", ".zpl-sh", ".zy-dlg", "#zplRoot", "#zamRoot", "#rdPlayer", ".modal-wrap.open", ".modal-wrap.show", ".modal-wrap:not(.hidden):not([hidden])"];
    for (var i = 0; i < layers.length; i++) {
      var list = D.querySelectorAll(layers[i]);
      for (var j = list.length - 1; j >= 0; j--) if (!list[j].hidden && visible(list[j]) && getComputedStyle(list[j]).position === "fixed") return list[j];
    }
    return D;
  }
  function items(root) {
    var out = [], all = root.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el)) continue;
      if (el.closest && el.closest("[inert]")) continue;
      /* si un contenedor y su hijo son ambos "clicables", se queda el hijo más interno que sea botón */
      out.push(el);
    }
    return out;
  }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function pick(from, dir, list) {
    var fr = from.getBoundingClientRect(), fc = center(fr), best = null, bs = Infinity;
    list.forEach(function (el) {
      if (el === from || from.contains(el) || el.contains(from)) return;
      var r = el.getBoundingClientRect(), c = center(r), dx = c.x - fc.x, dy = c.y - fc.y, ok, main, cross;
      if (dir === "ArrowRight") { ok = r.left >= fr.right - fr.width * 0.5 && dx > 4; main = Math.max(r.left - fr.right, 0); cross = Math.abs(dy); }
      else if (dir === "ArrowLeft") { ok = r.right <= fr.left + fr.width * 0.5 && dx < -4; main = Math.max(fr.left - r.right, 0); cross = Math.abs(dy); }
      else if (dir === "ArrowDown") { ok = r.top >= fr.bottom - fr.height * 0.5 && dy > 4; main = Math.max(r.top - fr.bottom, 0); cross = Math.abs(dx); }
      else { ok = r.bottom <= fr.top + fr.height * 0.5 && dy < -4; main = Math.max(fr.top - r.bottom, 0); cross = Math.abs(dx); }
      if (!ok) return;
      var s = main + cross * 2.2;
      if (s < bs) { bs = s; best = el; }
    });
    return best;
  }
  function focusEl(el) {
    if (!el) return;
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "0");
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    try { el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); } catch (e) {}
  }
  function firstFocus() {
    var root = scope(), l = items(root);
    l.sort(function (a, b) { var A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return (A.top - B.top) || (A.left - B.left); });
    var cur = l.filter(function (e) { return e.getBoundingClientRect().top >= 0; })[0] || l[0];
    focusEl(cur);
  }

  /* ----- reproductor nativo: flechas = adelantar/atrasar, OK = pausa ----- */
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
    if (inUi) return false; /* con el foco en un botón del reproductor se navega normal */
    if (k === "ArrowRight") { p.seekBy({ ms: 10000 }); showUi(); return true; }
    if (k === "ArrowLeft") { p.seekBy({ ms: -10000 }); showUi(); return true; }
    if (k === "Enter") { p.togglePlay(); showUi(); return true; }
    if (k === "ArrowUp" || k === "ArrowDown") { showUi(); var b = root.querySelector("button"); setTimeout(function () { var bs = items(root); if (bs.length) focusEl(bs[Math.min(bs.length - 1, 0)]); }, 60); return true; }
    return false;
  }

  function enable() {
    if (on) return; on = true;
    H.classList.add("tv");
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    setTimeout(function () { if (!D.activeElement || D.activeElement === D.body) firstFocus(); }, 400);
  }

  D.addEventListener("keydown", function (e) {
    var dpad = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!on) { if (dpad && isNative()) { enable(); firstFocus(); e.preventDefault(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (playerKeys(e)) { e.preventDefault(); return; }
    var a = D.activeElement, typing = a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !/^(button|checkbox|radio|range|submit)$/i.test(a.type || "");
    if (dpad) {
      if (typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return; /* mover el cursor del texto */
      if (a && a.tagName === "INPUT" && a.type === "range" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      var root = scope(), list = items(root);
      if (!a || a === D.body || !root.contains(a)) { firstFocus(); e.preventDefault(); return; }
      var from = a, nxt = pick(from, e.key, list);
      /* los carruseles horizontales: si no hay nada en esa dirección, no hacer nada */
      if (nxt) { focusEl(nxt); }
      e.preventDefault();
    } else if (e.key === "Enter" && a && a !== D.body && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) {
      e.preventDefault(); a.click();
    }
  }, true);

  if (looksTv && isNative()) {
    if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", enable); else enable();
  }
  W.ZTV = { enable: enable, isOn: function () { return on; } };
})();
