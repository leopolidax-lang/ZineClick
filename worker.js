// Zynora — Worker con proxy de TMDB.
// Secreto requerido: TMDB_TOKEN (el "API Read Access Token" v4 de TMDB).
// Todo lo que NO sea /api/tmdb/* se sirve como antes (archivos del sitio).

const ALLOWED = /^\/3\/(trending\/|search\/|discover\/|movie\/|tv\/|person\/|genre\/|watch\/|configuration|collection\/|network\/|company\/)/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function ttlFor(path) {
  if (path.startsWith("/3/configuration") || path.startsWith("/3/genre/") || path.startsWith("/3/watch/providers")) return 86400; // 1 día
  if (path.startsWith("/3/trending/")) return 1800; // 30 min
  return 3600; // 1 h
}

// Limpia el secreto: quita espacios, comillas y el prefijo "Bearer " por si se pegó mal.
function cleanToken(raw) {
  return String(raw || "").trim().replace(/^bearer\s+/i, "").replace(/^["']+|["']+$/g, "").trim();
}
// v4 = token largo (empieza con eyJ) -> Authorization. v3 = clave corta de 32 caracteres -> api_key.
function isV4(t) { return t.startsWith("eyJ") || t.split(".").length === 3; }

async function tmdbProxy(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Método no permitido", { status: 405, headers: CORS });
  if (!cleanToken(env.TMDB_TOKEN)) return new Response(JSON.stringify({ status_message: "Falta el secreto TMDB_TOKEN" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/tmdb/, "");
  const token = cleanToken(env.TMDB_TOKEN);

  // Diagnóstico: /api/tmdb/_check dice qué tipo de clave hay guardada (sin mostrarla).
  if (path === "/_check") {
    const tipo = isV4(token) ? "v4 (token largo, correcto)" : token.length === 32 ? "v3 (clave corta de 32 caracteres)" : "formato desconocido";
    return new Response(JSON.stringify({ longitud: token.length, tipo }), { headers: { ...CORS, "content-type": "application/json", "Cache-Control": "no-store" } });
  }
  if (!ALLOWED.test(path)) return new Response("Ruta no permitida", { status: 403, headers: CORS });

  // Nunca reenviamos credenciales del cliente.
  url.searchParams.delete("api_key");
  const v4 = isV4(token);
  if (!v4) url.searchParams.set("api_key", token);
  const target = "https://api.themoviedb.org" + path + "?" + url.searchParams.toString();
  const cacheTarget = target.replace(/([?&])api_key=[^&]*&?/, "$1").replace(/[?&]$/, "");

  // Caché en el borde de Cloudflare (la clave no incluye el token).
  const cache = caches.default;
  const cacheKey = new Request(cacheTarget, { method: "GET" });
  let hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
    r.headers.set("x-zynora-cache", "HIT");
    return r;
  }

  const upstream = await fetch(target, {
    headers: v4 ? { accept: "application/json", Authorization: "Bearer " + token } : { accept: "application/json" },
  });

  const out = new Response(upstream.body, upstream);
  Object.entries(CORS).forEach(([k, v]) => out.headers.set(k, v));
  if (upstream.ok) {
    out.headers.set("Cache-Control", "public, max-age=" + ttlFor(path));
    ctx.waitUntil(cache.put(cacheKey, out.clone()));
  } else {
    out.headers.set("Cache-Control", "no-store");
  }
  out.headers.set("x-zynora-cache", "MISS");
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/tmdb/")) return tmdbProxy(request, env, ctx);
    // Sitio estático (requiere "assets" con binding ASSETS en wrangler)
    return env.ASSETS.fetch(request);
  },
};
