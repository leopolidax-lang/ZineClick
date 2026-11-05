/* Zynora · hover-card.js
   Tarjeta flotante al pasar el mouse sobre un póster (estilo Paramount+).
   Solo en PC con mouse: en el celular, la app y la TV no hace nada.
   Usa las funciones que ya existen en index.html: findTitle, openDetail, toggleList y getList. */
(function () {
  "use strict";
  var W = window, D = document;

  /* solo con mouse real; en la app Android no se activa */
  try { if (W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()) return; } catch (e) {}
  if (!W.matchMedia || !W.matchMedia("(hover:hover) and (pointer:fine)").matches) return;

  var DELAY = 450;   /* ms que hay que dejar el mouse quieto antes de que se abra */
  var SWITCH = 140;  /* ms para cambiar de una tarjeta a otra ya con la tarjeta abierta */
  var HIDE = 140;    /* ms antes de cerrarla al sacar el mouse */
  var TMDB = "https://image.tmdb.org/t/p/";

  var pop = null, shownCard = null, pending = null, curId = null, showT = 0, hideT = 0;

  var CSS = '' +
    '#zhcPop{position:fixed;z-index:19;left:0;top:0;width:320px;border-radius:20px;overflow:hidden;background:rgba(12,15,32,.97);border:1px solid rgba(255,255,255,.16);box-shadow:0 34px 80px rgba(0,0,0,.75),0 0 46px -12px rgba(var(--acc-rgb,100,244,255),.35);color:#f4f7ff;opacity:0;transform:scale(.9);pointer-events:none;transition:opacity .16s ease,transform .22s cubic-bezier(.2,.8,.2,1);cursor:pointer;font-family:inherit}' +
    '#zhcPop.on{opacity:1;transform:scale(1);pointer-events:auto}' +
    'html.reduce-motion #zhcPop{transition:none}' +
    '#zhcPop .zhc-img{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,var(--c1,#3b3f6b),var(--c2,#12142b));overflow:hidden}' +
    '#zhcPop .zhc-img img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 20%;opacity:0;transition:opacity .25s}' +
    '#zhcPop .zhc-img img.bg.ok{opacity:1}' +
    '#zhcPop .zhc-img::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(12,15,32,1) 0%,rgba(12,15,32,.55) 28%,transparent 62%)}' +
    '#zhcPop .zhc-ttl{position:absolute;z-index:1;left:16px;right:16px;bottom:10px}' +
    '#zhcPop .zhc-ttl img{display:block;max-width:70%;max-height:54px;object-fit:contain;filter:drop-shadow(0 3px 12px rgba(0,0,0,.7))}' +
    '#zhcPop .zhc-ttl b{display:block;font-size:20px;line-height:1.1;font-weight:800;letter-spacing:-.4px;text-shadow:0 2px 14px rgba(0,0,0,.8)}' +
    '#zhcPop .zhc-body{padding:4px 16px 16px;display:grid;gap:9px}' +
    '#zhcPop .zhc-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:12px;font-weight:700;color:#dbe4f7}' +
    '#zhcPop .zhc-meta i{font-style:normal;opacity:.4}' +
    '#zhcPop .zhc-rate{color:#f2d38a}' +
    '#zhcPop .zhc-gen{font-size:12px;font-weight:600;color:var(--cyan,#64f4ff)}' +
    '#zhcPop .zhc-desc{margin:0;font-size:13px;line-height:1.45;color:#c3cde3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    '#zhcPop .zhc-act{display:flex;align-items:center;gap:10px;margin-top:4px}' +
    '#zhcPop .zhc-go{flex:1;height:42px;min-height:42px;padding:0 14px;border-radius:999px;font-size:14px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}' +
    '#zhcPop .zhc-go svg{width:14px;height:14px;fill:currentColor}' +
    '#zhcPop .zhc-add{flex:none;width:42px;height:42px;border-radius:50%;border:1.5px solid rgba(255,255,255,.55);background:rgba(255,255,255,.06);color:#fff;display:grid;place-items:center;padding:0;cursor:pointer;transition:background .15s,border-color .15s,color .15s}' +
    '#zhcPop .zhc-add svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}' +
    '#zhcPop .zhc-add:hover{background:rgba(255,255,255,.16);border-color:#fff}' +
    '#zhcPop .zhc-add.on{border-color:var(--cyan,#64f4ff);color:var(--cyan,#64f4ff)}';

  var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15a.6.6 0 0 0 .9.5l12-7.5a.6.6 0 0 0 0-1L7.9 4a.6.6 0 0 0-.9.5z"/></svg>';
  var ICON_PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }
  function url(base, p) { return !p ? "" : (/^https?:/i.test(p) ? p : TMDB + base + p); }

  function cardOf(el) { return el && el.closest ? el.closest(".card.cap") : null; }
  function idOf(card) {
    var m = /openDetail\('([^']+)'\)/.exec(card.getAttribute("onclick") || "");
    return m ? m[1] : null;
  }
  function blocked() {
    return !!(D.querySelector(".modal-wrap.open") || D.documentElement.classList.contains("znp-on") || D.fullscreenElement);
  }
  function inList(id) {
    try { return W.getList("watchlist").map(String).indexOf(String(id)) >= 0; } catch (e) { return false; }
  }

  function ensure() {
    if (pop) return;
    var s = D.createElement("style"); s.textContent = CSS; D.head.appendChild(s);
    pop = D.createElement("div"); pop.id = "zhcPop";
    pop.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("button")) return;
      var id = curId; hideNow();
      if (id && typeof W.openDetail === "function") W.openDetail(id);
    });
    D.body.appendChild(pop);
  }

  function build(t, id) {
    var back = url("w780/", t.backdropPath) || url("w500/", t.posterPath);
    var logo = url("w300/", t.logoPath);
    var meta = [];
    if (t.year) meta.push("<span>" + esc(t.year) + "</span>");
    if (t.kind) meta.push("<span>" + esc(t.kind) + "</span>");
    if (Number(t.rating) > 0) meta.push('<span class="zhc-rate">★ ' + Number(t.rating).toFixed(1) + "</span>");
    var gen = (t.genre || []).slice(0, 3).map(esc).join(" · ");
    var desc = t.desc && !/^No hay sinopsis/i.test(t.desc) ? t.desc : "";
    var colors = t.colors || [];
    pop.style.setProperty("--c1", colors[0] || "#3b3f6b");
    pop.style.setProperty("--c2", colors[1] || "#12142b");
    pop.innerHTML =
      '<div class="zhc-img">' + (back ? '<img class="bg" alt="" src="' + esc(back) + '">' : "") +
        '<div class="zhc-ttl">' + (logo ? '<img alt="' + esc(t.title) + '" src="' + esc(logo) + '">' : "<b>" + esc(t.title) + "</b>") + "</div></div>" +
      '<div class="zhc-body">' +
        (meta.length ? '<div class="zhc-meta">' + meta.join("<i>•</i>") + "</div>" : "") +
        (gen ? '<div class="zhc-gen">' + gen + "</div>" : "") +
        (desc ? '<p class="zhc-desc">' + esc(desc) + "</p>" : "") +
        '<div class="zhc-act"><button type="button" class="btn primary zhc-go">' + ICON_PLAY + "<span>Ver ahora</span></button>" +
        '<button type="button" class="zhc-add' + (inList(id) ? " on" : "") + '" aria-label="Mi lista" title="Mi lista">' + (inList(id) ? ICON_CHECK : ICON_PLUS) + "</button></div>" +
      "</div>";
    var bg = pop.querySelector("img.bg");
    if (bg) { bg.onload = function () { bg.classList.add("ok"); }; if (bg.complete && bg.naturalWidth) bg.classList.add("ok"); }
    pop.querySelector(".zhc-go").onclick = function (ev) {
      ev.stopPropagation();
      var target = curId; hideNow();
      if (typeof W.openDetail !== "function") return;
      /* abre la ficha y pulsa su botón "Reproducir", igual que si lo hicieras tú */
      Promise.resolve(W.openDetail(target)).then(function () {
        setTimeout(function () {
          var m = D.getElementById("detailModal");
          var b = m && m.classList.contains("open") && m.querySelector(".det-play");
          if (b) b.click();
        }, 80);
      }).catch(function () {});
    };
    var add = pop.querySelector(".zhc-add");
    add.onclick = function (ev) {
      ev.stopPropagation();
      try { W.toggleList("watchlist", id); } catch (e) { return; }
      var on = inList(id);
      add.classList.toggle("on", on);
      add.innerHTML = on ? ICON_CHECK : ICON_PLUS;
    };
  }

  function show(c) {
    var id = idOf(c);
    if (!id || blocked() || typeof W.findTitle !== "function") return;
    var t; try { t = W.findTitle(id); } catch (e) { t = null; }
    if (!t) return;
    var pr = (c.querySelector(".poster") || c).getBoundingClientRect();
    if (pr.width < 40 || pr.bottom < 0 || pr.top > W.innerHeight) return;
    ensure();
    pop.classList.remove("on");
    curId = id;
    build(t, id);
    var w = Math.max(300, Math.min(360, pr.width * 1.7));
    pop.style.width = w + "px";
    var h = pop.offsetHeight;
    var left = Math.max(10, Math.min(W.innerWidth - w - 10, pr.left + pr.width / 2 - w / 2));
    var top = Math.max(10, Math.min(W.innerHeight - h - 10, pr.top + pr.height / 2 - h / 2));
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.transformOrigin = (pr.left + pr.width / 2 - left) + "px " + (pr.top + pr.height / 2 - top) + "px";
    shownCard = c; pending = null; showT = 0;
    clearTimeout(hideT); hideT = 0;
    W.requestAnimationFrame(function () { if (shownCard === c) pop.classList.add("on"); });
  }

  function hideNow() {
    clearTimeout(showT); clearTimeout(hideT);
    showT = 0; hideT = 0; pending = null; shownCard = null; curId = null;
    if (pop) pop.classList.remove("on");
  }

  D.addEventListener("mousemove", function (e) {
    if (e.buttons) { if (shownCard || pending) hideNow(); return; }
    var overPop = pop && pop.contains(e.target);
    var c = overPop ? shownCard : cardOf(e.target);
    if (c && blocked()) { hideNow(); return; }

    if (c && c === shownCard) {            /* sigue sobre la misma tarjeta */
      clearTimeout(hideT); hideT = 0;
      clearTimeout(showT); showT = 0; pending = null;
      return;
    }
    if (c) {                                /* entró a otra tarjeta */
      clearTimeout(hideT); hideT = 0;
      if (pending !== c) {
        clearTimeout(showT); pending = c;
        showT = setTimeout(function () { if (pending === c) show(c); }, shownCard ? SWITCH : DELAY);
      }
      return;
    }
    clearTimeout(showT); showT = 0; pending = null;   /* no está sobre ninguna tarjeta */
    if (shownCard && !hideT) hideT = setTimeout(hideNow, HIDE);
  }, { passive: true });

  /* se cierra al hacer scroll, cambiar el tamaño, salir de la ventana o con Escape */
  D.addEventListener("scroll", function () { if (shownCard || pending) hideNow(); }, true);
  D.addEventListener("wheel", function () { if (shownCard || pending) hideNow(); }, { passive: true });
  W.addEventListener("resize", hideNow);
  W.addEventListener("blur", hideNow);
  D.documentElement.addEventListener("mouseleave", hideNow);
  D.addEventListener("keydown", function (e) { if (e.key === "Escape") hideNow(); });
})();
