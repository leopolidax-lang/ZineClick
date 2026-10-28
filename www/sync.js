/* Zynora · sync.js — cuentas (Supabase) + sincronización offline-first.
   Debe cargarse ANTES del script principal: redirige las claves sincronizables de localStorage
   a un espacio propio de cada cuenta, así el resto de la app no necesita cambios.
   - Sin sesión ("guest"): se usan las claves de siempre (nada cambia para quien no inicia sesión).
   - Con sesión: las claves pasan a "zs:<uid>:<clave>" y los cambios se encolan en un outbox. */
(function () {
  "use strict";
  var CFG = window.ZYNORA_CONFIG || {};
  var LS = window.localStorage;
  var P = Storage.prototype;
  var rawGet = P.getItem, rawSet = P.setItem, rawDel = P.removeItem;

  /* ---------- qué se sincroniza y qué NUNCA ---------- */
  var LISTS = { cc_v2_watchlist: "watchlist", cc_v2_favorites: "favorites", cc_v2_watched: "watched" };
  var KV = { cineclick_taste_v1: "taste", zy_settings_v1: "settings", zc_profile_v1: "profile", cc_region: "region", zynora_external_addons: "addons" };
  var KV_BY_NAME = {}; Object.keys(KV).forEach(function (k) { KV_BY_NAME[KV[k]] = k; });
  var LIST_KEY = {}; Object.keys(LISTS).forEach(function (k) { LIST_KEY[LISTS[k]] = k; });
  /* Credenciales de servicios externos: separadas por cuenta, pero JAMÁS se suben a la nube. */
  function isSecret(k) { return k === "cc_tmdb_credential" || k === "cc_rd_token" || k === "cc_media_server" || k.indexOf("cc_rd_src:") === 0; }
  function isScoped(k) { return !!(LISTS[k] || KV[k] || isSecret(k)); }

  function J(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  var UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var scope = (function () { var s = rawGet.call(LS, "zs_scope"); return s && UID_RE.test(s) ? s : "guest"; })();
  var applying = false;
  function real(k, sc) { sc = sc || scope; return sc === "guest" ? k : "zs:" + sc + ":" + k; }

  /* ---------- outbox y metadatos (por cuenta) ---------- */
  function obKey() { return "zs:" + scope + ":__ob"; }
  function metaKey(sc) { return "zs:" + (sc || scope) + ":__meta"; }
  function loadOb() { return J(rawGet.call(LS, obKey()), {}); }
  function saveOb(o) { try { rawSet.call(LS, obKey(), JSON.stringify(o)); } catch (e) {} }
  function loadMeta() { var m = J(rawGet.call(LS, metaKey()), {}); m.kvts = m.kvts || {}; return m; }
  function saveMeta(m) { try { rawSet.call(LS, metaKey(), JSON.stringify(m)); } catch (e) {} }

  function arr(s) { var a = J(s, []); return Array.isArray(a) ? a.map(String) : []; }

  function onLocalWrite(k, oldV, newV) {
    var now = Date.now(), ob = loadOb();
    if (LISTS[k]) {
      var o = arr(oldV), n = arr(newV), os = {}, ns = {};
      o.forEach(function (x) { os[x] = 1; }); n.forEach(function (x) { ns[x] = 1; });
      n.forEach(function (x) { if (!os[x]) ob["i:" + LISTS[k] + ":" + x] = { list: LISTS[k], id: x, del: false, ts: now }; });
      o.forEach(function (x) { if (!ns[x]) ob["i:" + LISTS[k] + ":" + x] = { list: LISTS[k], id: x, del: true, ts: now }; });
    } else if (KV[k]) {
      if (oldV === newV) return;
      ob["k:" + KV[k]] = { name: KV[k], ts: now };
      var m = loadMeta(); m.kvts[KV[k]] = now; saveMeta(m);
    } else return;
    saveOb(ob);
    emit(); schedulePush();
  }

  /* ---------- redirección de localStorage ---------- */
  P.getItem = function (k) {
    if (this === LS && typeof k === "string" && isScoped(k)) return rawGet.call(this, real(k));
    return rawGet.call(this, k);
  };
  P.setItem = function (k, v) {
    if (this === LS && typeof k === "string" && isScoped(k)) {
      var rk = real(k), track = scope !== "guest" && !applying && (LISTS[k] || KV[k]);
      var old = track ? rawGet.call(this, rk) : null;
      rawSet.call(this, rk, v);
      if (track) onLocalWrite(k, old, String(v));
      return;
    }
    return rawSet.call(this, k, v);
  };
  P.removeItem = function (k) {
    if (this === LS && typeof k === "string" && isScoped(k)) return rawDel.call(this, real(k));
    return rawDel.call(this, k);
  };

  /* ---------- estado ---------- */
  var sb = null, session = null, status = { state: scope === "guest" ? "guest" : "idle", last: 0, err: "" };
  var pushing = false, pulling = false, entering = false, explicitOut = false, pushTimer = 0, uiReady = false;
  function isNative() { try { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) { return false; } }
  function cap(n) { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins[n]; }
  function toast(m) { if (typeof window.toast === "function") window.toast(m); }
  function refreshApp() {
    try { if (typeof window.ZS_REFRESH === "function") window.ZS_REFRESH(); } catch (e) {}
    try { if (typeof addonRenderList === "function") addonRenderList(); if (typeof addonChanged === "function") addonChanged(); } catch (e) {}
  }

  var SCHEME = "com.zineclick.app", NATIVE_REDIRECT = SCHEME + "://auth-callback";
  function redirectUrl() { return isNative() ? NATIVE_REDIRECT : location.origin + location.pathname; }

  function friendly(e) {
    var m = String((e && e.message) || e || ""), l = m.toLowerCase();
    if (navigator.onLine === false || /failed to fetch|network|load failed/.test(l)) return "Sin conexión. Inténtalo cuando vuelva internet.";
    if (/invalid login/.test(l)) return "Correo o contraseña incorrectos.";
    if (/not confirmed/.test(l)) return "Primero confirma tu correo (revisa tu bandeja y el spam).";
    if (/already registered|already been registered/.test(l)) return "Ese correo ya tiene una cuenta. Prueba a iniciar sesión.";
    if (/password should be|weak/.test(l)) return "La contraseña es demasiado débil (mínimo 8 caracteres).";
    if (/rate limit|too many/.test(l)) return "Demasiados intentos. Espera unos minutos.";
    return m || "Algo salió mal. Inténtalo de nuevo.";
  }

  /* ---------- snapshots de títulos (para ver las listas en otro dispositivo) ---------- */
  var CACHE = "cc_v3_titlecache";
  function readCache() { return J(rawGet.call(LS, CACHE), {}); }
  function cleanSnap(t, id) {
    if (!t || typeof t !== "object") return null;
    var pp = function (v) { return typeof v === "string" && /^\/[\w.-]+$/.test(v) ? v : null; };
    var kinds = ["Película", "Serie", "Anime", "Documental"], hex = /^#[0-9a-f]{3,8}$/i;
    return {
      id: id, tmdbId: Number(t.tmdbId) || undefined,
      mediaType: t.mediaType === "tv" ? "tv" : (t.mediaType === "movie" ? "movie" : undefined),
      title: String(t.title || "Sin título").slice(0, 200), year: t.year == null ? undefined : String(t.year).slice(0, 4),
      kind: kinds.indexOf(t.kind) >= 0 ? t.kind : "Película",
      genre: Array.isArray(t.genre) ? t.genre.slice(0, 8).map(function (g) { return String(g).slice(0, 40); }) : [],
      rating: Number(t.rating) || 0, posterPath: pp(t.posterPath), backdropPath: pp(t.backdropPath),
      colors: Array.isArray(t.colors) && t.colors.length === 2 && t.colors.every(function (c) { return hex.test(String(c)); }) ? t.colors : undefined,
      emoji: typeof t.emoji === "string" ? t.emoji.slice(0, 4) : undefined, isLive: !!t.isLive,
      desc: String(t.desc || "").slice(0, 180)
    };
  }
  function snapFor(id) { var t = readCache()[id]; return t ? cleanSnap(t, id) : null; }

  /* ---------- PUSH ---------- */
  function readKV(name) {
    var raw = rawGet.call(LS, real(KV_BY_NAME[name]));
    if (raw == null) return null;
    return name === "region" ? String(raw) : J(raw, null);
  }
  function chunk(a, n) { var r = []; for (var i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; }

  async function push() {
    if (!sb || scope === "guest" || pushing || navigator.onLine === false || !session) return;
    var ob = loadOb(), keys = Object.keys(ob);
    if (!keys.length) return;
    pushing = true; setState("syncing");
    try {
      var items = [], kvs = [];
      keys.forEach(function (key) {
        var o = ob[key], at = new Date(o.ts).toISOString();
        if (o.list) items.push({ user_id: scope, list: o.list, item_id: o.id, deleted: !!o.del, data: o.del ? null : snapFor(o.id), updated_at: at });
        else { var v = readKV(o.name); if (v != null) kvs.push({ user_id: scope, key: o.name, value: v, updated_at: at }); }
      });
      var parts = chunk(items, 200);
      for (var i = 0; i < parts.length; i++) {
        var r = await sb.from("user_items").upsert(parts[i], { onConflict: "user_id,list,item_id" });
        if (r.error) throw r.error;
      }
      if (kvs.length) { var r2 = await sb.from("user_kv").upsert(kvs, { onConflict: "user_id,key" }); if (r2.error) throw r2.error; }
      var cur = loadOb();
      keys.forEach(function (k) { if (cur[k] && cur[k].ts === ob[k].ts) delete cur[k]; });
      saveOb(cur);
      status.last = Date.now(); setState("idle");
    } catch (e) { setState("error", friendly(e)); }
    finally { pushing = false; }
  }

  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(function () { push(); }, 1500); }

  /* ---------- PULL ---------- */
  function overlap(c) { return c ? new Date(Math.max(0, Date.parse(c) - 10000)).toISOString() : "1970-01-01T00:00:00Z"; }

  async function pull() {
    if (!sb || scope === "guest" || pulling || navigator.onLine === false || !session) return false;
    pulling = true; var changed = false, sc = scope;
    try {
      var meta = loadMeta(), ob = loadOb();
      /* listas */
      var from = overlap(meta.cursorI), newest = meta.cursorI || "";
      var byList = { watchlist: [], favorites: [], watched: [] };
      for (;;) {
        var r = await sb.from("user_items").select("list,item_id,deleted,data,updated_at,synced_at")
          .gt("synced_at", from).order("synced_at", { ascending: true }).limit(500);
        if (r.error) throw r.error;
        var rows = r.data || [];
        rows.forEach(function (row) { if (byList[row.list]) byList[row.list].push(row); if (!newest || row.synced_at > newest) newest = row.synced_at; });
        if (rows.length < 500) break;
        from = rows[rows.length - 1].synced_at;
      }
      if (sc !== scope) return false;
      ob = loadOb(); applying = true;
      try {
        var cache = readCache(), cacheDirty = false;
        Object.keys(byList).forEach(function (list) {
          var rows = byList[list]; if (!rows.length) return;
          var key = LIST_KEY[list], cur = arr(rawGet.call(LS, real(key))), set = {}, mod = false;
          cur.forEach(function (x) { set[x] = 1; });
          rows.forEach(function (row) {
            var o = ob["i:" + list + ":" + row.item_id];
            if (o && o.ts >= Date.parse(row.updated_at)) return;           // mi cambio local es más nuevo
            if (row.deleted) { if (set[row.item_id]) { delete set[row.item_id]; mod = true; } }
            else {
              if (!set[row.item_id]) { set[row.item_id] = 1; cur.push(row.item_id); mod = true; }
              if (row.data && !cache[row.item_id]) { var c = cleanSnap(row.data, row.item_id); if (c) { cache[row.item_id] = c; cacheDirty = true; } }
            }
          });
          if (mod) { rawSet.call(LS, real(key), JSON.stringify(cur.filter(function (x) { return set[x]; }))); changed = true; }
        });
        if (cacheDirty) try { rawSet.call(LS, CACHE, JSON.stringify(cache)); } catch (e) {}
      } finally { applying = false; }
      meta = loadMeta(); if (newest) meta.cursorI = newest; saveMeta(meta);

      /* clave-valor (perfil, gustos, ajustes, región) */
      var fromK = overlap(meta.cursorK), newestK = meta.cursorK || "";
      var rk = await sb.from("user_kv").select("key,value,updated_at,synced_at").gt("synced_at", fromK).order("synced_at", { ascending: true }).limit(50);
      if (rk.error) throw rk.error;
      if (sc !== scope) return false;
      meta = loadMeta(); ob = loadOb(); applying = true;
      try {
        (rk.data || []).forEach(function (row) {
          if (!row.synced_at || row.synced_at > newestK) newestK = row.synced_at;
          var k = KV_BY_NAME[row.key]; if (!k) return;
          var ts = Date.parse(row.updated_at), local = meta.kvts[row.key] || 0;
          if (ts <= local) return;                                          // lo local es igual o más nuevo
          var val = row.key === "region" ? String(row.value) : JSON.stringify(row.value);
          rawSet.call(LS, real(k), val); meta.kvts[row.key] = ts; changed = true;
        });
      } finally { applying = false; }
      if (newestK) meta.cursorK = newestK; saveMeta(meta);
      status.last = Date.now(); if (status.state !== "error") setState("idle");
      if (changed) refreshApp();
      return changed;
    } catch (e) { setState("error", friendly(e)); throw e; }
    finally { pulling = false; }
  }

  async function syncNow() {
    if (!sb) return;
    try {
      var s = (await sb.auth.getSession()).data.session; session = s;
      if (!s) { if (scope !== "guest") setState("expired"); return; }
      if (scope !== s.user.id) return enterAccount(s.user);
      await push(); await pull(); await push();
    } catch (e) { /* el estado de error ya quedó registrado */ }
  }

  /* ---------- importar datos que ya existían en este dispositivo ---------- */
  function legacySummary() {
    var n = 0, parts = [];
    Object.keys(LISTS).forEach(function (k) { n += arr(rawGet.call(LS, k)).length; });
    if (n) parts.push(n + " título(s) en tus listas");
    var t = J(rawGet.call(LS, "cineclick_taste_v1"), {});
    if ((t.liked || []).length || (t.disliked || []).length || Object.keys(t.ratings || {}).length) parts.push("tus gustos y valoraciones");
    var p = J(rawGet.call(LS, "zc_profile_v1"), {});
    if (p.name) parts.push("tu perfil");
    return parts;
  }
  function legacyOwner() { return rawGet.call(LS, "zs_legacy_owner"); }
  function hasImportable() { return scope !== "guest" && !legacyOwner() && legacySummary().length > 0; }

  function importLegacy() {
    if (scope === "guest" || legacyOwner()) return 0;
    var added = 0, meta = loadMeta();
    Object.keys(LISTS).forEach(function (k) {
      var leg = arr(rawGet.call(LS, k)), cur = arr(LS.getItem(k)), set = {};
      cur.forEach(function (x) { set[x] = 1; });
      var add = leg.filter(function (x) { return !set[x] && /^[\w-]{1,40}$/.test(x); });
      if (add.length) { LS.setItem(k, JSON.stringify(cur.concat(add))); added += add.length; }
    });
    var lt = J(rawGet.call(LS, "cineclick_taste_v1"), null), ct = J(LS.getItem("cineclick_taste_v1"), null);
    if (lt && (lt.liked || lt.disliked || lt.ratings)) {
      var u = function (a, b) { var o = {}, r = []; (a || []).concat(b || []).forEach(function (x) { x = String(x); if (!o[x]) { o[x] = 1; r.push(x); } }); return r; };
      ct = ct || { liked: [], disliked: [], ratings: {}, moods: {} };
      var liked = u(ct.liked, lt.liked), dis = u(ct.disliked, lt.disliked);
      var merged = { liked: liked, disliked: dis, ratings: Object.assign({}, lt.ratings || {}, ct.ratings || {}), moods: Object.assign({}, lt.moods || {}, ct.moods || {}) };
      LS.setItem("cineclick_taste_v1", JSON.stringify(merged));
    }
    ["settings", "profile", "region"].forEach(function (name) {
      var k = KV_BY_NAME[name], leg = rawGet.call(LS, k);
      if (leg != null && !meta.kvts[name] && name !== "profile") LS.setItem(k, leg);
    });
    var lp = J(rawGet.call(LS, "zc_profile_v1"), {}), cp = J(LS.getItem("zc_profile_v1"), {});
    if (lp.name && !cp.name) LS.setItem("zc_profile_v1", JSON.stringify(Object.assign({}, cp, { name: lp.name, color: lp.color, since: cp.since || lp.since })));
    /* credenciales: se copian a esta cuenta, pero nunca se sincronizan */
    ["cc_tmdb_credential", "cc_rd_token", "cc_media_server"].forEach(function (k) {
      var leg = rawGet.call(LS, k);
      if (leg && !rawGet.call(LS, real(k))) rawSet.call(LS, real(k), leg);
    });
    migrateAddons();
    rawSet.call(LS, "zs_legacy_owner", scope);
    return added;
  }

  /* ---------- addons que ya existían en el dispositivo: los hereda UNA sola cuenta ---------- */
  function migrateAddons() {
    if (scope === "guest") return;
    var own = rawGet.call(LS, "zs_addons_owner");
    if (own && own !== scope) return;
    var leg = rawGet.call(LS, "zynora_external_addons");
    if (!leg || !arr2(leg).length) return;
    var cur = rawGet.call(LS, real("zynora_external_addons"));
    if (cur == null || !arr2(cur).length) LS.setItem("zynora_external_addons", leg);
    rawSet.call(LS, "zs_addons_owner", scope);
  }
  function arr2(s) { var a = J(s, []); return Array.isArray(a) ? a : []; }

  /* ---------- entrar / salir de una cuenta ---------- */
  async function enterAccount(user) {
    if (entering) return; entering = true;
    var prev = scope, uid = user.id;
    try {
      setState("syncing");
      if (prev !== uid) { rawSet.call(LS, "zs_scope", uid); scope = uid; }
      await pull();                       // primero la nube; si falla, no se toca nada
      if (!legacyOwner() && legacySummary().length && rawGet.call(LS, "zs_declined:" + uid) !== "1") {
        var ok = true;
        try { ok = window.confirm("Encontramos datos guardados en este dispositivo (" + legacySummary().join(", ") + ").\n\n¿Quieres añadirlos a tu cuenta? Se unirán con lo que ya tengas, sin borrar nada.\n\nSolo se pueden importar a UNA cuenta."); } catch (e) {}
        if (ok) { var n = importLegacy(); toast(n ? "Se importaron " + n + " título(s) a tu cuenta" : "Datos importados"); }
        else rawSet.call(LS, "zs_declined:" + uid, "1");
      }
      refreshApp();
      await push();
      setState("idle");
    } catch (e) {
      if (prev !== uid) { scope = prev; if (prev === "guest") rawDel.call(LS, "zs_scope"); else rawSet.call(LS, "zs_scope", prev); }
      setState("error", friendly(e) + " No se cambió de cuenta; pulsa Sincronizar para reintentar.");
    } finally { entering = false; refreshApp(); renderCard(); }
  }

  function toGuest() {
    clearTimeout(pushTimer);
    rawDel.call(LS, "zs_scope"); scope = "guest"; session = null;
    status = { state: "guest", last: 0, err: "" };
    refreshApp(); renderCard();
  }

  /* ---------- autenticación ---------- */
  function needSb() { if (!sb) throw new Error("Las cuentas no están configuradas en esta versión de la app."); }
  async function signIn(email, pw) { needSb(); var r = await sb.auth.signInWithPassword({ email: email, password: pw }); if (r.error) throw r.error; }
  async function signUp(email, pw) {
    needSb();
    var r = await sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: redirectUrl() } });
    if (r.error) throw r.error;
    return r.data.session ? "ok" : "confirm";
  }
  async function resetPw(email) { needSb(); var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }); if (r.error) throw r.error; }
  async function google() {
    needSb();
    var nat = isNative();
    var r = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl(), skipBrowserRedirect: nat } });
    if (r.error) throw r.error;
    if (nat) { var B = cap("Browser"); if (!B) throw new Error("Falta el componente de navegador en esta versión de la app."); await B.open({ url: r.data.url }); }
  }
  async function signOut() {
    if (scope !== "guest" && Object.keys(loadOb()).length) {
      var ok = true; try { ok = window.confirm("Tienes cambios que aún no se han subido a la nube. Si sales ahora se conservarán en este dispositivo y se subirán la próxima vez que inicies sesión con esta cuenta.\n\n¿Cerrar sesión?"); } catch (e) {}
      if (!ok) return;
    }
    explicitOut = true;
    try { await push(); } catch (e) {}
    try { if (sb) await sb.auth.signOut({ scope: "local" }); } catch (e) {}
    explicitOut = false; toGuest();
  }
  async function deleteAccount() {
    needSb();
    var ok = false; try { ok = window.confirm("Esto BORRA tu cuenta y todos tus datos en la nube. No se puede deshacer.\n\nLos datos de este dispositivo no se tocan.\n\n¿Eliminar la cuenta?"); } catch (e) {}
    if (!ok) return;
    var r = await sb.rpc("delete_my_account"); if (r.error) throw r.error;
    var uid = scope; explicitOut = true;
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
    ["__ob", "__meta"].forEach(function (s) { rawDel.call(LS, "zs:" + uid + ":" + s); });
    explicitOut = false; toGuest(); toast("Cuenta eliminada");
  }

  async function handleUrl(url) {
    if (!sb || !url || url.indexOf(SCHEME + "://") !== 0) return;
    try {
      var u = new URL(url), code = u.searchParams.get("code");
      var hash = new URLSearchParams((u.hash || "").replace(/^#/, ""));
      var err = u.searchParams.get("error_description") || hash.get("error_description");
      try { var B = cap("Browser"); if (B) B.close(); } catch (e) {}
      if (err) { toast(err); return; }
      if (code) {
        var r = await sb.auth.exchangeCodeForSession(code);
        if (r.error) throw r.error;
        if (r.data && /recovery/i.test(String(r.data.redirectType || ""))) setTimeout(recoveryPrompt, 300);
      }
    } catch (e) { toast(friendly(e)); }
  }
  var recoveryShown = false;
  async function recoveryPrompt() {
    if (recoveryShown) return; recoveryShown = true;
    try {
      var pw = window.prompt("Escribe tu nueva contraseña (mínimo 8 caracteres):");
      if (pw == null) return;
      if (pw.length < 8) { toast("La contraseña debe tener al menos 8 caracteres"); return; }
      var r = await sb.auth.updateUser({ password: pw }); if (r.error) throw r.error;
      toast("Contraseña actualizada");
    } catch (e) { toast(friendly(e)); } finally { setTimeout(function () { recoveryShown = false; }, 2000); }
  }

  /* ---------- estado visible ---------- */
  function setState(s, err) { status.state = s; status.err = err || ""; emit(); }
  function emit() { if (uiReady) renderCard(); }

  /* ---------- interfaz ---------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ago(ts) { if (!ts) return "nunca"; var s = Math.round((Date.now() - ts) / 1000); if (s < 10) return "ahora mismo"; if (s < 60) return "hace " + s + " s"; if (s < 3600) return "hace " + Math.round(s / 60) + " min"; return "hace " + Math.round(s / 3600) + " h"; }

  function renderCard() {
    var card = $("zsCard"); if (!card) return;
    var sub = document.querySelector("#profilePage .page-title p");
    var note = document.querySelector("#profilePage .notice");
    var email = session && session.user && session.user.email ? session.user.email : "";
    var pend = scope === "guest" ? 0 : Object.keys(loadOb()).length;
    var h = '<h2 id="zsH">Cuenta y sincronización</h2>';
    if (!sb) {
      h += '<div class="st-row st-first"><div class="st-lab"><b>Cuentas no disponibles</b><small>Esta versión no tiene Supabase configurado. Todo sigue funcionando en este dispositivo.</small></div></div>';
      if (sub) sub.textContent = "Tu perfil se guarda solo en este dispositivo.";
    } else if (scope === "guest") {
      h += '<div class="st-row st-first"><div class="st-lab"><b>Sin sesión</b><small>Inicia sesión para guardar tus listas, gustos y perfil en la nube y recuperarlos en otros dispositivos. Lo que ya tienes aquí no se pierde.</small></div><div class="actions" style="margin-top:12px"><button class="btn primary" type="button" id="zsOpen">Iniciar sesión o crear cuenta</button></div></div>';
      if (sub) sub.textContent = "Tu perfil se guarda solo en este dispositivo.";
      if (note) note.textContent = "Sin cuenta, tus datos viven solo en este dispositivo. Con cuenta se sincronizan; las credenciales de TMDB, Real-Debrid y tu servidor multimedia nunca se suben.";
    } else {
      var st = status.state, line;
      if (st === "syncing") line = "Sincronizando…";
      else if (st === "error") line = "Error: " + esc(status.err);
      else if (st === "expired") line = "Tu sesión caducó. Inicia sesión de nuevo para seguir sincronizando; mientras tanto todo se guarda aquí.";
      else if (navigator.onLine === false) line = "Sin conexión" + (pend ? " · " + pend + " cambio(s) por subir" : "") + ". Se subirán solos al volver internet.";
      else line = "Sincronizado " + ago(status.last) + (pend ? " · " + pend + " cambio(s) por subir" : "");
      h += '<div class="st-row st-first"><div class="st-lab"><b>' + (email ? esc(email) : "Sesión iniciada") + '</b><small id="zsLine">' + line + '</small></div><div class="actions" style="margin-top:12px"><button class="btn primary" type="button" id="zsSync">' + (st === "expired" ? "Iniciar sesión" : "Sincronizar ahora") + '</button><button class="btn" type="button" id="zsOut">Cerrar sesión</button></div></div>';
      if (hasImportable()) h += '<div class="st-row"><div class="st-lab"><b>Datos de este dispositivo</b><small>Hay ' + esc(legacySummary().join(", ")) + ' que aún no están en tu cuenta.</small></div><div class="actions" style="margin-top:12px"><button class="btn" type="button" id="zsImport">Importar a mi cuenta</button></div></div>';
      h += '<div class="st-row"><div class="st-lab"><b>Eliminar mi cuenta</b><small>Borra tu cuenta y tus datos en la nube.</small></div><div class="actions" style="margin-top:12px"><button class="btn small" type="button" id="zsDel">Eliminar cuenta</button></div></div>';
      if (sub) sub.textContent = "Tu perfil se sincroniza con tu cuenta.";
      if (note) note.textContent = "Tus listas, gustos, valoraciones, ajustes y perfil se sincronizan con tu cuenta. Tus addons también se sincronizan (si el enlace de un addon incluye una clave, se guarda en tu cuenta). Las credenciales de TMDB, Real-Debrid y tu servidor multimedia se quedan solo en este dispositivo.";
    }
    card.innerHTML = h;
    var b;
    if ((b = $("zsOpen"))) b.onclick = openAuth;
    if ((b = $("zsSync"))) b.onclick = function () { if (status.state === "expired") openAuth(); else { toast("Sincronizando…"); syncNow(); } };
    if ((b = $("zsOut"))) b.onclick = signOut;
    if ((b = $("zsImport"))) b.onclick = function () {
      var n = importLegacy(); toast(n ? "Se importaron " + n + " título(s)" : "Datos importados"); refreshApp(); push(); renderCard();
    };
    if ((b = $("zsDel"))) b.onclick = function () { deleteAccount().catch(function (e) { toast(friendly(e)); }); };
  }

  var mode = "in";
  function openAuth() {
    var m = $("zsModal"); if (!m) return;
    mode = "in"; paintAuth(); m.classList.add("open"); setTimeout(function () { var e = $("zsEmail"); if (e) e.focus(); }, 50);
  }
  function closeAuth() { var m = $("zsModal"); if (m) m.classList.remove("open"); }
  function paintAuth() {
    var up = mode === "up";
    $("zsBody").innerHTML =
      '<div class="zs-seg"><button type="button" data-m="in" class="' + (up ? "" : "on") + '">Entrar</button><button type="button" data-m="up" class="' + (up ? "on" : "") + '">Crear cuenta</button></div>' +
      '<button type="button" class="btn zs-g" id="zsGoogle"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Continuar con Google</button>' +
      '<div class="zs-or"><span>o con tu correo</span></div>' +
      '<label for="zsEmail">Correo</label><input class="zs-in" id="zsEmail" type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.com">' +
      '<label for="zsPw">Contraseña</label><input class="zs-in" id="zsPw" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" placeholder="' + (up ? "Mínimo 8 caracteres" : "Tu contraseña") + '">' +
      '<div class="actions" style="margin-top:14px"><button type="button" class="btn primary" id="zsGo">' + (up ? "Crear cuenta" : "Entrar") + '</button></div>' +
      (up ? "" : '<button type="button" class="text-btn" id="zsForgot" style="margin-top:12px">Olvidé mi contraseña</button>') +
      '<div class="notice" id="zsMsg" role="status">Tus credenciales de TMDB y Real-Debrid nunca se suben a la nube.</div>';
    var msg = function (t, bad) { var n = $("zsMsg"); n.textContent = t; n.style.borderLeftColor = bad ? "#ff6b81" : ""; };
    document.querySelectorAll("#zsBody .zs-seg button").forEach(function (b) { b.onclick = function () { mode = b.dataset.m; paintAuth(); }; });
    var busy = false;
    function run(fn) { if (busy) return; busy = true; var g = $("zsGo"); if (g) g.disabled = true; Promise.resolve().then(fn).catch(function (e) { msg(friendly(e), true); }).then(function () { busy = false; if (g) g.disabled = false; }); }
    function creds() {
      var e = $("zsEmail").value.trim(), p = $("zsPw").value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Escribe un correo válido.");
      return [e, p];
    }
    $("zsGo").onclick = function () {
      run(async function () {
        var c = creds();
        if (up) {
          if (c[1].length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
          var r = await signUp(c[0], c[1]);
          if (r === "confirm") { msg("Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego vuelve a Entrar.", false); mode = "in"; return; }
        } else { if (!c[1]) throw new Error("Escribe tu contraseña."); await signIn(c[0], c[1]); }
        closeAuth();
      });
    };
    $("zsGoogle").onclick = function () { run(async function () { await google(); msg("Completa el acceso en el navegador y vuelve a Zynora.", false); }); };
    var f = $("zsForgot");
    if (f) f.onclick = function () { run(async function () { var e = $("zsEmail").value.trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("Escribe tu correo arriba y vuelve a pulsar."); await resetPw(e); msg("Si ese correo tiene cuenta, recibirás un enlace para cambiar la contraseña.", false); }); };
  }

  function buildUI() {
    var grid = document.querySelector("#profilePage .st-grid");
    if (grid && !$("zsCard")) { var s = document.createElement("section"); s.className = "st-card"; s.id = "zsCard"; s.setAttribute("aria-labelledby", "zsH"); grid.insertBefore(s, grid.firstChild); }
    if (!$("zsModal")) {
      var m = document.createElement("div"); m.className = "modal-wrap"; m.id = "zsModal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Cuenta");
      m.innerHTML = '<div class="modal zs-modal"><div class="zs-top"><h2>Tu cuenta Zynora</h2><button class="close zs-close" type="button" id="zsClose">✕ Cerrar</button></div><div class="modal-body" id="zsBody"></div></div>';
      document.body.appendChild(m);
      $("zsClose").onclick = closeAuth;
      m.addEventListener("click", function (e) { if (e.target === m) closeAuth(); });
    }
    uiReady = true; renderCard();
  }

  /* ---------- valoraciones (estrellas en el detalle) ---------- */
  window.zsRate = function (id, n) {
    if (typeof getTaste !== "function" || typeof saveTaste !== "function") return;
    var t = getTaste(); t.ratings = t.ratings || {}; id = String(id);
    if (!n || t.ratings[id] === n) delete t.ratings[id]; else t.ratings[id] = n;
    saveTaste(t); paintStars();
    toast(t.ratings[id] ? "Valoración guardada: " + n + "/5" : "Valoración quitada");
  };
  function paintStars() {
    var box = $("zsRate"); if (!box) return;
    var id = typeof detailId !== "undefined" ? String(detailId) : "", r = Number((getTaste().ratings || {})[id]) || 0;
    box.querySelectorAll("button").forEach(function (b) { var v = Number(b.dataset.v); b.classList.toggle("on", v <= r); b.setAttribute("aria-pressed", v === r); });
  }
  function injectStars() {
    var body = $("modalBody"); if (!body || $("zsRate")) return;
    var first = body.querySelector("[data-list]"); if (!first || !first.parentElement) return;
    var box = document.createElement("div"); box.id = "zsRate"; box.className = "zs-rate";
    box.innerHTML = '<span>Tu valoración</span>' + [1, 2, 3, 4, 5].map(function (v) { return '<button type="button" data-v="' + v + '" aria-label="' + v + ' de 5">★</button>'; }).join("");
    box.onclick = function (e) { var b = e.target.closest("button[data-v]"); if (b && typeof detailId !== "undefined") window.zsRate(detailId, Number(b.dataset.v)); };
    first.parentElement.insertAdjacentElement("afterend", box); paintStars();
  }

  /* ---------- arranque ---------- */
  function initSupabase() {
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase || !window.supabase.createClient) return;
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce", storage: window.localStorage }
    });
    sb.auth.onAuthStateChange(function (event, s) {
      /* Sin llamadas a Supabase dentro del callback (evita bloqueos): se difiere. */
      setTimeout(function () {
        session = s || null;
        if (event === "SIGNED_OUT") { if (explicitOut) return; if (scope !== "guest") setState("expired"); return; }
        if (event === "PASSWORD_RECOVERY") { recoveryPrompt(); return; }
        if (s && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
          if (scope !== s.user.id) enterAccount(s.user).then(function () { var m = $("zsModal"); if (m) m.classList.remove("open"); });
          else syncNow();
        } else if (event === "INITIAL_SESSION" && !s && scope !== "guest") setState("expired");
        renderCard();
      }, 0);
    });
    var A = cap("App");
    if (A && A.addListener) {
      A.addListener("appUrlOpen", function (ev) { handleUrl(ev && ev.url); });
      A.addListener("appStateChange", function (st) { if (st && st.isActive) syncNow(); });
    }
  }

  function start() {
    migrateAddons();
    initSupabase(); buildUI();
    window.addEventListener("online", function () { syncNow(); renderCard(); });
    window.addEventListener("offline", renderCard);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") syncNow(); });
    setInterval(function () { if (document.visibilityState === "visible" && scope !== "guest") syncNow(); }, 90000);
    setInterval(function () { if ($("profilePage") && !$("profilePage").classList.contains("hidden")) renderCard(); }, 15000);
    var mb = $("modalBody"); if (mb && window.MutationObserver) new MutationObserver(injectStars).observe(mb, { childList: true });
    /* La pestaña activa se centra sola en la barra de navegación horizontal. */
    var nv = document.querySelector("header nav");
    if (nv && window.MutationObserver) new MutationObserver(function () {
      var a = nv.querySelector("button.active");
      if (a && a.scrollIntoView) try { a.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); } catch (e) {}
    }).observe(nv, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.ZSync = { syncNow: syncNow, openAuth: openAuth, signOut: signOut, status: function () { return { scope: scope, state: status.state, pending: Object.keys(loadOb()).length }; } };
})();


/* ==========================================================================
   Addons externos (Nuvio/Stremio) — admite varios
   ========================================================================== */
var ADDON_KEY = 'zynora_external_addons';

function _addonEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function _addonHost(u) { try { return new URL(u).hostname; } catch (e) { return u; } }
function _addonBase(u) {
  return String(u || '').trim().replace(/^stremio:\/\//i, 'https://').replace(/\/manifest\.json.*$/i, '').replace(/\/+$/, '');
}
function addonLoad() {
  try {
    var raw = localStorage.getItem(ADDON_KEY);
    if (raw === null) { // migra el addon único de la versión anterior
      var old = localStorage.getItem('zynora_external_addon');
      if (!old) return [];
      var list = [{ url: _addonBase(old), name: _addonHost(old) }];
      localStorage.setItem(ADDON_KEY, JSON.stringify(list));
      localStorage.removeItem('zynora_external_addon');
      return list;
    }
    var a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter(function (x) { return x && x.url; }) : [];
  } catch (e) { return []; }
}
function addonSave(list) { try { localStorage.setItem(ADDON_KEY, JSON.stringify(list)); } catch (e) {} }
function addonCount() { return addonLoad().filter(function (a) { return a.stream !== false; }).length; }
function addonChanged() { try { window.dispatchEvent(new Event('zy-addons-changed')); } catch (e) {} }


/* ---------- Avisos y diálogos con el estilo de la app (reemplazan alert/confirm del sistema) ---------- */
function _zyStyle() {
  if (document.getElementById('zyDlgStyle')) return;
  var st = document.createElement('style'); st.id = 'zyDlgStyle';
  st.textContent =
    '.zy-dlg{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px;background:rgba(4,7,14,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);opacity:0;transition:opacity .2s}' +
    '.zy-dlg.on{opacity:1}' +
    '.zy-dlg-card{width:min(360px,100%);padding:24px 22px 18px;border-radius:22px;background:linear-gradient(160deg,rgba(28,36,58,.97),rgba(15,20,36,.97));border:1px solid rgba(255,255,255,.1);box-shadow:0 24px 70px rgba(0,0,0,.6);text-align:center;transform:translateY(10px) scale(.96);transition:transform .22s cubic-bezier(.2,.9,.3,1.2)}' +
    '.zy-dlg.on .zy-dlg-card{transform:none}' +
    '.zy-dlg-ic{width:48px;height:48px;margin:0 auto 12px;border-radius:50%;display:grid;place-items:center;background:rgba(100,244,255,.12);color:var(--cyan,#64f4ff)}' +
    '.zy-dlg-ic svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.zy-dlg-card.warn .zy-dlg-ic{background:rgba(255,184,77,.14);color:#ffb84d}' +
    '.zy-dlg-card.ok .zy-dlg-ic{background:rgba(110,231,160,.14);color:#6ee7a0}' +
    '.zy-dlg-card h3{margin:0 0 6px;font-size:18px;color:#fff}' +
    '.zy-dlg-card p{margin:0 0 18px;color:#aab4cc;font-size:14px;line-height:1.5;white-space:pre-line;word-break:break-word}' +
    '.zy-dlg-act{display:flex;gap:10px}' +
    '.zy-dlg-act button{flex:1;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#dbe3f5;font-weight:700;font-size:14.5px}' +
    '.zy-dlg-act button.pri{background:linear-gradient(135deg,var(--cyan,#64f4ff),#7aa8ff);border-color:transparent;color:#04121a}' +
    '.zy-dlg-act button.danger{background:linear-gradient(135deg,#ff7a8a,#ff5470);color:#fff}' +
    '.zy-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}' +
    '.zy-badge{padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(100,244,255,.12);color:var(--cyan,#64f4ff)}' +
    '.zy-badge.cat{background:rgba(167,139,250,.16);color:#c4b5fd}' +
    '.zy-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '.zy-act{padding:7px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e6ebf7;font-size:13px;font-weight:700;cursor:pointer}' +
    '.zy-act:disabled{opacity:.3;cursor:default}' +
    '.zy-act.cfg{color:#c4b5fd;border-color:rgba(167,139,250,.35);background:rgba(167,139,250,.12)}' +
    '@keyframes zyFlash{0%{box-shadow:0 0 0 0 rgba(100,244,255,0)}30%{box-shadow:0 0 0 3px rgba(100,244,255,.65),0 0 30px rgba(100,244,255,.35)}100%{box-shadow:0 0 0 0 rgba(100,244,255,0)}}' +
    '.zy-flash{animation:zyFlash 1.6s ease}';
  document.head.appendChild(st);
}
var _ZY_ICONS = {
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.2M12 7.8h.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3.6 21.2 19.5H2.8z"/><path d="M12 10v4.4M12 17.2h.01"/></svg>',
  ok: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.2 9.6"/></svg>'
};
function zyAsk(o) {
  return new Promise(function (resolve) {
    _zyStyle();
    var kind = _ZY_ICONS[o.kind] ? o.kind : 'info';
    var w = document.createElement('div'); w.className = 'zy-dlg';
    w.innerHTML = '<div class="zy-dlg-card ' + kind + '" role="alertdialog" aria-modal="true"><div class="zy-dlg-ic">' + _ZY_ICONS[kind] + '</div>' +
      '<h3>' + _addonEsc(o.title || 'Aviso') + '</h3><p>' + _addonEsc(o.text || '') + '</p><div class="zy-dlg-act">' +
      (o.cancel ? '<button type="button" data-r="0">' + _addonEsc(o.cancel) + '</button>' : '') +
      '<button type="button" class="pri' + (o.danger ? ' danger' : '') + '" data-r="1">' + _addonEsc(o.ok || 'Entendido') + '</button></div></div>';
    function done(v) { document.removeEventListener('keydown', key); w.classList.remove('on'); setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 220); resolve(v); }
    function key(e) { if (e.key === 'Escape') done(false); }
    w.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-r]');
      if (b) done(b.getAttribute('data-r') === '1'); else if (e.target === w) done(false);
    });
    document.addEventListener('keydown', key);
    document.body.appendChild(w);
    requestAnimationFrame(function () { w.classList.add('on'); });
  });
}
function zyAlert(title, text, kind) { return zyAsk({ title: title, text: text, kind: kind || 'info' }); }
/* los alert() de toda la app ahora usan el mismo diálogo */
window.alert = function (msg) { zyAlert('Aviso', String(msg == null ? '' : msg), 'info'); };

/* ¿Qué ofrece este addon? streams (enlaces de video) y/o catálogos (carátulas) */
function _addonInspect(m) {
  var res = (m && m.resources) || [];
  var has = function (n) { return res.some(function (r) { return r === n || (r && r.name === n); }); };
  var stream = !res.length || has('stream');
  var cats = [];
  if (!res.length || has('catalog')) {
    cats = ((m && m.catalogs) || []).filter(function (c) {
      if (!c || !c.id || (c.type !== 'movie' && c.type !== 'series')) return false;
      if ((c.extraRequired || []).length) return false;
      return !(c.extra || []).some(function (x) { return x && x.isRequired; });
    }).map(function (c) { return { type: c.type, id: String(c.id), name: String(c.name || c.id) }; }).slice(0, 12);
  }
  return { stream: stream && !(m && m.catalogs && m.catalogs.length && res.length && !has('stream')), catalogs: cats };
}

function _addonFetch(url, ms) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, ms || 15000);
  return fetch(url, { signal: ctrl.signal }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).finally(function () { clearTimeout(timer); });
}

function addonRenderList() {
  var box = document.getElementById('addonList');
  if (!box) return;
  var list = addonLoad();
  if (!list.length) {
    box.innerHTML = '<p class="muted" style="font-size:13px;margin:0 0 12px;">Aún no hay addons instalados.</p>';
    return;
  }
  var hint = list.length > 1 ? '<p class="muted" style="font-size:12px;margin:0 0 6px;">El de arriba tiene prioridad: sus catálogos salen primero en Inicio y sus fuentes de video se consultan primero.</p>' : '';
  box.innerHTML = hint + list.map(function (a, i) {
    return '<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);">' +
      '<div style="min-width:0;"><b style="display:block;font-size:14px;">' + _addonEsc(a.name || _addonHost(a.url)) + '</b>' +
      '<small class="muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _addonEsc(a.url) + '</small>' +
      '<div class="zy-badges">' + (a.stream !== false ? '<span class="zy-badge">Enlaces de video</span>' : '') +
      ((a.catalogs && a.catalogs.length) ? '<span class="zy-badge cat">Catálogo · ' + a.catalogs.length + (a.catalogs.length === 1 ? ' lista' : ' listas') + '</span>' : '') + '</div>' +
      '<div class="zy-acts">' +
      '<button class="zy-act" data-addon-mv="' + i + '" data-dir="-1" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>▲ Subir</button>' +
      '<button class="zy-act" data-addon-mv="' + i + '" data-dir="1" aria-label="Bajar"' + (i === list.length - 1 ? ' disabled' : '') + '>▼ Bajar</button>' +
      '<button class="zy-act cfg" data-addon-cfg="' + i + '">⚙ Configurar</button></div></div>' +
      '<button class="btn small" data-addon-del="' + i + '" style="background:rgba(255,0,0,0.1);border-color:rgba(255,0,0,0.2);color:#ff6b6b;flex:none;">Eliminar</button></div>';
  }).join('');
}

function _addonOpen(url) {
  try {
    var B = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Browser;
    if (B && B.open) { B.open({ url: url }); return; }
  } catch (e) {}
  window.open(url, '_blank');
}

document.addEventListener('DOMContentLoaded', function () {
  try { _zyStyle(); } catch (e) {}
  var input = document.getElementById('nuvioAddonInput');
  var addBtn = document.getElementById('saveAddonBtn');
  var listBox = document.getElementById('addonList');
  if (!input || !addBtn || !listBox) return;
  addonRenderList();

  addBtn.addEventListener('click', async function () {
    var base = _addonBase(input.value);
    if (!/^https?:\/\//i.test(base)) { zyAlert('Falta el enlace', 'Pega el enlace completo del addon (empieza con https:// o stremio://).', 'warn'); return; }
    var list = addonLoad();
    if (list.some(function (a) { return a.url === base; })) { zyAlert('Ya lo tienes', 'Ese addon ya está instalado.', 'info'); return; }
    var rec = { url: base, name: _addonHost(base) }, info = null;
    addBtn.disabled = true; var label = addBtn.textContent; addBtn.textContent = 'Verificando…';
    try {
      var m = await _addonFetch(base + '/manifest.json', 8000);
      if (m && m.name) rec.name = m.name;
      info = _addonInspect(m);
      if (!info.stream && !info.catalogs.length) {
        zyAlert('Addon sin contenido', 'Este addon no ofrece enlaces de video ni catálogos que la app pueda mostrar.', 'warn');
        return;
      }
      rec.stream = info.stream;
      if (info.catalogs.length) rec.catalogs = info.catalogs;
    } catch (e) {
      addBtn.disabled = false; addBtn.textContent = label;
      var go = await zyAsk({ title: 'No se pudo verificar', text: 'Puede ser un enlace incorrecto o que el addon esté caído. ¿Quieres agregarlo de todos modos?', kind: 'warn', ok: 'Agregar', cancel: 'Cancelar' });
      if (!go) return;
    } finally {
      addBtn.disabled = false; addBtn.textContent = label;
    }
    list.push(rec);
    addonSave(list);
    input.value = '';
    addonRenderList();
    addonChanged();
    if (info && !info.stream) zyAlert('Catálogo agregado', '«' + rec.name + '» trae ' + info.catalogs.length + (info.catalogs.length === 1 ? ' lista' : ' listas') + ' de carátulas. Las verás en Inicio. Para reproducir necesitas además un addon con enlaces de video.', 'ok');
    else if (typeof toast === 'function') toast('Addon agregado: ' + rec.name);
  });

  listBox.addEventListener('click', async function (ev) {
    var t = ev.target.closest && ev.target.closest('[data-addon-cfg],[data-addon-mv]');
    if (t) {
      var l2 = addonLoad();
      if (t.hasAttribute('data-addon-cfg')) {
        var ad = l2[Number(t.getAttribute('data-addon-cfg'))];
        if (ad) _addonOpen(_addonBase(ad.url) + '/configure');
        return;
      }
      var from = Number(t.getAttribute('data-addon-mv')), to = from + Number(t.getAttribute('data-dir'));
      if (!l2[from] || to < 0 || to >= l2.length) return;
      l2.splice(to, 0, l2.splice(from, 1)[0]);
      addonSave(l2);
      addonRenderList();
      addonChanged();
      return;
    }
    var b = ev.target.closest && ev.target.closest('[data-addon-del]');
    if (!b) return;
    var idx = Number(b.getAttribute('data-addon-del'));
    var list = addonLoad();
    var a = list[idx];
    if (!a) return;
    var ok = await zyAsk({ title: 'Eliminar addon', text: '¿Quitar «' + (a.name || a.url) + '»? Podrás volver a agregarlo cuando quieras.', kind: 'warn', ok: 'Eliminar', cancel: 'Cancelar', danger: true });
    if (!ok) return;
    list = addonLoad();
    if (!list[idx] || list[idx].url !== a.url) return;
    list.splice(idx, 1);
    addonSave(list);
    addonRenderList();
    addonChanged();
  });
});

/* ---------- Compatibilidad de códecs según el dispositivo ----------
   Se pregunta al propio navegador (canPlayType / MediaSource), así en el celular y en la laptop
   el aviso sale solo si ESE dispositivo no puede reproducir el códec. */
var _addonCodecs = null;
function addonCodecSupport() {
  if (_addonCodecs) return _addonCodecs;
  var v = document.createElement('video');
  function can(t) { try { return !!v.canPlayType(t); } catch (e) { return false; } }
  function ms(t) { try { return !!(window.MediaSource && MediaSource.isTypeSupported(t)); } catch (e) { return false; } }
  function any(list) { return list.some(function (t) { return can(t) || ms(t); }); }
  _addonCodecs = {
    hevc: any(['video/mp4; codecs="hvc1.1.6.L93.B0"', 'video/mp4; codecs="hev1.1.6.L93.B0"']),
    ac3: any(['audio/mp4; codecs="ac-3"']),
    eac3: any(['audio/mp4; codecs="ec-3"']),
    dts: any(['audio/mp4; codecs="dtsc"', 'audio/mp4; codecs="dtse"', 'audio/mp4; codecs="dtsh"']),
    truehd: false // ningún navegador lo reproduce
  };
  return _addonCodecs;
}

/* Etiquetas (resolución, tamaño, idioma) y avisos de códec de una fuente */
function _addonChips(stream) {
  var bh = stream.behaviorHints || {};
  var txt = [stream.name, stream.title, stream.description, bh.filename].filter(Boolean).join(' ');
  var chips = [], m;
  if ((m = txt.match(/\b(2160p|4k|1440p|1080p|720p|480p)\b/i))) chips.push({ t: m[1].toUpperCase(), c: '' });
  if ((m = txt.match(/(\d+(?:[.,]\d+)?)\s?(GB|MB)\b/i))) chips.push({ t: m[1] + ' ' + m[2].toUpperCase(), c: 'size' });
  if ((m = txt.match(/\b(latino|castellano|espa[nñ]ol|ingl[eé]s|english|dual|multi)\b/i))) chips.push({ t: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), c: 'size' });

  var sup = addonCodecSupport(), bad = [];
  var hasEac3 = /\b(E-?AC-?3|EAC3|DD\+|DDP|Atmos)\b/i.test(txt);
  if (/\bTrueHD\b/i.test(txt)) bad.push('TrueHD');
  if (/\bDTS\b/i.test(txt) && !sup.dts) bad.push('DTS');
  if (hasEac3 && !sup.eac3) bad.push('E-AC-3');
  if (!hasEac3 && /\b(AC-?3|DD ?5\.1|Dolby Digital)\b/i.test(txt) && !sup.ac3) bad.push('AC-3');
  if (/\b(HEVC|x265|H\.?265)\b/i.test(txt) && !sup.hevc) bad.push('HEVC');
  if (bad.length) chips.push({ t: '⚠ ' + bad.join(' · ') + ' podría fallar aquí', c: 'warn' });
  return chips;
}

var _addonReq = 0;

function _addonRenderStreams(container, addon, streams, currentTitle, showHeader) {
  var wrap = document.createElement('div');
  if (showHeader) {
    var h = document.createElement('div');
    h.style.cssText = 'font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.7;margin:10px 0 6px;';
    h.textContent = addon.name || _addonHost(addon.url);
    wrap.appendChild(h);
  }
  if (!streams.length) {
    var p = document.createElement('p');
    p.className = 'muted'; p.style.cssText = 'font-size:13px;margin:0 0 8px;';
    p.textContent = 'Sin transmisiones para este título.';
    wrap.appendChild(p);
  }
  streams.forEach(function (stream) {
    var itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = 'verse-relation';
    itemBtn.style.cursor = 'pointer';
    itemBtn.style.marginBottom = '8px';
    var chips = _addonChips(stream).map(function (c) {
      return '<span class="rd-chip ' + c.c + '">' + _addonEsc(c.t) + '</span>';
    }).join('');
    itemBtn.innerHTML =
      '<span class="rel-arrow">▶</span><div>' +
      '<b>' + _addonEsc(stream.title || stream.name || 'Servidor Multimedia') + '</b>' +
      '<small>' + _addonEsc(stream.description || 'Transmisión directa') + '</small>' +
      (chips ? '<div class="rd-chips">' + chips + '</div>' : '') + '</div>';

    itemBtn.addEventListener('click', async function () {
      var playbackUrl = stream.url;
      var magnet = stream.magnet || (playbackUrl && playbackUrl.indexOf('magnet:') === 0 ? playbackUrl : '') ||
        (stream.infoHash ? 'magnet:?xt=urn:btih:' + stream.infoHash : '');
      if (magnet) {
        var uiBackup = itemBtn.innerHTML;
        itemBtn.innerHTML = '<span class="rel-arrow" style="color: var(--pink);">✦</span><div><b>Desrestringiendo con Real-Debrid...</b><small>Generando puente de alta velocidad</small></div>';
        try {
          var r = await rdResolve(magnet); // definido en index.html
          playbackUrl = r && r.download;
        } catch (e) {
          alert(e.message || 'No se pudo resolver con Real-Debrid.');
          playbackUrl = null;
        }
        itemBtn.innerHTML = uiBackup;
      }
      if (!playbackUrl) return;
      var prev = container.querySelectorAll('.verse-relation.on');
      for (var i = 0; i < prev.length; i++) prev[i].classList.remove('on');
      itemBtn.classList.add('on');
      ejecutarReproductorZynora(playbackUrl, currentTitle);
    });
    wrap.appendChild(itemBtn);
  });
  container.appendChild(wrap);
}

async function consultarFuentesAddon(type, id, currentTitle) {
  var container = document.getElementById('opcionesStreamContainer');
  if (!container) return;
  var panel = document.getElementById('addonStreamsPanel');
  if (panel) panel.hidden = false;
  var count = document.getElementById('rdSrcCount');
  if (count) count.textContent = '';
  var addons = addonLoad();
  if (!addons.length) {
    container.innerHTML = '<p class="muted" style="font-size: 13px; margin: 0;">Instala un addon en Ajustes para sincronizar flujos de video externos.</p>';
    return;
  }
  var req = ++_addonReq; // si el usuario cambia de episodio rápido, se ignora la respuesta vieja
  container.innerHTML = '<p class="muted" style="font-size: 13px; margin: 0; color: var(--cyan);">Rastreando flujos de red disponibles...</p>';
  var contentType = (type === 'tv' || type === 'series') ? 'series' : 'movie';

  var results = await Promise.all(addons.map(function (a) {
    return _addonFetch(a.url + '/stream/' + contentType + '/' + encodeURIComponent(id).replace(/%3A/g, ':') + '.json', 15000)
      .then(function (d) { return { addon: a, streams: (d && d.streams) || [] }; })
      .catch(function (e) { console.error(a.url, e); return { addon: a, error: true }; });
  }));
  if (req !== _addonReq) return;

  container.innerHTML = '';
  var showHeader = addons.length > 1;
  var total = 0;
  results.forEach(function (r) {
    if (r.error) {
      var p = document.createElement('p');
      p.className = 'muted'; p.style.cssText = 'font-size:13px;margin:8px 0;color:#ff6b6b;';
      p.textContent = 'No se pudo conectar con «' + (r.addon.name || _addonHost(r.addon.url)) + '».';
      container.appendChild(p);
      return;
    }
    total += r.streams.length;
    if (r.streams.length || showHeader) _addonRenderStreams(container, r.addon, r.streams, currentTitle, showHeader);
  });
  if (count) count.textContent = total ? total + (total === 1 ? ' fuente' : ' fuentes') : '';
  if (!total && !container.children.length) {
    container.innerHTML = '<p class="muted" style="font-size: 13px; margin: 0;">No se encontraron transmisiones para este identificador.</p>';
  }
}

function ejecutarReproductorZynora(videoUrl, title) {
  if (typeof rdPlay === 'function') {
    rdPlay({ download: videoUrl }, title); // reproductor de la app (Plyr, estados, VLC, copiar enlace)
  } else {
    navigator.clipboard.writeText(videoUrl);
    alert('Enlace copiado al portapapeles.');
  }
}

/* ---------- Series: temporada y episodio ---------- */
var _addonCtx = null;

function _addonEl(id) { return document.getElementById(id); }

/* Línea "Reproduciendo": serie, temporada, episodio y botón de siguiente */
function addonSetNow() {
  var el = _addonEl('rdNow'), c = _addonCtx;
  if (!el) return;
  if (!c || c.type !== 'tv') { el.hidden = true; return; }
  var ep = (c.eps[c.season] || []).filter(function (e) { return e.n === c.episode; })[0];
  el.hidden = false;
  el.innerHTML = '<div class="rd-now-tx"><b>' + _addonEsc(c.title) + '</b><span>T' + c.season + ' · E' + c.episode +
    (ep && ep.name ? ' — ' + _addonEsc(ep.name) : '') + '</span></div>' +
    '<button type="button" class="btn small rd-next" data-next>Siguiente ▶</button>';
}

async function addonLoadSeason(n) {
  var c = _addonCtx;
  if (c.eps[n]) return c.eps[n];
  var list = [];
  try {
    var d = await tmdb('/tv/' + c.tmdbId + '/season/' + n);
    list = (d.episodes || []).map(function (e) {
      return { n: e.episode_number, name: e.name || '', still: e.still_path || '', overview: e.overview || '', runtime: e.runtime || 0 };
    });
  } catch (e) { /* si TMDB falla, se usa el número de episodios de la temporada */ }
  if (!list.length) {
    var s = c.seasons.filter(function (x) { return x.n === n; })[0];
    for (var i = 1; i <= (s ? s.count : 1); i++) list.push({ n: i, name: '', still: '', overview: '', runtime: 0 });
  }
  c.eps[n] = list;
  return list;
}

function addonRenderSeasonChips() {
  var box = _addonEl('rdSeasonChips'), c = _addonCtx;
  if (!box || !c) return;
  box.innerHTML = c.seasons.map(function (s) {
    return '<button type="button" class="rd-season' + (s.n === c.view ? ' on' : '') + '" data-s="' + s.n + '">' +
      (s.n === 0 ? 'Especiales' : 'Temporada ' + s.n) + '</button>';
  }).join('');
  var on = box.querySelector('.on');
  if (on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
}

function addonRenderEpisodes() {
  var list = _addonEl('rdEpisodeList'), c = _addonCtx;
  if (!list || !c) return;
  list.innerHTML = (c.eps[c.view] || []).map(function (e) {
    var on = c.view === c.season && e.n === c.episode;
    var img = e.still ? '<img loading="lazy" alt="" src="https://image.tmdb.org/t/p/w300' + _addonEsc(e.still) + '" onerror="this.remove()">' : '';
    return '<button type="button" class="rd-epi' + (on ? ' on' : '') + '" data-e="' + e.n + '">' +
      '<span class="rd-epi-th">E' + e.n + img + '</span>' +
      '<span class="rd-epi-tx"><small>T' + c.view + ' · E' + e.n + (e.runtime ? ' · ' + e.runtime + ' min' : '') + '</small>' +
      '<b>' + _addonEsc(e.name || ('Episodio ' + e.n)) + '</b>' +
      (e.overview ? '<em>' + _addonEsc(e.overview) + '</em>' : '') + '</span></button>';
  }).join('');
  var on = list.querySelector('.on');
  if (on) list.scrollTop = Math.max(0, on.offsetTop - 8);
}

/* Cambiar de temporada solo muestra sus episodios; las fuentes se buscan al elegir un episodio */
async function addonShowSeason(n) {
  var c = _addonCtx;
  if (!c) return;
  await addonLoadSeason(n);
  if (_addonCtx !== c) return;
  c.view = n;
  addonRenderSeasonChips();
  addonRenderEpisodes();
}

async function addonGoto(s, e, scrollToSources) {
  var c = _addonCtx;
  if (!c) return;
  var eps = await addonLoadSeason(s);
  if (_addonCtx !== c) return;
  if (!eps.some(function (x) { return x.n === e; })) e = eps.length ? eps[0].n : 1;
  c.season = s; c.episode = e; c.view = s;
  try { localStorage.setItem('zynora_last_ep:' + c.tmdbId, JSON.stringify({ s: s, e: e })); } catch (err) {}
  addonRenderSeasonChips();
  addonRenderEpisodes();
  addonSetNow();
  consultarFuentesAddon('tv', c.imdb + ':' + s + ':' + e, c.title + ' · T' + s + 'E' + e);
  if (scrollToSources) {
    var p = _addonEl('addonStreamsPanel');
    if (p && p.scrollIntoView) setTimeout(function () { p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
}

async function addonStep(dir) {
  var c = _addonCtx;
  if (!c || c.type !== 'tv') return;
  var eps = await addonLoadSeason(c.season);
  var i = eps.map(function (x) { return x.n; }).indexOf(c.episode) + dir;
  if (i >= 0 && i < eps.length) return addonGoto(c.season, eps[i].n);
  var si = c.seasons.map(function (x) { return x.n; }).indexOf(c.season) + dir;
  if (si < 0 || si >= c.seasons.length) { if (typeof toast === 'function') toast(dir > 0 ? 'Es el último episodio' : 'Es el primer episodio'); return; }
  var ns = c.seasons[si].n, ne = await addonLoadSeason(ns);
  if (ne.length) addonGoto(ns, dir > 0 ? ne[0].n : ne[ne.length - 1].n);
}

document.addEventListener('DOMContentLoaded', function () {
  var chips = _addonEl('rdSeasonChips'), list = _addonEl('rdEpisodeList'), now = _addonEl('rdNow');
  if (chips) chips.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-s]');
    if (b) addonShowSeason(Number(b.getAttribute('data-s')));
  });
  if (list) list.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-e]');
    if (b && _addonCtx) addonGoto(_addonCtx.view, Number(b.getAttribute('data-e')), true);
  });
  if (now) now.addEventListener('click', function (ev) {
    if (ev.target.closest && ev.target.closest('[data-next]')) addonStep(1);
  });
});

/* Abre el panel de fuentes desde la ficha de un título.
   Los addons Stremio/Nuvio piden ID de IMDb (tt...), no el de TMDB, así que se convierte primero. */
async function addonOpen(tmdbId, mediaType, title) {
  if (!addonCount()) { // sin addons: lleva a Ajustes para instalar uno
    if (typeof closeModal === 'function') closeModal();
    if (typeof openSettings === 'function') openSettings();
    setTimeout(function () {
      var c = _addonEl('addonCard');
      if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var i = _addonEl('nuvioAddonInput');
      if (i) i.focus();
    }, 150);
    return;
  }
  title = decodeURIComponent(title || '');
  var type = mediaType === 'tv' ? 'tv' : 'movie';
  try {
    if (typeof toast === 'function') toast('Buscando enlaces en los addons…');
    var ext = await tmdb('/' + type + '/' + tmdbId + '/external_ids');
    var imdb = ext && ext.imdb_id;
    if (!/^tt\d{6,10}$/.test(imdb || '')) throw new Error('No se encontró el ID de IMDb de este título.');

    var epPanel = _addonEl('rdEpisodesPanel');
    if (type === 'movie') {
      _addonCtx = { type: 'movie', tmdbId: tmdbId, imdb: imdb, title: title };
      if (epPanel) epPanel.hidden = true;
      addonSetNow();
      _addonEl('rdPlayerTitle').textContent = title || 'Reproductor';
      _addonEl('rdPlayer').classList.add('open');
      consultarFuentesAddon('movie', imdb, title);
      return;
    }

    var tv = await tmdb('/tv/' + tmdbId);
    var seasons = (tv.seasons || []).filter(function (s) { return s.episode_count > 0; })
      .map(function (s) { return { n: s.season_number, count: s.episode_count }; })
      .sort(function (a, b) { return a.n - b.n; });
    if (!seasons.length) seasons = [{ n: 1, count: 1 }];
    var last = null;
    try { last = JSON.parse(localStorage.getItem('zynora_last_ep:' + tmdbId)); } catch (e) {}
    var startS = last && seasons.some(function (s) { return s.n === last.s; }) ? last.s
      : (seasons.filter(function (s) { return s.n >= 1; })[0] || seasons[0]).n;
    var startE = last && last.s === startS ? last.e : 1;

    _addonCtx = { type: 'tv', tmdbId: tmdbId, imdb: imdb, title: title, seasons: seasons, eps: {}, season: startS, episode: startE, view: startS };
    if (epPanel) epPanel.hidden = false;
    _addonEl('rdPlayerTitle').textContent = title || 'Reproductor';
    _addonEl('rdPlayer').classList.add('open');
    addonGoto(startS, startE);
  } catch (e) {
    alert(e.message || 'No se pudo consultar el addon.');
  }
}
