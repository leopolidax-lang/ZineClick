/* Zynora · addon-menu.js
   - Botón "Reproducir" de la ficha = menú de addons (o "Continuar" si ya lo veías)
   - Menú de fuentes con el diseño de tarjetas (calidad, tamaño, botón de play)
   - Sección "Seguir viendo" en el inicio
   Funciona en la app y en la web. El reproductor solo aparece después de elegir un enlace. */
(function () {
  "use strict";
  var W = window, D = document;
  function noop() {}
  function J(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function say(m) { try { if (typeof W.toast === "function") W.toast(m); } catch (e) {} }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return D.getElementById(id); }
  var TM = "https://image.tmdb.org/t/p/";

  /* =============== Seguir viendo: almacenamiento =============== */
  var CW_KEY = "zynora_cw_v1";
  function cwAll() { return J(localStorage.getItem(CW_KEY), {}) || {}; }
  function cwSave(m) { try { localStorage.setItem(CW_KEY, JSON.stringify(m)); } catch (e) {} }
  function keyOf(type, id) { return (type === "tv" ? "tv" : "movie") + ":" + id; }

  /* Episodios vistos (uno por uno): { "tmdbId": { "temporada:episodio": 1 } } */
  var EW_KEY = "zynora_eps_v1";
  function ewAll() { return J(localStorage.getItem(EW_KEY), {}) || {}; }
  var EW = {
    has: function (id, s, e) { var m = ewAll()[String(id)]; return !!(m && m[s + ":" + e]); },
    set: function (id, s, e, on) {
      var a = ewAll(), k = String(id), m = a[k] || (a[k] = {});
      if (on) m[s + ":" + e] = 1; else delete m[s + ":" + e];
      try { localStorage.setItem(EW_KEY, JSON.stringify(a)); } catch (x) {}
    },
    setMany: function (id, pairs) {
      var a = ewAll(), k = String(id), m = a[k] || (a[k] = {});
      pairs.forEach(function (p) { m[p[0] + ":" + p[1]] = 1; });
      try { localStorage.setItem(EW_KEY, JSON.stringify(a)); } catch (x) {}
    }
  };
  W.ZEW = EW;

  /* Al ver el episodio N, todos los anteriores (de esa y de temporadas previas) cuentan como vistos */
  var prevDone = {};
  function markBefore(id, s, e) {
    s = Number(s); e = Number(e);
    if (!(s >= 1) || !(e >= 1)) return Promise.resolve();
    return Promise.resolve().then(function () { return seasonsOf(id); }).then(function (seasons) {
      var list = [];
      seasons.forEach(function (x) {
        if (x.n < 1 || x.n > s) return;
        var last = x.n < s ? x.count : e - 1;
        for (var i = 1; i <= last; i++) list.push([x.n, i]);
      });
      if (list.length) EW.setMany(id, list);
    });
  }
  function watchedHook(meta) {
    var k = meta.tmdbId + ":" + meta.s + ":" + meta.e;
    if (prevDone[k]) return;
    prevDone[k] = 1;
    markBefore(meta.tmdbId, meta.s, meta.e).then(function () { try { repaintSeen(); } catch (x) {} }).catch(function () { delete prevDone[k]; });
  }
  function repaintSeen() {
    var b = $("modalBody"), p = b && b.querySelector('.tab-panel[data-panel="eps"]');
    if (p) refreshSeen(p);
  }

  var ZCW = {
    get: function (k) { return cwAll()[k] || null; },
    refresh: function () { try { refreshRow(); } catch (e) {} },
    remove: function (k) { var m = cwAll(); delete m[k]; cwSave(m); refreshRow(); },
    list: function () {
      var m = cwAll();
      return Object.keys(m).map(function (k) { return m[k]; }).filter(function (x) { return x && (!x.done || x.ns); })
        .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    },
    progress: function (meta, time, len, ended) {
      if (!meta || !meta.key) return;
      var m = cwAll(), old = m[meta.key];
      var finished = !!ended || (len > 0 && (time / len >= 0.95 || time > len - 120000));
      if (meta.type === "tv" && (finished || (len > 0 && time / len >= 0.9))) EW.set(meta.tmdbId, meta.s, meta.e, true);
      if (meta.type === "tv" && (finished || time >= 60000)) watchedHook(meta);
      if (!old && time < 20000) return;
      var base = Object.assign({}, old || {}, {
        key: meta.key, tmdbId: meta.tmdbId, type: meta.type, title: meta.title, poster: meta.poster || (old && old.poster) || "", backdrop: meta.backdrop || (old && old.backdrop) || "",
        s: meta.s, e: meta.e, epName: meta.epName || "", src: meta.src || (old && old.src) || null, ts: Date.now()
      });
      /* Mientras sigues en los créditos del mismo episodio se conserva el "siguiente" ya calculado.
         Antes se borraba en cada guardado (cada 5 s) y la serie desaparecía de Seguir viendo. */
      var sameEp = !!(old && old.done && String(old.s) === String(meta.s) && String(old.e) === String(meta.e));
      if (!(finished && sameEp)) { delete base.ns; delete base.ne; delete base.nName; }
      if (finished) {
        if (meta.type !== "tv") { delete m[meta.key]; cwSave(m); return; }
        base.done = true; base.pos = 0; base.len = 0;
      } else { base.done = false; base.pos = time; base.len = len; }
      m[meta.key] = base;
      var keys = Object.keys(m);
      if (keys.length > 60) { keys.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); }); delete m[keys[0]]; }
      cwSave(m);
      if (base.done) fillNext(meta.key, meta.tmdbId, meta.s, meta.e);
    }
  };
  W.ZCW = ZCW;

  /* Al terminar un episodio de verdad (créditos), calcula cuál es el siguiente y lo deja en "Seguir viendo".
     Si era el último episodio de la serie, la quita de la fila. */
  var nextBusy = {};
  function fillNext(key, id, s, e) {
    var bk = key + "|" + s + ":" + e;
    if (nextBusy[bk]) return;
    var c0 = cwAll()[key];
    if (c0 && c0.done && c0.ns && String(c0.s) === String(s) && String(c0.e) === String(e)) return;   /* ya está calculado */
    nextBusy[bk] = 1;
    function same(c) { return c && c.done && String(c.s) === String(s) && String(c.e) === String(e); }
    function free() { delete nextBusy[bk]; }
    nextEp(id, Number(s), Number(e), 1).then(function (n) {
      var m = cwAll(), c = m[key];
      if (!same(c)) return;
      if (!n) { delete m[key]; cwSave(m); refreshRow(); return; }
      return epName(id, n.s, n.e).catch(function () { return ""; }).then(function (nm) {
        var m2 = cwAll(), c2 = m2[key];
        if (!same(c2)) return;
        c2.ns = n.s; c2.ne = n.e; c2.nName = nm || "";
        cwSave(m2); refreshRow();
      });
    }).then(free, free);
  }
  /* Si quedó algún episodio terminado sin su "siguiente" (por el error anterior o por falta de internet), se recalcula */
  function healNext() {
    var m = cwAll();
    Object.keys(m).forEach(function (k) {
      var c = m[k];
      if (c && c.type === "tv" && c.done && !c.ns) fillNext(k, c.tmdbId, c.s, c.e);
    });
  }

  /* =============== Estilos =============== */
  var CSS = '' +
    'button[onclick^="addonOpen("]{display:none!important}' +
    '#zcwSection .zcw-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:none}' +
    '#zcwSection .zcw-row::-webkit-scrollbar{display:none}' +
    '.zcw-card{position:relative;flex:none;width:min(300px,78vw);cursor:pointer;-webkit-user-select:none;user-select:none}' +
    '.zcw-th{position:relative;aspect-ratio:16/9;border-radius:18px;overflow:hidden;background:#101421;border:1px solid rgba(255,255,255,.1)}' +
    '.zcw-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
    '.zcw-th::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 50%,rgba(0,0,0,.6))}' +
    '.zcw-play{position:absolute;z-index:2;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;display:grid;place-items:center;border-radius:50%;background:rgba(255,255,255,.92);color:#0a0d18}' +
    '.zcw-play svg{width:22px;height:22px;fill:currentColor;margin-left:2px}' +
    '.zcw-pct{position:absolute;z-index:2;top:10px;left:10px;padding:4px 10px;border-radius:9px;background:rgba(0,0,0,.6);font-size:12px;font-weight:700}' +
    '.zcw-bar{position:absolute;z-index:2;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.28);overflow:hidden}.zcw-bar u{display:block;height:100%;border-radius:0 4px 4px 0;background:#fff;text-decoration:none}' +
    '.zcw-meta{display:flex;align-items:flex-start;gap:6px;padding:10px 0 0 4px}' +
    '.zcw-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '.zcw-tx b{font-size:15px;line-height:1.25;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.zcw-tx span{color:#aab3cc;font-size:13px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.zcw-dots{flex:none;width:34px;height:34px;margin:-6px -4px 0 0;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:none;color:#fff;cursor:pointer}' +
    '.zcw-dots svg{width:20px;height:20px;fill:currentColor}' +
    '.zcw-dots:hover{background:rgba(255,255,255,.12)}' +
    '.zcw-pop{position:fixed;z-index:2000000001;min-width:210px;padding:6px;border-radius:14px;background:#101421;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 40px rgba(0,0,0,.6)}' +
    '.zcw-pop button{display:block;width:100%;text-align:left;padding:12px 14px;border:0;border-radius:10px;background:none;color:#f4f7ff;font:600 14px Inter,system-ui,sans-serif;cursor:pointer}' +
    '.zcw-pop button:hover{background:rgba(255,255,255,.08)}' +
    /* menú de addons */
    '#zamRoot{position:fixed;inset:0;z-index:2000000000;display:flex;flex-direction:column;color:#f4f7ff;background:radial-gradient(ellipse at 85% 18%,rgba(120,30,40,.28),transparent 45%),radial-gradient(ellipse at 10% 0,rgba(40,70,140,.22),transparent 40%),#07090f;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}' +
    '#zamRoot[hidden]{display:none}' +
    '#zamRoot button{font:inherit;color:inherit;border:0;background:none;padding:0;cursor:pointer}' +
    '.zam-top{display:flex;align-items:center;gap:14px;padding:calc(var(--sat,14px) + 6px) 18px 8px}' +
    '.zam-top svg{width:26px;height:26px;fill:currentColor}' +
    '.zam-ttl{min-width:0;flex:1}.zam-ttl b{display:block;font-size:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.zam-ttl small{display:block;color:#9aa6c1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.zam-list{flex:1;overflow-y:auto;padding:4px 16px calc(24px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:14px}' +
    '.zam-msg{padding:40px 10px;text-align:center;color:#9aa6c1;font-weight:500}' +
    '.zam-card{display:grid;grid-template-columns:72px 1fr 52px;gap:12px;align-items:center;padding:14px;border-radius:22px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);cursor:pointer}' +
    '.zam-card.pf{border-color:rgba(var(--acc-rgb,100,244,255),.45);background:linear-gradient(135deg,rgba(var(--acc-rgb,100,244,255),.1),rgba(255,255,255,.05))}.zam-card.ex{opacity:.62}' +
    '.zam-grp{display:flex;align-items:center;gap:8px;margin:10px 4px 0;color:#c3cce3;font-weight:700;font-size:12.5px;letter-spacing:.5px;text-transform:uppercase}.zam-grp:first-child{margin-top:0}' +
    '.zam-grp em{font-style:normal;padding:2px 9px;border-radius:999px;background:rgba(167,139,250,.2);color:#cdbcff;font-size:11px;text-transform:none;letter-spacing:0}.zam-grp i{font-style:normal;margin-left:auto;color:#8f9ab5;font-weight:600}' +
    '.zam-q{display:flex;flex-direction:column;align-items:center;gap:8px;color:#4fd69b;font-weight:600;font-size:14px;text-align:center}' +
    '.zam-q b{display:block;width:100%;padding:11px 0;border-radius:12px;background:rgba(60,180,120,.2);font-size:16px}' +
    '.zam-q.dim{color:#9aa6c1}.zam-q.dim b{background:rgba(255,255,255,.08)}' +
    '.zam-q.r4k{color:#cdbcff}.zam-q.r4k b{background:rgba(167,139,250,.24)}.zam-q.r720{color:#64f4ff}.zam-q.r720 b{background:rgba(100,244,255,.15)}.zam-q.r480{color:#ffd36b}.zam-q.r480 b{background:rgba(255,200,60,.14)}' +
    '.zam-in{min-width:0}.zam-in h4{margin:0 0 4px;font-size:16px;line-height:1.25;font-weight:700;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}' +
    '.zam-in p{margin:0;color:#9fa9c2;font-size:13px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}' +
    '.zam-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '.zam-tags span{padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.08);color:#c8d0e6;font-size:12.5px;font-weight:600}' +
    '.zam-tags span.lg{background:rgba(255,255,255,.14);color:#fff}.zam-tags span.lg.pf{background:rgba(var(--acc-rgb,100,244,255),.22);color:#c9fbff}.zam-tags span.wn{background:rgba(255,160,60,.16);color:#ffb86b}' +
    '.zam-tags span.y{background:rgba(255,200,60,.14);color:#ffd36b}' +
    '.zam-pl{width:52px;height:52px;border-radius:50%;background:#14d9ee;display:grid;place-items:center;color:#031014;justify-self:end}' +
    '.zam-pl svg{width:26px;height:26px;fill:currentColor}' +
    '.zam-pl.ld{background:rgba(255,255,255,.12)}.zam-pl.ld::before{content:"";width:26px;height:26px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#64f4ff;animation:zamS .8s linear infinite}.zam-pl.ld svg{display:none}' +
    '@keyframes zamS{to{transform:rotate(360deg)}}' +
    /* chips (Todo / addons) */
    '.zam-chips{display:flex;flex:none;gap:10px;overflow-x:auto;padding:8px 18px 16px;scrollbar-width:none}.zam-chips::-webkit-scrollbar{display:none}' +
    '#zamRoot .zam-chip{flex:none;display:inline-flex;align-items:center;gap:10px;padding:11px 14px 11px 20px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#c3cce3;font-weight:650;font-size:15px;line-height:1;white-space:nowrap;transition:background .2s,border-color .2s,box-shadow .2s,color .2s}' +
    '#zamRoot .zam-chip:active{transform:scale(.97)}' +
    '#zamRoot .zam-chip i{font-style:normal;min-width:26px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.1);color:#aeb8d1;font-size:12.5px;font-weight:700;text-align:center;line-height:1}' +
    '#zamRoot .zam-chip.on{color:#effdff;border-color:rgba(var(--acc-rgb,100,244,255),.75);background:linear-gradient(135deg,rgba(var(--acc-rgb,100,244,255),.24),rgba(167,139,250,.2));box-shadow:0 0 0 1px rgba(var(--acc-rgb,100,244,255),.18),0 6px 24px rgba(var(--acc-rgb,100,244,255),.2)}' +
    '#zamRoot .zam-chip.on i{background:rgba(var(--acc-rgb,100,244,255),.28);color:#e6fcff}' +
    /* pestaña Episodios en la ficha */
    '.zep-sea{position:relative;display:flex;gap:10px;overflow-x:auto;margin:0 -24px 16px;padding:4px 24px;scrollbar-width:none}.zep-sea::-webkit-scrollbar{display:none}' +
    '.zep-sea button{flex:none;padding:11px 20px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.07);color:#b9c3dc;font-weight:650;font-size:14.5px;line-height:1;white-space:nowrap}' +
    '.zep-sea button.on{background:var(--cyan);border-color:transparent;color:#041014;box-shadow:0 0 18px rgba(var(--acc-rgb,100,244,255),.35)}' +
    '.zep-list{display:flex;flex-direction:column;gap:16px;padding:4px 2px}' +
    '.zep-row{display:flex;gap:14px;align-items:center;width:100%;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    '.zep-row:active{opacity:.8}' +
    '.zep-th{position:relative;flex:0 0 40%;max-width:250px;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#151b2c;display:grid;place-items:center;color:#5d6a8a;font-weight:800;font-size:22px;transition:box-shadow .25s}' +
    '.zep-th img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;-webkit-user-drag:none}' +
    '.zep-th.seen{box-shadow:0 0 0 2px #b46bff,0 0 12px 2px rgba(180,107,255,.75),0 0 30px 6px rgba(150,80,255,.4)}' +
    '.zep-tx{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}' +
    '.zep-tx small{color:#9aa6c1;font-weight:600;font-size:13.5px}' +
    '.zep-tx b{color:#fff;font-size:clamp(15px,4.2vw,18px);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.zep-tx em{font-style:normal;color:#8f9ab5;font-size:13.5px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.zep-msg{padding:26px 6px;text-align:center;color:#9aa6c1;margin:0}' +
    '.zep-hint{margin:16px 0 0;text-align:center;color:#7f8aa6;font-size:12px}' +
    '.zep-n{font-weight:800;margin-right:2px}.zep-play{display:none}' +
    '.zep-tx small{order:3;letter-spacing:.3px}' +
    '@media(min-width:701px){' +
    '.zep-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:30px 20px;padding:8px 4px}' +
    '.zep-row{flex-direction:column;align-items:stretch;gap:12px;cursor:pointer}' +
    '.zep-th{flex:none;width:100%;max-width:none;border-radius:10px;transition:transform .25s,box-shadow .25s}' +
    '.zep-tx{flex:none;gap:6px}' +
    '.zep-tx b{font-size:15.5px;font-weight:500;line-height:1.25}' +
    '.zep-tx em{-webkit-line-clamp:3;font-size:13.5px}' +
    '.zep-play{display:block;position:absolute;right:12px;bottom:12px;width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.6);border:1.5px solid rgba(255,255,255,.9);opacity:0;transform:scale(.85);transition:opacity .2s,transform .2s}' +
    '.zep-play:after{content:\"\";position:absolute;left:15px;top:11px;border-left:11px solid #fff;border-top:7px solid transparent;border-bottom:7px solid transparent}' +
    '.zep-row:hover .zep-th{transform:scale(1.04);box-shadow:0 14px 34px rgba(0,0,0,.6)}' +
    '.zep-row:hover .zep-th.seen{box-shadow:0 0 0 2px #b46bff,0 14px 34px rgba(0,0,0,.6)}' +
    '.zep-row:hover .zep-play{opacity:1;transform:none}' +
    '}' +
    '#zacWrap .zac-sec{margin:0 0 6px}#zacWrap .zac-sec[hidden]{display:none}' +
    '#zacWrap .zac-sub{display:block;color:#8f9ab5;font-size:12px;margin-top:3px}' +
    '#zacWrap .zac-row{display:flex;gap:14px;overflow-x:auto;padding:22px 14px 26px;margin:-20px -14px -14px;scroll-padding-inline:14px;scrollbar-width:none}#zacWrap .zac-row::-webkit-scrollbar{display:none}' +
    '#zacWrap .zac-card{flex:0 0 clamp(112px,31vw,150px);padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;display:flex;flex-direction:column;gap:8px}' +
    '#zacWrap .zac-card{-webkit-tap-highlight-color:transparent}#zacWrap .zac-card:active .zac-p{transform:scale(.965);transition-duration:.12s}' +
    '#zacWrap .zac-p::after{content:"";position:absolute;inset:0;z-index:4;pointer-events:none;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.06) 32%,transparent 56%);opacity:0;transition:opacity .32s ease}' +
    '@media(hover:hover){html:not(.reduce-motion) #zacWrap .zac-card:hover .zac-p,html:not(.reduce-motion) #zacWrap .zac-card:focus-visible .zac-p{transform:translateY(-7px) scale(1.06);box-shadow:0 26px 44px -12px rgba(0,0,0,.85),0 8px 18px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.16)}#zacWrap .zac-card:hover .zac-p::after,#zacWrap .zac-card:focus-visible .zac-p::after{opacity:1}}#zacWrap .zac-card:focus-visible{outline:none}html.reduce-motion #zacWrap .zac-p{transform:none!important}' +
    '#zacWrap .zac-p{display:block;position:relative;aspect-ratio:2/3;border-radius:16px;overflow:hidden;background:#151b2c;box-shadow:0 8px 22px rgba(0,0,0,.35);transition:transform .32s cubic-bezier(.2,.8,.2,1),box-shadow .32s ease;will-change:transform}' +
    '#zacWrap .zac-p img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#zacWrap .zac-card b{font-size:13px;line-height:1.25;color:#e8edf8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}';

  /* =============== Datos de fuentes (addons) =============== */
  function addonsAll() { return typeof W.addonLoad === "function" ? W.addonLoad() : []; }
  function addons() { return addonsAll().filter(function (a) { return a.stream !== false; }); }
  function plg() { return W.ZPL || null; }
  function hasSources() { return addons().length > 0 || !!(plg() && plg().count() > 0); }

  function imdbOf(type, id) {
    return W.tmdb("/" + type + "/" + id + "/external_ids").then(function (x) {
      var i = x && x.imdb_id;
      if (!/^tt\d{6,10}$/.test(i || "")) throw new Error("No se encontró el ID de IMDb de este título.");
      return i;
    });
  }
  function fetchStreams(imdb, type, s, e, onlyUrl) {
    if (!imdb) return Promise.resolve([]);
    var list = addons().filter(function (a) { return !onlyUrl || a.url === onlyUrl; });
    var path = type === "tv" ? "series/" + imdb + ":" + s + ":" + e : "movie/" + imdb;
    return Promise.all(list.map(function (a) {
      return W._addonFetch(a.url + "/stream/" + path + ".json", 15000)
        .then(function (d) { return { addon: a, streams: (d && d.streams) || [] }; })
        .catch(function () { return { addon: a, streams: [], error: true }; });
    }));
  }
  /* ---------- idiomas de las fuentes ---------- */
  var LANGS = [
    ["latino", "Latino", /\b(latino|lat|es-?la|es-?mx|mexicano)\b|💃|🇲🇽|🇦🇷|🇨🇴|🇨🇱|🇵🇪|🇻🇪|🇺🇾/i],
    ["espanol", "Español", /\b(castellano|espa[nñ]ol|spanish|spa)\b|espa[nñ]a|🇪🇸/i],
    ["multi", "Multi", /\b(multi|dual|multi-?audio|multi-?lang)\b/i],
    ["ingles", "Inglés", /\b(ingl[eé]s|english|eng)\b|🇬🇧|🇺🇸/i],
    ["frances", "Francés", /\b(franc[eé]s|french|fran[cç]ais|vf|vff|vfq|truefrench)\b|🇫🇷/i],
    ["portugues", "Portugués", /\b(portugu[eé]s|portuguese|pt-?br|dublado|brazilian)\b|🇧🇷|🇵🇹/i],
    ["italiano", "Italiano", /\b(italiano|italian|ita)\b|🇮🇹/i],
    ["aleman", "Alemán", /\b(alem[aá]n|german|deutsch)\b|🇩🇪/i],
    ["japones", "Japonés", /\b(japon[eé]s|japanese|jpn)\b|🇯🇵/i],
    ["coreano", "Coreano", /\b(coreano|korean|kor)\b|🇰🇷/i],
    ["ruso", "Ruso", /\b(ruso|russian|rus)\b|🇷🇺/i],
    ["chino", "Chino", /\b(chino|chinese|mandarin)\b|🇨🇳|🇹🇼|🇭🇰/i],
    ["hindi", "Hindi", /\bhindi\b|🇮🇳/i]
  ];
  function langIds(txt) {
    var t = String(txt || "").replace(/\b(subs?|subt[ií]tulos?|subtitles?|subtitled|subtitulad[oa]s?)\b[^\n|]*/gi, " "), out = [];
    LANGS.forEach(function (l) { if (l[2].test(t)) out.push(l[0]); });
    var li = out.indexOf("latino"), ei = out.indexOf("espanol");
    if (li >= 0 && ei >= 0 && !/castellano|🇪🇸|\bes-?es\b|espa[nñ]a/i.test(t)) out.splice(ei, 1);
    return out;
  }
  function langLabel(id) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === id) return LANGS[i][1]; return id; }
  function srcPrefs() {
    var s = J(localStorage.getItem("zy_settings_v1"), {}) || {};
    return { langs: Array.isArray(s.srcLangs) ? s.srcLangs : [], auto: s.autoSrc !== false };
  }
  /* elige la mejor fuente según los idiomas preferidos (el orden marcado es la prioridad); -1 si ninguna coincide */
  var badSrc = {}, lastTry = null;
  var EMBED = /streamwish|filemoon|\bvoe\b|voe\.sx|doodstream|\bdood\b|streamtape|mixdrop|vidhide|mp4upload|uqload|\bembed\b/i;
  function epKey(type, id, s, e) { return type + ":" + id + ":" + (type === "tv" ? s + ":" + e : "0"); }
  function sigOf(st) { return (st.url || st.infoHash || "") + "|" + (st.name || "") + "|" + (st.title || st.description || ""); }
  function autoPick(items, ek) {
    var p = srcPrefs(); if (!p.auto || !p.langs.length) return -1;
    var RES = { "1080p": 5, "4K": 4, "1440p": 3, "720p": 2, "480p": 1 }, best = -1, bs = -Infinity, bad = badSrc[ek] || {};
    items.forEach(function (it, i) {
      if (bad[sigOf(it.st)]) return;
      var rank = -1;
      (it.inf.langIds || []).forEach(function (id) { var r = p.langs.indexOf(id); if (r >= 0 && (rank < 0 || r < rank)) rank = r; });
      if (rank < 0) return;
      var txt = [it.st.name, it.st.title, it.st.description, (it.st.behaviorHints || {}).filename].filter(Boolean).join("\n");
      var sc = (50 - rank) * 1e6 + (RES[it.inf.res] || 0) * 1e4 + (it.st.url ? 5000 : 0) + Math.min(Number(it.inf.seeds) || 0, 4999);
      if (EMBED.test(txt)) sc -= 1e9; /* páginas externas: casi nunca reproducen, quedan como último recurso */
      if (sc > bs) { bs = sc; best = i; }
    });
    return best;
  }

  /* dentro de cada addon o plugin: primero los de tus idiomas y al final las páginas externas (casi nunca reproducen) */
  function sortStreams(list, pf) {
    return list.map(function (st, i) {
      var n = info(st), rk = 99;
      (n.langIds || []).forEach(function (id) { var r = pf.langs.indexOf(id); if (r >= 0 && r < rk) rk = r; });
      return { st: st, i: i, k: (n.ext ? 1000 : 0) + (pf.langs.length ? rk : 0) };
    }).sort(function (x, y) { return x.k - y.k || x.i - y.i; }).map(function (x) { return x.st; });
  }
  function info(st) {
    var bh = st.behaviorHints || {};
    var txt = [st.name, st.title, st.description, bh.filename].filter(Boolean).join("\n"), m, res = "";
    if (/\b(2160p|4k|uhd)\b/i.test(txt)) res = "4K"; else if (/\b1440p\b/i.test(txt)) res = "1440p";
    else if (/\b1080p\b/i.test(txt)) res = "1080p"; else if (/\b720p\b/i.test(txt)) res = "720p"; else if (/\b480p\b/i.test(txt)) res = "480p";
    var size = (m = txt.match(/(\d+(?:[.,]\d+)?)\s?(GB|MB)\b/i)) ? m[1].replace(",", ".") + " " + m[2].toUpperCase() : "";
    var tags = [];
    [[/\bREMUX\b/i, "REMUX"], [/\bBlu-?Ray\b/i, "BluRay"], [/\bWEB-?DL\b/i, "WEB-DL"], [/\bWEB-?Rip\b/i, "WEBRip"], [/\bHDTV\b/i, "HDTV"],
      [/\b(HEVC|x265|H\.?265)\b/i, "HEVC"], [/\b(x264|H\.?264|AVC)\b/i, "H.264"], [/\bAV1\b/i, "AV1"],
      [/\b(HDR10\+?|HDR)\b/i, "HDR"], [/\b(DV|Dolby Vision)\b/i, "Dolby Vision"],
      [/\bAtmos\b/i, "Atmos"], [/\b(E-?AC-?3|DDP|DD\+)\b/i, "DD+"], [/\bTrueHD\b/i, "TrueHD"], [/\bDTS(-HD)?\b/i, "DTS"], [/\bAAC\b/i, "AAC"], [/\b(AC-?3|Dolby Digital)\b/i, "AC3"],
      [/\b7\.1\b/, "7.1"], [/\b5\.1\b/, "5.1"]].forEach(function (p) { if (p[0].test(txt) && tags.indexOf(p[1]) < 0) tags.push(p[1]); });
    var lids = langIds(txt), lang = lids.map(langLabel);
    var head = String(st.name || "Fuente").replace(/\s*\n\s*/g, " · ");
    var body = String(st.title || st.description || "").trim();
    var lines = body.split(/\n+/).map(function (x) { return x.trim(); }).filter(function (x) { return x && !/^opci[oó]n\s*\d+$/i.test(x); });
    var tit = lines[0] || head, extra = lines.slice(1).join(" · "), ext = EMBED.test(txt);
    var seeds = (m = txt.match(/👤\s*(\d+)/)) ? m[1] : "";
    return { res: res, size: size, tags: tags, lang: lang, langIds: lids, head: head, body: body, tit: tit, extra: extra, ext: ext, seeds: seeds, bg: bh.bingeGroup || "" };
  }
  function snapOf(addon, st) {
    var i = info(st), bh = st.behaviorHints || {};
    return { addon: addon.url, addonName: addon.name || "", url: st.url || "", magnet: st.magnet || "", infoHash: st.infoHash || "", fileIdx: st.fileIdx,
      name: st.name || "", title: st.title || "", description: st.description || "", bingeGroup: bh.bingeGroup || "", res: i.res };
  }
  function pickMatch(snap, results) {
    var pool = [];
    results.forEach(function (r) { if (r.addon.url === snap.addon) r.streams.forEach(function (st) { pool.push(st); }); });
    var best = null, score = -1;
    pool.forEach(function (st) {
      var i = info(st), sc = 0;
      if (snap.bingeGroup && i.bg === snap.bingeGroup) sc += 10;
      if (snap.name && st.name === snap.name) sc += 4;
      if (snap.res && i.res === snap.res) sc += 3;
      if (sc > score) { score = sc; best = st; }
    });
    return score >= 7 ? best : null;
  }
  async function resolveUrl(sn) {
    var url = sn.url || "";
    if (/^https?:/i.test(url)) return url;
    var magnet = sn.magnet || (url.indexOf("magnet:") === 0 ? url : "") || (sn.infoHash ? "magnet:?xt=urn:btih:" + sn.infoHash : "");
    if (!magnet) throw new Error("Esta fuente no trae un enlace reproducible.");
    var r = await W.rdResolve(magnet);
    if (!r || !r.download) throw new Error("No se pudo resolver el enlace con Real-Debrid.");
    return r.download;
  }

  /* =============== Episodios =============== */
  var EPC = {};
  function seasonsOf(id) {
    if (EPC["s" + id]) return Promise.resolve(EPC["s" + id]);
    return W.tmdb("/tv/" + id).then(function (tv) {
      var s = (tv.seasons || []).filter(function (x) { return x.episode_count > 0; }).map(function (x) { return { n: x.season_number, count: x.episode_count }; })
        .sort(function (a, b) { return a.n - b.n; });
      if (!s.length) s = [{ n: 1, count: 1 }];
      return (EPC["s" + id] = s);
    });
  }
  function epList(id, n) {
    var k = id + ":" + n;
    if (EPC[k]) return Promise.resolve(EPC[k]);
    return W.tmdb("/tv/" + id + "/season/" + n).then(function (d) {
      return (d.episodes || []).map(function (e) { return { n: e.episode_number, name: e.name || "", still: e.still_path || "", runtime: e.runtime || 0, overview: e.overview || "", date: e.air_date || "" }; });
    }).catch(function () { return []; }).then(function (l) {
      if (!l.length) { l = [{ n: 1, name: "", still: "", runtime: 0, overview: "" }]; }
      return (EPC[k] = l);
    });
  }
  async function nextEp(id, s, e, dir) {
    var eps = await epList(id, s), i = eps.map(function (x) { return x.n; }).indexOf(e) + dir;
    if (i >= 0 && i < eps.length) return { s: s, e: eps[i].n };
    var seasons = await seasonsOf(id), si = seasons.map(function (x) { return x.n; }).indexOf(s) + dir;
    if (si < 0 || si >= seasons.length) return null;
    var ns = seasons[si].n, ne = await epList(id, ns);
    return { s: ns, e: dir > 0 ? ne[0].n : ne[ne.length - 1].n };
  }
  async function epName(id, s, e) { var l = await epList(id, s); var x = l.filter(function (z) { return z.n === e; })[0]; return x ? x.name : ""; }

  /* =============== Lanzar el reproductor =============== */
  function metaFor(t, s, e, name, src) {
    var type = t.mediaType === "tv" ? "tv" : "movie";
    return { key: keyOf(type, t.tmdbId), tmdbId: t.tmdbId, type: type, title: t.title, poster: t.posterPath || "", backdrop: t.backdropPath || "", s: s, e: e, epName: name || "", src: src };
  }
  function playerTitle(t, s, e) { return t.mediaType === "tv" ? t.title + " · T" + s + "E" + e : t.title; }
  var webMeta = null, webLast = 0, webResume = 0, webResumeMin = 30000, webBound = false;
  function bindWeb() {
    var v = $("rdVideo"); if (!v || webBound) return;
    webBound = true;
    v.addEventListener("timeupdate", function () {
      if (!webMeta || !v.duration || !isFinite(v.duration)) return;
      var n = Date.now(); if (n - webLast < 5000) return; webLast = n;
      ZCW.progress(webMeta, v.currentTime * 1000, v.duration * 1000, false);
    });
    v.addEventListener("ended", function () {
      if (webMeta && v.duration && isFinite(v.duration)) { ZCW.progress(webMeta, v.duration * 1000, v.duration * 1000, true); webMeta = null; }
    });
    v.addEventListener("loadedmetadata", function () {
      var rmin = webResumeMin, rend = rmin > 5000 ? 60000 : 5000;
      if (webResume > rmin && v.duration && webResume < v.duration * 1000 - rend) { try { v.currentTime = webResume / 1000; } catch (x) {} }
      webResume = 0; webResumeMin = 30000;
    });
  }
  function saveWebNow() {
    var v = $("rdVideo");
    if (webMeta && v && v.duration && isFinite(v.duration) && v.currentTime > 0) ZCW.progress(webMeta, v.currentTime * 1000, v.duration * 1000, false);
  }
  var origClose = typeof W.rdClosePlayer === "function" ? W.rdClosePlayer : null;
  if (origClose) W.rdClosePlayer = function () {
    try { saveWebNow(); } catch (x) {}
    webMeta = null;
    var r = origClose.apply(this, arguments);
    try { refreshRow(); decorateDetail(); } catch (x) {}
    return r;
  };

  /* cambiar de fuente desde el reproductor web sin perder el minuto (lo usa web-player.js) */
  function webSwitch(r, startMs) {
    try { saveWebNow(); } catch (x) {}
    var meta = r.meta;
    W.__zplHdr = (meta && meta.hdr) || null;
    bindWeb(); webMeta = meta; webLast = 0; webResume = Number(startMs) || 0; webResumeMin = 3000;
    var url = r.url;
    if (meta && meta.hdr && plg() && plg().mediaUrl) url = plg().mediaUrl(url, meta.hdr);
    var tt = $("rdPlayerTitle");
    if (typeof W.rdPlay === "function") W.rdPlay({ download: url }, tt ? tt.textContent : "");
  }

  function runtimeMs(t, s, e) {
    if (t.mediaType === "tv") return epList(t.tmdbId, s).then(function (l) { var x = l.filter(function (z) { return z.n === e; })[0]; return x && x.runtime ? x.runtime * 60000 : 0; }).catch(function () { return 0; });
    return W.tmdb("/movie/" + t.tmdbId).then(function (d) { return (d && d.runtime ? d.runtime : 0) * 60000; }).catch(function () { return 0; });
  }
  var curT = null;
  function launch(url, t, s, e, meta) {
    lastTry = null; curT = t;
    if (meta) runtimeMs(t, s, e).then(function (ms) { if (ms) meta.rt = ms; }).catch(noop);
    W.__zplHdr = (meta && meta.hdr) || null;
    W._addonCtx = t.mediaType === "tv" ? { type: "tv", tmdbId: t.tmdbId, title: t.title, season: s, episode: e } : { type: "movie", tmdbId: t.tmdbId, title: t.title };
    var title = playerTitle(t, s, e);
    if (W.ZNP && W.ZNP.available()) { W.ZNP.open(url, title, null, meta); return; }
    closeMenu();
    bindWeb(); webMeta = meta; webLast = 0;
    var prev = meta && ZCW.get(meta.key); webResume = prev && prev.s === meta.s && prev.e === meta.e && !prev.done ? (prev.pos || 0) : 0;
    if (meta && meta.hdr && plg() && plg().mediaUrl) url = plg().mediaUrl(url, meta.hdr); /* web: el video de un plugin pasa por el proxy */
    if (typeof W.rdPlay === "function") W.rdPlay({ download: url }, title); else { try { navigator.clipboard.writeText(url); } catch (x) {} alert("Enlace copiado al portapapeles."); }
  }

  /* =============== Menú de fuentes =============== */
  var root = null, M = null, req = 0;
  var PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

  function build() {
    if (root) return;
    root = D.createElement("div"); root.id = "zamRoot"; root.hidden = true;
    root.innerHTML =
      '<div class="zam-top"><button id="zamBack" aria-label="Volver"><svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg></button>' +
      '<div class="zam-ttl"><b id="zamT"></b><small id="zamS"></small></div></div>' +
      '<div class="zam-chips" id="zamChips"></div><div class="zam-list" id="zamList"></div>';
    D.body.appendChild(root);
    $("zamBack").onclick = closeMenu;
    $("zamChips").onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-f]"); if (!b) return;
      M.filter = b.getAttribute("data-f"); paintChips(); paintList();
    };
    $("zamList").onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-i]"); if (!b) return;
      playFrom(Number(b.getAttribute("data-i")), b);
    };
  }
  var backH = null;
  function attachBack() {
    var A = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.App;
    if (!A || !A.addListener || backH) return;
    try {
      backH = A.addListener("backButton", function () {
        if (D.documentElement.classList.contains("znp-on")) return;
        closeMenu();
      });
    } catch (e) { backH = null; }
  }
  function detachBack() {
    if (!backH) return;
    var h = backH; backH = null;
    Promise.resolve(h).then(function (x) { if (x && x.remove) x.remove(); }).catch(noop);
  }
  function closeMenu() { if (root) root.hidden = true; req++; detachBack(); refreshRow(); decorateDetail(); }

  async function openMenu(t, s0, e0, auto) {
    build();
    var type = t.mediaType === "tv" ? "tv" : "movie";
    var old = ZCW.get(keyOf(type, t.tmdbId));
    M = { t: t, type: type, s: 1, e: 1, imdb: "", res: [], filter: "all", seasons: [], auto: !!auto, autoTried: false };
    root.hidden = false; attachBack();
    $("zamT").textContent = t.title; $("zamS").textContent = "";
    $("zamChips").innerHTML = "";
    $("zamList").innerHTML = '<div class="zam-msg">Buscando fuentes…</div>';
    try {
      try { M.imdb = await imdbOf(type, t.tmdbId); } catch (e0) { M.imdb = ""; if (!(plg() && plg().count())) throw e0; }
      if (type === "tv") {
        M.seasons = await seasonsOf(t.tmdbId);
        var first = (M.seasons.filter(function (x) { return x.n >= 1; })[0] || M.seasons[0]).n;
        if (s0 != null && e0 != null) { M.s = Number(s0); M.e = Number(e0); }
        else { M.s = old && old.s ? old.s : first; M.e = old && old.e ? old.e : 1; }
      }
      loadStreams();
    } catch (e) { $("zamList").innerHTML = '<div class="zam-msg">' + E(e.message || "No se pudo consultar los addons.") + "</div>"; }
  }

  async function loadStreams() {
    var my = ++req, m = M;
    $("zamChips").innerHTML = "";
    $("zamList").innerHTML = '<div class="zam-msg">Buscando fuentes…</div>';
    if (m.type === "tv") {
      var nm = await epName(m.t.tmdbId, m.s, m.e);
      $("zamS").textContent = "T" + m.s + " · E" + m.e + (nm ? " — " + nm : "");
    }
    var both = await Promise.all([fetchStreams(m.imdb, m.type, m.s, m.e), (plg() && plg().count()) ? plg().find(m.t, m.type, m.s, m.e).catch(function () { return []; }) : Promise.resolve([])]);
    var res = both[0].concat(both[1]), pfs = srcPrefs();
    res.forEach(function (r) { r.streams = sortStreams(r.streams || [], pfs); });
    if (my !== req) return;
    m.res = res; m.filter = "all"; m.items = [];
    res.forEach(function (r, ai) { r.streams.forEach(function (st) { m.items.push({ ai: ai, addon: r.addon, st: st, inf: info(st) }); }); });
    paintChips(); paintList();
    if (m.auto && !m.autoTried) {
      m.autoTried = true;
      var pp = srcPrefs();
      if (pp.auto && pp.langs.length && m.items.length) {
        var pk = autoPick(m.items, epKey(m.type, m.t.tmdbId, m.s, m.e));
        if (pk >= 0) {
          var ids = m.items[pk].inf.langIds || [], lb = "";
          for (var q = 0; q < pp.langs.length; q++) if (ids.indexOf(pp.langs[q]) >= 0) { lb = langLabel(pp.langs[q]); break; }
          say("Fuente en " + lb + " encontrada");
          playFrom(pk, $("zamList").querySelector('[data-i="' + pk + '"]'), true);
        } else say("No hay fuentes en tus idiomas. Elige una de la lista.");
      }
    }
  }
  function paintChips() {
    var m = M, h = '<button class="zam-chip' + (m.filter === "all" ? " on" : "") + '" data-f="all">Todo<i>' + m.items.length + "</i></button>";
    m.res.forEach(function (r, i) {
      h += '<button class="zam-chip' + (m.filter === String(i) ? " on" : "") + '" data-f="' + i + '">' + E(r.addon.name || W._addonHost(r.addon.url)) + "<i>" + (r.error ? "✕" : r.streams.length) + "</i></button>";
    });
    $("zamChips").innerHTML = h;
  }
  function paintList() {
    var m = M, rows = m.items.map(function (it, i) { return { it: it, i: i }; }).filter(function (r) { return m.filter === "all" || String(r.it.ai) === m.filter; });
    if (!rows.length) {
      var fail = m.res.filter(function (r) { return r.error; }).length;
      $("zamList").innerHTML = '<div class="zam-msg">' + (fail && fail === m.res.length ? "No se pudo conectar con los addons. Revisa tu internet." : "Ningún addon encontró fuentes para este título.") + "</div>";
      return;
    }
    var pf = srcPrefs(), showGrp = m.filter === "all" && m.res.filter(function (r) { return r.streams.length; }).length > 1, lastAi = -1, html = "";
    rows.forEach(function (r) {
      var n = r.it.inf;
      if (showGrp && r.it.ai !== lastAi) {
        lastAi = r.it.ai;
        var rr = m.res[r.it.ai], isP = !!(rr.streams[0] && rr.streams[0]._zpl);
        html += '<div class="zam-grp"><b>' + E(rr.addon.name || W._addonHost(rr.addon.url)) + "</b>" + (isP ? "<em>Plugin</em>" : "") + "<i>" + rr.streams.length + "</i></div>";
      }
      var isPf = false, lg = n.lang.map(function (l, k) { var p = pf.langs.indexOf((n.langIds || [])[k]) >= 0; if (p) isPf = true; return '<span class="lg' + (p ? " pf" : "") + '">' + E(l) + "</span>"; }).join("");
      var tags = (n.ext ? '<span class="wn">⚠ Página externa</span>' : "") + lg + n.tags.map(function (x) { return "<span>" + E(x) + "</span>"; }).join("") + (n.seeds ? "<span>👤 " + E(n.seeds) + "</span>" : "");
      var rc = n.res === "4K" ? " r4k" : (n.res === "1080p" || n.res === "1440p") ? " r1080" : n.res === "720p" ? " r720" : n.res === "480p" ? " r480" : "";
      html += '<div class="zam-card' + (isPf ? " pf" : "") + (n.ext ? " ex" : "") + '" data-i="' + r.i + '"><div class="zam-q' + rc + (n.res ? "" : " dim") + '"><b>' + E(n.res || "?") + "</b>" + (n.size ? "<span>" + E(n.size) + "</span>" : "") + "</div>" +
        '<div class="zam-in"><h4>' + E(n.tit || n.head) + "</h4>" + (n.extra ? "<p>" + E(n.extra) + "</p>" : "") + (tags ? '<div class="zam-tags">' + tags + "</div>" : "") + "</div>" +
        '<div class="zam-pl" data-pl>' + PLAY + "</div></div>";
    });
    $("zamList").innerHTML = html;
  }

  var busy = false;
  async function playFrom(i, el, auto) {
    if (busy) return;
    var it = M.items[i]; if (!it) return;
    busy = true;
    var pl = el ? el.querySelector("[data-pl]") : null; if (pl) pl.classList.add("ld");
    try {
      var snap = snapOf(it.addon, it.st), url, hdr = null;
      if (it.st._zpl) { var rr = await plg().resolveFor(it.st._zpl, M.type, M.s, M.e); url = rr.url; hdr = rr.headers; snap.plg = it.st._zpl; }
      else url = await resolveUrl(snap);
      var nm = M.type === "tv" ? await epName(M.t.tmdbId, M.s, M.e) : "";
      var mt0 = metaFor(M.t, M.s, M.e, nm, snap); mt0.hdr = hdr;
      launch(url, M.t, M.s, M.e, mt0); lastTry = { t: M.t, s: M.s, e: M.e, sig: sigOf(it.st), auto: !!auto };
    } catch (e) { alert((e && (e.userMessage || e.message)) || "No se pudo abrir esta fuente. Prueba con otra."); }
    busy = false; if (pl) pl.classList.remove("ld");
  }

  /* el reproductor avisa si la fuente terminó casi al instante (pantalla negra): se descarta y se prueba otra */
  function playFailed() {
    var c = W._addonCtx; if (!c) return;
    var lt = lastTry, type = c.type === "tv" ? "tv" : "movie", s = c.season, e = c.episode;
    var t = (lt && String(lt.t.tmdbId) === String(c.tmdbId)) ? lt.t : { tmdbId: c.tmdbId, mediaType: type, title: c.title };
    var ek = epKey(type, c.tmdbId, s, e), bad = badSrc[ek] = badSrc[ek] || {};
    var auto = true;
    if (lt && lt.sig) { bad[lt.sig] = 1; auto = !!lt.auto && Object.keys(bad).length <= 5; }
    lastTry = null;
    say(auto ? "Esa fuente no funcionó. Probando otra…" : "Esa fuente no se pudo reproducir. Elige otra.");
    if (type === "tv") openMenu(t, s, e, auto); else openMenu(t, null, null, auto);
  }
  /* =============== Continuar / siguiente =============== */
  function asTitle(en) { return { tmdbId: en.tmdbId, mediaType: en.type, title: en.title, posterPath: en.poster, backdropPath: en.backdrop }; }

  /* con idiomas preferidos: busca en todos los addons una fuente de ese idioma para el episodio (false si no hay ninguna) */
  async function langPlay(t, type, s, e, nm) {
    var imdb = "";
    try { imdb = await imdbOf(type, t.tmdbId); } catch (x) { imdb = ""; }
    var both = await Promise.all([imdb ? fetchStreams(imdb, type, s, e) : Promise.resolve([]), (plg() && plg().count()) ? plg().find(t, type, s, e).catch(function () { return []; }) : Promise.resolve([])]);
    var items = [];
    both[0].concat(both[1]).forEach(function (r) { r.streams.forEach(function (st) { items.push({ addon: r.addon, st: st, inf: info(st) }); }); });
    var i = autoPick(items, epKey(type, t.tmdbId, s, e)); if (i < 0) return false;
    var it = items[i], snap = snapOf(it.addon, it.st), url, hdr = null;
    if (it.st._zpl) { var rr = await plg().resolveFor(it.st._zpl, type, s, e); url = rr.url; hdr = rr.headers; snap.plg = it.st._zpl; }
    else url = await resolveUrl(snap);
    var mt = metaFor(t, s, e, nm, snap); mt.hdr = hdr;
    launch(url, t, s, e, mt); lastTry = { t: t, s: s, e: e, sig: sigOf(it.st), auto: true }; return true;
  }
  async function playEpisode(t, s, e, snap, exact) {
    var type = t.mediaType === "tv" ? "tv" : "movie", nm = type === "tv" ? await epName(t.tmdbId, s, e) : "";
    if (!exact) { var pf = srcPrefs(); if (pf.auto && pf.langs.length) { try { if (await langPlay(t, type, s, e, nm)) return true; } catch (x) {} } }
    if (snap && snap.plg) {
      if (!plg()) return false;
      var rr = await plg().resolveFor(snap.plg, type, s, e), mt1 = metaFor(t, s, e, nm, snap); mt1.hdr = rr.headers;
      launch(rr.url, t, s, e, mt1); return true;
    }
    if (exact && snap) { var u = await resolveUrl(snap); launch(u, t, s, e, metaFor(t, s, e, nm, snap)); return true; }
    if (!snap) return false;
    var imdb = await imdbOf(type, t.tmdbId), res = await fetchStreams(imdb, type, s, e, snap.addon);
    var st = pickMatch(snap, res);
    if (!st) return false;
    var addon = addons().filter(function (a) { return a.url === snap.addon; })[0] || { url: snap.addon, name: snap.addonName };
    var ns = snapOf(addon, st), url = await resolveUrl(ns);
    launch(url, t, s, e, metaFor(t, s, e, nm, ns));
    return true;
  }
  async function continueFrom(en) {
    var t = asTitle(en);
    if (en.type !== "tv") { if (await playEpisode(t, 0, 0, en.src, true)) return; return openMenu(t, null, null, true); }
    var s = en.s, e = en.e, exact = true;
    if (en.done) { var n = await nextEp(t.tmdbId, s, e, 1); if (!n) { say("Ya viste todos los episodios"); return openMenu(t, null, null, true); } s = n.s; e = n.e; exact = false; }
    say("Abriendo T" + s + " · E" + e + "…");
    if (!(await playEpisode(t, s, e, en.src, exact))) return openMenu(t, null, null, true);
  }
  function safeContinue(en) {
    continueFrom(en).catch(function (e) { say((e && e.message) || "No se pudo continuar. Elige una fuente."); openMenu(asTitle(en), null, null, true); });
  }

  /* siguiente episodio (botón "Siguiente" y fin del episodio) */
  W.addonStep = async function (dir) {
    var c = W._addonCtx;
    if (!c || c.type !== "tv") return;
    try {
      var n = await nextEp(c.tmdbId, c.season, c.episode, dir || 1);
      if (!n) { say(dir < 0 ? "Es el primer episodio" : "Es el último episodio"); return; }
      var en = ZCW.get(keyOf("tv", c.tmdbId)), t = { tmdbId: c.tmdbId, mediaType: "tv", title: c.title, posterPath: en && en.poster, backdropPath: en && en.backdrop };
      say("Siguiente: T" + n.s + " · E" + n.e);
      if (en && en.src && (await playEpisode(t, n.s, n.e, en.src, false))) return;
      openMenu(t, n.s, n.e, true);
    } catch (e) { say((e && e.message) || "No se pudo abrir el siguiente episodio"); }
  };

  /* =============== Catálogos de addons (Nuvio / Stremio) en Inicio =============== */
  var CAT_TTL = 15 * 60 * 1000, catCache = {}, catData = [], catTok = 0;
  function catItems() {
    var out = [];
    addonsAll().forEach(function (a) { (a.catalogs || []).forEach(function (c) { out.push({ addon: a, cat: c }); }); });
    return out.slice(0, 10);
  }
  function catKey(it) { return it.addon.url + "|" + it.cat.type + "|" + it.cat.id; }
  function fetchCat(it) {
    var k = catKey(it), c = catCache[k];
    if (c && Date.now() - c.t < CAT_TTL) return Promise.resolve(c.v);
    return W._addonFetch(it.addon.url + "/catalog/" + it.cat.type + "/" + encodeURIComponent(it.cat.id) + ".json", 15000).then(function (d) {
      var v = ((d && d.metas) || []).filter(function (m) { return m && (m.name || m.title) && m.poster; }).slice(0, 24);
      catCache[k] = { t: Date.now(), v: v };
      return v;
    });
  }
  function catRowHtml(it, v, i) {
    return '<div class="section-head"><div><h2>' + E(it.cat.name || it.cat.id) + '</h2></div></div>' +
      '<div class="zac-row">' + v.map(function (m, j) {
        return '<button type="button" class="zac-card" data-i="' + i + '" data-j="' + j + '" aria-label="' + E(m.name || m.title) + '"><span class="zac-p"><img loading="lazy" alt="" src="' + E(m.poster) + '"></span></button>';
      }).join("") + "</div>";
  }
  function renderCats() {
    var home = $("homePage"); if (!home) return;
    var items = catItems(), wrap = $("zacWrap");
    if (!items.length) { if (wrap) wrap.remove(); catData = []; return; }
    var sig = items.map(catKey).join(",");
    if (!wrap) {
      wrap = D.createElement("div"); wrap.id = "zacWrap";
      wrap.addEventListener("click", function (ev) {
        var c = ev.target.closest && ev.target.closest(".zac-card"); if (!c) return;
        var arr = catData[Number(c.getAttribute("data-i"))], m = arr && arr.v[Number(c.getAttribute("data-j"))];
        if (m) openMeta(m, arr.type);
      });
    }
    /* colocar: después de "Seguir viendo", antes del resto del Inicio */
    var anchor = home.querySelector("section.section:not(#zcwSection)"), z = $("zcwSection");
    if (wrap.parentNode !== home) { if (anchor) home.insertBefore(wrap, anchor); else home.appendChild(wrap); }
    if (z && z.nextSibling !== wrap && z.parentNode === home) home.insertBefore(wrap, z.nextSibling);
    if (wrap.getAttribute("data-sig") === sig && Date.now() - Number(wrap.getAttribute("data-t") || 0) < CAT_TTL) return;
    wrap.setAttribute("data-sig", sig); wrap.setAttribute("data-t", String(Date.now()));
    var tok = ++catTok;
    catData = items.map(function (it) { return { v: [], type: it.cat.type }; });
    wrap.innerHTML = items.map(function (it, i) { return '<div class="zac-sec" data-i="' + i + '" hidden></div>'; }).join("");
    items.forEach(function (it, i) {
      fetchCat(it).then(function (v) {
        if (tok !== catTok || !v.length) return;
        var el = wrap.querySelector('.zac-sec[data-i="' + i + '"]'); if (!el) return;
        catData[i].v = v; el.innerHTML = catRowHtml(it, v, i); el.hidden = false;
      }).catch(function () {});
    });
  }
  async function openMeta(m, ctype) {
    var mt = (m.type || ctype) === "series" || ctype === "series" ? "tv" : "movie";
    try {
      var id = String(m.id || ""), tm = 0, x = /^tmdb:(\d+)$/.exec(id);
      if (x) tm = Number(x[1]);
      else if (/^tt\d{6,10}$/.test(id)) {
        var f = await W.tmdb("/find/" + id, { external_source: "imdb_id" });
        var pri = mt === "tv" ? (f.tv_results || []) : (f.movie_results || []), alt = mt === "tv" ? (f.movie_results || []) : (f.tv_results || []);
        if (pri.length) tm = pri[0].id; else if (alt.length) { tm = alt[0].id; mt = mt === "tv" ? "movie" : "tv"; }
      }
      if (!tm) {
        var q = await W.tmdb("/search/" + mt, { query: m.name || m.title });
        var hit = (q.results || [])[0]; if (hit) tm = hit.id;
      }
      if (!tm) throw new Error("No se encontró ese título en TMDB.");
      W.openCredit(mt, tm);
    } catch (e) { say((e && e.message) || "No se pudo abrir ese título."); }
  }
  W.addEventListener("zy-addons-changed", function () { catCache = {}; var w = $("zacWrap"); if (w) w.removeAttribute("data-sig"); try { renderCats(); } catch (e) {} });

  /* =============== Pestaña "Episodios" de la ficha =============== */
  function isSeen(id, s, e) { return EW.has(id, s, e); }
  function openEpisode(t, s, e) {
    if (!hasSources()) { playFlow(t, true); return; }
    openMenu(t, s, e, true);
  }
  function paintSeasons(panel) {
    var z = panel._zep, box = panel.querySelector(".zep-sea");
    box.innerHTML = z.seasons.map(function (x) {
      return '<button type="button" data-s="' + x.n + '" class="' + (x.n === z.view ? "on" : "") + '">' + (x.n === 0 ? "Especiales" : "Temporada " + x.n) + "</button>";
    }).join("");
    var on = box.querySelector(".on");
    if (on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
  }
  async function paintEpisodes(panel) {
    var z = panel._zep, view = z.view, list = panel.querySelector(".zep-list");
    list.innerHTML = '<p class="zep-msg">Cargando episodios…</p>';
    var l = await epList(z.t.tmdbId, view);
    if (z.view !== view) return;
    list.innerHTML = l.map(function (e) {
      var lab = (view === 0 ? "Especial" : "T" + view) + " E" + e.n;
      var dt = "";
      if (e.date) { try { dt = new Date(e.date + "T12:00:00").toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }); } catch (x) { dt = ""; } }
      var meta = [e.runtime ? e.runtime + " MIN" : "", dt].filter(Boolean).join(" · ");
      return '<button type="button" class="zep-row" data-e="' + e.n + '">' +
        '<span class="zep-th' + (isSeen(z.t.tmdbId, view, e.n) ? " seen" : "") + '">' +
        (e.still ? '<img loading="lazy" alt="" draggable="false" src="' + TM + "w500" + E(e.still) + '">' : E(String(e.n))) + '<i class="zep-play"></i></span>' +
        '<span class="zep-tx"><b><span class="zep-n">' + lab + "</span> " + E(e.name || "Episodio " + e.n) + "</b>" +
        (e.overview ? "<em>" + E(e.overview) + "</em>" : "") +
        (meta ? "<small>" + meta + "</small>" : "") + "</span></button>";
    }).join("");
  }
  function refreshSeen(panel) {
    var z = panel._zep; if (!z) return;
    panel.querySelectorAll(".zep-row").forEach(function (r) {
      var th = r.querySelector(".zep-th");
      if (th) th.classList.toggle("seen", isSeen(z.t.tmdbId, z.view, Number(r.getAttribute("data-e"))));
    });
  }
  async function buildEpisodes(panel, t) {
    if (panel.dataset.ready) return;
    panel.dataset.ready = "1";
    panel.innerHTML = '<p class="zep-msg">Cargando episodios…</p>';
    var seasons;
    try { seasons = await seasonsOf(t.tmdbId); }
    catch (e) { delete panel.dataset.ready; panel.innerHTML = '<p class="zep-msg">No se pudieron cargar los episodios. Revisa tu conexión.</p>'; return; }
    var en = ZCW.get(keyOf("tv", t.tmdbId)), want = en ? Number(en.s) : -1;
    var first = (seasons.filter(function (x) { return x.n >= 1; })[0] || seasons[0]).n;
    panel._zep = { t: t, seasons: seasons, view: seasons.some(function (x) { return x.n === want; }) ? want : first };
    panel.innerHTML = '<div class="zep-sea"></div><div class="zep-list"></div><p class="zep-hint">Mantén pulsado un episodio para marcarlo como visto (y los anteriores) o quitarlo.</p>';
    var z = panel._zep, tm = 0, fired = false;
    panel.querySelector(".zep-sea").addEventListener("click", async function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-s]"); if (!b) return;
      z.view = Number(b.getAttribute("data-s")); paintSeasons(panel); await paintEpisodes(panel);
    });
    var list = panel.querySelector(".zep-list");
    list.addEventListener("pointerdown", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-e]"); if (!b) return;
      fired = false; clearTimeout(tm);
      tm = setTimeout(function () {
        fired = true;
        var n = Number(b.getAttribute("data-e")), on = !isSeen(t.tmdbId, z.view, n);
        EW.set(t.tmdbId, z.view, n, on);
        var th = b.querySelector(".zep-th"); if (th) th.classList.toggle("seen", on);
        if (on) markBefore(t.tmdbId, z.view, n).then(function () { refreshSeen(panel); }).catch(noop);
        say(on ? "Marcado como visto (y los anteriores)" : "Quitado de vistos");
      }, 550);
    });
    ["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach(function (n) { list.addEventListener(n, function () { clearTimeout(tm); }); });
    list.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    list.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-e]"); if (!b) return;
      if (fired) { fired = false; return; }
      openEpisode(t, z.view, Number(b.getAttribute("data-e")));
    });
    paintSeasons(panel); await paintEpisodes(panel);
  }
  function decorateEpisodesTab() {
    var body = $("modalBody"); if (!body) return;
    var t = currentTitle();
    if (!t || t.mediaType !== "tv" || !t.tmdbId) return;
    var old = body.querySelector('.tab-panel[data-panel="eps"]');
    if (old) { refreshSeen(old); return; }
    var tabs = body.querySelector(".tabs"); if (!tabs) return;
    var panel = D.createElement("div");
    panel.className = "tab-panel"; panel.setAttribute("data-panel", "eps"); panel.hidden = true;
    var btn = D.createElement("button");
    btn.className = "tab"; btn.type = "button"; btn.setAttribute("role", "tab"); btn.setAttribute("aria-selected", "false");
    btn.setAttribute("data-tab", "eps"); btn.textContent = "Episodios";
    btn.addEventListener("click", function () {
      if (typeof W.detailTab === "function") W.detailTab("eps");
      buildEpisodes(panel, t);
    });
    var detTab = tabs.querySelector('[data-tab="det"]');
    if (detTab) tabs.insertBefore(btn, detTab); else tabs.appendChild(btn);
    var detPanel = body.querySelector('.tab-panel[data-panel="det"]');
    var cast = body.querySelector('.tab-panel[data-panel="cast"]');
    var ref = detPanel || (cast && cast.nextSibling);
    if (ref && ref.parentNode) ref.parentNode.insertBefore(panel, ref); else body.appendChild(panel);
  }

  /* =============== Botón Reproducir de la ficha =============== */
  var origAddonOpen = typeof W.addonOpen === "function" ? W.addonOpen : null;
  function currentTitle() { try { return typeof detailId !== "undefined" && detailId != null ? W.findTitle(detailId) : null; } catch (e) { return null; } }

  function playFlow(t, manual) {
    if (!t || !t.tmdbId) { say("Conecta TMDB para poder reproducir este título"); return; }
    if (!hasSources()) {
      say("Instala un addon o plugin para poder reproducir");
      if (origAddonOpen) origAddonOpen(t.tmdbId, t.mediaType, encodeURIComponent(t.title));
      return;
    }
    var type = t.mediaType === "tv" ? "tv" : "movie", en = ZCW.get(keyOf(type, t.tmdbId));
    if (en && en.src && !manual) { safeContinue(en); return; }
    openMenu(t, null, null, !manual);
  }
  var longFired = false;
  W.rdPlayFlow = function () { if (longFired) { longFired = false; return; } playFlow(currentTitle(), false); };
  W.addonOpen = function (tmdbId, mediaType, title) {
    var t = currentTitle();
    if (!t || String(t.tmdbId) !== String(tmdbId)) t = { tmdbId: tmdbId, mediaType: mediaType, title: decodeURIComponent(title || "") };
    playFlow(t, true);
  };

  function decorateDetail() {
    var body = $("modalBody"); if (!body) return;
    try { decorateEpisodesTab(); } catch (x) {}
    var b = body.querySelector('button[onclick^="rdPlayFlow("]'); if (!b) return;
    var t = currentTitle(), en = t && t.tmdbId ? ZCW.get(keyOf(t.mediaType === "tv" ? "tv" : "movie", t.tmdbId)) : null;
    var label = "▶ Reproducir";
    if (en && en.src && hasSources()) label = "▶ Continuar" + (en.type === "tv" && !en.done ? " T" + en.s + " · E" + en.e : "");
    if (b.textContent !== label) b.textContent = label;
    /* botón visible para elegir la fuente a mano (con idiomas configurados, Reproducir elige sola) */
    var ics = body.querySelector(".det-ics");
    if (ics && hasSources() && !ics.querySelector(".zam-srcbtn")) {
      var sb = D.createElement("button"); sb.type = "button"; sb.className = "det-ic zam-srcbtn";
      sb.innerHTML = '<svg class="di" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg><span>Fuentes</span>';
      sb.addEventListener("click", function () { var tt = currentTitle(); if (tt) playFlow(tt, true); });
      ics.insertBefore(sb, ics.firstChild);
    }
    if (b.dataset.zam) return;
    b.dataset.zam = "1";
    var tm = 0;
    b.addEventListener("pointerdown", function () {
      clearTimeout(tm);
      tm = setTimeout(function () { longFired = true; var tt = currentTitle(); if (tt) playFlow(tt, true); setTimeout(function () { longFired = false; }, 700); }, 600);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (n) { b.addEventListener(n, function () { clearTimeout(tm); }); });
    b.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
  }

  /* =============== Fila "Seguir viendo" en el inicio =============== */
  function closePop() {
    var p = $("zcwPop"); if (p) p.remove();
    D.removeEventListener("click", closePop);
    W.removeEventListener("scroll", closePop, true);
    W.removeEventListener("resize", closePop);
  }
  function showPop(btn, key) {
    var cur = $("zcwPop");
    if (cur && cur.getAttribute("data-k") === key) { closePop(); return; }
    closePop();
    var en = ZCW.get(key); if (!en) return;
    var pop = D.createElement("div"); pop.id = "zcwPop"; pop.className = "zcw-pop"; pop.setAttribute("data-k", key);
    pop.innerHTML = '<button type="button" data-a="d">Detalles</button><button type="button" data-a="r">Quitar de Seguir viendo</button>';
    D.body.appendChild(pop);
    var r = btn.getBoundingClientRect();
    pop.style.right = Math.max(8, W.innerWidth - r.right) + "px";
    pop.style.bottom = Math.max(8, W.innerHeight - r.top + 6) + "px";
    pop.onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-a]"); if (!b) return;
      closePop();
      if (b.getAttribute("data-a") === "d") { if (typeof W.openCredit === "function") W.openCredit(en.type === "tv" ? "tv" : "movie", Number(en.tmdbId)); }
      else ZCW.remove(key);
    };
    W.addEventListener("scroll", closePop, true);
    W.addEventListener("resize", closePop);
    setTimeout(function () { if ($("zcwPop")) D.addEventListener("click", closePop); }, 0);
  }

  function refreshRow() {
    var home = $("homePage"); if (!home) return;
    try { healNext(); } catch (x) {}
    var list = ZCW.list(), sec = $("zcwSection");
    if (!list.length) { if (sec) sec.style.display = "none"; return; }
    if (!sec) {
      sec = D.createElement("section"); sec.className = "section"; sec.id = "zcwSection";
      var anchor = home.querySelector("section.section");
      if (anchor) home.insertBefore(sec, anchor); else home.appendChild(sec);
      var tm = 0, fired = false;
      sec.addEventListener("pointerdown", function (ev) {
        if (ev.target.closest && ev.target.closest("[data-more]")) return;
        var c = ev.target.closest && ev.target.closest("[data-k]"); if (!c) return;
        fired = false; clearTimeout(tm);
        tm = setTimeout(function () {
          fired = true;
          if (confirm("¿Quitar «" + (ZCW.get(c.getAttribute("data-k")) || {}).title + "» de Seguir viendo?")) ZCW.remove(c.getAttribute("data-k"));
        }, 650);
      });
      ["pointerup", "pointerleave", "pointercancel", "pointermove"].forEach(function (n) { sec.addEventListener(n, function () { clearTimeout(tm); }); });
      sec.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
      sec.addEventListener("click", function (ev) {
        var more = ev.target.closest && ev.target.closest("[data-more]");
        if (more) { ev.stopPropagation(); showPop(more, more.closest("[data-k]").getAttribute("data-k")); return; }
        var c = ev.target.closest && ev.target.closest("[data-k]"); if (!c || fired) { fired = false; return; }
        var en = ZCW.get(c.getAttribute("data-k"));
        if (!en) return;
        if (!hasSources()) { playFlow(asTitle(en), false); return; }
        safeContinue(en);
      });
    }
    sec.style.display = "";
    sec.innerHTML = '<div class="section-head"><div><h2>Seguir viendo</h2></div></div><div class="zcw-row">' + list.map(function (en) {
      var img = en.backdrop ? TM + "w500" + en.backdrop : (en.poster ? TM + "w500" + en.poster : "");
      var nx = !!(en.done && en.ns), pct = (!nx && en.len > 0) ? Math.max(1, Math.min(99, Math.round(en.pos / en.len * 100))) : 0;
      var cs = nx ? en.ns : en.s, ce = nx ? en.ne : en.e, cn = nx ? en.nName : en.epName;
      return '<div class="zcw-card" data-k="' + E(en.key) + '"><div class="zcw-th">' + (img ? '<img loading="lazy" alt="" src="' + img + '">' : "") +
        '<span class="zcw-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l11-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z"/></svg></span>' +
        (nx ? '<span class="zcw-pct">Siguiente</span>' : "") +
        (pct ? '<i class="zcw-bar"><u style="width:' + pct + '%"></u></i>' : "") + '</div>' +
        '<div class="zcw-meta"><div class="zcw-tx"><b>' + E(en.title) + "</b>" + (en.type === "tv" ? "<span>T" + cs + ":E" + ce + (cn ? " " + E(cn) : "") + "</span>" : "") + '</div>' +
        '<button type="button" class="zcw-dots" data-more aria-label="Más opciones"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg></button></div></div>';
    }).join("") + "</div>";
    try { fillArt(list); } catch (x) {}
  }

  /* Entradas guardadas sin póster ni fondo (portada gris): se piden a TMDB una vez y se guardan */
  var ARTTRY = {};
  function fillArt(list) {
    var miss = list.filter(function (en) { return en && en.tmdbId && !en.backdrop && !en.poster && !ARTTRY[en.key]; }).slice(0, 12);
    if (!miss.length || typeof W.tmdb !== "function") return;
    miss.forEach(function (en) { ARTTRY[en.key] = 1; });
    Promise.all(miss.map(function (en) {
      return W.tmdb("/" + (en.type === "tv" ? "tv" : "movie") + "/" + en.tmdbId).then(function (d) {
        return d ? { key: en.key, poster: d.poster_path || "", backdrop: d.backdrop_path || "" } : null;
      }).catch(function () { return null; });
    })).then(function (rs) {
      var m = cwAll(), n = 0;
      rs.forEach(function (r) { if (r && (r.poster || r.backdrop) && m[r.key]) { m[r.key].poster = r.poster; m[r.key].backdrop = r.backdrop; n++; } });
      if (n) { cwSave(m); refreshRow(); }
    });
  }

  /* En pantalla completa nativa solo se ve el elemento que entra en fullscreen: llevamos el logo de carga dentro */
  function syncLoader() {
    var L = D.querySelector("#rdPlayer .rd-loading") || D.querySelector(".rd-loading");
    if (!L) return;
    var fe = D.fullscreenElement || D.webkitFullscreenElement;
    if (fe && !fe.contains(L)) { if (!L._zh) L._zh = L.parentNode; fe.appendChild(L); }
    else if (!fe && L._zh && L.parentNode !== L._zh) { L._zh.appendChild(L); }
  }

  /* =============== Arranque =============== */
  function start() {
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    var ro = W.renderHome;
    if (typeof ro === "function") W.renderHome = function () { var r = ro.apply(this, arguments); try { refreshRow(); } catch (e) {} try { renderCats(); } catch (e) {} return r; };
    var mb = $("modalBody");
    if (mb && W.MutationObserver) new MutationObserver(function () { decorateDetail(); }).observe(mb, { childList: true });
    D.addEventListener("znp:closed", function () { refreshRow(); decorateDetail(); });
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (n) { D.addEventListener(n, syncLoader); });
    refreshRow();
    try { renderCats(); } catch (e) {}
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  /* ---- fuentes alternativas desde el reproductor ---- */
  function sameSnap(a, b) {
    return !!(a && b && a.addon === b.addon && a.name === b.name && a.title === b.title && (a.infoHash || "") === (b.infoHash || ""));
  }
  async function srcList(m) {
    var type = m.type === "tv" ? "tv" : "movie", imdb = await imdbOf(type, m.tmdbId);
    var t = (curT && String(curT.tmdbId) === String(m.tmdbId)) ? curT : { tmdbId: m.tmdbId, mediaType: type, title: m.title, posterPath: m.poster, backdropPath: m.backdrop };
    var both = await Promise.all([fetchStreams(imdb, type, m.s, m.e), (plg() && plg().count()) ? plg().find(t, type, m.s, m.e).catch(function () { return []; }) : Promise.resolve([])]);
    var pf = srcPrefs(), out = [];
    both[0].concat(both[1]).forEach(function (r) {
      var list = sortStreams(r.streams || [], pf); if (!list.length) return;
      out.push({ head: (list[0]._zpl ? "Plugin · " : "") + (r.addon.name || W._addonHost(r.addon.url)) });
      list.forEach(function (st) {
        var i = info(st), sn = snapOf(r.addon, st);
        if (st._zpl) sn.plg = st._zpl;
        out.push({
          label: (i.res || "?") + (i.size ? " · " + i.size : ""),
          sub: (i.ext ? ["⚠ Externa"] : []).concat(i.lang, i.tags.slice(0, 3)).join(" · "),
          on: sameSnap(sn, m.src), snap: sn
        });
      });
    });
    return out;
  }
  async function srcResolve(m, snap) {
    var type = m.type === "tv" ? "tv" : "movie", url, hdr = null;
    if (snap.plg && plg()) { var rr = await plg().resolveFor(snap.plg, type, m.s, m.e); url = rr.url; hdr = rr.headers || null; }
    else url = await resolveUrl(snap);
    W.__zplHdr = hdr;
    var nm = type === "tv" ? await epName(m.tmdbId, m.s, m.e) : "";
    var t = { tmdbId: m.tmdbId, mediaType: type, title: m.title, posterPath: m.poster, backdropPath: m.backdrop };
    var mt = metaFor(t, m.s, m.e, nm, snap); mt.hdr = hdr;
    return { url: url, meta: mt };
  }
  /* temporizador de apagado: cierra el menú de fuentes y cualquier ficha abierta y deja la app en el Inicio */
  function goHome() {
    try { closeMenu(); } catch (e) {}
    try { if (typeof W.closeModal === "function") W.closeModal(); } catch (e) {}
    try { if (typeof W.goPage === "function") W.goPage("home"); } catch (e) {}
    try { W.scrollTo(0, 0); } catch (e) {}
  }
  W.ZAM = { goHome: goHome, open: openMenu, playFailed: playFailed, playFlow: playFlow, sources: srcList, resolve: srcResolve, webMeta: function () { return webMeta; }, saveWeb: saveWebNow, webSwitch: webSwitch, resume: safeContinue };
})();
