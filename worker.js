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

async function tmdbProxy(request, env, ctx) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return new Response("Método no permitido", { status: 405, headers: CORS });
  if (!env.TMDB_TOKEN) return new Response(JSON.stringify({ status_message: "Falta el secreto TMDB_TOKEN" }), { status: 500, headers: { ...CORS, "content-type": "application/json" } });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/tmdb/, "");
  if (!ALLOWED.test(path)) return new Response("Ruta no permitida", { status: 403, headers: CORS });

  // Nunca reenviamos credenciales del cliente.
  url.searchParams.delete("api_key");
  const target = "https://api.themoviedb.org" + path + "?" + url.searchParams.toString();

  // Caché en el borde de Cloudflare (la clave no incluye el token).
  const cache = caches.default;
  const cacheKey = new Request(target, { method: "GET" });
  let hit = await cache.match(cacheKey);
  if (hit) {
    const r = new Response(hit.body, hit);
    Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
    r.headers.set("x-zynora-cache", "HIT");
    return r;
  }

  const upstream = await fetch(target, {
    headers: { accept: "application/json", Authorization: "Bearer " + env.TMDB_TOKEN },
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
