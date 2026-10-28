/* Zynora · plugins.js
   Sistema de plugins de Zynora (apiVersion 1 a 4). También lee plugins con el formato antiguo.
   - Un plugin es un repositorio público de GitHub con zynora-plugin.json + plugin.js
   - Se instala escribiendo usuario/repositorio. La app muestra a qué sitios se conectará y pide permiso.
   - El código del plugin corre aislado (iframe con sandbox y CSP): solo puede salir a internet con zynora.fetch,
     y solo hacia los sitios (hosts) que el plugin declaró y la persona aprobó.
   - Los plugins aportan: fuentes en el menú de reproducción, y filas en el Inicio.
   Funciona en la app Android (usa la red nativa de Capacitor). En la web usa el proxy de Zynora (window.ZY_PROXY, ver worker.js)
   para saltarse el CORS; sin proxy, la mayoría de sitios se bloquean. */
(function () {
  "use strict";
  var W = window, D = document;
  var API_MAX = 4, APP_VER = "1.1.0";
  /* Compatibilidad con plugins hechos antes de Zynora (formato antiguo): nombres que se siguen leyendo */
  var LEGACY = String.fromCharCode(107, 105, 110, 111);
  var LEGACY_MF = LEGACY + "-plugin.json", LEGACY_TOPIC = LEGACY + "-plugin", LEGACY_SKIP = new RegExp("^" + LEGACY + "tvapp\\/(" + LEGACY + "-plugins|" + LEGACY + "-light)$", "i");
  var KEY = "zynora_plugins_v1", CODE = "zynora_plugin_code_", STORE = "zynora_plugin_store_", HOMEC = "zynora_plugin_home_", COMM = "zynora_plugin_comm_v1";

  /* Plugins recomendados (puedes añadir más líneas con el mismo formato) */
  var RECOMMENDED = [
    { repo: "kinotvapp/kino-plugin-archive", name: "Internet Archive", desc: "Películas de dominio público y televisión clásica de archive.org", color: "#E0A030", cats: ["movies", "series"] }
  ];
  /* Temas de GitHub donde se buscan plugins de la comunidad */
  var TOPICS = ["zynora-plugin", LEGACY_TOPIC];

  function noop() {}
  function J(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(id) { return D.getElementById(id); }
  function say(m) { try { if (typeof W.toast === "function") W.toast(m); } catch (e) {} }
  function warn(t, m) { try { if (typeof W.zyAlert === "function") W.zyAlert(t, m, "warn"); else alert(m); } catch (e) {} }

  /* =============== Red (nativa en la app) =============== */
  function http() { var c = W.Capacitor; return c && c.Plugins && c.Plugins.CapacitorHttp && c.Plugins.CapacitorHttp.request ? c.Plugins.CapacitorHttp : null; }
  /* Proxy web (Cloudflare Worker). En la app Android no se usa. */
  function proxyBase() { return String(W.ZY_PROXY || "").replace(/\/+$/, ""); }
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  /* Convierte el enlace de video de un plugin en uno que pasa por el proxy (con sus cabeceras). */
  function mediaUrl(url, headers) {
    var px = proxyBase(); if (!px || !/^https?:\/\//i.test(url)) return url;
    var u = url.replace(/^http:\/\//i, "https://"), list = false;
    try { list = /\.m3u8$/i.test(new URL(u).pathname); } catch (e) { /* nada */ }
    var h = headers && Object.keys(headers).length ? headers : null;
    return px + "/media?u=" + encodeURIComponent(u) + (h ? "&h=" + b64url(JSON.stringify(h)) : "") + (list ? "&k=l" : "");
  }
  function lower(h) { var o = {}; Object.keys(h || {}).forEach(function (k) { o[String(k).toLowerCase()] = String(h[k]); }); return o; }
  async function rawRequest(method, url, headers, body, timeout) {
    var h = http();
    if (h) {
      var opt = { url: url, method: method, headers: headers || {}, responseType: "text", connectTimeout: timeout, readTimeout: timeout, disableRedirects: true };
      if (body != null) opt.data = body;
      var r = await h.request(opt), d = r.data;
      if (typeof d !== "string") d = d == null ? "" : JSON.stringify(d);
      return { status: r.status, headers: lower(r.headers), text: d };
    }
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, timeout + 5000);
    var px = proxyBase();
    if (px) {
      /* Web: la petición la hace el proxy (sin CORS). Él responde siempre 200 con {status, headers, text}. */
      try {
        var pb = null;
        if (body != null) pb = typeof body === "string" ? body : (/x-www-form/i.test((headers || {})["Content-Type"] || "") ? new URLSearchParams(body).toString() : JSON.stringify(body));
        var pr = await fetch(px + "/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal, body: JSON.stringify({ url: url, method: method, headers: headers || {}, body: pb, timeout: timeout }) });
        var pj = null; try { pj = await pr.json(); } catch (x) { /* sin JSON */ }
        if (!pr.ok || !pj || typeof pj.status !== "number") throw new Error("proxy: " + ((pj && pj.error) || ("HTTP " + pr.status)));
        return { status: pj.status, headers: lower(pj.headers), text: typeof pj.text === "string" ? pj.text : "" };
      } finally { clearTimeout(t); }
    }
    try {
      var init = { method: method, headers: headers || {}, signal: ctrl.signal, redirect: "follow" };
      if (body != null) init.body = typeof body === "string" ? body : (/x-www-form/i.test((headers || {})["Content-Type"] || "") ? new URLSearchParams(body).toString() : JSON.stringify(body));
      var f = await fetch(url, init), hd = {};
      f.headers.forEach(function (v, k) { hd[k] = v; });
      return { status: f.status, headers: lower(hd), text: await f.text(), finalUrl: f.url };
    } finally { clearTimeout(t); }
  }

  /* =============== Reglas de hosts =============== */
  var IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/, LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  var PRIV = [".local", ".lan", ".internal", ".localhost", ".home.arpa"];
  function validHostName(h) {
    if (typeof h !== "string" || !h || h.length > 253) return false;
    h = h.toLowerCase();
    if (h.indexOf(".") < 0 || h.indexOf(":") >= 0 || IPV4.test(h)) return false;
    if (PRIV.some(function (s) { return h.slice(-s.length) === s || h === s.slice(1); })) return false;
    return h.split(".").every(function (l) { return LABEL.test(l); });
  }
  function validPattern(p) { return typeof p === "string" && (p.slice(0, 2) === "*." ? validHostName(p.slice(2)) : validHostName(p)); }
  function hostMatches(host, pats) {
    host = host.toLowerCase();
    return (pats || []).some(function (p) {
      p = String(p).toLowerCase();
      if (p.slice(0, 2) === "*.") return host.length > p.length - 1 && host.slice(-(p.length - 1)) === p.slice(1);
      return host === p;
    });
  }
  function ferr(code, msg, host) { var e = new Error(msg); e.kcode = code; if (host) e.khost = host; return e; }
  function checkUrl(p, url, mode) {
    var u;
    try { u = new URL(url); } catch (e) { throw ferr("invalid_request", "dirección no válida"); }
    if (u.protocol !== "https:") throw ferr("invalid_request", "solo se permite https");
    if (u.username || u.password || (u.port && u.port !== "443")) throw ferr("host_not_allowed", "host no permitido: " + u.host, u.hostname);
    var h = u.hostname.toLowerCase(), ok = hostMatches(h, p.hosts);
    if (!ok && mode === "stream") ok = (p.streamAny && validHostName(h)) || (Array.isArray(p.streamList) && hostMatches(h, p.streamList));
    if (!ok && mode === "fetch") ok = p.fetchAny && validHostName(h);
    if (!ok) throw ferr("host_not_allowed", "host no permitido: " + h, h);
    return u;
  }

  /* =============== Manifiesto =============== */
  var KNOWN_CAPS = ["search", "home", "browse", "episodes", "resolve", "download", "drm", "channels", "migrate", "scopedSearch", "meta", "subtitles", "tracking", "segments", "playlists", "externalResolve", "nuvio"];
  var CATS = ["movies", "series", "anime", "live", "radio", "subtitles", "utilities", "adult"];
  var RESERVED = ["live", "local", "unknown", "plugin", "own", "magis", "ditu", "subtitle-keys", "subtitle-prefs"];
  function checkManifest(m) {
    if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error("El manifiesto del plugin no es un objeto JSON válido.");
    function need(c, msg) { if (!c) throw new Error(msg); }
    need(typeof m.id === "string" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(m.id) && RESERVED.indexOf(m.id) < 0, "El campo «id» no es válido (2 a 40 letras minúsculas, números o guiones).");
    need(typeof m.name === "string" && m.name.trim().length >= 1 && m.name.trim().length <= 40, "El campo «name» debe tener de 1 a 40 caracteres.");
    need(typeof m.version === "string" && /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(m.version), "El campo «version» debe ser como 1.2.3.");
    need(typeof m.apiVersion === "number" && isFinite(m.apiVersion) && m.apiVersion % 1 === 0 && m.apiVersion >= 1, "El campo «apiVersion» debe ser un número entero.");
    if (m.apiVersion > API_MAX) throw new Error("Este plugin necesita una versión más nueva de Zynora (pide apiVersion " + m.apiVersion + ").");
    need(typeof m.entry === "string" && /^[A-Za-z0-9._\/-]{1,200}$/.test(m.entry) && m.entry.indexOf("..") < 0 && m.entry[0] !== "/" && /\.js$/.test(m.entry), "El campo «entry» no es válido (debe ser un archivo .js).");
    var fetchAny = m.fetchHosts === "any", streamAny = m.streamHosts === "any", streamList = Array.isArray(m.streamHosts) ? m.streamHosts : null;
    var hosts = m.hosts == null ? [] : m.hosts;
    need(Array.isArray(hosts) && hosts.length <= 50 && hosts.every(validPattern), "El campo «hosts» tiene un nombre de sitio no válido.");
    need(hosts.length >= 1 || fetchAny, "El campo «hosts» necesita al menos un sitio.");
    if (streamList) need(streamList.length <= 50 && streamList.every(validPattern), "El campo «streamHosts» tiene un nombre de sitio no válido.");
    need(Array.isArray(m.capabilities) && m.capabilities.every(function (c) { return KNOWN_CAPS.indexOf(c) >= 0; }), "El campo «capabilities» tiene una capacidad desconocida.");
    var caps = m.capabilities.filter(function (c, i, a) { return a.indexOf(c) === i; });
    var catalogOnly = m.catalogOnly === true;
    if (catalogOnly) need(["home", "browse", "search", "meta"].some(function (c) { return caps.indexOf(c) >= 0; }), "Un plugin «catalogOnly» debe declarar home, browse, search o meta.");
    else {
      need(caps.indexOf("resolve") >= 0, "Este plugin no aporta videos (le falta «resolve») y Zynora aún no soporta plugins de solo subtítulos o seguimiento.");
      need(caps.indexOf("search") >= 0 || caps.indexOf("home") >= 0, "El plugin debe declarar «search» o «home».");
    }
    need(m.color == null || /^#[0-9A-Fa-f]{6}$/.test(m.color), "El campo «color» debe ser como #E0A030.");
    var cats = Array.isArray(m.categories) ? m.categories.filter(function (c) { return CATS.indexOf(c) >= 0; }) : [];
    function cut(v, n) { return typeof v === "string" ? v.trim().slice(0, n) : ""; }
    return {
      id: m.id, name: m.name.trim(), version: m.version, apiVersion: m.apiVersion, entry: m.entry, hosts: hosts.map(function (h) { return h.toLowerCase(); }),
      caps: caps, color: m.color || "", icon: typeof m.icon === "string" && /^[A-Za-z0-9._\/-]{1,200}$/.test(m.icon) && m.icon.indexOf("..") < 0 ? m.icon : "",
      description: cut(m.description, 300), author: cut(m.author, 60), homepage: cut(m.homepage, 200), categories: cats,
      fetchAny: fetchAny, streamAny: streamAny, streamList: streamList, catalogOnly: catalogOnly
    };
  }
  function cmpVer(a, b) {
    var x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; }
    return 0;
  }

  /* =============== Dirección del repositorio =============== */
  function parseSpec(s) {
    s = String(s || "").trim();
    var m = s.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^\/\s]+)(?:\/(.*?))?)?\/?$/i);
    if (m) return { owner: m[1], repo: m[2], ref: m[3] || "", dir: (m[4] || "").replace(/^\/+|\/+$/g, "") };
    m = s.match(/^([\w.-]+)\/([\w.-]+)((?:\/[\w.-]+)*)(?:@([\w.-]+))?$/);
    if (m) return { owner: m[1], repo: m[2], ref: m[4] || "", dir: (m[3] || "").replace(/^\/+/, "") };
    throw new Error("Escribe la dirección como usuario/repositorio (por ejemplo usuario/mi-plugin).");
  }
  function keyOf(sp) { return (sp.owner + "/" + sp.repo + (sp.dir ? "/" + sp.dir : "")).toLowerCase(); }
  function baseOf(sp) { return "https://raw.githubusercontent.com/" + sp.owner + "/" + sp.repo + "/" + (sp.ref || "HEAD") + "/" + (sp.dir ? sp.dir + "/" : ""); }
  async function getText(url, max) {
    var r = await rawRequest("GET", url, { Accept: "*/*" }, null, 20000);
    for (var hop = 0; hop < 5 && [301, 302, 307, 308].indexOf(r.status) >= 0 && r.headers.location; hop++) {
      var nu = new URL(r.headers.location, url);
      if (nu.protocol !== "https:" || !/(^|\.)(github\.com|githubusercontent\.com)$/.test(nu.hostname)) break;
      url = nu.href; r = await rawRequest("GET", url, { Accept: "*/*" }, null, 20000);
    }
    if (r.status === 404) throw new Error("No se encontró el archivo (¿el repositorio es público y la dirección está bien?).");
    if (r.status < 200 || r.status >= 300) throw new Error("GitHub respondió " + r.status + ".");
    if (r.text.length > max) throw new Error("El archivo es demasiado grande.");
    return r.text;
  }
  async function fetchRepo(sp) {
    var base = baseOf(sp), mt;
    var mf = "zynora-plugin.json";
    try { mt = await getText(base + mf, 16384); }
    catch (e0) {
      if (!/No se encontró/.test(String((e0 && e0.message) || ""))) throw new Error("No se pudo leer " + mf + ": " + e0.message);
      mf = LEGACY_MF; /* plugins hechos con el formato antiguo */
      try { mt = await getText(base + mf, 16384); } catch (e) { throw new Error("No se pudo leer zynora-plugin.json: " + e0.message); }
    }
    var raw = J(mt, null); if (!raw) throw new Error(mf + " no es un JSON válido.");
    var m = checkManifest(raw);
    return { m: m, sp: sp, key: keyOf(sp), base: base, icon: m.icon ? base + m.icon : "", getCode: function () { return getText(base + m.entry, 1048576); } };
  }

  /* =============== Almacenamiento de plugins instalados =============== */
  function all() { var a = J(localStorage.getItem(KEY), []); return Array.isArray(a) ? a.filter(function (x) { return x && x.id; }) : []; }
  function saveAll(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { throw new Error("No hay espacio para guardar el plugin."); } }
  function byId(id) { return all().filter(function (p) { return p.id === id; })[0] || null; }
  function byRepo(k) { k = String(k).toLowerCase(); return all().filter(function (p) { return p.repo === k; })[0] || null; }
  function patch(id, o) { var a = all(); a.forEach(function (p) { if (p.id === id) Object.keys(o).forEach(function (k) { if (o[k] === undefined) delete p[k]; else p[k] = o[k]; }); }); saveAll(a); }
  function codeOf(id) { return localStorage.getItem(CODE + id) || ""; }
  function active(p) { return p && p.enabled !== false && !p.noresp; }
  function sources() { return all().filter(function (p) { return active(p) && !p.catalogOnly && p.caps.indexOf("search") >= 0; }); }
  function homes() { return all().filter(function (p) { return active(p) && p.caps.indexOf("home") >= 0; }); }

  /* =============== Entorno aislado (iframe) =============== */
  /* Esta función se copia tal cual dentro del iframe: no puede usar nada de afuera. */
  function zplBoot(CFG) {
    var P = window.parent, pend = {}, seq = 0, kv = CFG.kv || {}, ex = null, cur = 0, chain = Promise.resolve();
    function post(m) { try { P.postMessage(m, "*"); } catch (e) {} }
    function mkErr(o) {
      o = o || {};
      var e = new Error(o.message || "error");
      if (o.code) { e.code = o.code; e.name = "PluginError_" + o.code; }
      if (o.host) e.host = o.host;
      if (o.userMessage) e.userMessage = o.userMessage;
      return e;
    }
    function fmt(a) { if (typeof a === "string") return a; try { return JSON.stringify(a); } catch (e) { return String(a); } }
    function resp(r) {
      var body = r.text;
      return Object.freeze({
        ok: r.ok, status: r.status, url: r.url, headers: Object.freeze(r.headers || {}),
        text: function () { return body; },
        json: function () { return JSON.parse(body); },
        base64: function () { try { return btoa(unescape(encodeURIComponent(body))); } catch (e) { return ""; } }
      });
    }
    var log = function () { post({ k: "log", a: Array.prototype.slice.call(arguments).map(fmt).join(" ").slice(0, 2000) }); };
    var api = {
      apiVersion: CFG.api, appVersion: CFG.app, lang: CFG.lang, device: "phone",
      fetch: function (url, o) {
        return new Promise(function (res, rej) { var id = ++seq; pend[id] = { res: res, rej: rej }; post({ k: "fetch", id: id, call: cur, url: String(url), opts: o || {} }); });
      },
      html: {
        select: function (h, css) {
          if (String(css).length > 10000) throw new Error("selector CSS demasiado largo (más de 10000 caracteres)");
          var d = new DOMParser().parseFromString(String(h).slice(0, 2000000), "text/html"), out = [], l = d.querySelectorAll(css);
          for (var i = 0; i < l.length && i < 500; i++) {
            var el = l[i], at = {};
            for (var j = 0; j < el.attributes.length; j++) at[el.attributes[j].name] = el.attributes[j].value;
            out.push({ text: (el.textContent || "").replace(/\s+/g, " ").trim(), html: el.innerHTML, attrs: at });
          }
          return out;
        }
      },
      storage: {
        get: function (k) { return Object.prototype.hasOwnProperty.call(kv, k) ? kv[k] : null; },
        set: function (k, v) {
          var n = {}; Object.keys(kv).forEach(function (x) { n[x] = kv[x]; }); n[String(k)] = String(v);
          if (JSON.stringify(n).length > 65536) throw new Error("almacenamiento del plugin lleno (64 KB)");
          kv = n; post({ k: "kv", kv: kv });
        },
        remove: function (k) { var n = {}; Object.keys(kv).forEach(function (x) { if (x !== k) n[x] = kv[x]; }); kv = n; post({ k: "kv", kv: kv }); }
      },
      log: log,
      error: function (code, message, o) { return mkErr({ code: code, message: message || code, userMessage: o && o.userMessage }); },
      sleep: function (ms) { return new Promise(function (r) { setTimeout(r, Math.min(Math.max(+ms || 0, 0), 5000)); }); }
    };
    Object.freeze(api.html); Object.freeze(api.storage); Object.freeze(api);
    Object.defineProperty(window, "zynora", { value: api, writable: false, configurable: false });
    Object.defineProperty(window, String.fromCharCode(107, 105, 110, 111), { value: api, writable: false, configurable: false }); /* plugins antiguos */
    ["log", "info", "warn", "error", "debug"].forEach(function (n) { try { console[n] = log; } catch (e) {} });

    function exec(m) {
      cur = m.id;
      var f = ex && ex[m.fn];
      if (typeof f !== "function") { post({ k: "ret", id: m.id, ok: false, err: { message: "El plugin no exporta «" + m.fn + "»" } }); return Promise.resolve(); }
      return Promise.resolve().then(function () { return f(m.arg); }).then(function (v) {
        var out = null;
        try { out = v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch (e) { throw new Error("el plugin devolvió datos que no son JSON"); }
        post({ k: "ret", id: m.id, ok: true, v: out });
      }).catch(function (e) {
        post({ k: "ret", id: m.id, ok: false, err: { message: String((e && e.message) || e).slice(0, 2000), code: e && e.code, userMessage: e && e.userMessage } });
      });
    }
    window.addEventListener("message", function (ev) {
      if (ev.source !== P) return;
      var m = ev.data; if (!m || typeof m !== "object") return;
      if (m.k === "fetchRet") {
        var p = pend[m.id]; if (!p) return; delete pend[m.id];
        if (m.ok) p.res(resp(m.res)); else p.rej(mkErr(m.err));
      } else if (m.k === "call") { chain = chain.then(function () { return exec(m); }); }
    });
    window.__zplReady = function (o) { ex = o; post({ k: "ready", ex: Object.keys(o) }); };
    window.__zplFail = function (msg) { post({ k: "fail", msg: String(msg) }); };
    window.addEventListener("error", function (e) { post({ k: "fail", msg: String((e && e.message) || "error al cargar") }); });
    window.addEventListener("unhandledrejection", function (e) { log("promesa rechazada: " + ((e && e.reason && e.reason.message) || e.reason)); });
  }

  function buildDoc(p, code, kv) {
    var cfg = JSON.stringify({ api: API_MAX, app: "zynora/" + APP_VER, lang: navigator.language || "es", kv: kv || {} }).replace(/</g, "\\u003c");
    var names = ["search", "home", "browse", "episodes", "resolve", "details"];
    var reg = "\n;try{var __z={};" + names.map(function (n) { return 'if(typeof ' + n + '==="function")__z.' + n + "=" + n + ";"; }).join("") + "window.__zplReady(__z);}catch(e){window.__zplFail(e&&e.message||e);}\n";
    var safe = String(code).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'; connect-src \'none\'; img-src \'none\'; frame-src \'none\'; child-src \'none\'; form-action \'none\'; base-uri \'none\'">' +
      "<script>(" + zplBoot.toString() + ")(" + cfg + ");<\/script>" +
      '<script type="module">' + safe + reg + "<\/script></head><body></body></html>";
  }

  var RT = {};
  function Runtime(p, code) { this.p = p; this.code = code; this.f = null; this.ready = null; this.calls = {}; this.seq = 0; this.idle = 0; this.tmo = 0; this.logs = []; this.reqs = []; }
  Runtime.prototype.start = function () {
    var self = this;
    if (self.ready) return self.ready;
    self.ready = new Promise(function (resolve, reject) {
      var f = D.createElement("iframe");
      f.setAttribute("sandbox", "allow-scripts"); f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
      f.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden";
      self.f = f;
      var to = setTimeout(function () { self.onfail("El plugin tardó demasiado en cargar."); }, 10000);
      self.onready = function (ex) { clearTimeout(to); self.onready = self.onfail = null; resolve(ex); };
      self.onfail = function (msg) { clearTimeout(to); self.onready = self.onfail = null; reject(new Error(msg)); self.kill(); };
      f.srcdoc = buildDoc(self.p, self.code != null ? self.code : codeOf(self.p.id), J(localStorage.getItem(STORE + self.p.id), {}));
      D.body.appendChild(f);
    });
    self.ready.catch(noop);
    return self.ready;
  };
  Runtime.prototype.kill = function () {
    var self = this;
    clearTimeout(self.idle);
    if (self.f && self.f.parentNode) self.f.parentNode.removeChild(self.f);
    self.f = null; self.ready = null;
    Object.keys(self.calls).forEach(function (k) { var c = self.calls[k]; clearTimeout(c.t); delete self.calls[k]; c.reject(new Error("El plugin se reinició.")); });
  };
  Runtime.prototype.call = async function (fn, arg, ms) {
    var self = this;
    await self.start();
    var id = ++self.seq;
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        delete self.calls[id];
        self.tmo++;
        if (self.tmo >= 3 && !self.test) { try { patch(self.p.id, { noresp: true }); } catch (e) {} }
        reject(new Error("«" + self.p.name + "» tardó demasiado en responder (puede que su sitio esté caído o lento). Prueba con otra fuente."));
        self.kill();
      }, ms);
      self.calls[id] = { resolve: resolve, reject: reject, t: t, n: 0 };
      try { self.f.contentWindow.postMessage({ k: "call", id: id, fn: fn, arg: arg }, "*"); } catch (e) { clearTimeout(t); delete self.calls[id]; reject(e); }
    }).then(function (v) { self.tmo = 0; self.armIdle(); return v; }, function (e) { self.armIdle(); throw e; });
  };
  Runtime.prototype.armIdle = function () { var self = this; clearTimeout(self.idle); self.idle = setTimeout(function () { self.kill(); }, 300000); };
  function rtOf(p) { var r = RT[p.id]; if (!r) r = RT[p.id] = new Runtime(p); r.p = p; return r; }
  function dispose(id) { if (RT[id]) { RT[id].kill(); delete RT[id]; } }

  /* mensajes que llegan de los iframes */
  W.addEventListener("message", function (ev) {
    var rt = null, ids = Object.keys(RT);
    for (var i = 0; i < ids.length; i++) if (RT[ids[i]].f && RT[ids[i]].f.contentWindow === ev.source) { rt = RT[ids[i]]; break; }
    if (!rt && TESTRT && TESTRT.f && TESTRT.f.contentWindow === ev.source) rt = TESTRT;
    if (!rt) return;
    var m = ev.data; if (!m || typeof m !== "object") return;
    if (m.k === "ready") { if (rt.onready) rt.onready(m.ex || []); }
    else if (m.k === "fail") { if (rt.onfail) rt.onfail(m.msg); }
    else if (m.k === "ret") {
      var c = rt.calls[m.id]; if (!c) return; delete rt.calls[m.id]; clearTimeout(c.t);
      if (m.ok) c.resolve(m.v); else { var e = new Error((m.err && m.err.message) || "error"); if (m.err) { e.code = m.err.code; e.userMessage = m.err.userMessage; } c.reject(e); }
    }
    else if (m.k === "kv") { try { if (JSON.stringify(m.kv).length <= 65536 && !rt.test) localStorage.setItem(STORE + rt.p.id, JSON.stringify(m.kv)); } catch (e) {} }
    else if (m.k === "log") { rt.logs.push(String(m.a)); if (rt.logs.length > 60) rt.logs.shift(); try { console.log("[plugin " + rt.p.id + "]", m.a); } catch (e) {} }
    else if (m.k === "fetch") { doFetch(rt, m); }
  });
  var TESTRT = null;

  /* zynora.fetch: aquí se aplican las reglas de hosts */
  async function doFetch(rt, m) {
    var f = rt.f, reply = function (o) { try { if (f && f.contentWindow) f.contentWindow.postMessage(Object.assign({ k: "fetchRet", id: m.id }, o), "*"); } catch (e) {} };
    try {
      var now = Date.now(); rt.reqs = rt.reqs.filter(function (t) { return now - t < 60000; });
      if (rt.reqs.length >= 300) throw ferr("rate_limited", "demasiadas solicitudes");
      rt.reqs.push(now);
      var c = rt.calls[m.call]; if (c) { c.n++; if (c.n > 60) throw ferr("rate_limited", "demasiadas solicitudes en una llamada (máximo 60)"); }
      reply({ ok: true, res: await pluginFetch(rt.p, m.url, m.opts || {}) });
    } catch (e) {
      reply({ ok: false, err: { message: String(e && e.message || e).slice(0, 500), code: e && e.kcode || "network", host: e && e.khost } });
    }
  }
  async function pluginFetch(p, url, o) {
    var method = String(o.method || "GET").toUpperCase();
    if (["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].indexOf(method) < 0) throw ferr("invalid_request", "método no permitido");
    var headers = {}, hasUA = false;
    Object.keys(o.headers || {}).forEach(function (k) {
      if (/^(host|content-length|transfer-encoding|connection|cookie2|cookie)$/i.test(k)) return;
      if (!/^[A-Za-z0-9-]{1,64}$/.test(k)) return;
      var v = String(o.headers[k]); if (/[\r\n]/.test(v)) return;
      if (k.toLowerCase() === "user-agent") hasUA = true;
      headers[k] = v;
    });
    if (!hasUA) headers["User-Agent"] = "Zynora/" + APP_VER + " (plugin " + p.id + ")";
    var body = null, b = o.body;
    if (b != null && method !== "GET" && method !== "HEAD") {
      if (typeof b === "string") {
        body = b;
        if (/json/i.test(headers["Content-Type"] || "")) { var pj = J(b, undefined); if (pj !== undefined && http()) body = pj; }
      } else if (b && b.json !== undefined) { body = b.json; if (!headers["Content-Type"]) headers["Content-Type"] = "application/json"; }
      else if (b && b.form && typeof b.form === "object") {
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = http() ? b.form : new URLSearchParams(b.form).toString();
      } else throw ferr("invalid_request", "cuerpo de la solicitud no válido");
    }
    if ((url + JSON.stringify(headers) + (typeof body === "string" ? body : JSON.stringify(body || ""))).length > 1048576) throw ferr("too_large", "solicitud demasiado grande (más de 1 MB)");
    var timeout = Math.min(Math.max(Number(o.timeoutMs) || 15000, 1000), 30000), cur = url, hops = 0;
    for (;;) {
      checkUrl(p, cur, "fetch");
      var r;
      try { r = await rawRequest(method, cur, headers, body, timeout); }
      catch (e) {
        var em = String((e && e.message) || ""), hn = ""; try { hn = new URL(cur).hostname; } catch (x) {}
        if (/resolve host|UnknownHost|No address associated|ENOTFOUND|Name or service/i.test(em)) throw ferr("network", "No se pudo encontrar el sitio " + hn + " (puede estar caído, haber cambiado de dirección o estar bloqueado en tu red).");
        if (/abort|timeout|timed out/i.test(em)) throw ferr("timeout", "El sitio " + hn + " tardó demasiado en responder.");
        if (/SSL|certificate|handshake|TLS/i.test(em)) throw ferr("network", "No se pudo abrir una conexión segura con " + hn + ".");
        throw ferr("network", "No se pudo conectar con " + hn + ".");
      }
      if (r.finalUrl && r.finalUrl !== cur) { checkUrl(p, r.finalUrl, "fetch"); cur = r.finalUrl; }
      if ([301, 302, 303, 307, 308].indexOf(r.status) >= 0 && r.headers.location && o.redirect !== "manual") {
        if (++hops > 10) throw ferr("network", "demasiadas redirecciones");
        cur = new URL(r.headers.location, cur).href;
        if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === "POST")) { method = "GET"; body = null; delete headers["Content-Type"]; }
        continue;
      }
      if (r.text.length > 5242880) throw ferr("too_large", "la respuesta es demasiado grande (más de 5 MB)");
      delete r.headers["set-cookie"];
      return { ok: r.status >= 200 && r.status < 300, status: r.status, url: cur, headers: r.headers, text: r.text };
    }
  }

  /* =============== Llamadas al plugin y revisión de sus respuestas =============== */
  var TMO = { search: 25000, home: 25000, browse: 25000, episodes: 25000, resolve: 30000 };
  function callPlugin(p, fn, arg) { return rtOf(p).call(fn, arg, TMO[fn] || 20000); }
  var ID = /^[A-Za-z0-9._~-]{1,128}$/;
  function str(v, n) { return typeof v === "string" ? v.trim().slice(0, n) : (typeof v === "number" && isFinite(v) ? String(v).slice(0, n) : ""); }
  function img(v) { v = str(v, 2048); return /^https:\/\//i.test(v) ? v : ""; }
  function cleanItem(x, p) {
    if (!x || typeof x !== "object") return null;
    var id = typeof x.id === "string" ? x.id : "", ref = typeof x.ref === "string" ? x.ref : "", title = str(x.title, 200);
    if (!ID.test(id) || !ref || ref.length > 4096 || !title) return null;
    if (x.adult === true) return null;
    var kind = x.kind === "series" ? "series" : x.kind === "movie" ? "movie" : "";
    if (!kind) return null;
    if (kind === "series" && p && p.caps.indexOf("episodes") < 0) return null;
    return { id: id, ref: ref, title: title, kind: kind, year: str(x.year, 10), poster: img(x.poster), backdrop: img(x.backdrop), overview: str(x.overview, 2000), lang: str(x.lang, 20), quality: str(x.quality, 20) };
  }
  function cleanList(arr, p, max) {
    var seen = {}, out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (x) { var it = cleanItem(x, p); if (it && !seen[it.id] && out.length < max) { seen[it.id] = 1; out.push(it); } });
    return out;
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  function cleanStream(p, st) {
    if (!st || typeof st !== "object" || typeof st.url !== "string") throw new Error("El plugin no devolvió un enlace de video.");
    var bad = ["drm", "license", "licenseUrl", "drmLicenseUrl", "keySystem", "widevine"];
    if (bad.some(function (k) { return st[k] != null; })) throw new Error("Este video usa protección DRM y no se puede reproducir.");
    try { checkUrl(p, st.url, "stream"); } catch (e) { throw new Error("El plugin devolvió un enlace de un sitio que no declaró (" + (e.khost || "desconocido") + ")."); }
    var h = {}, n = 0;
    Object.keys(st.headers || {}).forEach(function (k) {
      if (n >= 20 || !/^[A-Za-z0-9-]{1,64}$/.test(k) || /^(host|content-length|transfer-encoding|connection)$/i.test(k)) return;
      var v = String(st.headers[k]); if (v.length > 4096 || /[\r\n]/.test(v)) return;
      h[k] = v; n++;
    });
    var mime = typeof st.mime === "string" && /^[a-z]+\/[a-z0-9.+-]+$/i.test(st.mime) ? st.mime : "";
    if (typeof st.mime === "string" && !mime) throw new Error("El plugin devolvió un tipo de video no válido.");
    return { url: st.url, headers: h, mime: mime };
  }

  /* =============== Fuentes para el menú de reproducción =============== */
  async function find(t, type, s, e) {
    var list = sources();
    var q = { q: t.title, type: type === "tv" ? "series" : "movie", year: Number(t.year) || 0, season: type === "tv" ? Number(s) || 0 : 0, episode: type === "tv" ? Number(e) || 0 : 0, tmdbId: Number(t.tmdbId) || 0, originalTitle: t.originalTitle || t.original_title || "", altTitles: [], cursor: null };
    var want = norm(t.title);
    return Promise.all(list.map(async function (p) {
      var addon = { url: "plugin:" + p.id, name: p.name };
      try {
        var r = await callPlugin(p, "search", q);
        var items = cleanList(Array.isArray(r) ? r : (r && r.items), p, 50);
        items.forEach(function (it) { var n = norm(it.title); it._s = (n === want ? 0 : (n.indexOf(want) === 0 ? 1 : (n.indexOf(want) >= 0 ? 2 : 3))) * 2 + ((it.kind === "series") === (type === "tv") ? 0 : 1); });
        items.sort(function (a, b) { return a._s - b._s; });
        return { addon: addon, plugin: true, error: false, streams: items.slice(0, 12).map(function (it) {
          return { name: p.name, title: it.title + (it.year ? " (" + it.year + ")" : "") + "\n" + [it.kind === "series" ? "Serie" : "Película", it.quality, it.lang].filter(Boolean).join(" · "), behaviorHints: {}, _zpl: { pid: p.id, ref: it.ref, id: it.id, kind: it.kind, title: it.title } };
        }) };
      } catch (err) { try { console.warn("[plugin " + p.id + "]", err && err.message); } catch (x) {} return { addon: addon, plugin: true, error: true, streams: [] }; }
    }));
  }
  var EPC = {};
  async function episodesOf(p, ref) {
    var k = p.id + "|" + ref, c = EPC[k];
    if (c && Date.now() - c.t < 600000) return c.v;
    var r = await callPlugin(p, "episodes", ref);
    var v = { episodes: (r && Array.isArray(r.episodes) ? r.episodes : []).filter(function (x) { return x && typeof x.ref === "string" && x.ref && Number(x.number) >= 1; }), seasons: r && Array.isArray(r.seasons) ? r.seasons : [] };
    EPC[k] = { t: Date.now(), v: v };
    return v;
  }
  async function resolveFor(z, type, s, e) {
    var p = byId(z.pid);
    if (!p || !active(p)) throw new Error("Ese plugin ya no está activo. Actívalo en Plugins.");
    var ref = z.ref;
    if (z.kind === "series") {
      var want = type === "tv" ? Number(s) : 1, wantE = type === "tv" ? Number(e) : 1;
      var r = await episodesOf(p, z.ref), eps = r.episodes, hit = null;
      if (type === "tv") hit = eps.filter(function (x) { return (Number(x.season) || 1) === want && Number(x.number) === wantE; })[0];
      else hit = eps.slice().sort(function (a, b) { return ((Number(a.season) || 1) - (Number(b.season) || 1)) || (a.number - b.number); })[0];
      if (!hit && type === "tv") {
        var sea = r.seasons.filter(function (x) { return x && Number(x.number) === want && !x.current && typeof x.ref === "string"; })[0];
        if (sea) { var r2 = await episodesOf(p, sea.ref); hit = r2.episodes.filter(function (x) { return Number(x.number) === wantE; })[0]; }
      }
      if (!hit) throw new Error("«" + p.name + "» no tiene el episodio T" + want + " · E" + wantE + ". Prueba con otra fuente.");
      ref = hit.ref;
    }
    return cleanStream(p, await callPlugin(p, "resolve", ref));
  }

  /* =============== Filas del Inicio =============== */
  var HOME = [], homeTok = 0;
  async function homeOf(p) {
    var c = J(localStorage.getItem(HOMEC + p.id), null);
    if (c && c.v === p.version && Date.now() - c.t < 21600000) return c.rows;
    var r = await callPlugin(p, "home", null), seen = {}, rows = [];
    (Array.isArray(r) ? r : []).slice(0, 10).forEach(function (x) {
      if (!x || typeof x.id !== "string" || !ID.test(x.id) || seen[x.id] || !str(x.title, 200)) return;
      var items = cleanList(x.items, p, 40).filter(function (i) { return i.poster; });
      if (items.length) { seen[x.id] = 1; rows.push({ id: x.id, title: str(x.title, 200), items: items }); }
    });
    try { localStorage.setItem(HOMEC + p.id, JSON.stringify({ t: Date.now(), v: p.version, rows: rows })); } catch (e) {}
    return rows;
  }
  async function openMeta(it) {
    var mt = it.kind === "series" ? "tv" : "movie";
    try {
      var yr = /^\d{4}$/.test(it.year) ? it.year : "", hit = null;
      var q = await W.tmdb("/search/" + mt, mt === "tv" ? { query: it.title, first_air_date_year: yr || undefined } : { query: it.title, year: yr || undefined });
      hit = (q.results || [])[0];
      if (!hit && yr) { q = await W.tmdb("/search/" + mt, { query: it.title }); hit = (q.results || [])[0]; }
      if (!hit) { var o = mt === "tv" ? "movie" : "tv"; q = await W.tmdb("/search/" + o, { query: it.title }); hit = (q.results || [])[0]; if (hit) mt = o; }
      if (!hit) throw new Error("No se encontró ese título en TMDB.");
      W.openCredit(mt, hit.id);
    } catch (e) { say((e && e.message) || "No se pudo abrir ese título."); }
  }
  /* Pestaña «Plugins»: muestra el catálogo (filas del Inicio) de cada plugin instalado, uno a la vez. */
  var HP = "";
  function showTab() { renderHome(true); }
  function renderHome(show) {
    var page = $("pluginsPage"); if (!page) return;
    var ps = homes(), body = $("zplTab");
    if (!body) {
      body = D.createElement("div"); body.id = "zplTab"; page.appendChild(body);
      body.addEventListener("click", function (ev) {
        var ch = ev.target.closest && ev.target.closest("[data-hp]");
        if (ch) { HP = ch.getAttribute("data-hp"); body.removeAttribute("data-sig"); renderHome(true); return; }
        if (ev.target.closest && ev.target.closest("[data-zplopen]")) { try { open(); } catch (e) {} return; }
        var c = ev.target.closest && ev.target.closest(".zph-card"); if (!c) return;
        var x = HOME[Number(c.getAttribute("data-i"))], it = x && x.row.items[Number(c.getAttribute("data-j"))];
        if (it) openMeta(it);
      });
    }
    if (show !== true && page.classList.contains("hidden")) return; /* se pinta al abrir la pestaña */
    if (!ps.length) {
      HOME = []; ++homeTok; body.removeAttribute("data-sig");
      var has = all().length > 0;
      body.innerHTML = '<div class="zph-empty"><p>' + (has ? "Tus plugins instalados no ofrecen catálogo (solo búsqueda y reproducción), o están desactivados." : "Aquí aparecerá el catálogo de tus plugins.") + '</p><button type="button" class="btn" data-zplopen="1">' + (has ? "Ver mis plugins" : "Instalar un plugin") + "</button></div>";
      return;
    }
    if (!ps.some(function (p) { return p.id === HP; })) HP = ps[0].id;
    var sig = ps.map(function (p) { return p.id + p.version; }).join(",") + "|" + HP;
    if (body.getAttribute("data-sig") === sig && Date.now() - Number(body.getAttribute("data-t") || 0) < 21600000) return;
    var cur = ps.filter(function (p) { return p.id === HP; })[0], tok = ++homeTok;
    body.setAttribute("data-sig", sig); body.setAttribute("data-t", String(Date.now())); HOME = [];
    body.innerHTML = '<div class="chips" id="zplChips">' + ps.map(function (p) {
      return '<button type="button" class="chip' + (p.id === HP ? " active" : "") + '" data-hp="' + E(p.id) + '">' + E(p.name) + "</button>";
    }).join("") + '</div><div id="zplHome"><p class="zph-st">Cargando catálogo…</p></div>';
    var wrap = $("zplHome");
    homeOf(cur).then(function (rows) {
      if (tok !== homeTok) return;
      wrap.innerHTML = "";
      if (!rows.length) { body.removeAttribute("data-sig"); wrap.innerHTML = '<p class="zph-st">Este plugin no tiene catálogo disponible ahora.</p>'; return; }
      rows.forEach(function (r) {
        var i = HOME.push({ p: cur, row: r }) - 1, sec = D.createElement("div");
        sec.className = "zph-sec";
        sec.innerHTML = '<div class="section-head"><div><h2>' + E(r.title) + "</h2></div></div>" +
          '<div class="zph-row">' + r.items.map(function (it, j) {
            return '<button type="button" class="zph-card" data-i="' + i + '" data-j="' + j + '"><span class="zph-p"><img loading="lazy" alt="" src="' + E(it.poster) + '"></span><b>' + E(it.title) + "</b></button>";
          }).join("") + "</div>";
        wrap.appendChild(sec);
      });
    }).catch(function (e) {
      if (tok !== homeTok) return;
      body.removeAttribute("data-sig");
      wrap.innerHTML = '<p class="zph-st">No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.</p>';
      try { console.warn("[plugin " + cur.id + "] catálogo:", e && e.message); } catch (x) {}
    });
  }

  /* =============== Instalar, actualizar, quitar =============== */
  async function selfTest(f, code) {
    var rec = { id: f.m.id, name: f.m.name }, rt = new Runtime(rec, code);
    rt.test = true; TESTRT = rt;
    try {
      var ex = await rt.start();
      var need = f.m.caps.filter(function (c) { return ["search", "home", "browse", "episodes", "resolve"].indexOf(c) >= 0; });
      if (f.m.catalogOnly) need = need.filter(function (c) { return c !== "resolve"; });
      need.forEach(function (c) { if (ex.indexOf(c) < 0) throw new Error("El plugin no carga: le falta «" + c + "»."); });
    } finally { rt.kill(); TESTRT = null; }
  }
  function hostsText(p) {
    var a = (p.hosts || []).slice();
    if (p.fetchAny) a.push("cualquier servidor público (solo https)");
    return a.join(", ");
  }
  async function install(specText, upd) {
    var sp = typeof specText === "string" ? parseSpec(specText) : specText, f = await fetchRepo(sp), cur = byId(f.m.id);
    if (cur && cur.repo !== f.key && !upd) throw new Error("Ya hay un plugin con ese id («" + cur.name + "») instalado desde otra dirección.");
    if (cur && !upd) throw new Error("«" + cur.name + "» ya está instalado.");
    var newHosts = null;
    if (upd && cur) newHosts = f.m.hosts.filter(function (h) { return cur.hosts.indexOf(h) < 0; }).concat(f.m.fetchAny && !cur.fetchAny ? ["cualquier servidor público"] : []);
    if (!upd || (newHosts && newHosts.length)) { if (!(await consent(f, newHosts))) return false; }
    var code = await f.getCode();
    await selfTest(f, code);
    try { localStorage.setItem(CODE + f.m.id, code); } catch (e) { throw new Error("No hay espacio para guardar el plugin."); }
    var rec = Object.assign({}, f.m, { repo: f.key, spec: sp, iconUrl: f.icon, enabled: cur ? cur.enabled !== false : true, noresp: undefined, pending: undefined, at: cur ? cur.at : Date.now(), checked: Date.now() });
    rec.icon = f.icon;
    var a = all().filter(function (p) { return p.id !== rec.id; }); a.push(rec); saveAll(a);
    dispose(rec.id); try { localStorage.removeItem(HOMEC + rec.id); } catch (e) {} EPC = {};
    changed();
    return rec;
  }
  async function checkUpdate(id, manual) {
    var p = byId(id); if (!p) return "none";
    try {
      var f = await fetchRepo(p.spec || parseSpec(p.repo));
      patch(id, { checked: Date.now() });
      if (cmpVer(f.m.version, p.version) <= 0) return "same";
      var grow = f.m.hosts.some(function (h) { return p.hosts.indexOf(h) < 0; }) || (f.m.fetchAny && !p.fetchAny) || (f.m.streamAny && !p.streamAny);
      if (grow && !manual) { patch(id, { pending: true }); changed(); return "pending"; }
      return (await install(p.spec || parseSpec(p.repo), true)) ? "updated" : "cancel";
    } catch (e) { if (manual) throw e; return "error"; }
  }
  function uninstall(id) {
    dispose(id);
    saveAll(all().filter(function (p) { return p.id !== id; }));
    try { localStorage.removeItem(CODE + id); localStorage.removeItem(STORE + id); localStorage.removeItem(HOMEC + id); } catch (e) {}
    changed();
  }
  function setEnabled(id, on) { patch(id, { enabled: on, noresp: undefined }); if (!on) dispose(id); else { var r = RT[id]; if (r) r.tmo = 0; } changed(); }
  function changed() { try { W.dispatchEvent(new Event("zy-plugins-changed")); } catch (e) {} try { sum(); paintAll(); renderHome(); } catch (e) {} }

  /* =============== Pantalla de plugins =============== */
  var CSS = '' +
    '#zplRoot{position:fixed;inset:0;z-index:2000000000;display:flex;flex-direction:column;color:#f4f7ff;background:radial-gradient(ellipse at 85% 10%,rgba(120,30,40,.22),transparent 45%),radial-gradient(ellipse at 10% 0,rgba(40,70,140,.2),transparent 40%),#07090f;font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}' +
    ':where(#zplRoot,.zpl-sh) button{font:inherit;color:inherit;border:0;background:none;padding:0;cursor:pointer}#zplRoot[hidden]{display:none}' +
    '.zpl-top{display:flex;align-items:center;gap:14px;padding:calc(var(--sat,14px) + 6px) 18px 8px}.zpl-top svg{width:26px;height:26px;fill:currentColor}.zpl-top b{flex:1;font-size:26px;font-weight:800}' +
    '.zpl-plus{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,rgba(var(--acc-rgb,100,244,255),.28),rgba(var(--acc-rgb,100,244,255),.1));box-shadow:inset 0 0 0 1px rgba(var(--acc-rgb,100,244,255),.5);color:var(--cyan,#64f4ff);font-size:28px;line-height:1;display:grid;place-items:center}.zpl-back{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.07);display:grid;place-items:center}' +
    '.zpl-tabs{display:flex;gap:8px;padding:8px 18px 14px;border-bottom:1px solid rgba(255,255,255,.08);overflow-x:auto;scrollbar-width:none}.zpl-tabs::-webkit-scrollbar{display:none}' +
    '.zpl-tabs button{flex:none;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.05);color:#9aa6c1;font-weight:700;font-size:14.5px}.zpl-tabs button.on{background:rgba(var(--acc-rgb,100,244,255),.18);color:#fff;box-shadow:inset 0 0 0 1px rgba(var(--acc-rgb,100,244,255),.55)}' +
    '.zpl-body{flex:1;overflow-y:auto;padding:16px 18px calc(28px + env(safe-area-inset-bottom,0px))}' +
    '.zpl-q{width:100%;box-sizing:border-box;padding:15px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:transparent;color:#fff;font:500 16px inherit;outline:none}.zpl-q:focus{border-color:var(--cyan,#64f4ff)}' +
    '.zpl-chips{display:flex;gap:10px;overflow-x:auto;padding:14px 0;scrollbar-width:none}.zpl-chips::-webkit-scrollbar{display:none}' +
    '.zpl-chips button{flex:none;padding:9px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#c3cce3;font-weight:600;font-size:14px}.zpl-chips button.on{background:linear-gradient(100deg,var(--cyan,#64f4ff),color-mix(in srgb,var(--cyan,#64f4ff) 55%,#9da8ff));border-color:transparent;color:#071018;font-weight:700}' +
    '.zpl-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(min-width:760px){.zpl-grid{grid-template-columns:repeat(3,1fr)}}' +
    '.zpl-card{display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:20px;background:linear-gradient(160deg,color-mix(in srgb,var(--c) 38%,#12141f),#12141f 85%);border:1px solid rgba(255,255,255,.06);min-width:0}' +
    '.zpl-ic{width:54px;height:54px;border-radius:14px;background:var(--c);display:grid;place-items:center;font-weight:800;font-size:24px;color:#fff;overflow:hidden;margin-bottom:6px}.zpl-ic img{width:100%;height:100%;object-fit:cover}' +
    '.zpl-card h4{margin:0;font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.zpl-card p{margin:0;color:#aab3c9;font-size:13.5px;line-height:1.35;min-height:2.7em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.zpl-tag{align-self:flex-start;padding:3px 10px;border-radius:8px;background:rgba(255,255,255,.1);color:#c8d0e6;font-size:12px;font-weight:600}.zpl-tag.w{background:rgba(255,184,77,.16);color:#ffb84d}' +
    '.zpl-btn{margin-top:auto;padding:12px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-weight:700;font-size:15px;text-align:center}.zpl-btn.pri{background:linear-gradient(100deg,var(--cyan,#64f4ff),color-mix(in srgb,var(--cyan,#64f4ff) 55%,#9da8ff));border-color:transparent;color:#071018;box-shadow:0 6px 22px rgba(var(--acc-rgb,100,244,255),.22)}.zpl-card p{margin-bottom:10px!important}' +
    '.zpl-msg{padding:36px 10px;text-align:center;color:#9aa6c1;line-height:1.5}.zpl-note{margin:14px 2px 0;color:#7f8aa6;font-size:12px;line-height:1.5}' +
    '.zpl-sh{position:fixed;inset:0;z-index:2000000002;display:flex;align-items:flex-end;background:rgba(0,0,0,.55)}' +
    '.zpl-sh-card{width:100%;max-height:86vh;overflow-y:auto;box-sizing:border-box;padding:12px 22px calc(22px + env(safe-area-inset-bottom,0px));border-radius:26px 26px 0 0;background:#1d1e26;color:#f4f7ff}' +
    '.zpl-grab{width:44px;height:5px;border-radius:5px;background:#8b8d99;margin:0 auto 22px}.zpl-sh h3{margin:0 0 8px;font-size:22px}.zpl-sh .zpl-sm{margin:0 0 6px;color:#a9adbd;font-size:15px;line-height:1.5;word-break:break-word}' +
    '.zpl-sh .zpl-more{color:#ff4d5e;font-size:15px;margin:6px 0 18px}.zpl-sh .zpl-warn{margin:14px 0;padding:12px 14px;border-radius:12px;background:rgba(255,184,77,.12);color:#ffcf85;font-size:14px;line-height:1.45}' +
    '.zpl-act{display:block;width:100%;text-align:left;padding:18px 2px;font-size:18px;font-weight:500}.zpl-act.red{color:#ff6b7a}' +
    '.zpl-row2{display:flex;gap:10px;margin-top:16px}.zpl-row2 button{flex:1;padding:14px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);font-weight:700}.zpl-row2 button.pri{background:linear-gradient(100deg,var(--cyan,#64f4ff),color-mix(in srgb,var(--cyan,#64f4ff) 55%,#9da8ff));border-color:transparent;color:#071018}' +
    '.zpl-in{width:100%;box-sizing:border-box;margin-top:10px;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;font:500 16px inherit;outline:none}' +
    '#zplHome .zph-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 12px;scrollbar-width:none}#zplHome .zph-row::-webkit-scrollbar{display:none}' +
    '#zplHome .zph-sub{display:block;color:#8f9ab5;font-size:12px;margin-top:3px}#zplHome .zph-card{flex:0 0 clamp(112px,31vw,150px);padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;display:flex;flex-direction:column;gap:8px}' +
    '#zplHome .zph-p{display:block;aspect-ratio:2/3;border-radius:16px;overflow:hidden;background:#151b2c;box-shadow:0 8px 22px rgba(0,0,0,.35)}#zplHome .zph-p img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#zplHome .zph-card b{font-size:13px;line-height:1.25;color:#e8edf8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '#zplHome .zph-st,#zplTab .zph-empty p{color:#8f9ab5;font-size:14px;padding:8px 2px}#zplTab .chips{margin:4px 0 16px}#zplTab .zph-empty{padding:18px 2px}';
  var BACK = '<svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>';
  var root = null, UI = { tab: "rec", q: "", cat: "all" }, MC = {}, comm = null, commErr = "", sheetEl = null, backH = null;

  var sheetCb = null;
  function sheet(html, wire, onClose) {
    closeSheet();
    sheetCb = onClose || null;
    var s = D.createElement("div"); s.className = "zpl-sh";
    s.innerHTML = '<div class="zpl-sh-card"><div class="zpl-grab"></div>' + html + "</div>";
    s.addEventListener("click", function (ev) { if (ev.target === s) closeSheet(); });
    D.body.appendChild(s); sheetEl = s;
    if (wire) wire(s);
    return s;
  }
  function closeSheet() {
    if (sheetEl && sheetEl.parentNode) sheetEl.parentNode.removeChild(sheetEl);
    sheetEl = null;
    var cb = sheetCb; sheetCb = null;
    if (cb) cb();
  }

  function consent(f, newHosts) {
    return new Promise(function (resolve) {
      var m = f.m, hosts = m.hosts.map(function (h) { return "• " + h + (newHosts && newHosts.indexOf(h) >= 0 ? "  (nuevo)" : ""); }).join("\n");
      var extra = [];
      if (m.fetchAny) extra.push("Puede conectarse a cualquier servidor público de internet (solo https, nunca tu red local)");
      if (m.streamAny) extra.push("Puede reproducir videos de cualquier servidor público");
      if (m.catalogOnly) extra.push("Solo catálogo: no reproduce videos");
      var done = false;
      function fin(v) { if (done) return; done = true; sheetCb = null; closeSheet(); resolve(v); }
      sheet('<h3>' + (newHosts ? "Actualizar " : "Instalar ") + E(m.name) + '</h3><p class="zpl-sm">v' + E(m.version) + (m.author ? " · " + E(m.author) : "") + "</p>" +
        (m.description ? '<p class="zpl-sm">' + E(m.description) + "</p>" : "") +
        '<p class="zpl-sm"><b>Se va a conectar con:</b></p><p class="zpl-sm" style="white-space:pre-line">' + E(hosts || "—") + "</p>" +
        extra.map(function (x) { return '<p class="zpl-sm">' + E(x) + "</p>"; }).join("") +
        '<div class="zpl-warn">Plugin no verificado: solo instálalo si confías en quien lo hizo. Lo que reproduzca depende de ese plugin.</div>' +
        '<div class="zpl-row2"><button data-r="0">Cancelar</button><button class="pri" data-r="1">' + (newHosts ? "Actualizar" : "Instalar") + "</button></div>",
        function (s) { s.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-r]"); if (b) fin(b.getAttribute("data-r") === "1"); }); },
        function () { fin(false); });
    });
  }

  function manage(p) {
    var h = hostsText(p), long = h.length > 110, open = false;
    var st = p.noresp ? "No responde — actívalo para volver a intentar" : p.pending ? "Actualización disponible — requiere tu aprobación" : p.enabled === false ? "Desactivado" : "Activo";
    sheet('<h3>' + E(p.name) + " · " + E(p.version) + '</h3><p class="zpl-sm" id="zplH"></p>' + (long ? '<button class="zpl-more" id="zplMore">Ver más</button>' : "") +
      '<p class="zpl-sm">Estado: ' + E(st) + "</p>" +
      '<button class="zpl-act" data-a="toggle">' + (p.enabled === false || p.noresp ? "Activar" : "Desactivar") + "</button>" +
      '<button class="zpl-act" data-a="upd">' + (p.pending ? "Aprobar actualización" : "Buscar actualización") + "</button>" +
      (RT[p.id] && RT[p.id].logs.length ? '<button class="zpl-act" data-a="log">Ver registro</button>' : "") +
      '<button class="zpl-act red" data-a="del">Desinstalar</button>',
      function (s) {
        var hp = s.querySelector("#zplH");
        function paint() { hp.textContent = "Se conectará a: " + (long && !open ? h.slice(0, 110) + "…" : h); var mb = s.querySelector("#zplMore"); if (mb) mb.textContent = open ? "Ver menos" : "Ver más"; }
        paint();
        s.addEventListener("click", async function (ev) {
          if (ev.target.id === "zplMore") { open = !open; paint(); return; }
          var b = ev.target.closest && ev.target.closest("[data-a]"); if (!b) return;
          var a = b.getAttribute("data-a");
          if (a === "toggle") { setEnabled(p.id, p.enabled === false || !!p.noresp); closeSheet(); }
          else if (a === "del") {
            closeSheet();
            var ok = typeof W.zyAsk === "function" ? await W.zyAsk({ title: "Desinstalar plugin", text: "¿Quitar «" + p.name + "»? Podrás volver a instalarlo cuando quieras.", kind: "warn", ok: "Desinstalar", cancel: "Cancelar", danger: true }) : confirm("¿Desinstalar " + p.name + "?");
            if (ok) { uninstall(p.id); say("Plugin desinstalado"); }
          }
          else if (a === "upd") {
            closeSheet(); say("Buscando actualización…");
            try { var r = await checkUpdate(p.id, true); say(r === "updated" ? "Plugin actualizado" : r === "same" ? "Ya tienes la última versión" : r === "cancel" ? "Actualización cancelada" : "Listo"); } catch (e) { warn("No se pudo actualizar", e.message); }
          }
          else if (a === "log") { closeSheet(); warn("Registro de «" + p.name + "»", (RT[p.id] && RT[p.id].logs.slice(-12).join("\n")) || "Sin mensajes."); }
        });
      });
  }
  function addSheet() {
    sheet('<h3>Agregar plugin</h3><p class="zpl-sm">Escribe la dirección del repositorio de GitHub del plugin.</p><input id="zplIn" class="zpl-in" placeholder="usuario/repositorio" autocapitalize="none" autocomplete="off" spellcheck="false">' +
      '<div class="zpl-row2"><button data-r="0">Cancelar</button><button class="pri" data-r="1">Agregar</button></div>',
      function (s) {
        s.addEventListener("click", function (ev) {
          var b = ev.target.closest && ev.target.closest("[data-r]"); if (!b) return;
          if (b.getAttribute("data-r") === "0") { closeSheet(); return; }
          var v = s.querySelector("#zplIn").value; closeSheet(); doInstall(v);
        });
      });
  }
  async function doInstall(spec) {
    try { say("Descargando plugin…"); var r = await install(spec, false); if (r) say("Plugin instalado: " + r.name); }
    catch (e) { warn("No se pudo instalar", (e && e.message) || "Error desconocido."); }
  }

  /* contenido de las pestañas */
  function entries() {
    if (UI.tab === "inst") return all().map(function (p) { return { repo: p.repo, name: p.name }; });
    if (UI.tab === "rec") return RECOMMENDED.map(function (r) { return { repo: r.repo.toLowerCase(), name: r.name, desc: r.desc, color: r.color, cats: r.cats }; });
    return comm || [];
  }
  var mq = [], mrun = 0;
  function loadMeta(repo) {
    if (MC[repo] !== undefined) return;
    MC[repo] = null; mq.push(repo); pump();
  }
  function pump() {
    while (mrun < 5 && mq.length) {
      (function (repo) {
        mrun++;
        fetchRepo(parseSpec(repo)).then(function (f) { MC[repo] = { m: f.m, icon: f.icon }; }, function () { MC[repo] = { err: true }; })
          .then(function () { mrun--; paintGrid(); pump(); });
      })(mq.shift());
    }
  }
  function pretty(n) {
    var t = String(n || "").replace(/^(kino|zynora)[-_]?plugins?[-_]?/i, "").replace(/^kino[-_]/i, "").replace(/[-_]+/g, " ").trim();
    if (!t) t = String(n || "");
    return t.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function card(en) {
    var p = byRepo(en.repo), mc = MC[en.repo] || {}, m = mc.m;
    if (mc.err && !p && UI.tab === "comm") return "";
    if (!p && !m && UI.tab === "comm") return "";
    var name = p ? p.name : m ? m.name : (en.name ? pretty(en.name) : pretty(en.repo.split("/")[1]));
    var desc = p ? p.description : m ? m.description : (en.desc || "");
    var color = (p && p.color) || (m && m.color) || en.color || "#5b6b8c"; if (!/^#[0-9A-Fa-f]{6}$/.test(color)) color = "#5b6b8c";
    var icon = p ? p.icon : mc.icon;
    var cats = p ? p.categories : m ? m.categories : (en.cats || []);
    if (UI.cat !== "all" && cats.length && cats.indexOf(UI.cat) < 0) return "";
    if (UI.cat !== "all" && !cats.length && !p && !m) return "";
    if (cats.indexOf("adult") >= 0) return "";
    var q = norm(UI.q); if (q && norm(name + " " + desc).indexOf(q) < 0) return "";
    var st = p ? (p.noresp ? '<span class="zpl-tag w">No responde</span>' : p.pending ? '<span class="zpl-tag w">Actualización disponible</span>' : p.enabled === false ? '<span class="zpl-tag">Desactivado</span>' : "") : "";
    return '<div class="zpl-card" style="--c:' + E(color) + '"><div class="zpl-ic">' + (icon ? '<img alt="" src="' + E(icon) + '">' : E(name.charAt(0).toUpperCase())) + "</div><h4>" + E(name) + "</h4><p>" + E(desc || en.repo) + "</p>" + st +
      '<button class="zpl-btn' + (p ? "" : " pri") + '" data-a="' + (p ? "manage" : "install") + '" data-r="' + E(en.repo) + '">' + (p ? "Gestionar" : "Instalar") + "</button></div>";
  }
  var paintT = 0;
  function paintGrid() {
    clearTimeout(paintT);
    paintT = setTimeout(function () {
      var g = $("zplGrid"); if (!g) return;
      var list = entries();
      if (UI.tab === "comm" && !comm) { g.innerHTML = '<div class="zpl-msg">' + (commErr ? E(commErr) + '<br><br><button class="zpl-btn pri" data-a="retry" style="padding:12px 26px">Reintentar</button>' : "Buscando plugins de la comunidad…") + "</div>"; return; }
      list.slice(0, 40).forEach(function (en) { if (UI.tab !== "inst") loadMeta(en.repo); });
      var h = list.map(card).join("");
      if (!h && UI.tab === "comm" && (mq.length || mrun)) h = '<div class="zpl-msg" style="grid-column:1/-1">Cargando plugins…</div>';
      if (!h) h = '<div class="zpl-msg" style="grid-column:1/-1">' + (UI.tab === "inst" ? "Aún no tienes plugins instalados.<br>Agrega uno con el botón + o desde las otras pestañas." : "No hay plugins que coincidan.") + "</div>";
      g.innerHTML = h;
    }, 30);
  }
  function paintChips() {
    var c = $("zplChips"); if (!c) return;
    var L = [["all", "Todos"], ["movies", "Películas"], ["series", "Series"], ["anime", "Anime"], ["utilities", "Utilidades"]];
    c.innerHTML = L.map(function (x) { return '<button data-c="' + x[0] + '" class="' + (UI.cat === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("");
  }
  function paintTabs() {
    var t = $("zplTabs"); if (!t) return;
    var L = [["rec", "Recomendados"], ["comm", "De la comunidad"], ["inst", "Instalados"]];
    t.innerHTML = L.map(function (x) { return '<button data-t="' + x[0] + '" class="' + (UI.tab === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("");
  }
  function paintAll() { if (!root || root.hidden) return; paintTabs(); paintChips(); paintGrid(); }

  async function loadComm(force) {
    var c = J(localStorage.getItem(COMM), null);
    if (!force && c && Date.now() - c.t < 3600000) { comm = c.v; paintGrid(); return; }
    commErr = ""; comm = null; paintGrid();
    try {
      var out = {};
      for (var i = 0; i < TOPICS.length; i++) {
        var r = await rawRequest("GET", "https://api.github.com/search/repositories?q=topic:" + TOPICS[i] + "&sort=stars&per_page=50", { Accept: "application/vnd.github+json", "User-Agent": "Zynora/" + APP_VER }, null, 15000);
        if (r.status === 403 || r.status === 429) throw new Error("GitHub limitó las búsquedas por ahora. Intenta de nuevo en unos minutos.");
        if (r.status !== 200) throw new Error("GitHub respondió " + r.status + ".");
        (J(r.text, {}).items || []).forEach(function (it) {
          if (it && it.full_name && !it.fork && !LEGACY_SKIP.test(it.full_name)) out[it.full_name.toLowerCase()] = { repo: it.full_name.toLowerCase(), name: it.name, desc: it.description || "" };
        });
      }
      comm = Object.keys(out).map(function (k) { return out[k]; });
      try { localStorage.setItem(COMM, JSON.stringify({ t: Date.now(), v: comm })); } catch (e) {}
    } catch (e) { commErr = (e && e.message) || "No se pudo consultar GitHub. Revisa tu internet."; comm = null; }
    paintGrid();
  }

  function attachBack() {
    var A = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.App;
    if (!A || !A.addListener || backH) return;
    try { backH = A.addListener("backButton", function () { if (D.documentElement.classList.contains("znp-on")) return; if (sheetEl) closeSheet(); else closePage(); }); } catch (e) { backH = null; }
  }
  function detachBack() { if (!backH) return; var h = backH; backH = null; Promise.resolve(h).then(function (x) { if (x && x.remove) x.remove(); }).catch(noop); }
  function closePage() { if (root) root.hidden = true; closeSheet(); detachBack(); sum(); }
  function build() {
    if (root) return;
    root = D.createElement("div"); root.id = "zplRoot"; root.hidden = true;
    root.innerHTML = '<div class="zpl-top"><button id="zplBack" class="zpl-back" aria-label="Volver">' + BACK + '</button><b>Plugins</b><button id="zplAdd" class="zpl-plus" aria-label="Agregar plugin">+</button></div>' +
      '<div class="zpl-tabs" id="zplTabs"></div><div class="zpl-body"><input id="zplQ" class="zpl-q" placeholder="Buscar plugins" autocomplete="off"><div class="zpl-chips" id="zplChips"></div><div class="zpl-grid" id="zplGrid"></div>' +
      '<p class="zpl-note">Los plugins los crea la comunidad y no están verificados. Cada uno solo puede conectarse a los sitios que ves antes de instalarlo.</p></div>';
    D.body.appendChild(root);
    $("zplBack").onclick = closePage;
    $("zplAdd").onclick = addSheet;
    $("zplQ").oninput = function () { UI.q = this.value; paintGrid(); };
    $("zplTabs").onclick = function (ev) { var b = ev.target.closest && ev.target.closest("[data-t]"); if (!b) return; UI.tab = b.getAttribute("data-t"); paintTabs(); paintGrid(); if (UI.tab === "comm" && !comm) loadComm(false); };
    $("zplChips").onclick = function (ev) { var b = ev.target.closest && ev.target.closest("[data-c]"); if (!b) return; UI.cat = b.getAttribute("data-c"); paintChips(); paintGrid(); };
    $("zplGrid").onclick = function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-a]"); if (!b) return;
      var a = b.getAttribute("data-a"), r = b.getAttribute("data-r");
      if (a === "retry") loadComm(true);
      else if (a === "install") doInstall(r);
      else if (a === "manage") { var p = byRepo(r); if (p) manage(p); }
    };
  }
  function open() { build(); root.hidden = false; attachBack(); paintAll(); if (UI.tab === "comm" && !comm) loadComm(false); }

  /* tarjeta en Ajustes */
  function sum() {
    var el = $("zplSum"); if (!el) return;
    var n = all().length;
    el.textContent = n ? n + (n === 1 ? " plugin instalado" : " plugins instalados") : "Aún no hay plugins instalados.";
  }
  function addSettingsCard() {
    if ($("zplCard")) { sum(); return; }
    var page = $("settingsPage"), ref = $("addonCard"); if (!page) return;
    var c = D.createElement("div"); c.className = "st-card"; c.id = "zplCard"; c.style.marginTop = "16px";
    c.innerHTML = '<h2>Plugins de la comunidad</h2><p class="muted" style="font-size:12.5px;margin-bottom:12px">Fuentes hechas por la comunidad para Zynora. Cada plugin muestra a qué sitios se conecta antes de instalarse. Sus videos aparecen en el menú de fuentes al reproducir.</p><p class="muted" id="zplSum" style="margin:0 0 12px"></p><button type="button" id="zplOpen" class="btn primary small">Abrir plugins</button>';
    if (ref && ref.parentNode) ref.parentNode.insertBefore(c, ref); else page.appendChild(c);
    $("zplOpen").onclick = open; sum();
  }

  /* =============== Arranque =============== */
  function boot() {
    var st = D.createElement("style"); st.id = "zplStyle"; st.textContent = CSS; D.head.appendChild(st);
    addSettingsCard(); renderHome();
    setInterval(function () { try { addSettingsCard(); if (homes().length && !$("zplHome")) renderHome(); } catch (e) {} }, 2500);
    setTimeout(function () { all().forEach(function (p) { if (Date.now() - (p.checked || 0) > 86400000) checkUpdate(p.id, false).catch(noop); }); }, 8000);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();

  W.ZPL = {
    count: function () { return sources().length; },
    list: all, find: find, resolveFor: resolveFor, open: open, install: install, uninstall: uninstall, mediaUrl: mediaUrl, showTab: showTab,
    _t: { checkManifest: checkManifest, parseSpec: parseSpec, validHostName: validHostName, hostMatches: hostMatches, checkUrl: checkUrl, cleanItem: cleanItem, cleanStream: cleanStream, cmpVer: cmpVer, buildDoc: buildDoc, pluginFetch: pluginFetch, zplBoot: zplBoot }
  };
})();
