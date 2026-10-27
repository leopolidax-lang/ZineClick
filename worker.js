/* Zynora · proxy web (Cloudflare Worker)

   Hace dos cosas que el navegador no puede hacer solo:
   1) POST /fetch  → hace por ti las peticiones de los plugins (sin CORS, con User-Agent/Referer propios).
   2) GET  /media  → trae el video con las cabeceras que pide la fuente, reescribe las listas HLS (.m3u8)
                     para que sus trozos también pasen por aquí y le quita la cabecera falsa de PNG
                     a los trozos disfrazados de imagen (lo mismo que hace ZineProxy en la app Android).

   Seguridad: solo atiende a las páginas listadas en la variable ALLOWED_ORIGINS, solo https, solo puerto 443
   y nunca a direcciones IP ni a nombres internos. Si ALLOWED_ORIGINS está vacía, rechaza todo. */

const UA_DEF = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_TEXT = 5 * 1024 * 1024;
const MAX_LIST = 2 * 1024 * 1024;
const MAX_BODY = 1024 * 1024;
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIV = [".local", ".lan", ".internal", ".localhost", ".home.arpa"];
const BLOCKED_HDR = /^(host|content-length|transfer-encoding|connection|cookie|cookie2|range|upgrade|te|trailer|proxy-.*|cf-.*|x-forwarded-.*|x-real-ip|true-client-ip)$/i;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- reglas de destino ---------- */
export function validHost(h) {
  if (typeof h !== "string" || !h || h.length > 253) return false;
  h = h.toLowerCase();
  if (h.indexOf(".") < 0 || h.indexOf(":") >= 0 || IPV4.test(h)) return false;
  if (PRIV.some((s) => h.endsWith(s) || h === s.slice(1))) return false;
  return h.split(".").every((l) => LABEL.test(l));
}

export function checkTarget(raw, selfHost) {
  let u;
  try { u = new URL(String(raw)); } catch (e) { throw new HttpError(400, "dirección no válida"); }
  if (u.protocol !== "https:") throw new HttpError(400, "solo se permite https");
  if (u.username || u.password || (u.port && u.port !== "443")) throw new HttpError(403, "host no permitido");
  if (!validHost(u.hostname)) throw new HttpError(403, "host no permitido");
  if (selfHost && u.hostname.toLowerCase() === String(selfHost).toLowerCase()) throw new HttpError(403, "host no permitido");
  return u;
}

/* ---------- origen permitido ---------- */
export function originAllowed(origin, env) {
  const list = String((env && env.ALLOWED_ORIGINS) || "").split(",").map((s) => s.trim().toLowerCase().replace(/\/+$/, "")).filter(Boolean);
  const o = String(origin || "").toLowerCase();
  return list.some((p) => {
    const re = new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9.-]+") + "$");
    return re.test(o);
  });
}

function requestOrigin(req) {
  const o = req.headers.get("Origin");
  if (o) return o;
  const r = req.headers.get("Referer");
  if (r) { try { return new URL(r).origin; } catch (e) { /* sin referer válido */ } }
  return "";
}

function corsHeaders(origin, preflight) {
  const h = {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type"
  };
  if (preflight) {
    h["Access-Control-Allow-Methods"] = "GET, HEAD, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, Range";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

/* ---------- utilidades ---------- */
function cleanHeaders(o) {
  const h = new Headers();
  if (!o || typeof o !== "object") return h;
  let n = 0;
  for (const k of Object.keys(o)) {
    if (n >= 30) break;
    if (!/^[A-Za-z0-9-]{1,64}$/.test(k) || BLOCKED_HDR.test(k)) continue;
    const v = String(o[k]);
    if (v.length > 4096 || /[\r\n]/.test(v)) continue;
    h.set(k, v); n++;
  }
  return h;
}

function decodeHdr(s) {
  if (!s || s.length > 8000) return {};
  try {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const j = JSON.parse(new TextDecoder().decode(bytes));
    return j && typeof j === "object" ? j : {};
  } catch (e) { return {}; }
}

async function readText(r, max) {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let n = 0, out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { try { await reader.cancel(); } catch (e) { /* nada */ } throw new HttpError(413, "la respuesta es demasiado grande"); }
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

function concat(a, b) {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0); r.set(b, a.length);
  return r;
}

function prefixedStream(first, reader) {
  let sent = false;
  return new ReadableStream({
    async pull(c) {
      if (!sent) {
        sent = true;
        if (first.length) { c.enqueue(first); return; }
      }
      const { value, done } = await reader.read();
      if (done) c.close(); else c.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- trozos disfrazados de PNG (igual que ZineProxy.strip) ---------- */
export function isPng(d) {
  return d.length >= 4 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47;
}

/* Devuelve dónde empieza el video real; 0 si no es un PNG falso o no se encuentra. */
export function pngOffset(d) {
  if (d.length < 64 || !isPng(d)) return 0;
  const lim = Math.min(d.length - 8, 8192);
  let off = -1;
  for (let i = 8; i < lim; i++) {
    if (d[i] === 0x49 && d[i + 1] === 0x45 && d[i + 2] === 0x4e && d[i + 3] === 0x44) { off = i + 8; break; }
  }
  if (off < 0 || off >= d.length) {
    off = -1;
    const lim2 = Math.min(d.length - 400, 8192);
    for (let i = 0; i < lim2; i++) {
      if (d[i] === 0x47 && d[i + 188] === 0x47 && d[i + 376] === 0x47) { off = i; break; }
    }
  }
  return off > 0 && off < d.length ? off : 0;
}

/* ---------- listas HLS ---------- */
export function rewritePlaylist(text, base, mk) {
  const out = [];
  const abs = (s) => { try { return new URL(s, base).href; } catch (e) { return null; } };
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) { out.push(""); continue; }
    if (l[0] === "#") {
      out.push(l.replace(/URI="([^"]+)"/g, (m, g) => { const a = abs(g); return a ? 'URI="' + mk(a) + '"' : m; }));
    } else {
      const a = abs(l);
      out.push(a ? mk(a) : l);
    }
  }
  return out.join("\n") + "\n";
}

/* ---------- POST /fetch ---------- */
async function doFetch(req, origin, selfHost) {
  let j;
  try { j = await req.json(); } catch (e) { throw new HttpError(400, "JSON no válido"); }
  if (!j || typeof j !== "object") throw new HttpError(400, "JSON no válido");
  const u = checkTarget(j.url, selfHost);
  const method = String(j.method || "GET").toUpperCase();
  if (METHODS.indexOf(method) < 0) throw new HttpError(400, "método no permitido");
  const headers = cleanHeaders(j.headers);
  if (!headers.has("user-agent")) headers.set("User-Agent", UA_DEF);
  let body = null;
  if (typeof j.body === "string" && method !== "GET" && method !== "HEAD") {
    if (j.body.length > MAX_BODY) throw new HttpError(413, "solicitud demasiado grande");
    body = j.body;
  }
  const ms = Math.min(Math.max(Number(j.timeout) || 15000, 1000), 30000);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(u.href, { method, headers, body, redirect: "manual", signal: ctrl.signal });
    const text = method === "HEAD" ? "" : await readText(r, MAX_TEXT);
    const hd = {};
    r.headers.forEach((v, k) => { hd[k.toLowerCase()] = v; });
    delete hd["set-cookie"];
    return new Response(JSON.stringify({ status: r.status, headers: hd, text }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders(origin) }
    });
  } finally { clearTimeout(t); }
}

/* ---------- GET /media ---------- */
async function doMedia(req, url, origin) {
  const u = checkTarget(url.searchParams.get("u"), url.hostname);
  const hp = url.searchParams.get("h") || "";
  const h = cleanHeaders(decodeHdr(hp));
  if (!h.has("user-agent")) h.set("User-Agent", UA_DEF);
  if (!h.has("accept")) h.set("Accept", "*/*");
  const ref = h.get("referer");
  if (ref && !h.has("origin")) { try { h.set("Origin", new URL(ref).origin); } catch (e) { /* sin origin */ } }
  const range = req.headers.get("Range");
  if (range && /^bytes=[\d,\s-]+$/.test(range)) h.set("Range", range);

  let up = null;
  for (let a = 0; a < 3; a++) {
    if (a) await sleep(300 * a);
    try {
      up = await fetch(u.href, { method: req.method, headers: h, redirect: "follow" });
    } catch (e) {
      if (a === 2) throw new HttpError(502, "no se pudo conectar con el servidor del video");
      continue;
    }
    if ((up.status === 429 || up.status >= 500) && a < 2) { try { if (up.body) await up.body.cancel(); } catch (e) { /* nada */ } continue; }
    break;
  }

  const ct = (up.headers.get("content-type") || "").toLowerCase();
  const isList = up.status < 300 && (/mpegurl/.test(ct) || /\.m3u8$/i.test(u.pathname) || url.searchParams.get("k") === "l");

  if (isList && req.method !== "HEAD") {
    const text = await readText(up, MAX_LIST);
    const self = url.origin + "/media";
    const mk = (abs) => {
      const t = abs.replace(/^http:\/\//i, "https://");
      let list = false;
      try { list = /\.m3u8$/i.test(new URL(t).pathname); } catch (e) { /* nada */ }
      return self + "?u=" + encodeURIComponent(t) + (hp ? "&h=" + hp : "") + (list ? "&k=l" : "");
    };
    return new Response(rewritePlaylist(text, up.url || u.href, mk), {
      status: 200,
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store", ...corsHeaders(origin) }
    });
  }

  const rh = new Headers(corsHeaders(origin));
  for (const k of ["content-type", "content-range", "accept-ranges"]) {
    const v = up.headers.get(k);
    if (v) rh.set(k, v);
  }
  const enc = up.headers.get("content-encoding");
  const len = up.headers.get("content-length");
  if (len && !enc) rh.set("content-length", len);
  if (!up.body || req.method === "HEAD") return new Response(null, { status: up.status, headers: rh });

  const reader = up.body.getReader();
  let head = new Uint8Array(0);
  for (;;) {
    if (head.length >= 4 && !isPng(head)) break;
    if (head.length >= 8200) break;
    const { value, done } = await reader.read();
    if (done) break;
    head = concat(head, value);
  }
  const off = pngOffset(head);
  if (off > 0) {
    rh.set("content-type", "video/mp2t");
    rh.delete("content-range");
    rh.delete("accept-ranges");
    if (len && !enc && Number(len) > off) rh.set("content-length", String(Number(len) - off)); else rh.delete("content-length");
    return new Response(prefixedStream(head.subarray(off), reader), { status: up.status === 206 ? 200 : up.status, headers: rh });
  }
  return new Response(prefixedStream(head, reader), { status: up.status, headers: rh });
}

/* ---------- entrada ---------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = requestOrigin(req);
    const ok = !!origin && originAllowed(origin, env);
    try {
      if (req.method === "OPTIONS") {
        return ok ? new Response(null, { status: 204, headers: corsHeaders(origin, true) }) : new Response(null, { status: 403 });
      }
      if (url.pathname === "/") return new Response("Zynora proxy OK", { status: 200, headers: { "content-type": "text/plain" } });
      if (!ok) throw new HttpError(403, "origen no permitido (revisa ALLOWED_ORIGINS)");
      if (url.pathname === "/fetch" && req.method === "POST") return await doFetch(req, origin, url.hostname);
      if (url.pathname === "/media" && (req.method === "GET" || req.method === "HEAD")) return await doMedia(req, url, origin);
      throw new HttpError(404, "no encontrado");
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 502;
      const msg = String((e && e.message) || e).slice(0, 300);
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { "content-type": "application/json", ...(ok ? corsHeaders(origin) : {}) }
      });
    }
  }
};
