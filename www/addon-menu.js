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
    /* menú de addons */
    '#zamRoot{position:fixed;inset:0;z-index:2000000000;display:flex;flex-direction:column;color:#f4f7ff;background:radial-gradient(ellipse at 85% 18%,rgba(120,30,40,.28),transparent 45%),radial-gradient(ellipse at 10% 0,rgba(40,70,140,.22),transparent 40%),#07090f;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}' +
    '#zamRoot[hidden]{display:none}' +
    '#zamRoot button{font:inherit;color:inherit;border:0;background:none;padding:0;cursor:pointer}' +
    '.zam-top{display:flex;align-items:center;gap:14px;padding:calc(var(--sat,14px) + 6px) 18px 8px}' +
    '.zam-top svg{width:26px;height:26px;fill:currentColor}' +
    '.zam-ttl{min-width:0;flex:1}.zam-ttl b{display:block;font-size:22px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.zam-ttl small{display:block;color:#9aa6c1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.zam-ep{flex:none;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)!important;font-weight:700;font-size:13px}' +
    '.zam-chips{display:flex;gap:10px;overflow-x:auto;padding:10px 18px 12px;scrollbar-width:none}.zam-chips::-webkit-scrollbar{display:none}' +
    '.zam-chip{flex:none;padding:12px 20px;border-radius:999px;border:1.5px solid rgba(255,255,255,.14)!important;background:rgba(255,255,255,.04);color:#c8d0e6;font-weight:600;font-size:15px}' +
    '.zam-chip.on{border-color:#64f4ff!important;color:#64f4ff;background:rgba(100,244,255,.06)}.zam-chip i{font-style:normal;opacity:.6;margin-left:8px}' +
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
    '.zam-sheet{position:absolute;left:0;right:0;bottom:0;max-height:78%;display:flex;flex-direction:column;background:#0d111c;border-top:1px solid rgba(255,255,255,.12);border-radius:24px 24px 0 0;padding:14px 0 calc(10px + env(safe-area-inset-bottom,0px));z-index:3}' +
    '.zam-sheet[hidden]{display:none}' +
    '.zam-eps{overflow-y:auto;padding:0 12px}' +
    '.zam-epi{display:flex;gap:12px;width:100%;text-align:left;padding:10px;border-radius:14px;align-items:center}' +
    '.zam-epi.on{background:rgba(100,244,255,.1)}' +
    '.zam-epi img{width:110px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;background:#151b2c;flex:none}' +
    '.zam-epi small{display:block;color:#9aa6c1;font-weight:600}.zam-epi b{font-size:15px}';

  /* =============== Datos de fuentes (addons) =============== */
  function addons() { return typeof W.addonLoad === "function" ? W.addonLoad() : []; }

  function imdbOf(type, id) {
    return W.tmdb("/" + type + "/" + id + "/external_ids").then(function (x) {
      var i = x && x.imdb_id;
      if (!/^tt\d{6,10}$/.test(i || "")) throw new Error("No se encontró el ID de IMDb de este título.");
      return i;
    });
  }
  function fetchStreams(imdb, type, s, e, onlyUrl) {
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
      return (d.episodes || []).map(function (e) { return { n: e.episode_number, name: e.name || "", still: e.still_path || "", runtime: e.runtime || 0 }; });
    }).catch(function () { return []; }).then(function (l) {
      if (!l.length) { l = [{ n: 1, name: "", still: "", runtime: 0 }]; }
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
  function launch(url, t, s, e, meta) {
    W._addonCtx = t.mediaType === "tv" ? { type: "tv", tmdbId: t.tmdbId, title: t.title, season: s, episode: e } : { type: "movie", tmdbId: t.tmdbId, title: t.title };
    var title = playerTitle(t, s, e);
    if (W.ZNP && W.ZNP.available()) { W.ZNP.open(url, title, null, meta); return; }
    closeMenu();
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
      '<div class="zam-ttl"><b id="zamT"></b><small id="zamS"></small></div><button class="zam-ep" id="zamEp" hidden></button></div>' +
      '<div class="zam-chips" id="zamChips"></div><div class="zam-list" id="zamList"></div>' +
      '<div class="zam-sheet" id="zamSheet" hidden><div class="zam-chips" id="zamSea"></div><div class="zam-eps" id="zamEps"></div></div>';
    D.body.appendChild(root);
    $("zamBack").onclick = function () { if (!$("zamSheet").hidden) $("zamSheet").hidden = true; else closeMenu(); };
    $("zamEp").onclick = openEpisodes;
    $("zamChips").onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-f]"); if (!b) return;
      M.filter = b.getAttribute("data-f"); paintChips(); paintList();
    };
    $("zamList").onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-i]"); if (!b) return;
      playFrom(Number(b.getAttribute("data-i")), b);
    };
    $("zamSea").onclick = async function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-s]"); if (!b) return;
      M.view = Number(b.getAttribute("data-s")); paintSeasons(); await paintEpisodes();
    };
    $("zamEps").onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-e]"); if (!b) return;
      $("zamSheet").hidden = true; M.s = M.view; M.e = Number(b.getAttribute("data-e")); loadStreams();
    };
  }
  var backH = null;
  function attachBack() {
    var A = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.App;
    if (!A || !A.addListener || backH) return;
    try {
      backH = A.addListener("backButton", function () {
        if (D.documentElement.classList.contains("znp-on")) return;
        if (!$("zamSheet").hidden) $("zamSheet").hidden = true; else closeMenu();
      });
    } catch (e) { backH = null; }
  }
  function detachBack() {
    if (!backH) return;
    var h = backH; backH = null;
    Promise.resolve(h).then(function (x) { if (x && x.remove) x.remove(); }).catch(noop);
  }
  function closeMenu() { if (root) root.hidden = true; req++; detachBack(); refreshRow(); decorateDetail(); }

  async function openMenu(t) {
    build();
    var type = t.mediaType === "tv" ? "tv" : "movie";
    var old = ZCW.get(keyOf(type, t.tmdbId));
    M = { t: t, type: type, s: 1, e: 1, view: 1, imdb: "", res: [], filter: "all", seasons: [] };
    root.hidden = false; attachBack();
    $("zamT").textContent = t.title; $("zamS").textContent = ""; $("zamEp").hidden = true;
    $("zamChips").innerHTML = ""; $("zamSheet").hidden = true;
    $("zamList").innerHTML = '<div class="zam-msg">Buscando fuentes…</div>';
    try {
      M.imdb = await imdbOf(type, t.tmdbId);
      if (type === "tv") {
        M.seasons = await seasonsOf(t.tmdbId);
        var first = (M.seasons.filter(function (x) { return x.n >= 1; })[0] || M.seasons[0]).n;
        M.s = old && old.s ? old.s : first; M.e = old && old.e ? old.e : 1; M.view = M.s;
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
      var b = $("zamEp"); b.hidden = false; b.textContent = "T" + m.s + " · E" + m.e + " ▾";
    }
    var res = await fetchStreams(m.imdb, m.type, m.s, m.e);
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
      var snap = snapOf(it.addon, it.st), url = await resolveUrl(snap);
      var nm = M.type === "tv" ? await epName(M.t.tmdbId, M.s, M.e) : "";
      launch(url, M.t, M.s, M.e, metaFor(M.t, M.s, M.e, nm, snap));
    } catch (e) { alert(e.message || "No se pudo abrir esta fuente. Prueba con otra."); }
    busy = false; if (pl) pl.classList.remove("ld");
  }

  /* selector de episodio */
  function paintSeasons() {
    $("zamSea").innerHTML = M.seasons.map(function (s) {
      return '<button class="zam-chip' + (s.n === M.view ? " on" : "") + '" data-s="' + s.n + '">' + (s.n === 0 ? "Especiales" : "Temporada " + s.n) + "</button>";
    }).join("");
  }
  async function paintEpisodes() {
    var l = await epList(M.t.tmdbId, M.view);
    $("zamEps").innerHTML = l.map(function (e) {
      var on = M.view === M.s && e.n === M.e;
      return '<button class="zam-epi' + (on ? " on" : "") + '" data-e="' + e.n + '">' + (e.still ? '<img loading="lazy" alt="" src="' + TM + "w300" + E(e.still) + '">' : "") +
        "<span><small>E" + e.n + (e.runtime ? " · " + e.runtime + " min" : "") + "</small><b>" + E(e.name || "Episodio " + e.n) + "</b></span></button>";
    }).join("");
  }
  async function openEpisodes() {
    M.view = M.s; paintSeasons(); $("zamSheet").hidden = false; await paintEpisodes();
  }

  /* =============== Continuar / siguiente =============== */
  function asTitle(en) { return { tmdbId: en.tmdbId, mediaType: en.type, title: en.title, posterPath: en.poster, backdropPath: en.backdrop }; }

  async function playEpisode(t, s, e, snap, exact) {
    var type = t.mediaType === "tv" ? "tv" : "movie", nm = type === "tv" ? await epName(t.tmdbId, s, e) : "";
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
      openMenu(t).then(function () { if (M) { M.s = n.s; M.e = n.e; M.view = n.s; loadStreams(); } });
    } catch (e) { say((e && e.message) || "No se pudo abrir el siguiente episodio"); }
  };

  /* =============== Botón Reproducir de la ficha =============== */
  var origAddonOpen = typeof W.addonOpen === "function" ? W.addonOpen : null;
  function currentTitle() { try { return typeof detailId !== "undefined" && detailId != null ? W.findTitle(detailId) : null; } catch (e) { return null; } }

  function playFlow(t, manual) {
    if (!t || !t.tmdbId) { say("Conecta TMDB para poder reproducir este título"); return; }
    if (!addons().length) {
      say("Instala un addon para poder reproducir");
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
    var b = body.querySelector('button[onclick^="rdPlayFlow("]'); if (!b) return;
    var t = currentTitle(), en = t && t.tmdbId ? ZCW.get(keyOf(t.mediaType === "tv" ? "tv" : "movie", t.tmdbId)) : null;
    var label = "▶ Reproducir";
    if (en && en.src && addons().length) label = "▶ Continuar" + (en.type === "tv" && !en.done ? " T" + en.s + " · E" + en.e : "");
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
        var c = ev.target.closest && ev.target.closest("[data-k]"); if (!c || fired) { fired = false; return; }
        var en = ZCW.get(c.getAttribute("data-k"));
        if (!en) return;
        if (!addons().length) { playFlow(asTitle(en), false); return; }
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
        (pct ? '<i class="zcw-bar" style="width:' + Math.max(12, Math.round(pct * 0.6)) + 'px"></i>' : "") + "</div>";
    }).join("") + "</div>";
  }

  /* =============== Arranque =============== */
  function start() {
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    var ro = W.renderHome;
    if (typeof ro === "function") W.renderHome = function () { var r = ro.apply(this, arguments); try { refreshRow(); } catch (e) {} return r; };
    var mb = $("modalBody");
    if (mb && W.MutationObserver) new MutationObserver(function () { decorateDetail(); }).observe(mb, { childList: true });
    D.addEventListener("znp:closed", function () { refreshRow(); decorateDetail(); });
    refreshRow();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();
  W.ZAM = { open: openMenu, playFlow: playFlow };
})();
