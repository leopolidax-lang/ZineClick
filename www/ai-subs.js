/* Zynora · subtítulos en español traducidos con IA
   1) Busca subtítulos (normalmente en inglés) del título que se está viendo en OpenSubtitles.
   2) Los manda por bloques al Worker (/api/translate), que usa Gemini con la clave guardada en Cloudflare.
   3) Dibuja el texto traducido sobre el video, empezando a traducir por el minuto donde estás.
   Lo usan native-player.js y web-player.js: ZAI.attach / open / close / items / tick. */
(function () {
  "use strict";
  var W = window, D = document;
  var BASE = String(W.ZY_AI_BASE || "https://zineclick.leopolidax.workers.dev").replace(/\/+$/, "");
  var OSUB = "https://opensubtitles-v3.strem.io";
  var CH = 50, PAR = 2, IDX = "zy_ai_idx", PFX = "zy_ai_c_", AUTO = "zy_ai_auto", SUBK = "zy_sub", KEEP = 6;
  var noop = function () {};

  var S = { phase: "idle", gen: 0, key: "", title: "", cues: [], tr: [], cdone: [], cbusy: [], cfail: [], on: false, off: 0, ms: 0, err: "", cb: {}, meta: null };
  var el = null, rootEl = null, shown = "", base = { t: 0, at: 0, playing: false, rate: 1 }, loopT = 0, firstHide = false;

  /* ---------- estilos del texto ---------- */
  var CSS =
    ".zai-sub{position:absolute;z-index:2;left:50%;bottom:7%;transform:translateX(-50%);max-width:88%;text-align:center;white-space:pre-line;pointer-events:none;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;font-weight:600;line-height:1.28;color:#fff;padding:.12em .5em;border-radius:.3em;display:none;transition:bottom .2s}" +
    "#znpRoot:not(.znp-hide) .zai-sub{bottom:170px}#zwpRoot:not(.zwp-hide) .zai-sub{bottom:130px}";
  var SZ = { s: 0.8, m: 1, l: 1.35, xl: 1.8 };
  var BG = { shadow: ["transparent", "0 0 3px #000,0 0 6px #000,0 1px 8px #000"], light: ["rgba(0,0,0,.45)", "none"], normal: ["rgba(0,0,0,.75)", "none"], solid: ["#000", "none"] };
  function styleNow() {
    if (!el) return;
    var o = null; try { o = JSON.parse(localStorage.getItem(SUBK) || "null"); } catch (e) {}
    var size = o && SZ[o.size] ? o.size : "m", bg = o && BG[o.bg] ? o.bg : "shadow";
    var h = (rootEl && rootEl.clientHeight) || W.innerHeight || 400;
    el.style.fontSize = Math.max(14, Math.round(h * 0.048 * SZ[size])) + "px";
    el.style.backgroundColor = BG[bg][0]; el.style.textShadow = BG[bg][1];
  }
  function attach(root) {
    if (!root) return;
    if (!D.getElementById("zaiCss")) { var s = D.createElement("style"); s.id = "zaiCss"; s.textContent = CSS; D.head.appendChild(s); }
    if (el && el.parentNode === root) { rootEl = root; return; }
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = D.createElement("div"); el.className = "zai-sub"; root.appendChild(el); rootEl = root; shown = "";
  }

  /* ---------- red (todo pasa por el Worker) ---------- */
  function post(path, obj) {
    return fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) { var er = new Error((j && j.error) || ("error " + r.status)); er.status = r.status; throw er; }
        if (!j) throw new Error("respuesta no válida");
        return j;
      });
    });
  }
  function pfetch(url, hops) {
    hops = hops || 0;
    return post("/fetch", { url: String(url).replace(/^http:\/\//i, "https://"), headers: { Accept: "*/*" }, timeout: 20000 }).then(function (r) {
      if (r.status >= 300 && r.status < 400 && r.headers && r.headers.location && hops < 4) {
        var n; try { n = new URL(r.headers.location, url).href; } catch (e) { throw new Error("redirección no válida"); }
        return pfetch(n, hops + 1);
      }
      if (r.status !== 200) throw new Error("http " + r.status);
      return r.text || "";
    });
  }

  /* ---------- identificar el título ---------- */
  function ids(meta) {
    var out = { tmdb: "", imdb: "" }, c = W._addonCtx || {};
    [c, meta].forEach(function (o) {
      if (!o || typeof o !== "object") return;
      Object.keys(o).forEach(function (k) {
        var x = o[k], s, mm;
        if (typeof x !== "string" && typeof x !== "number") return;
        s = String(x);
        if (/tmdb/i.test(k) && /^\d+$/.test(s)) out.tmdb = out.tmdb || s;
        else if (/imdb/i.test(k) && /^tt\d+$/.test(s)) out.imdb = out.imdb || s;
        else if ((mm = s.match(/^(?:tv|movie)_(\d+)$/))) out.tmdb = out.tmdb || mm[1];
        else if (/^tt\d{6,}$/.test(s)) out.imdb = out.imdb || s;
      });
    });
    return out;
  }
  function imdbOf(isTv, id) {
    if (id.imdb) return Promise.resolve(id.imdb);
    if (!id.tmdb) return Promise.reject(new Error("no se pudo identificar el título"));
    return fetch(BASE + "/api/tmdb/3/" + (isTv ? "tv" : "movie") + "/" + id.tmdb + "/external_ids").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && /^tt\d+$/.test(j.imdb_id || "")) return j.imdb_id;
      throw new Error("no se encontró el código de IMDb");
    });
  }

  /* ---------- leer subtítulos .srt / .vtt ---------- */
  function ms(m, i) { return (+m[i]) * 3600000 + (+m[i + 1]) * 60000 + (+m[i + 2]) * 1000 + Number((m[i + 3] + "00").slice(0, 3)); }
  function parse(txt) {
    txt = String(txt || "").replace(/^\uFEFF/, "").replace(/\r/g, "");
    var re = /(\d+):(\d\d):(\d\d)[,.](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[,.](\d{1,3})/, out = [];
    txt.split(/\n{2,}/).forEach(function (b) {
      var lines = b.split("\n"), i = 0, m;
      while (i < lines.length && !re.test(lines[i])) i++;
      if (i >= lines.length) return;
      m = lines[i].match(re);
      var t = lines.slice(i + 1).join("\n").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
      if (!t || /opensubtitles|osdb\.|subscene|yts\.|yify|addic7ed|support us and become|advertise your product/i.test(t)) return;
      var a = ms(m, 1), e = ms(m, 5);
      if (e <= a) e = a + 2000;
      out.push({ s: a, e: e, t: t });
    });
    out.sort(function (x, y) { return x.s - y.s; });
    return out;
  }
  function findSubs(imdb, isTv, season, episode) {
    var u = OSUB + "/subtitles/" + (isTv ? "series" : "movie") + "/" + imdb + (isTv ? ":" + season + ":" + episode : "") + ".json";
    return pfetch(u).then(function (t) {
      var j = JSON.parse(t), arr = (j && j.subtitles) || [];
      var en = arr.filter(function (x) { return /^(eng|en)/i.test(x.lang || ""); });
      var rest = arr.filter(function (x) { return !/^(spa|es|spl)/i.test(x.lang || "") && en.indexOf(x) < 0; });
      var all = en.concat(rest).filter(function (x) { return x && x.url; }).slice(0, 4);
      if (!all.length) throw new Error("no hay subtítulos para este título");
      return all.map(function (x) { return x.url; });
    });
  }
  function firstGood(urls, i) {
    i = i || 0;
    if (i >= urls.length) return Promise.reject(new Error("no se pudieron leer los subtítulos"));
    return pfetch(urls[i]).then(function (t) {
      var c = parse(t);
      if (c.length >= 40) return c;
      throw new Error("pocos subtítulos");
    }).catch(function () { return firstGood(urls, i + 1); });
  }

  /* ---------- guardar lo traducido ---------- */
  function cacheGet(key) {
    try { var o = JSON.parse(localStorage.getItem(PFX + key) || "null"); return o && o.v === 1 && o.c && o.c.length ? o.c : null; } catch (e) { return null; }
  }
  function cachePut(key, cues, tr) {
    var data = JSON.stringify({ v: 1, c: cues.map(function (c, i) { return [c.s, c.e, tr[i] || ""]; }) });
    function save() {
      localStorage.setItem(PFX + key, data);
      var idx = []; try { idx = JSON.parse(localStorage.getItem(IDX) || "[]") || []; } catch (e) {}
      idx = idx.filter(function (k) { return k !== key; }); idx.push(key);
      while (idx.length > KEEP) { try { localStorage.removeItem(PFX + idx.shift()); } catch (e) {} }
      localStorage.setItem(IDX, JSON.stringify(idx));
    }
    try { save(); } catch (e) {
      try {
        var old = JSON.parse(localStorage.getItem(IDX) || "[]") || [];
        while (old.length) { localStorage.removeItem(PFX + old.shift()); }
        localStorage.setItem(IDX, "[]"); save();
      } catch (e2) { /* sin espacio: no se guarda y se vuelve a traducir la próxima vez */ }
    }
  }

  /* ---------- traducir por bloques ---------- */
  function nChunks() { return Math.ceil(S.cues.length / CH); }
  function curChunk() {
    var t = S.ms - S.off, lo = 0, hi = S.cues.length - 1, mid;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (S.cues[mid].s <= t) lo = mid; else hi = mid - 1; }
    return Math.floor(lo / CH);
  }
  function nextChunk() {
    var n = nChunks(), c0 = curChunk(), i, c;
    for (i = 0; i < n; i++) {
      c = (c0 + i) % n;
      if (!S.cdone[c] && !S.cbusy[c] && (S.cfail[c] || 0) < 3) return c;
    }
    return -1;
  }
  function sleep(t) { return new Promise(function (r) { setTimeout(r, t); }); }
  function doChunk(c, gen) {
    var a = c * CH, b = Math.min(S.cues.length, a + CH), lines = S.cues.slice(a, b).map(function (x) { return x.t; });
    return post("/api/translate", { title: S.title, lines: lines }).then(function (j) {
      if (gen !== S.gen) return;
      var out = j.lines;
      if (!Array.isArray(out) || out.length !== lines.length) throw new Error("la IA devolvió un bloque incompleto");
      for (var i = 0; i < out.length; i++) S.tr[a + i] = String(out[i]);
      S.cdone[c] = true;
    });
  }
  function worker(gen) {
    function step() {
      if (gen !== S.gen) return Promise.resolve();
      var c = nextChunk();
      if (c < 0) return Promise.resolve();
      S.cbusy[c] = true;
      return doChunk(c, gen).then(function () {
        S.cbusy[c] = false;
        if (gen !== S.gen) return;
        if (!firstHide) { firstHide = true; if (S.on) hideOthers(); say("Subtítulos en español listos para ver"); }
        if (pct() === 100) { finish(gen); return; }
        return step();
      }, function (e) {
        S.cbusy[c] = false;
        if (gen !== S.gen) return;
        S.cfail[c] = (S.cfail[c] || 0) + 1;
        S.err = (e && e.message) || "error";
        return sleep(e && e.status === 429 ? 6000 : 1500).then(step);
      });
    }
    return step();
  }
  function finish(gen) {
    if (gen !== S.gen || S.phase === "ready") return;
    var n = nChunks(), ok = 0, c;
    for (c = 0; c < n; c++) if (S.cdone[c]) ok++;
    if (ok === n) { S.phase = "ready"; cachePut(S.key, S.cues, S.tr); }
    else { S.phase = ok ? "partial" : "error"; if (!ok) say("No se pudo traducir: " + S.err); }
  }
  function runAll(gen) {
    var ws = []; for (var i = 0; i < PAR; i++) ws.push(worker(gen));
    return Promise.all(ws).then(function () { finish(gen); });
  }

  /* ---------- manejo ---------- */
  function say(t) { try { if (S.cb && S.cb.say) S.cb.say(t); } catch (e) {} }
  function hideOthers() { try { if (S.cb && S.cb.hide) S.cb.hide(); } catch (e) {} }
  function resetState() {
    S.gen++; S.phase = "idle"; S.key = ""; S.cues = []; S.tr = []; S.cdone = []; S.cbusy = []; S.cfail = []; S.err = ""; S.off = 0; firstHide = false;
    shown = ""; if (el) { el.textContent = ""; el.style.display = "none"; }
  }
  function start() {
    if (S.phase === "loading" || S.phase === "working") return;
    var meta = S.meta, id = ids(meta), c = W._addonCtx || {}, isTv = c.type === "tv";
    if (!id.imdb && !id.tmdb) { say("No se pudo identificar este título"); S.on = false; return; }
    S.on = true; S.err = ""; try { localStorage.setItem(AUTO, "1"); } catch (e) {}
    if (S.cues.length) { /* ya estaba cargado en este video: se retoma sin volver a buscar */
      var g = ++S.gen; hideOthers(); firstHide = true;
      if (pct() < 100) { S.phase = "working"; runAll(g); } else S.phase = "ready";
      return;
    }
    var gen = ++S.gen; S.phase = "loading"; firstHide = false;
    say("Buscando subtítulos…");
    imdbOf(isTv, id).then(function (imdb) {
      if (gen !== S.gen) return;
      S.key = imdb + (isTv ? "_" + c.season + "_" + c.episode : "");
      var hit = cacheGet(S.key);
      if (hit) {
        S.cues = hit.map(function (x) { return { s: x[0], e: x[1], t: x[2] }; });
        S.tr = hit.map(function (x) { return x[2]; });
        S.cdone = []; for (var i = 0; i < nChunks(); i++) S.cdone[i] = true;
        S.phase = "ready"; hideOthers(); say("Subtítulos en español listos para ver");
        return;
      }
      return findSubs(imdb, isTv, c.season, c.episode).then(firstGood).then(function (cues) {
        if (gen !== S.gen) return;
        S.cues = cues; S.tr = new Array(cues.length); S.cdone = []; S.cbusy = []; S.cfail = [];
        S.phase = "working"; say("Traduciendo… se verá en unos segundos");
        return runAll(gen);
      });
    }).catch(function (e) {
      if (gen !== S.gen) return;
      S.phase = "error"; S.err = (e && e.message) || "error"; S.on = false;
      say("No se pudo: " + S.err);
    });
  }
  function stop() {
    S.on = false; S.gen++; if (S.phase === "loading" || S.phase === "working") S.phase = S.cues.length ? "partial" : "idle";
    try { localStorage.removeItem(AUTO); } catch (e) {}
    shown = ""; if (el) { el.textContent = ""; el.style.display = "none"; }
  }
  function retry() {
    var n = nChunks(), c;
    for (c = 0; c < n; c++) S.cfail[c] = 0;
    if (!S.cues.length) { S.phase = "idle"; start(); return; }
    var gen = ++S.gen; S.phase = "working"; S.on = true; say("Reintentando traducción…");
    runAll(gen);
  }
  function pct() {
    var n = nChunks(), c, ok = 0;
    if (!n) return 0;
    for (c = 0; c < n; c++) if (S.cdone[c]) ok++;
    return Math.round(ok * 100 / n);
  }

  /* ---------- menú de Subtítulos ---------- */
  function items() {
    var out = [];
    styleNow();
    if (!S.on) {
      out.push({ label: "Español (IA)", sub: "Traduce los subtítulos del título con Gemini", fn: start });
      return out;
    }
    var sub = S.phase === "ready" ? "Traducción completa" : S.phase === "loading" ? "Buscando subtítulos…" : S.phase === "error" ? "No se pudo traducir" : "Traduciendo… " + pct() + "%";
    out.push({ label: "Español (IA)", sub: sub, on: true, fn: stop });
    if (S.phase === "partial" || S.phase === "error") out.push({ label: "Reintentar traducción", sub: S.err || "", fn: retry });
    if (S.cues.length) {
      out.push({ label: "Mostrar antes (−0,5 s)", sub: "Ajuste actual: " + (S.off > 0 ? "+" : "") + (S.off / 1000).toFixed(1) + " s", keep: true, fn: function () { S.off -= 500; } });
      out.push({ label: "Mostrar después (+0,5 s)", keep: true, fn: function () { S.off += 500; } });
    }
    return out;
  }

  /* ---------- mostrar el texto en pantalla ---------- */
  function find(t) {
    var a = S.cues, lo = 0, hi = a.length - 1, mid;
    if (!a.length) return -1;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (a[mid].s <= t) lo = mid; else hi = mid - 1; }
    for (var i = lo; i >= 0 && i > lo - 3; i--) if (a[i].s <= t && t < a[i].e) return i;
    return -1;
  }
  function paint() {
    if (!el || !S.on) return;
    var t = base.t + (base.playing ? Math.min(1500, (Date.now() - base.at) * (base.rate || 1)) : 0) - S.off;
    var i = find(t), txt = i >= 0 && S.tr[i] ? S.tr[i] : "";
    if (txt !== shown) {
      shown = txt; el.textContent = txt;
      if (txt) styleNow();
      el.style.display = txt ? "" : "none";
    }
  }
  function tick(m, playing, rate) {
    S.ms = Number(m) || 0;
    base = { t: S.ms, at: Date.now(), playing: !!playing, rate: Number(rate) || 1 };
    paint();
    if (S.on && !loopT) loopT = setInterval(paint, 200);
    else if (!S.on && loopT) { clearInterval(loopT); loopT = 0; }
  }

  /* ---------- abrir / cerrar ---------- */
  function open(meta, title, cb) {
    resetState();
    S.meta = meta || null; S.title = String(title || "").slice(0, 120); S.cb = cb || {}; S.on = false;
    var auto = false; try { auto = localStorage.getItem(AUTO) === "1"; } catch (e) {}
    if (auto) setTimeout(function () { if (S.phase === "idle" && !S.on) start(); }, 2500);
  }
  function close() {
    resetState(); S.on = false; S.cb = {}; S.meta = null;
    if (loopT) { clearInterval(loopT); loopT = 0; }
  }

  W.ZAI = { attach: attach, open: open, close: close, items: items, tick: tick, _parse: parse };
})();
