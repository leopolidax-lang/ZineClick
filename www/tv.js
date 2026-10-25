/* Zynora · tv.js (modo Android TV)
   Navegación con el control remoto, filas tipo Netflix (el póster se extiende y muestra la sinopsis),
   botón Atrás, teclado solo con OK y foco elegante. En el celular no cambia nada. */
(function () {
  "use strict";
  var W = window, D = document, H = D.documentElement;
  function isNative() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  var FORCE = null; try { FORCE = localStorage.getItem("zynora_tv"); } catch (e) {}
  if (FORCE === "0") return;
  var UA = navigator.userAgent || "";
  var looksTv = /\b(TV|AFT[A-Z]*|BRAVIA|SmartTV|Android TV|AndroidTV|MiBOX|SHIELD|Chromecast|GoogleTV|Hisense|TCL)\b/i.test(UA) || FORCE === "1";
  var on = false, lastRect = null, lastKeyT = 0;
  var ROWS = "#trendingGrid,#homeUpcomingGrid";

  var CSS =
    'html.tv{cursor:none;--tvw:clamp(128px,12.2vw,215px)}' +
    'html.tv *{-webkit-tap-highlight-color:transparent}' +
    'html.tv ::-webkit-scrollbar{display:none}' +
    'html.tv :focus{outline:none!important}' +
    'html.tv header{position:relative!important}' +
    'html.tv .avatar{width:46px!important;height:46px!important;min-width:46px!important;max-width:46px!important;flex:none!important;padding:0!important;border-radius:50%!important;aspect-ratio:1/1;display:grid!important;place-items:center;line-height:1}' +
    'html.tv .section-head h2{font-size:clamp(18px,1.7vw,26px)}html.tv .section-head p{font-size:12px}' +
    'html.tv .grid:not(#trendingGrid):not(#homeUpcomingGrid){grid-template-columns:repeat(auto-fill,minmax(var(--tvw),1fr))!important;gap:14px!important}' +
    'html.tv .card h3,html.tv .card .sub,html.tv .card .rating,html.tv .card .type{display:none!important}' +
    'html.tv .card .poster .poster-name{bottom:9px;left:8px;right:8px;font-size:clamp(10px,.95vw,14px);font-weight:800;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
    'html.tv .card .poster:before{background:linear-gradient(0deg,#070910e6,transparent 62%)}' +
    'html.tv .card .up-date{position:absolute;z-index:3;top:8px;left:8px;padding:4px 8px;border-radius:8px;background:#070910d9;border:1px solid #ffffff22;font-size:11px;font-weight:800;color:#ffe7a6}' +
    'html.tv #trendingGrid,html.tv #homeUpcomingGrid{display:flex!important;gap:14px;overflow-x:auto;overflow-y:hidden;position:relative;z-index:2;padding:20px 56px 150px 10px;margin:0 -10px -118px;grid-template-columns:none}' +
    'html.tv #trendingGrid .card,html.tv #homeUpcomingGrid .card{flex:0 0 var(--tvw);width:var(--tvw);position:relative;transition:flex-basis .22s ease,width .22s ease}' +
    'html.tv #trendingGrid .poster,html.tv #homeUpcomingGrid .poster{aspect-ratio:auto;height:calc(var(--tvw)*1.5);width:100%}' +
    'html.tv .card.tv-x{flex-basis:calc(var(--tvw)*2.65)!important;width:calc(var(--tvw)*2.65)!important}' +
    'html.tv .card .tv-info{display:none;position:absolute;z-index:6;left:0;right:0;top:calc(var(--tvw)*1.5 + 12px);padding:2px 4px 0}' +
    'html.tv .card.tv-x .tv-info{display:block}' +
    'html.tv .tv-meta{font-size:clamp(11px,1vw,15px);font-weight:700;color:#e8edf8;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    'html.tv .tv-syn{margin:0;font-size:clamp(11px,.95vw,14px);line-height:1.38;color:#b9c3dc;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}' +
    'html.tv .poster,html.tv .zac-p,html.tv .zph-p,html.tv .zcw-card,html.tv .hc-slide{transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}' +
    'html.tv .card:focus .poster,html.tv .zac-card:focus .zac-p,html.tv .zph-card:focus .zph-p,html.tv .zcw-card:focus{transform:scale(1.06);position:relative;z-index:4;border-color:rgba(255,255,255,.6)!important;box-shadow:0 0 0 1px rgba(255,255,255,.55),0 16px 38px rgba(0,0,0,.65),0 0 26px rgba(255,255,255,.14)}' +
    'html.tv .card.tv-x:focus .poster{transform:none}' +
    'html.tv .card:focus,html.tv .zac-card:focus,html.tv .zph-card:focus{transform:none;box-shadow:none}' +
    'html.tv .hc-slide:focus{box-shadow:inset 0 0 0 2px rgba(255,255,255,.75),0 0 30px rgba(255,255,255,.12)}' +
    'html.tv button:focus,html.tv a:focus,html.tv select:focus,html.tv [role=button]:focus,html.tv .chip:focus,html.tv .tab:focus{background-color:rgba(255,255,255,.17)!important;color:#fff!important;box-shadow:0 0 0 1px rgba(255,255,255,.42),0 6px 22px rgba(255,255,255,.08)!important;transform:none}' +
    'html.tv .btn.primary:focus,html.tv .zpl-btn.pri:focus,html.tv .zpl-row2 .pri:focus{filter:brightness(1.18);box-shadow:0 0 0 2px rgba(255,255,255,.7),0 8px 26px rgba(0,0,0,.5)!important}' +
    'html.tv header nav button:focus{background:rgba(255,255,255,.18)!important}' +
    'html.tv input:focus,html.tv textarea:focus{box-shadow:0 0 0 1px rgba(255,255,255,.5)!important;border-color:rgba(255,255,255,.55)!important}' +
    'html.tv #znpRoot button:focus{background:rgba(255,255,255,.22)!important;transform:scale(1.1)}' +
    'html.tv #zacWrap .zac-card,html.tv #zplHome .zph-card{position:relative;flex:0 0 clamp(110px,10.5vw,170px)}' +
    'html.tv #zacWrap .zac-card b,html.tv #zplHome .zph-card b{position:absolute;left:8px;right:8px;bottom:8px;font-size:11px;font-weight:800;color:#fff;text-shadow:0 2px 8px #000;pointer-events:none}' +
    'html.tv #zacWrap .zac-p,html.tv #zplHome .zph-p{position:relative}' +
    'html.tv #zacWrap .zac-p:after,html.tv #zplHome .zph-p:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#070910e6,transparent 60%)}' +
    'html.tv .split{gap:12px!important;align-items:start!important}' +
    'html.tv .split .panel{padding:14px 18px!important;min-height:0!important;border-radius:16px!important}' +
    'html.tv .split .panel h2{font-size:17px!important;margin:4px 0!important}' +
    'html.tv .split .eyebrow{font-size:10px!important}' +
    'html.tv .recommend-form{gap:8px!important;margin-top:8px!important}' +
    'html.tv .recommend-form select,html.tv .recommend-form button,html.tv .recommend-form input{padding-top:9px!important;padding-bottom:9px!important;font-size:13px!important;min-height:0!important}' +
    'html.tv .feature-line{padding:6px 0!important}html.tv .feature-line small{font-size:11px}html.tv .iconbox{width:30px!important;height:30px!important;font-size:14px!important}';

  function visible(el) {
    if (!el || el.disabled || el.hidden) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.pointerEvents !== "none";
  }
  var SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),.card,.hc-slide,.zam-card,.zcw-card,.zph-card,.zac-card,.zep-row,[role=button]';
  var LAYERS = ["#znpRoot", ".zpl-sh", ".zy-dlg", "#zplRoot", "#zamRoot", "#rdPlayer", "#pfRail.open", ".modal-wrap.open", ".modal-wrap.show", ".modal-wrap:not(.hidden):not([hidden])"];
  function scope() {
    for (var i = 0; i < LAYERS.length; i++) {
      var list = D.querySelectorAll(LAYERS[i]);
      for (var j = list.length - 1; j >= 0; j--) {
        var el = list[j], pos = getComputedStyle(el).position;
        if (!el.hidden && visible(el) && (pos === "fixed" || pos === "absolute")) return el;
      }
    }
    return D;
  }
  function items(root) {
    var out = [], all = root.querySelectorAll(SEL);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!visible(el) || (el.closest && el.closest("[inert]"))) continue;
      if (el.matches && el.matches(".hc-dot,.hc-nav")) continue;
      if (el.tagName === "BUTTON" && el.closest && el.closest(".card,.zcw-card")) continue;
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
  function reveal(el) {
    var row = el.closest && el.closest(ROWS);
    if (row) { try { row.scrollTo({ left: Math.max(0, el.offsetLeft - 56), behavior: "smooth" }); } catch (e) { row.scrollLeft = Math.max(0, el.offsetLeft - 56); } }
    if (scope() !== D) { try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch (e) {} return; }
    var r = boxOf(el), vh = innerHeight;
    if (r.top < 70 || r.bottom > vh - 170) { try { W.scrollTo({ top: Math.max(0, W.scrollY + r.top - vh * 0.2), behavior: "smooth" }); } catch (e) {} }
    if (el.closest && el.closest(".hc-track")) { try { el.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
  }
  function focusEl(el) {
    if (!el) return;
    if (!el.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) el.setAttribute("tabindex", "0");
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
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

  var EPS = {}, expEl = null, expT = 0;
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
    var im = card.querySelector(".poster img");
    if (im && t.backdropPath && !im.getAttribute("data-o")) { im.setAttribute("data-o", im.src); im.src = "https://image.tmdb.org/t/p/w780" + t.backdropPath; }
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
    if (row && card && card === t) expand(card); else if (expEl) { collapse(expEl); expEl = null; }
  }, true);

  var moreDone = false;
  async function moreTrending() {
    if (moreDone || typeof W.tmdb !== "function") return; moreDone = true;
    try {
      for (var pg = 2; pg <= 4; pg++) {
        var d = await W.tmdb("/trending/all/week", { page: pg });
        (d.results || []).filter(function (x) { return x.media_type === "movie" || x.media_type === "tv"; }).forEach(function (x) {
          var n = W.normalize ? W.normalize(x) : null;
          if (n && !titles.some(function (t) { return t.id === n.id; })) titles.push(n);
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
          try { var hg = D.getElementById("homeUpcomingGrid"); if (on && hg && upcomingCache && upcomingCache.list && upcomingCache.list.length) hg.innerHTML = upcomingCache.list.slice(0, 40).map(W.cardUp).join(""); } catch (e) {}
          return r;
        };
        g.__tv = true; W.renderUpcoming = g;
      }
      try { W.renderUpcoming(); } catch (e) {}
    }
    var od = W.draw;
    if (typeof od === "function" && !od.__tv) {
      var d2 = function (id, arr) {
        if (on && id === "trendingGrid") { try { arr = titles.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 60); } catch (e) {} }
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
      if (el.getAttribute("data-tvedit") === "1") continue;
      if (!el.hasAttribute("readonly")) el.setAttribute("readonly", "");
    }
  }
  function player() { var c = W.Capacitor; return c && c.Plugins && c.Plugins.ZinePlayer; }
  function showKb() { try { var p = player(); if (p && p.showKeyboard) p.showKeyboard(); } catch (e) {} }
  function startEdit(el) {
    el.setAttribute("data-tvedit", "1"); el.removeAttribute("readonly");
    el.blur(); el.focus();
    try { var n = el.value.length; el.setSelectionRange(n, n); } catch (e) {}
    showKb(); setTimeout(showKb, 120);
  }
  function stopEdit(el) { el.removeAttribute("data-tvedit"); el.setAttribute("readonly", ""); el.blur(); setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (e) {} }, 30); }
  function isEditing(a) { return !!(a && a.getAttribute && a.getAttribute("data-tvedit") === "1"); }
  D.addEventListener("focusout", function (e) { if (on && isEditing(e.target)) { e.target.removeAttribute("data-tvedit"); e.target.setAttribute("readonly", ""); } }, true);

  function playerKeys(e) {
    var root = D.getElementById("znpRoot"); if (!root || root.hidden || !H.classList.contains("znp-on")) return false;
    var p = player(); if (!p) return false;
    var inUi = D.activeElement && root.contains(D.activeElement) && D.activeElement !== root, k = e.key;
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

  function back() {
    if (!on) return false;
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
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    lockInputs(); patches();
    try { new MutationObserver(function () { lockInputs(); patches(); }).observe(D.body, { childList: true, subtree: true }); } catch (e) {}
    setTimeout(moreTrending, 2500);
    setTimeout(function () { if (!D.activeElement || D.activeElement === D.body) firstFocus(); }, 600);
  }

  D.addEventListener("keydown", function (e) {
    var dpad = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!on) { if (dpad && isNative()) { enable(); firstFocus(); e.preventDefault(); } return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (playerKeys(e)) { e.preventDefault(); return; }
    var a = D.activeElement, isInput = a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && (a.tagName === "TEXTAREA" || TEXTY.test(a.type || "text"));
    if (isInput && isEditing(a)) {
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); stopEdit(a); return; }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); stopEdit(a); } else return;
    }
    if ((e.key === "Enter" || e.keyCode === 23 || e.keyCode === 13) && isInput && !isEditing(a)) { e.preventDefault(); startEdit(a); return; }
    if (dpad) {
      var now = Date.now(); if (now - lastKeyT < 90) { e.preventDefault(); return; } lastKeyT = now;
      if (a && a.tagName === "INPUT" && a.type === "range" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return;
      var root = scope(), list = items(root), valid = a && a !== D.body && root.contains(a) && visible(a), nxt = null;
      if (valid) nxt = pick(a, boxOf(a), e.key, list);
      else if (lastRect) { nxt = pick(null, lastRect, e.key, list); if (!nxt && !/Left|Right/.test(e.key)) nxt = nearest(list, lastRect); }
      if (!valid && !nxt) { if (lastRect) nxt = nearest(list, lastRect); else { firstFocus(); e.preventDefault(); return; } }
      if (nxt) focusEl(nxt);
      e.preventDefault();
    } else if (e.key === "Enter" && a && a !== D.body && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) {
      e.preventDefault(); a.click();
    }
  }, true);

  if (looksTv && isNative()) { if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", enable); else enable(); }
  W.ZTV = { enable: enable, isOn: function () { return on; }, back: back };
})();
