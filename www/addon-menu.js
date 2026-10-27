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
    remove: function (k) { var m = cwAll(); delete m[k]; cwSave(m); refreshRow(); },
    list: function () {
      var m = cwAll();
      return Object.keys(m).map(function (k) { return m[k]; }).filter(function (x) { return x && !x.done; })
        .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    },
    progress: function (meta, time, len, ended) {
      if (!meta || !meta.key) return;
      var m = cwAll(), old = m[meta.key];
      var finished = !!ended || (len > 0 && time > len - 45000);
      if (meta.type === "tv" && (finished || (len > 0 && time / len >= 0.9))) EW.set(meta.tmdbId, meta.s, meta.e, true);
      if (meta.type === "tv" && (finished || time >= 60000)) watchedHook(meta);
      if (!old && time < 20000) return;
      var base = Object.assign({}, old || {}, {
        key: meta.key, tmdbId: meta.tmdbId, type: meta.type, title: meta.title, poster: meta.poster, backdrop: meta.backdrop,
        s: meta.s, e: meta.e, epName: meta.epName || "", src: meta.src || (old && old.src) || null, ts: Date.now()
      });
      if (finished) {
        if (meta.type !== "tv") { delete m[meta.key]; cwSave(m); return; }
        base.done = true; base.pos = 0; base.len = 0;
      } else { base.done = false; base.pos = time; base.len = len; }
      m[meta.key] = base;
      var keys = Object.keys(m);
      if (keys.length > 60) { keys.sort(function (a, b) { return (m[a].ts || 0) - (m[b].ts || 0); }); delete m[keys[0]]; }
      cwSave(m);
    }
  };
  W.ZCW = ZCW;

  /* =============== Estilos =============== */
  var CSS = '' +
    'button[onclick^="addonOpen("]{display:none!important}' +
    '#zcwSection .zcw-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 10px;scrollbar-width:none}' +
    '#zcwSection .zcw-row::-webkit-scrollbar{display:none}' +
    '.zcw-card{position:relative;flex:none;width:min(300px,78vw);aspect-ratio:16/9;border-radius:20px;overflow:hidden;background:#101421;border:1px solid rgba(255,255,255,.1);cursor:pointer;-webkit-user-select:none;user-select:none}' +
    '.zcw-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
    '.zcw-card::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 38%,rgba(0,0,0,.82))}' +
    '.zcw-pct{position:absolute;z-index:2;top:10px;right:10px;padding:5px 11px;border-radius:10px;background:rgba(0,0,0,.6);font-size:12px;font-weight:700}' +
    '.zcw-tx{position:absolute;z-index:2;left:14px;right:14px;bottom:20px;display:flex;flex-direction:column;gap:2px}' +
    '.zcw-tx small{font-weight:800;font-size:12px;letter-spacing:.3px}' +
    '.zcw-tx b{font-size:18px;line-height:1.15;text-shadow:0 1px 8px rgba(0,0,0,.7)}' +
    '.zcw-tx span{color:#c3cbe0;font-size:13px}' +
    '.zcw-bar{position:absolute;z-index:2;left:14px;bottom:10px;height:3px;border-radius:3px;background:#fff}' +
    '.zcw-dots{position:absolute;z-index:3;right:8px;bottom:6px;padding:6px 10px;border-radius:10px;color:#fff;font-size:18px;line-height:1;letter-spacing:1px;background:rgba(0,0,0,.35);border:0;cursor:pointer}' +
    '.zcw-dots:hover{background:rgba(255,255,255,.2)}' +
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
    '.zam-card{display:grid;grid-template-columns:78px 1fr 62px;gap:14px;align-items:center;padding:16px;border-radius:26px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.07);cursor:pointer}' +
    '.zam-q{display:flex;flex-direction:column;align-items:center;gap:8px;color:#4fd69b;font-weight:600;font-size:14px;text-align:center}' +
    '.zam-q b{display:block;width:100%;padding:13px 0;border-radius:12px;background:rgba(60,180,120,.2);font-size:17px}' +
    '.zam-q.dim{color:#9aa6c1}.zam-q.dim b{background:rgba(255,255,255,.08)}' +
    '.zam-in{min-width:0}.zam-in h4{margin:0 0 6px;font-size:17px;line-height:1.25;font-weight:700}' +
    '.zam-in p{margin:0;color:#aab3c9;font-size:14px;line-height:1.35;white-space:pre-line;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;word-break:break-word}' +
    '.zam-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
    '.zam-tags span{padding:6px 12px;border-radius:10px;background:rgba(255,255,255,.08);color:#c8d0e6;font-size:13px;font-weight:600}' +
    '.zam-tags span.y{background:rgba(255,200,60,.14);color:#ffd36b}' +
    '.zam-pl{width:60px;height:60px;border-radius:50%;background:#14d9ee;display:grid;place-items:center;color:#031014;justify-self:end}' +
    '.zam-pl svg{width:30px;height:30px;fill:currentColor}' +
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
    '#zacWrap .zac-sec{margin:0 0 6px}#zacWrap .zac-sec[hidden]{display:none}' +
    '#zacWrap .zac-sub{display:block;color:#8f9ab5;font-size:12px;margin-top:3px}' +
    '#zacWrap .zac-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 12px;scrollbar-width:none}#zacWrap .zac-row::-webkit-scrollbar{display:none}' +
    '#zacWrap .zac-card{flex:0 0 clamp(112px,31vw,150px);padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;display:flex;flex-direction:column;gap:8px}' +
    '#zacWrap .zac-card:active{opacity:.8}' +
    '#zacWrap .zac-p{display:block;aspect-ratio:2/3;border-radius:16px;overflow:hidden;background:#151b2c;box-shadow:0 8px 22px rgba(0,0,0,.35)}' +
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
    var lang = [];
    [[/\b(latino|lat)\b/i, "Latino"], [/\b(castellano|espa[nñ]ol|spa)\b/i, "Español"], [/\b(ingl[eé]s|english|eng)\b/i, "Inglés"], [/\b(dual|multi)\b/i, "Multi"]]
      .forEach(function (p) { if (p[0].test(txt)) lang.push(p[1]); });
    var head = String(st.name || "Fuente").replace(/\s*\n\s*/g, " · ");
    var body = String(st.title || st.description || "").trim();
    var seeds = (m = txt.match(/👤\s*(\d+)/)) ? m[1] : "";
    return { res: res, size: size, tags: tags, lang: lang, head: head, body: body, seeds: seeds, bg: bh.bingeGroup || "" };
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
      return (d.episodes || []).map(function (e) { return { n: e.episode_number, name: e.name || "", still: e.still_path || "", runtime: e.runtime || 0, overview: e.overview || "" }; });
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
  var webMeta = null, webLast = 0, webResume = 0, webBound = false;
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
      if (webResume > 30000 && v.duration && webResume < v.duration * 1000 - 60000) { try { v.currentTime = webResume / 1000; } catch (x) {} }
      webResume = 0;
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

  function launch(url, t, s, e, meta) {
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

  async function openMenu(t, s0, e0) {
    build();
    var type = t.mediaType === "tv" ? "tv" : "movie";
    var old = ZCW.get(keyOf(type, t.tmdbId));
    M = { t: t, type: type, s: 1, e: 1, imdb: "", res: [], filter: "all", seasons: [] };
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
    var res = both[0].concat(both[1]);
    if (my !== req) return;
    m.res = res; m.filter = "all"; m.items = [];
    res.forEach(function (r, ai) { r.streams.forEach(function (st) { m.items.push({ ai: ai, addon: r.addon, st: st, inf: info(st) }); }); });
    paintChips(); paintList();
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
    $("zamList").innerHTML = rows.map(function (r) {
      var n = r.it.inf;
      var tags = n.tags.concat(n.lang).map(function (x) { return "<span>" + E(x) + "</span>"; }).join("") + (n.seeds ? "<span>👤 " + E(n.seeds) + "</span>" : "");
      return '<div class="zam-card" data-i="' + r.i + '"><div class="zam-q' + (n.res ? "" : " dim") + '"><b>' + E(n.res || "?") + "</b>" + (n.size ? "<span>" + E(n.size) + "</span>" : "") + "</div>" +
        '<div class="zam-in"><h4>' + E(n.head) + "</h4>" + (n.body ? "<p>" + E(n.body) + "</p>" : "") + (tags ? '<div class="zam-tags">' + tags + "</div>" : "") + "</div>" +
        '<div class="zam-pl" data-pl>' + PLAY + "</div></div>";
    }).join("");
  }

  var busy = false;
  async function playFrom(i, el) {
    if (busy) return;
    var it = M.items[i]; if (!it) return;
    busy = true;
    var pl = el.querySelector("[data-pl]"); if (pl) pl.classList.add("ld");
    try {
      var snap = snapOf(it.addon, it.st), url, hdr = null;
      if (it.st._zpl) { var rr = await plg().resolveFor(it.st._zpl, M.type, M.s, M.e); url = rr.url; hdr = rr.headers; snap.plg = it.st._zpl; }
      else url = await resolveUrl(snap);
      var nm = M.type === "tv" ? await epName(M.t.tmdbId, M.s, M.e) : "";
      var mt0 = metaFor(M.t, M.s, M.e, nm, snap); mt0.hdr = hdr;
      launch(url, M.t, M.s, M.e, mt0);
    } catch (e) { alert((e && (e.userMessage || e.message)) || "No se pudo abrir esta fuente. Prueba con otra."); }
    busy = false; if (pl) pl.classList.remove("ld");
  }

  /* =============== Continuar / siguiente =============== */
  function asTitle(en) { return { tmdbId: en.tmdbId, mediaType: en.type, title: en.title, posterPath: en.poster, backdropPath: en.backdrop }; }

  async function playEpisode(t, s, e, snap, exact) {
    var type = t.mediaType === "tv" ? "tv" : "movie", nm = type === "tv" ? await epName(t.tmdbId, s, e) : "";
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
    if (en.type !== "tv") { if (await playEpisode(t, 0, 0, en.src, true)) return; return openMenu(t); }
    var s = en.s, e = en.e, exact = true;
    if (en.done) { var n = await nextEp(t.tmdbId, s, e, 1); if (!n) { say("Ya viste todos los episodios"); return openMenu(t); } s = n.s; e = n.e; exact = false; }
    say("Abriendo T" + s + " · E" + e + "…");
    if (!(await playEpisode(t, s, e, en.src, exact))) return openMenu(t);
  }
  function safeContinue(en) {
    continueFrom(en).catch(function (e) { say((e && e.message) || "No se pudo continuar. Elige una fuente."); openMenu(asTitle(en)); });
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
      openMenu(t, n.s, n.e);
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
    return '<div class="section-head"><div><h2>' + E(it.cat.name || it.cat.id) + '</h2><small class="zac-sub">' + E(it.addon.name || W._addonHost(it.addon.url)) + '</small></div></div>' +
      '<div class="zac-row">' + v.map(function (m, j) {
        return '<button type="button" class="zac-card" data-i="' + i + '" data-j="' + j + '"><span class="zac-p"><img loading="lazy" alt="" src="' + E(m.poster) + '"></span><b>' + E(m.name || m.title) + "</b></button>";
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
    openMenu(t, s, e);
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
      var lab = (view === 0 ? "Especial" : "T" + view) + " · E" + e.n;
      return '<button type="button" class="zep-row" data-e="' + e.n + '">' +
        '<span class="zep-th' + (isSeen(z.t.tmdbId, view, e.n) ? " seen" : "") + '">' +
        (e.still ? '<img loading="lazy" alt="" draggable="false" src="' + TM + "w300" + E(e.still) + '">' : E(String(e.n))) + "</span>" +
        '<span class="zep-tx"><small>' + lab + (e.runtime ? " · " + e.runtime + " min" : "") + "</small><b>" + E(e.name || "Episodio " + e.n) + "</b>" +
        (e.overview ? "<em>" + E(e.overview) + "</em>" : "") + "</span></button>";
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
    openMenu(t);
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
  function closePop() { var p = $("zcwPop"); if (p) p.remove(); }
  function showPop(btn, key) {
    closePop();
    var en = ZCW.get(key); if (!en) return;
    var pop = D.createElement("div"); pop.id = "zcwPop"; pop.className = "zcw-pop";
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
    setTimeout(function () { D.addEventListener("click", closePop, { once: true }); }, 0);
  }

  function refreshRow() {
    var home = $("homePage"); if (!home) return;
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
      var pct = en.len > 0 ? Math.max(1, Math.min(99, Math.round(en.pos / en.len * 100))) : 0;
      return '<div class="zcw-card" data-k="' + E(en.key) + '">' + (img ? '<img loading="lazy" alt="" src="' + img + '">' : "") +
        (pct ? '<span class="zcw-pct">' + pct + "% visto</span>" : "") +
        '<div class="zcw-tx">' + (en.type === "tv" ? "<small>T" + en.s + " E" + en.e + "</small>" : "") + "<b>" + E(en.title) + "</b>" + (en.type === "tv" && en.epName ? "<span>" + E(en.epName) + "</span>" : "") + "</div>" +
        (pct ? '<i class="zcw-bar" style="width:' + Math.max(12, Math.round(pct * 0.6)) + 'px"></i>' : "") +
        '<button type="button" class="zcw-dots" data-more aria-label="Más opciones">•••</button></div>';
    }).join("") + "</div>";
  }

  /* =============== Arranque =============== */
  function start() {
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    var ro = W.renderHome;
    if (typeof ro === "function") W.renderHome = function () { var r = ro.apply(this, arguments); try { refreshRow(); } catch (e) {} try { renderCats(); } catch (e) {} return r; };
    var mb = $("modalBody");
    if (mb && W.MutationObserver) new MutationObserver(function () { decorateDetail(); }).observe(mb, { childList: true });
    D.addEventListener("znp:closed", function () { refreshRow(); decorateDetail(); });
    refreshRow();
    try { renderCats(); } catch (e) {}
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  /* ---- fuentes alternativas desde el reproductor ---- */
  function sameSnap(a, b) {
    return !!(a && b && a.addon === b.addon && a.name === b.name && a.title === b.title && (a.infoHash || "") === (b.infoHash || ""));
  }
  async function srcList(m) {
    var type = m.type === "tv" ? "tv" : "movie", imdb = await imdbOf(type, m.tmdbId), res = await fetchStreams(imdb, type, m.s, m.e), out = [];
    res.forEach(function (r) {
      r.streams.forEach(function (st) {
        var i = info(st), sn = snapOf(r.addon, st);
        out.push({
          label: (i.res || "?") + (i.size ? " · " + i.size : ""),
          sub: [r.addon.name || W._addonHost(r.addon.url)].concat(i.tags.slice(0, 3), i.lang).join(" · "),
          on: sameSnap(sn, m.src), snap: sn
        });
      });
    });
    return out;
  }
  async function srcResolve(m, snap) {
    var type = m.type === "tv" ? "tv" : "movie", url = await resolveUrl(snap), nm = type === "tv" ? await epName(m.tmdbId, m.s, m.e) : "";
    var t = { tmdbId: m.tmdbId, mediaType: type, title: m.title, posterPath: m.poster, backdropPath: m.backdrop };
    return { url: url, meta: metaFor(t, m.s, m.e, nm, snap) };
  }
  W.ZAM = { open: openMenu, playFlow: playFlow, sources: srcList, resolve: srcResolve };
})();
