/* Zynora · tv.js (modo Android TV) — v3
   Navegación con el control remoto, filas tipo Netflix (el póster se extiende y muestra la sinopsis),
   botón Atrás, teclado solo con OK y foco elegante. En el celular no cambia nada.

   Probar sin TV: en el sitio web (PC) abre la consola y escribe
     localStorage.zynora_tv="1"; location.reload()
   y usa flechas + Enter como si fuera el control. Para quitarlo: localStorage.removeItem("zynora_tv").
   Diagnóstico en pantalla: tecla Menú del control (o F2 en PC), o localStorage.zynora_tv_debug="1". */
(function () {
  "use strict";
  var W = window, D = document, H = D.documentElement;
  function isNative() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  var FORCE = null, DEBUG = false;
  try { FORCE = localStorage.getItem("zynora_tv"); DEBUG = localStorage.getItem("zynora_tv_debug") === "1"; } catch (e) {}
  if (FORCE === "0") { W.ZTV = { enable: function () {}, isOn: function () { return false; }, back: function () { return false; }, debug: function () {} }; return; }
  var UA = navigator.userAgent || "";
  var bigNoTouch = (navigator.maxTouchPoints || 0) === 0 && Math.max((W.screen && screen.width) || 0, (W.screen && screen.height) || 0) >= 900;
  var looksTv = /\b(TV|AFT[A-Z]*|BRAVIA|SmartTV|Android TV|AndroidTV|MiBOX|SHIELD|Chromecast|GoogleTV|Hisense|TCL)\b/i.test(UA) || FORCE === "1" || (isNative() && bigNoTouch);
  function canTv() { return isNative() || FORCE === "1"; }
  var on = false, lastRect = null, lastKeyT = 0, sysEl = null, filt = null, exDone = false;
  var ROWS = "#trendingGrid,#homeUpcomingGrid";

  var CSS =
    'html.tv{cursor:none;--tvw:clamp(128px,12.2vw,215px)}' +
    'html.tv,html.tv *{scroll-behavior:auto!important}' +
    'html.tv *{-webkit-tap-highlight-color:transparent;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}' +
    'html.tv .modal-wrap,html.tv .modal-wrap *{transition:none!important;animation:none!important}' +
    'html.tv ::-webkit-scrollbar{display:none}' +
    /* anillo de foco por defecto para TODO lo enfocable; se apaga donde hay un resaltado propio */
    'html.tv :focus{outline:3px solid rgba(255,255,255,.9)!important;outline-offset:2px}' +
    'html.tv [tabindex="-1"]:focus,html.tv .card:focus,html.tv .zac-card:focus,html.tv .zph-card:focus,html.tv .zcw-card:focus,html.tv input:focus,html.tv textarea:focus{outline:none!important}' +
    'html.tv header{position:relative!important}' +
    'html.tv .avatar{width:46px!important;height:46px!important;min-width:46px!important;max-width:46px!important;flex:none!important;padding:0!important;border-radius:50%!important;aspect-ratio:1/1;display:grid!important;place-items:center;line-height:1}' +
    'html.tv .section-head h2{font-size:clamp(18px,1.7vw,26px)}html.tv .section-head p{font-size:12px}' +
    'html.tv .grid:not(#trendingGrid):not(#homeUpcomingGrid){grid-template-columns:repeat(auto-fill,minmax(var(--tvw),1fr))!important;gap:14px!important}' +
    'html.tv .card h3,html.tv .card .sub,html.tv .card .rating,html.tv .card .type{display:none!important}' +
    'html.tv .card .poster .poster-name{bottom:9px;left:8px;right:8px;font-size:clamp(10px,.95vw,14px);font-weight:800;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    'html.tv .card .poster:before{background:linear-gradient(0deg,#070910e6,transparent 62%)}' +
    'html.tv .card .up-date{position:absolute;z-index:3;top:8px;left:8px;padding:4px 8px;border-radius:8px;background:#070910d9;border:1px solid #ffffff22;font-size:11px;font-weight:800;color:#ffe7a6}' +
    'html.tv #trendingGrid,html.tv #homeUpcomingGrid{display:flex!important;gap:14px;overflow-x:auto;overflow-y:hidden;position:relative;z-index:2;padding:20px 56px 118px 10px;margin:0 -10px;grid-template-columns:none;scroll-snap-type:none!important}' +
    'html.tv #trendingGrid .card,html.tv #homeUpcomingGrid .card{flex:0 0 var(--tvw);width:var(--tvw);position:relative}' +
    'html.tv #trendingGrid .poster,html.tv #homeUpcomingGrid .poster{aspect-ratio:auto;height:calc(var(--tvw)*1.5);width:100%}' +
    'html.tv .card.tv-x{flex-basis:calc(var(--tvw)*2.65)!important;width:calc(var(--tvw)*2.65)!important}' +
    'html.tv .card .tv-info{display:none;position:absolute;z-index:6;left:0;right:0;top:calc(var(--tvw)*1.5 + 12px);padding:2px 4px 0}' +
    'html.tv .card.tv-x .tv-info{display:block}' +
    'html.tv .tv-meta{font-size:clamp(11px,1vw,15px);font-weight:700;color:#e8edf8;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    'html.tv .tv-syn{margin:0;font-size:clamp(11px,.95vw,14px);line-height:1.38;color:#b9c3dc;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    'html.tv .poster,html.tv .zac-p,html.tv .zph-p,html.tv .zcw-card,html.tv .hc-slide{transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease}' +
    'html.tv .card:focus .poster,html.tv .zac-card:focus .zac-p,html.tv .zph-card:focus .zph-p,html.tv .zcw-card:focus{transform:scale(1.06);position:relative;z-index:4;border-color:rgba(255,255,255,.7)!important;box-shadow:0 0 0 2px rgba(255,255,255,.6),0 10px 22px rgba(0,0,0,.55)}' +
    'html.tv .card.tv-x:focus .poster{transform:none}' +
    'html.tv .card:focus,html.tv .zac-card:focus,html.tv .zph-card:focus{transform:none;box-shadow:none}' +
    /* póster grande de Inicio: contorno propio (no depende de que el slide tenga position) */
    'html.tv .hc-slide:focus{outline:4px solid #fff!important;outline-offset:-8px!important;border-color:rgba(255,255,255,.9)!important}' +
    'html.tv .hc-slide:focus:after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 3px rgba(255,255,255,.92),inset 0 0 46px rgba(255,255,255,.16);pointer-events:none;z-index:9}' +
    'html.tv button:focus,html.tv a:focus,html.tv select:focus,html.tv [role=button]:focus,html.tv .chip:focus,html.tv .tab:focus{background-color:rgba(255,255,255,.17)!important;color:#fff!important;box-shadow:0 0 0 1px rgba(255,255,255,.42),0 6px 22px rgba(255,255,255,.08)!important;transform:none}' +
    'html.tv .zep-row:focus,html.tv .zam-card:focus{background-color:rgba(255,255,255,.16)!important}' +
    'html.tv .btn.primary:focus,html.tv .zpl-btn.pri:focus,html.tv .zpl-row2 .pri:focus{filter:brightness(1.18);box-shadow:0 0 0 2px rgba(255,255,255,.7),0 8px 26px rgba(0,0,0,.5)!important}' +
    'html.tv header nav button:focus{background:rgba(255,255,255,.18)!important}' +
    'html.tv input:focus,html.tv textarea:focus{box-shadow:0 0 0 1px rgba(255,255,255,.5)!important;border-color:rgba(255,255,255,.55)!important}' +
    'html.tv #znpRoot button:focus{background:rgba(255,255,255,.22)!important;transform:scale(1.1)}' +
    'html.tv #zacWrap .zac-card,html.tv #zplHome .zph-card{position:relative;flex:0 0 clamp(110px,10.5vw,170px)}' +
    'html.tv #zacWrap .zac-card b,html.tv #zplHome .zph-card b{position:absolute;left:8px;right:8px;bottom:8px;font-size:11px;font-weight:800;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none}' +
    'html.tv #zacWrap .zac-p,html.tv #zplHome .zph-p{position:relative}' +
    'html.tv #zacWrap .zac-p:after,html.tv #zplHome .zph-p:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#070910e6,transparent 60%)}' +
    '#tvKb{position:fixed;left:0;right:0;bottom:0;z-index:2000000100;background:rgba(8,11,20,.98);border-top:1px solid rgba(255,255,255,.14);padding:12px 4vw calc(14px + env(safe-area-inset-bottom,0px))}' +
    '#tvKb[hidden]{display:none}#tvKb .tvkb-val{min-height:34px;margin:0 0 10px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.08);color:#fff;font-size:20px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#tvKb .tvkb-r{display:flex;gap:7px;margin-bottom:7px;justify-content:center}#tvKb button{flex:1 1 0;max-width:86px;min-width:0;padding:11px 0;border:0;border-radius:11px;background:rgba(255,255,255,.1);color:#fff;font-weight:700;font-size:18px;font-family:inherit;cursor:pointer}' +
    '#tvKb button.w{max-width:300px;flex:3 1 0}#tvKb button.pri{background:#64f4ff;color:#04121a}#tvKb button.m{max-width:130px;flex:1.4 1 0;font-size:14px}#tvKb.uc button[data-k]{text-transform:uppercase}' +
    '#tvKb button:focus{background:#fff!important;color:#071018!important;transform:scale(1.08);box-shadow:0 4px 16px rgba(0,0,0,.5)!important;outline:none!important}' +
    'html.tv .split{gap:12px!important;align-items:start!important}' +
    'html.tv .split .panel{padding:14px 18px!important;min-height:0!important;border-radius:16px!important}' +
    'html.tv .split .panel h2{font-size:17px!important;margin:4px 0!important}' +
    'html.tv .split .eyebrow{font-size:10px!important}' +
    'html.tv .recommend-form{gap:8px!important;margin-top:8px!important}' +
    'html.tv .recommend-form select,html.tv .recommend-form button,html.tv .recommend-form input{padding-top:9px!important;padding-bottom:9px!important;font-size:13px!important;min-height:0!important}' +
    'html.tv .feature-line{padding:6px 0!important}html.tv .feature-line small{font-size:11px}html.tv .iconbox{width:30px!important;height:30px!important;font-size:14px!important}';


  var CSS2 = `
/* foco: sin outline (en WebViews viejos sale cuadrado); anillo con box-shadow que respeta el radio */
html.tv :focus{outline:none!important}
html.tv button:focus,html.tv a:focus,html.tv select:focus,html.tv [role=button]:focus,html.tv .chip:focus,html.tv .tab:focus,html.tv .text-btn:focus{background-color:rgba(255,255,255,.17)!important;color:#fff!important;box-shadow:0 0 0 3px rgba(255,255,255,.92)!important;transform:none}
html.tv .text-btn{border-radius:12px;padding:6px 12px}
html.tv .hc-slide:focus{outline:none!important;border-color:transparent!important}
html.tv .hc-slide:focus:after{box-shadow:inset 0 0 0 4px rgba(255,255,255,.95),inset 0 0 40px rgba(255,255,255,.10);border-radius:inherit}
/* barra superior: el acento azul sigue al foco, no se queda en la pestaña anterior */
html.tv header nav:focus-within button.active:not(:focus){background:none!important;box-shadow:none!important;color:var(--muted)!important}
html.tv header nav:focus-within button.active:not(:focus)::after{display:none}
html.tv header nav button.tv-pend{color:#fff!important;background:linear-gradient(135deg,rgba(var(--acc-rgb),.28),rgba(var(--acc-rgb),.10))!important}
html.tv header nav button.tv-pend::after{content:"";position:absolute;left:50%;bottom:4px;width:16px;height:2px;border-radius:2px;background:var(--cyan);transform:translateX(-50%)}
/* teclado en pantalla: compacto, centrado abajo */
#tvKb{left:50%;right:auto;transform:translateX(-50%);width:min(64vw,720px);bottom:2.5vh;border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:10px 14px 8px;box-shadow:0 18px 50px rgba(0,0,0,.65)}
#tvKb .tvkb-val{min-height:0;margin:0 0 8px;padding:6px 12px;font-size:clamp(14px,1.6vw,18px);border-radius:10px}
#tvKb .tvkb-r{gap:5px;margin-bottom:5px}
#tvKb button{max-width:56px;padding:clamp(4px,.9vh,8px) 0;border-radius:9px;font-size:clamp(12px,1.45vw,16px)}
#tvKb button.w{max-width:240px}#tvKb button.m{max-width:96px;font-size:clamp(10px,1.1vw,13px)}
#tvKb button:focus{transform:scale(1.06)}
/* Explorar: los filtros viven en un panel lateral */
html.tv .ex-bar{display:none!important}
html.tv .ex-title h1{font-size:clamp(24px,2.6vw,34px)}
html.tv .ex-title p{font-size:13px}
.tv-exbar{display:flex;align-items:center;gap:14px;margin:6px 0 12px}
.tv-exbar .chip{padding:9px 18px;font-size:13px;font-weight:700}
#tvExSum{color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tvFilt{position:fixed;left:0;top:0;bottom:0;z-index:2000000050;width:min(430px,46vw);display:flex;flex-direction:column;background:rgba(8,11,22,.975);border-right:1px solid rgba(255,255,255,.14);box-shadow:14px 0 44px rgba(0,0,0,.65)}
#tvFilt[hidden]{display:none}
#tvFilt .tvf-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1)}
#tvFilt .tvf-h b{flex:1;font-size:17px}
#tvFilt .tvf-h button{flex:none;min-height:0;padding:7px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;font-size:12px;font-weight:700}
#tvFilt .tvf-h .tvf-ok{background:var(--cyan);color:#04121a;border-color:transparent}
#tvFilt .tvf-b{flex:1;overflow-y:auto;padding:6px 14px 60px}
#tvFilt .tvf-t,#tvFilt .ex-head h2{margin:12px 0 6px;font-size:13px;font-weight:800;color:#dfe7f8;letter-spacing:0}
#tvFilt .ex-sec{margin:0}#tvFilt .ex-head{margin-bottom:0}
#tvFilt .chips{display:flex;flex-wrap:wrap!important;overflow:visible!important;gap:6px;margin:0 0 4px!important;padding:0!important}
#tvFilt .chip{flex:0 0 auto;padding:6px 12px!important;font-size:12px!important;min-height:0}
#tvFilt .prov-card{padding:4px 12px 4px 4px;min-height:0;font-size:12px}#tvFilt .prov-card img{width:22px;height:22px}
#tvFilt .ex-region{margin:0 0 8px}#tvFilt .ex-region select{min-height:36px;font-size:13px}
#tvFilt .ex-time{margin:12px 0 0!important;padding:10px 12px!important}
#tvFilt .ex-head .text-btn{font-size:12px;padding:4px 10px}
/* Ajustes: compactos y con foco discreto */
html.tv #settingsPage{max-width:none}
html.tv #settingsPage h1{font-size:clamp(22px,2.2vw,30px)}
html.tv #settingsPage .st-back{min-height:34px;margin-top:4px}
html.tv #settingsPage .st-grid{gap:10px}
html.tv #settingsPage .st-card{padding:10px 16px 2px;border-radius:16px;margin-top:0!important}
html.tv #settingsPage .st-card h2{font-size:15px}
html.tv #settingsPage .st-row{padding:8px 0}
html.tv #settingsPage .st-row.st-first{padding-top:6px}
html.tv #settingsPage .st-lab b{font-size:13px}
html.tv #settingsPage .st-lab small{font-size:10.5px;line-height:1.35;margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
html.tv #settingsPage .st-seg{margin-top:6px;padding:3px;border-radius:12px;gap:3px}
html.tv #settingsPage .st-seg button{min-height:30px;font-size:11.5px;padding:3px 4px;border-radius:9px}
html.tv #settingsPage .st-sw{width:42px;height:24px}
html.tv #settingsPage .st-sw::after{width:18px;height:18px;top:2px;left:2px}
html.tv #settingsPage .st-sw[aria-checked="true"]::after{transform:translateX(18px)}
html.tv #settingsPage .st-gchips{gap:6px;margin-top:8px}
html.tv #settingsPage .st-gchip{min-height:28px;padding:4px 11px;font-size:11.5px}
html.tv #settingsPage .st-kv{margin-top:8px}html.tv #settingsPage .st-kv>div{padding:6px 10px}
html.tv #settingsPage .st-kv dt,html.tv #settingsPage .st-kv dd,html.tv #settingsPage .st-list{font-size:11px}
html.tv #settingsPage input{font-size:12.5px!important;padding-top:8px!important;padding-bottom:8px!important;min-height:0!important}
html.tv #settingsPage .btn{padding:8px 16px!important;font-size:12.5px!important;min-height:0!important}
html.tv #settingsPage button:focus{background-color:rgba(255,255,255,.08)!important;box-shadow:0 0 0 2px rgba(255,255,255,.9)!important}
html.tv #settingsPage button[aria-checked="true"]:focus{background-color:var(--acc-soft)!important}
`;

  /* ---------- visibilidad ---------- */
  function sized(el) {
    if (!el || el.hidden) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    return getComputedStyle(el).display !== "none";
  }
  function visible(el) {
    if (!el || el.disabled || el.hidden) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.pointerEvents !== "none" && parseFloat(cs.opacity) > 0.05;
  }
  /* visible Y dentro de la pantalla (para capas: ventanas, hojas, reproductor) */
  function onScreen(el) {
    if (!visible(el)) return false;
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  }
  /* igual, pero revisando también a los padres (el reproductor oculta los controles con opacity) */
  function shown(el, stop) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.05) return false;
      if (n === stop) break;
    }
    var r = el.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),.card,.hc-slide,.zam-card,.zcw-card,.zph-card,.zac-card,.zep-row,[role=button]';
  var LAYERS = ["#tvKb", "#tvFilt", "#znpRoot", ".zpl-sh", ".zy-dlg", "#zplRoot", "#zamRoot", "#rdPlayer", "#pfRail.open", ".modal-wrap.open", ".modal-wrap.show", ".modal-wrap:not(.hidden):not([hidden])"];

  /* Capa activa. Una capa solo cuenta si está de verdad en pantalla Y tiene algo enfocable:
     antes una ventana cerrada (opacity:0 o fuera de pantalla) o un aviso sin botones "secuestraba" el foco. */
  var scopeC = null;
  function scope() {
    if (scopeC) return scopeC;
    var res = D;
    outer:
    for (var i = 0; i < LAYERS.length; i++) {
      var list = D.querySelectorAll(LAYERS[i]);
      for (var j = list.length - 1; j >= 0; j--) {
        var el = list[j];
        if (el.hidden) continue;
        var pos = getComputedStyle(el).position;
        if ((pos === "fixed" || pos === "absolute") && onScreen(el) && items(el).length) { res = el; break outer; }
      }
    }
    scopeC = res; setTimeout(function () { scopeC = null; }, 0);
    return res;
  }
  function items(root) {
    var out = [], all = root.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest && el.closest("[inert]")) continue;
      if (el.matches && el.matches(".hc-dot,.hc-nav")) continue;
      if (el.tagName === "BUTTON" && el.closest && el.closest(".card,.zcw-card")) continue;
      /* en Ajustes cada grupo de opciones es UNA sola parada (la opción marcada); izquierda/derecha cambia dentro del grupo */
      if (el.getAttribute && el.getAttribute("role") === "radio" && el.getAttribute("aria-checked") !== "true" && !(D.activeElement && D.activeElement.parentNode === el.parentNode)) continue;
      if (!visible(el)) continue;
      out.push(el);
    }
    return out;
  }
  function boxOf(el) { var p = el.matches && el.matches(".card") ? el.querySelector(".poster") : null; return (p || el).getBoundingClientRect(); }
  function copyRect(r) { return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }

  function pick(from, fr, dir, list) {
    var horiz = dir === "ArrowLeft" || dir === "ArrowRight", cand = [];
    var fcx = fr.left + fr.width / 2, fcy = fr.top + fr.height / 2;
    list.forEach(function (el) {
      if (el === from || (from && (from.contains(el) || el.contains(from)))) return;
      var r = boxOf(el), cx = r.left + r.width / 2, cy = r.top + r.height / 2, ok, main, cross, overlap;
      if (dir === "ArrowRight") { ok = cx > fcx + 4 && r.right > fr.right - 2; main = Math.max(r.left - fr.right, 0); }
      else if (dir === "ArrowLeft") { ok = cx < fcx - 4 && r.left < fr.left + 2; main = Math.max(fr.left - r.right, 0); }
      else if (dir === "ArrowDown") { ok = cy > fcy + 4 && r.bottom > fr.bottom - 2; main = Math.max(r.top - fr.bottom, 0); }
      else { ok = cy < fcy - 4 && r.top < fr.top + 2; main = Math.max(fr.top - r.bottom, 0); }
      if (!ok) return;
      if (horiz) { cross = Math.abs(cy - fcy); overlap = Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top); if (overlap < Math.min(r.height, fr.height) * 0.4) overlap = 0; }
      else { cross = Math.abs(cx - fcx); overlap = Math.min(r.right, fr.right) - Math.max(r.left, fr.left); if (overlap <= 0) overlap = 0; }
      cand.push({ el: el, main: main, cross: cross, overlap: overlap });
    });
    if (!cand.length) return null;
    var al = cand.filter(function (c) { return c.overlap > 0; });
    if (horiz && !al.length) return null;
    var use = al.length ? al : cand, best = null, bs = Infinity;
    use.forEach(function (c) { var s = c.main * 3 + c.cross; if (s < bs) { bs = s; best = c.el; } });
    return best;
  }
  /* izquierda/derecha dentro de una fila o del carrusel: siguiente/anterior hermano.
     Solo si el foco está en el póster/slide mismo (no en un botón dentro del slide). */
  function seqNav(from, dir) {
    if (dir !== "ArrowLeft" && dir !== "ArrowRight") return undefined;
    var c = from.closest && from.closest("#trendingGrid,#homeUpcomingGrid,#heroTrack"); if (!c) return undefined;
    if (!from.matches(".card,.hc-slide") || from.parentNode !== c) return undefined;
    var n = from;
    do { n = dir === "ArrowRight" ? n.nextElementSibling : n.previousElementSibling; } while (n && !(n.matches(".card,.hc-slide") && sized(n)));
    return n || null;
  }
  /* desplazamiento horizontal por posiciones reales (no por offsetLeft, que falla si el contenedor no tiene position) */
  function hscroll(c, el, lead) { var cr = c.getBoundingClientRect(), er = el.getBoundingClientRect(); c.scrollLeft += er.left - cr.left - lead; }
  function reveal(el) {
    var row = el.closest && el.closest(ROWS);
    if (row) hscroll(row, el, 56);
    if (scope() !== D) { try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {} return; }
    var r = boxOf(el), vh = innerHeight;
    if (el.matches && el.matches(".hc-slide")) {
      var tr = el.parentNode;
      if (tr && tr.scrollWidth > tr.clientWidth + 2) hscroll(tr, el, (tr.clientWidth - el.offsetWidth) / 2);
      r = el.getBoundingClientRect();
      if (r.top < 10 || r.bottom > vh) W.scrollTo(0, Math.max(0, W.scrollY + r.top - 14));
      return;
    }
    if (r.top < 70 || r.bottom > vh - 170) W.scrollTo(0, Math.max(0, W.scrollY + r.top - vh * 0.2));
  }
  function focusEl(el) {
    if (!el) return;
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "0");
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (x) {} }
    lastRect = copyRect(boxOf(el));
    reveal(el);
  }
  function firstFocus() {
    var root = scope(), l = items(root);
    var pref = l.filter(function (e) { return !(e.closest && e.closest("header")); });
    var pool = (root === D && pref.length) ? pref : l;
    pool.sort(function (a, b) { var A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return (A.top - B.top) || (A.left - B.left); });
    focusEl(pool.filter(function (e) { return e.getBoundingClientRect().top >= 0; })[0] || pool[0]);
  }
  function nearest(list, rc) {
    var best = null, bs = Infinity;
    list.forEach(function (el) { var r = boxOf(el), d = Math.pow(r.left + r.width / 2 - (rc.left + rc.width / 2), 2) + Math.pow(r.top + r.height / 2 - (rc.top + rc.height / 2), 2); if (d < bs) { bs = d; best = el; } });
    return best;
  }

  /* ---------- globales de la app (pueden ser let/const del index.html) ---------- */
  function gTitles() { return typeof titles !== "undefined" ? titles : (W.titles || null); }
  function gUpcoming() { return typeof upcomingCache !== "undefined" ? upcomingCache : (W.upcomingCache || null); }

  var EPS = {}, expEl = null, expT = 0, expT2 = 0, navT = 0;
  function titleOf(card) { var m = /openDetail\('([^']+)'/.exec(card.getAttribute("onclick") || ""); try { return m && typeof W.findTitle === "function" ? W.findTitle(m[1]) : null; } catch (e) { return null; } }
  function metaLine(t) {
    var p = [t.kind || (t.mediaType === "tv" ? "Serie" : "Película")];
    if (t.genre && t.genre.length) p.push(t.genre.slice(0, 2).join(" / "));
    if (t.year) p.push(t.year);
    if (t.mediaType === "tv" && EPS[t.tmdbId]) p.push(EPS[t.tmdbId] + (EPS[t.tmdbId] === 1 ? " episodio" : " episodios"));
    return p.join(" · ");
  }
  function collapse(card) {
    if (!card) return;
    card.classList.remove("tv-x");
    var im = card.querySelector(".poster img");
    if (im && im.getAttribute("data-o")) { im.src = im.getAttribute("data-o"); im.removeAttribute("data-o"); }
  }
  function expand(card) {
    clearTimeout(expT);
    if (expEl && expEl !== card) collapse(expEl);
    expEl = card;
    var t = titleOf(card); if (!t) return;
    var info = card.querySelector(".tv-info");
    if (!info) { info = D.createElement("div"); info.className = "tv-info"; card.appendChild(info); }
    function paint() { info.innerHTML = '<div class="tv-meta"></div><p class="tv-syn"></p>'; info.firstChild.textContent = metaLine(t); info.lastChild.textContent = t.desc || ""; }
    paint();
    card.classList.add("tv-x");
    var xrow = card.closest && card.closest(ROWS); if (xrow) hscroll(xrow, card, 56);   /* al ensancharse, que no quede cortado a la izquierda */
    var im = card.querySelector(".poster img");
    if (im && t.backdropPath && !im.getAttribute("data-o")) { im.setAttribute("data-o", im.src); im.src = "https://image.tmdb.org/t/p/w500" + t.backdropPath; }
    if (t.mediaType === "tv" && t.tmdbId && !EPS[t.tmdbId] && typeof W.tmdb === "function") {
      expT = setTimeout(function () {
        W.tmdb("/tv/" + t.tmdbId).then(function (d) { if (d && d.number_of_episodes) { EPS[t.tmdbId] = d.number_of_episodes; if (expEl === card) paint(); } }).catch(function () {});
      }, 350);
    }
  }
  D.addEventListener("focusin", function (e) {
    if (!on) return;
    var t = e.target;
    if (t && t.getBoundingClientRect) lastRect = copyRect(boxOf(t));
    var row = t.closest && t.closest(ROWS), card = t.closest && t.closest(".card");
    clearTimeout(expT2);
    if (expEl && expEl !== card) { collapse(expEl); expEl = null; if (row && card === t) hscroll(row, card, 56); }   /* al encoger la anterior, la fila se corre: se recoloca */
    if (row && card && card === t) expT2 = setTimeout(function () { if (D.activeElement === card) expand(card); }, 130);
    /* barra superior: el acento sigue al foco; solo las pestañas principales abren su página al detenerse (Más y su menú NO: se eligen con OK) */
    var pend = D.querySelectorAll("header nav button.tv-pend");
    for (var pi = 0; pi < pend.length; pi++) if (pend[pi] !== t) pend[pi].classList.remove("tv-pend");
    if (!(t.closest && t.closest("#navMore"))) closeMore();
    if (t.matches && t.matches("header nav > button[data-page]")) {
      t.classList.add("tv-pend");
      clearTimeout(navT);
      if (!t.classList.contains("active")) navT = setTimeout(function () {
        if (D.activeElement !== t || t.classList.contains("active")) return;
        var label = (t.textContent || "").trim();
        t.click();
        setTimeout(function () {
          var a = D.activeElement; if (a && a !== D.body) return;
          var bs = D.querySelectorAll("header nav button");
          for (var i = 0; i < bs.length; i++) if ((bs[i].textContent || "").trim() === label) { focusEl(bs[i]); return; }
        }, 120);
      }, 180);
    }
  }, true);


  function closeMore() { var m = D.getElementById("navMoreMenu"), b = D.getElementById("navMoreBtn"); if (m && b && !m.hidden) b.click(); }
  function navTarget() { return D.querySelector("header nav > button.active") || D.querySelector("header nav .nav-more-btn.active"); }

  /* ---------- Explorar: filtros en panel lateral ---------- */
  function filtSummary() {
    var el = D.getElementById("tvExSum"); if (!el) return;
    var p = [], t = D.querySelector("#typeChips .chip.active"), g = D.querySelector("#genreChips .chip.active"), pv = D.querySelector("#providerChips .active");
    if (t && t.getAttribute("data-kind") !== "Todo") p.push(t.textContent.trim());
    if (g && g.getAttribute("data-genre") !== "Todo") p.push(g.textContent.trim());
    if (pv && !/^todas$/i.test(pv.textContent.trim())) p.push(pv.textContent.trim());
    el.textContent = p.length ? p.join(" · ") : "Sin filtros";
  }
  function filtOpen() {
    if (!filt) return; filt.hidden = false;
    setTimeout(function () { focusEl(filt.querySelector("#typeChips .chip.active") || filt.querySelector(".chip") || filt.querySelector("button")); }, 30);
  }
  function filtClose() {
    if (!filt || filt.hidden) return false;
    filt.hidden = true; filtSummary();
    var b = D.getElementById("tvExBtn"); if (b) setTimeout(function () { focusEl(b); }, 30);
    return true;
  }
  function setupExplore() {
    if (exDone) return;
    var page = D.getElementById("explorePage"), types = D.getElementById("typeChips"), tf = D.getElementById("timeFilter");
    var title = page && page.querySelector(".ex-title"), secs = page && page.querySelectorAll(".ex-sec");
    if (!page || !types || !tf || !title || !secs.length) return;
    exDone = true;
    filt = D.createElement("aside"); filt.id = "tvFilt"; filt.hidden = true; filt.setAttribute("aria-label", "Filtros");
    filt.innerHTML = '<div class="tvf-h"><b>Filtros</b><span id="tvfClr"></span><button type="button" class="tvf-ok">Listo</button></div><div class="tvf-b"><div class="tvf-t">Tipo</div></div>';
    var body = filt.querySelector(".tvf-b");
    body.appendChild(types);
    [].forEach.call(secs, function (x) { body.appendChild(x); });
    body.appendChild(tf);
    var clr = D.getElementById("exFilterClear"), slot = filt.querySelector("#tvfClr");
    if (clr) { slot.parentNode.insertBefore(clr, slot); slot.remove(); clr.hidden = false; }
    D.body.appendChild(filt);
    var bar = D.createElement("div"); bar.className = "tv-exbar";
    bar.innerHTML = '<button type="button" class="chip" id="tvExBtn">☰ Filtros</button><span id="tvExSum"></span>';
    title.insertAdjacentElement("afterend", bar);
    bar.firstChild.addEventListener("click", filtOpen);
    filt.querySelector(".tvf-ok").addEventListener("click", filtClose);
    filt.addEventListener("click", function () { setTimeout(filtSummary, 80); });
    filtSummary();
  }

  var moreDone = false;
  async function moreTrending() {
    var T = gTitles();
    if (moreDone || typeof W.tmdb !== "function" || !T) return; moreDone = true;
    try {
      for (var pg = 2; pg <= 4; pg++) {
        var d = await W.tmdb("/trending/all/week", { page: pg });
        (d.results || []).filter(function (x) { return x.media_type === "movie" || x.media_type === "tv"; }).forEach(function (x) {
          var n = W.normalize ? W.normalize(x) : null;
          if (n && !T.some(function (t) { return t.id === n.id; })) T.push(n);
        });
      }
      redrawTrending();
    } catch (e) {}
  }
  function redrawTrending() {
    var a = D.activeElement, id = a && a.closest && a.closest("#trendingGrid") ? a.getAttribute("onclick") : null;
    try { W.draw("trendingGrid", []); } catch (e) {}
    if (id) { var again = D.querySelector('#trendingGrid .card[onclick="' + id.replace(/"/g, '\\"') + '"]'); if (again) focusEl(again); }
  }
  var MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function shortDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? Number(m[3]) + "/" + MES[Number(m[2]) - 1] + "/" + m[1].slice(2) : ""; }
  function patches() {
    var oc = W.cardUp;
    if (typeof oc === "function" && !oc.__tv) {
      var f = function (t) { var h = oc(t), d = shortDate(t && t.releaseDate); return d ? h.replace('<span class="poster-name">', '<span class="up-date">' + d + '</span><span class="poster-name">') : h; };
      f.__tv = true; W.cardUp = f;
      var or = W.renderUpcoming;
      if (typeof or === "function" && !or.__tv) {
        var g = function () {
          var r = or.apply(this, arguments);
          try { var hg = D.getElementById("homeUpcomingGrid"), uc = gUpcoming(); if (on && hg && uc && uc.list && uc.list.length) hg.innerHTML = uc.list.slice(0, 40).map(W.cardUp).join(""); } catch (e) {}
          return r;
        };
        g.__tv = true; W.renderUpcoming = g;
      }
      try { W.renderUpcoming(); } catch (e) {}
    }
    var od = W.draw;
    if (typeof od === "function" && !od.__tv) {
      var d2 = function (id, arr) {
        if (on && id === "trendingGrid") { try { var T = gTitles(); if (T) arr = T.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 60); } catch (e) {} }
        return od(id, arr);
      };
      d2.__tv = true; W.draw = d2;
      try { if (typeof W.renderHome === "function") W.renderHome(); } catch (e) {}
    }
  }

  var TEXTY = /^(text|search|email|url|tel|password|number)$/i;
  function lockInputs() {
    var l = D.querySelectorAll("input,textarea");
    for (var i = 0; i < l.length; i++) {
      var el = l[i];
      if (el.tagName === "INPUT" && !TEXTY.test(el.type || "text")) continue;
      if (el === sysEl) continue;
      if (!el.hasAttribute("readonly")) el.setAttribute("readonly", "");
    }
  }
  function player() { var c = W.Capacitor; return c && c.Plugins && c.Plugins.ZinePlayer; }

  /* ---------- diagnóstico en pantalla ---------- */
  var hud = null, hudOn = false, hudT = 0;
  function hudEl() {
    if (!hud) {
      hud = D.createElement("div"); hud.id = "tvHud";
      hud.style.cssText = "position:fixed;left:8px;top:8px;z-index:2147483647;max-width:48vw;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.85);color:#9ff;font:12px/1.4 monospace;pointer-events:none;white-space:pre-wrap;display:none";
      D.body.appendChild(hud);
    }
    return hud;
  }
  function say(t, ms) {
    try { var h = hudEl(); h.textContent = t; h.style.display = "block"; clearTimeout(hudT); if (!hudOn) hudT = setTimeout(function () { if (!hudOn) h.style.display = "none"; }, ms || 3000); } catch (e) {}
  }
  function describe(el) {
    if (!el || el === D.body || el === H) return "(ninguno)";
    var s = el.tagName.toLowerCase(); if (el.id) s += "#" + el.id;
    var c = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : ""; if (c) s += "." + c;
    return s;
  }
  function hudInfo(e) {
    var r = scope();
    return "TV v2 · tecla: " + (e ? e.key + " [" + e.keyCode + "]" : "-") +
      "\nfoco: " + describe(D.activeElement) +
      "\nzona: " + (r === D ? "página" : describe(r)) + " · items: " + items(r).length +
      "\npantalla: " + innerWidth + "x" + innerHeight + " @" + (W.devicePixelRatio || 1) +
      "\nnativa: " + isNative() + " · player: " + !!player();
  }
  function toggleHud() {
    hudOn = !hudOn; var h = hudEl();
    h.style.display = hudOn ? "block" : "none";
    if (hudOn) h.textContent = hudInfo(null);
  }

  /* teclado propio para el control remoto */
  var kb = null, kbT = null, kbUc = false;
  var KROWS = ["1234567890", "qwertyuiop", "asdfghjklñ", "zxcvbnm,.-", "@_/:?=&#+%"];
  function kbBuild() {
    kb = D.createElement("div"); kb.id = "tvKb"; kb.hidden = true;
    var h = '<div class="tvkb-val" id="tvkbVal"></div>';
    KROWS.forEach(function (r) { h += '<div class="tvkb-r">' + r.split("").map(function (c) { return '<button type="button" data-k="' + c + '">' + c + "</button>"; }).join("") + "</div>"; });
    h += '<div class="tvkb-r"><button type="button" class="m" data-a="shift">Mayús</button><button type="button" class="w" data-k=" ">Espacio</button><button type="button" class="m" data-a="del">Borrar</button><button type="button" class="m" data-a="clr">Limpiar</button><button type="button" class="m" data-a="paste">Pegar</button><button type="button" class="m" data-a="sys">Sistema</button><button type="button" class="m pri" data-a="done">Listo</button></div>';
    kb.innerHTML = h; D.body.appendChild(kb);
    kb.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("button"); if (!b || !kbT) return;
      var k = b.getAttribute("data-k"), a = b.getAttribute("data-a");
      if (k != null) kbSet(kbT.value + (kbUc && k.trim() ? k.toUpperCase() : k));
      else if (a === "del") kbSet(kbT.value.slice(0, -1));
      else if (a === "clr") kbSet("");
      else if (a === "shift") { kbUc = !kbUc; kb.classList.toggle("uc", kbUc); }
      else if (a === "paste") kbPaste();
      else if (a === "sys") kbSystem();
      else if (a === "done") kbClose();
    });
  }
  function kbSet(v) {
    var ml = Number(kbT.getAttribute("maxlength")) || 0; if (ml && v.length > ml) v = v.slice(0, ml);
    kbT.value = v;
    kbT.dispatchEvent(new Event("input", { bubbles: true }));
    var o = D.getElementById("tvkbVal"); if (o) o.textContent = (kbT.type === "password" ? v.replace(/./g, "•") : v) || (kbT.placeholder || "");
  }
  function kbOpen(el) {
    if (!kb) kbBuild();
    kbT = el; kbUc = false; kb.classList.remove("uc"); kb.hidden = false;
    var o = D.getElementById("tvkbVal"); o.textContent = (el.type === "password" ? el.value.replace(/./g, "•") : el.value) || (el.placeholder || "");
    setTimeout(function () { var q = kb.querySelector('button[data-k="g"]'); focusEl(q || kb.querySelector("button")); }, 30);
  }
  function note(m) { try { if (typeof W.toast === "function") W.toast(m); else say(m, 3000); } catch (e) { say(m, 3000); } }
  /* pegar: lee el portapapeles del TV (si el WebView lo permite) */
  function kbPaste() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) { note("Este TV no permite pegar desde el portapapeles"); return; }
      navigator.clipboard.readText().then(function (t) { if (t && kbT) kbSet(kbT.value + t); else note("El portapapeles está vacío"); }).catch(function () { note("No se pudo leer el portapapeles"); });
    } catch (e) { note("No se pudo pegar"); }
  }
  /* teclado del sistema: quita el bloqueo del campo y lo enfoca para que Android TV muestre su propio teclado
     (es lo que usan las apps de control remoto del celular, como la de TCL, para enviar texto) */
  function kbSystem() {
    var el = kbT; if (!el) return;
    kbClose();
    sysEl = el; el.removeAttribute("readonly");
    setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (x) {} try { el.click(); } catch (x) {} }, 80);
  }
  D.addEventListener("focusout", function (e) { if (sysEl && e.target === sysEl) { var t = sysEl; sysEl = null; t.setAttribute("readonly", ""); } }, true);
  function kbClose() {
    if (!kb || kb.hidden) return false;
    kb.hidden = true;
    try { kbT.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    var t = kbT; kbT = null;
    if (t) setTimeout(function () { focusEl(t); }, 30);
    return true;
  }

  function playerKeys(e, dir) {
    var root = D.getElementById("znpRoot"); if (!root || root.hidden || !H.classList.contains("znp-on")) return false;
    var p = player(); if (!p) return false;
    var k = dir || e.key, ae = D.activeElement;
    /* "en los controles" solo si el botón enfocado se ve de verdad (si los controles se ocultaron, las flechas adelantan/atrasan) */
    var inUi = !!(ae && ae !== root && root.contains(ae) && shown(ae, root));
    function call(name, arg) {
      try {
        if (typeof p[name] !== "function") { say("player." + name + " no existe"); return; }
        var r = p[name](arg); if (r && typeof r.catch === "function") r.catch(function () {});
      } catch (x) { say("player." + name + ": " + (x && x.message)); }
    }
    function showUi() { var t = root.querySelector(".znp-tap"); if (t) { try { t.click(); } catch (x) {} } }
    if (k === "MediaPlayPause" || k === "MediaPlay" || k === "MediaPause" || (k === " " && !inUi)) { call("togglePlay"); showUi(); return true; }
    if (k === "MediaFastForward" || k === "MediaTrackNext") { call("seekBy", { ms: 30000 }); showUi(); return true; }
    if (k === "MediaRewind" || k === "MediaTrackPrevious") { call("seekBy", { ms: -30000 }); showUi(); return true; }
    if (inUi) return false;
    if (k === "ArrowRight") { call("seekBy", { ms: 10000 }); showUi(); return true; }
    if (k === "ArrowLeft") { call("seekBy", { ms: -10000 }); showUi(); return true; }
    if (isOK(e)) { call("togglePlay"); showUi(); return true; }
    if (k === "ArrowUp" || k === "ArrowDown") { showUi(); setTimeout(function () { var bs = items(root); if (bs.length) focusEl(bs[0]); }, 60); return true; }
    return false;
  }

  function back() {
    if (!on) return false;
    if (kbClose()) return true;
    if (sysEl) { var se = sysEl; try { se.blur(); } catch (e) {} return true; }
    if (filtClose()) return true;
    var mm0 = D.getElementById("navMoreMenu");
    if (mm0 && !mm0.hidden) { var mb = D.getElementById("navMoreBtn"); closeMore(); if (mb) focusEl(mb); return true; }
    var rail = D.getElementById("pfRail");
    if (rail && rail.classList.contains("open")) { try { W.closeRail(); } catch (e) {} setTimeout(firstFocus, 120); return true; }
    var mw = [].slice.call(D.querySelectorAll(".modal-wrap.open")).filter(function (m) { return m.id !== "detailModal"; });
    if (mw.length) { var m = mw[mw.length - 1], c = m.querySelector(".close"); if (c) c.click(); else m.classList.remove("open"); return true; }
    var dm = D.getElementById("detailModal"); if (dm && dm.classList.contains("open")) return false;
    var pg = D.querySelector('main[id$="Page"]:not(.hidden)');
    if (pg && pg.id !== "homePage") { try { W.goPage("home"); } catch (e) {} W.scrollTo(0, 0); setTimeout(firstFocus, 200); return true; }
    if (W.scrollY > 200) { W.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(firstFocus, 350); return true; }
    return false;
  }

  function enable() {
    if (on) return; on = true;
    H.classList.add("tv");
    var st = D.createElement("style"); st.textContent = CSS + CSS2; D.head.appendChild(st);
    lockInputs(); patches(); setupExplore();
    var moT = 0;
    try { new MutationObserver(function () { if (moT) return; moT = setTimeout(function () { moT = 0; lockInputs(); patches(); setupExplore(); }, 150); }).observe(D.body, { childList: true, subtree: true }); } catch (e) {}
    setTimeout(moreTrending, 2500);
    setInterval(function () { try { if (typeof heroTimer !== "undefined" && heroTimer) { clearInterval(heroTimer); heroTimer = null; } } catch (e) {} }, 1500);
    setTimeout(function () { if (!D.activeElement || D.activeElement === D.body) firstFocus(); }, 600);
    if (DEBUG) toggleHud(); else say("Modo TV activo · botón Menú = diagnóstico", 4000);
  }

  /* ---------- teclas ---------- */
  function dirOf(e) {
    var k = e.key;
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") return k;
    var c = e.keyCode; /* respaldo por si el control manda key vacío */
    return c === 19 ? "ArrowUp" : c === 20 ? "ArrowDown" : c === 21 ? "ArrowLeft" : c === 22 ? "ArrowRight" : null;
  }
  function isOK(e) { var k = e.key, c = e.keyCode; return k === "Enter" || k === "NumpadEnter" || k === "Select" || c === 13 || c === 23 || c === 66; }
  function isMenu(e) { return e.key === "ContextMenu" || e.key === "F2" || (e.keyCode === 82 && e.key !== "r" && e.key !== "R"); }

  /* CH+/CH- o AvPág/RePág: salta una pantalla (útil en Ajustes y listas largas) */
  function pageKey(e) {
    var k = e.key, c = e.keyCode;
    if (k === "PageDown" || k === "ChannelDown" || c === 34 || c === 167) return 1;
    if (k === "PageUp" || k === "ChannelUp" || c === 33 || c === 166) return -1;
    return 0;
  }
  function pageJump(down) {
    var root = scope(); if (root !== D) return;
    W.scrollBy(0, (down ? 1 : -1) * Math.round(innerHeight * 0.75));
    setTimeout(function () {
      var l = items(D).filter(function (el) { if (el.closest && el.closest("header")) return false; var r = el.getBoundingClientRect(); return r.top >= 40 && r.top < innerHeight - 60; });
      l.sort(function (x, y) { var A = x.getBoundingClientRect(), B = y.getBoundingClientRect(); return (A.top - B.top) || (A.left - B.left); });
      if (l[0]) focusEl(l[0]);
    }, 60);
  }
  function navigate(dir) {
    var a = D.activeElement;
    var root = scope(), list = items(root), valid = a && a !== D.body && root.contains(a) && visible(a), nxt = null;
    if (valid) {
      var host = a.closest && a.closest(".hc-slide");
      if (host && host === a && dir === "ArrowDown") { var inner = items(a); if (inner.length) nxt = inner[0]; }       /* del póster grande a sus botones */
      else if (host && host !== a && dir === "ArrowUp") nxt = host;                                                       /* de sus botones al póster */
      if (!nxt) { var sq = seqNav(a, dir); nxt = sq !== undefined ? sq : pick(a, boxOf(a), dir, list); }
    } else if (lastRect) {
      nxt = pick(null, lastRect, dir, list);
      if (!nxt && !/Left|Right/.test(dir)) nxt = nearest(list, lastRect);
    }
    if (nxt && dir === "ArrowUp" && root === D && nxt.closest && nxt.closest("header nav") && !(a && a.closest && a.closest("header"))) {
      var tg = navTarget(); if (tg && visible(tg)) nxt = tg;   /* desde el contenido se sube a la pestaña de la página actual (o a Más) */
    }
    if (!valid && !nxt) { if (lastRect) nxt = nearest(list, lastRect); else { firstFocus(); return; } }
    if (nxt) focusEl(nxt);
  }

  D.addEventListener("keydown", function (e) {
    var dir = dirOf(e);
    if (!on) { if (dir && canTv()) { enable(); firstFocus(); e.preventDefault(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    try {
      if (isMenu(e)) { toggleHud(); e.preventDefault(); return; }
      if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") { if (back()) { e.preventDefault(); e.stopPropagation(); } return; }
      if (playerKeys(e, dir)) { e.preventDefault(); e.stopPropagation(); return; }
      var a = D.activeElement, tag = a ? a.tagName : "";
      var isInput = a && /^(INPUT|TEXTAREA)$/.test(tag) && (tag === "TEXTAREA" || TEXTY.test(a.type || "text"));
      if (a === sysEl && sysEl && !dir && !isOK(e)) return;
      if (isOK(e) && isInput && a !== sysEl) { e.preventDefault(); if (!e.repeat) kbOpen(a); return; }
      if (isOK(e) && a === sysEl && sysEl) return;
      var more = D.getElementById("navMoreBtn"), mm = D.getElementById("navMoreMenu");
      if (more && a === more && mm && (isOK(e) || (dir === "ArrowDown" && !mm.hidden))) {
        e.preventDefault(); e.stopPropagation(); if (e.repeat) return;
        if (mm.hidden) more.click();
        setTimeout(function () { var f = mm.querySelector("button"); if (f && !mm.hidden) focusEl(f); }, 30);
        return;
      }
      var pj = pageKey(e);
      if (pj) { e.preventDefault(); e.stopPropagation(); pageJump(pj > 0); return; }
      if (dir) {
        if (tag === "INPUT" && a.type === "range" && (dir === "ArrowLeft" || dir === "ArrowRight")) return;
        /* se cancela SIEMPRE y primero: si no, el WebView mueve el foco por su cuenta y se "saltan" botones */
        e.preventDefault(); e.stopPropagation();
        var now = Date.now(); if (now - lastKeyT < (e.repeat ? 110 : 30)) return; lastKeyT = now;
        navigate(dir);
        return;
      }
      if (isOK(e) && a && a !== D.body) {
        if (tag === "SELECT" || (tag === "INPUT" && a.type === "range")) return;   /* el WebView abre su selector */
        e.preventDefault();                                                          /* OK siempre hace click, también en botones y enlaces */
        if (!e.repeat) {
          var inMenu = a.closest && a.closest("#navMoreMenu");
          a.click();
          if (inMenu) setTimeout(function () { var mb2 = D.getElementById("navMoreBtn"); if (mb2) focusEl(mb2); }, 160);   /* tras elegir, el foco queda en Más (ya activo) */
        }
      }
    } catch (err) {
      if (dir || isOK(e)) e.preventDefault();
      say("ERROR tv.js: " + (err && err.message), 6000);
    } finally {
      if (hudOn) setTimeout(function () { try { hudEl().textContent = hudInfo(e); } catch (x) {} }, 0);
    }
  }, true);

  if (looksTv && canTv()) { if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", enable); else enable(); }
  W.ZTV = { enable: enable, isOn: function () { return on; }, back: back, debug: toggleHud };
})();
