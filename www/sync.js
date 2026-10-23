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
  var KV = { cineclick_taste_v1: "taste", zy_settings_v1: "settings", zc_profile_v1: "profile", cc_region: "region" };
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
  function refreshApp() { try { if (typeof window.ZS_REFRESH === "function") window.ZS_REFRESH(); } catch (e) {} }

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
    rawSet.call(LS, "zs_legacy_owner", scope);
    return added;
  }

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
      if (note) note.textContent = "Tus listas, gustos, valoraciones, ajustes y perfil se sincronizan con tu cuenta. Las credenciales de TMDB, Real-Debrid y tu servidor multimedia se quedan solo en este dispositivo.";
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
