/* Zynora · native-player.js
   Controles del reproductor nativo (VLC) al estilo Nuvio. Solo actúa dentro de la app Android;
   en la web (PC) no hace nada. Si el plugin nativo no existe, todo sigue como antes. */
(function () {
  "use strict";
  var W = window, D = document;
  function isNative() { try { return !!(W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  if (!isNative()) return;
  function plug() { var c = W.Capacitor, p = c && c.Plugins && c.Plugins.ZinePlayer; return p && p.play ? p : null; }
  function noop() {}
  function say(m) { try { if (typeof W.toast === "function") W.toast(m); } catch (e) {} }

  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>',
    skip: '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6.5 12 11V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z"/></svg><b>10</b>'
  };

  var CSS = '' +
    'html.znp-on,html.znp-on body{background:transparent!important}' +
    'html.znp-on::before,html.znp-on::after,html.znp-on body::before,html.znp-on body::after{display:none!important}' +
    'html.znp-on body>*:not(#znpRoot){visibility:hidden!important}' +
    '#znpRoot{position:fixed;inset:0;z-index:2147483000;color:#fff;font:600 14px/1.3 Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;overflow:hidden}' +
    '#znpRoot[hidden]{display:none}' +
    '#znpRoot button{font:inherit;color:inherit;border:0;background:none;padding:0;cursor:pointer}' +
    '#znpRoot svg{fill:currentColor;width:24px;height:24px;display:block}' +
    '.znp-tap{position:absolute;inset:0}' +
    '.znp-ui{position:absolute;inset:0;pointer-events:none;transition:opacity .22s}' +
    '.znp-ui::before,.znp-ui::after{content:"";position:absolute;left:0;right:0;pointer-events:none}' +
    '.znp-ui::before{top:0;height:34%;background:linear-gradient(rgba(0,0,0,.78),transparent)}' +
    '.znp-ui::after{bottom:0;height:50%;background:linear-gradient(transparent,rgba(0,0,0,.86))}' +
    '#znpRoot.znp-hide .znp-ui{opacity:0}' +
    '#znpRoot.znp-hide .znp-ui *{pointer-events:none!important}' +
    '.znp-top{position:absolute;z-index:1;top:0;left:0;right:0;display:flex;align-items:center;gap:12px;pointer-events:auto;padding:max(env(safe-area-inset-top),14px) max(env(safe-area-inset-right),22px) 0 max(env(safe-area-inset-left),22px)}' +
    '.znp-round{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}' +
    '.znp-ttl{min-width:0;display:flex;flex-direction:column}' +
    '.znp-ttl b{font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.znp-ttl small{color:#c8d0e6;font-weight:600}' +
    '.znp-mid{position:absolute;z-index:1;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;justify-content:center;align-items:center;gap:clamp(28px,12vw,110px);pointer-events:none}' +
    '.znp-mid button{pointer-events:auto}' +
    '.znp-skip{position:relative;width:56px;height:56px;display:grid;place-items:center}' +
    '.znp-skip svg{width:46px;height:46px}.znp-skip.f svg{transform:scaleX(-1)}' +
    '.znp-skip b{position:absolute;left:0;right:0;top:50%;transform:translateY(-34%);font-size:11px;text-align:center}' +
    '.znp-big{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--cyan,#64f4ff),var(--purple,#a78bfa));color:#06101a;box-shadow:0 8px 30px rgba(0,0,0,.45)}' +
    '.znp-big svg{width:40px;height:40px}' +
    '#znpRoot.znp-busy .znp-big{opacity:0;pointer-events:none}' +
    '.znp-bot{position:absolute;z-index:1;left:0;right:0;bottom:0;pointer-events:auto;padding:0 max(env(safe-area-inset-right),24px) max(env(safe-area-inset-bottom),14px) max(env(safe-area-inset-left),24px)}' +
    '.znp-bar{position:relative;height:34px;display:flex;align-items:center;touch-action:none;cursor:pointer}' +
    '.znp-trk{position:absolute;left:0;right:0;height:4px;border-radius:4px;background:rgba(255,255,255,.25)}' +
    '.znp-fill{position:absolute;left:0;height:4px;border-radius:4px;width:0;background:linear-gradient(90deg,var(--cyan,#64f4ff),var(--purple,#a78bfa))}' +
    '.znp-knob{position:absolute;left:0;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(100,244,255,.25)}' +
    '.znp-pv{position:absolute;bottom:38px;left:0;width:184px;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:5px;pointer-events:none}' +
    '.znp-pv.on{display:flex}' +
    '.znp-pv img{display:none;width:184px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;border:2px solid #fff;background:#0b0e18}' +
    '.znp-pv img.ok{display:block}' +
    '.znp-pv span{padding:3px 10px;border-radius:8px;background:rgba(0,0,0,.72);font-size:13px}' +
    '.znp-row{display:flex;justify-content:space-between;color:#d6dcef;font-size:13px;margin-top:-2px}' +
    '.znp-acts{display:flex;gap:8px;margin-top:8px;overflow-x:auto;scrollbar-width:none}' +
    '.znp-acts::-webkit-scrollbar{display:none}' +
    '.znp-acts button{flex:none;padding:9px 16px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16)}' +
    '.znp-acts button[hidden]{display:none}' +
    '.znp-acts .znp-nx{margin-left:auto;background:linear-gradient(135deg,var(--cyan,#64f4ff),var(--purple,#a78bfa));color:#06101a;border:0}' +
    '.znp-spin{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;border:3px solid rgba(255,255,255,.22);border-top-color:var(--cyan,#64f4ff);animation:znpS .8s linear infinite;pointer-events:none;display:none}' +
    '#znpRoot.znp-busy .znp-spin{display:block}' +
    '@keyframes znpS{to{transform:rotate(360deg)}}' +
    '.znp-sheet{position:absolute;z-index:3;top:0;right:0;bottom:0;width:min(360px,52vw);background:rgba(9,12,22,.96);border-left:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;padding:max(env(safe-area-inset-top),14px) max(env(safe-area-inset-right),14px) 14px 14px}' +
    '.znp-sheet[hidden]{display:none}' +
    '.znp-sh-t{font-size:16px;font-weight:800;padding:6px 8px 10px}' +
    '.znp-sh-l{overflow-y:auto;flex:1}' +
    '.znp-sh-l button{display:flex;width:100%;text-align:left;align-items:center;gap:10px;padding:13px 12px;border-radius:12px;color:#d6dcef}' +
    '.znp-sh-l button.on{background:rgba(100,244,255,.12);color:var(--cyan,#64f4ff)}' +
    '.znp-sh-l button.on::after{content:"✓";margin-left:auto}' +
    '.znp-sh-e{padding:14px 12px;color:#9aa6c1;font-weight:500}' +
    '.znp-flash{position:absolute;z-index:2;top:50%;margin-top:-22px;padding:10px 18px;border-radius:999px;background:rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .2s}' +
    '.znp-flash.on{opacity:1}.znp-flash.l{left:14%}.znp-flash.r{right:14%}' +
    '.znp-msg{position:absolute;z-index:2;left:50%;bottom:92px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:rgba(0,0,0,.72);opacity:0;pointer-events:none;transition:opacity .2s;white-space:nowrap;max-width:80vw;overflow:hidden;text-overflow:ellipsis}' +
    '.znp-msg.on{opacity:1}';

  var root = null, ui = {};
  var st = { time: 0, length: 0, playing: false, buffering: true };
  var isOpen = false, dragging = false, dragT = 0, sheetOpen = false;
  var hideT = 0, msgT = 0, flashT = 0, tapT = 0, lastTap = 0, lastSide = 0;
  var curTitle = "", fallback = null, backH = null, listening = false, resumed = false, lastSave = 0;
  var origPlay = typeof W.rdPlay === "function" ? W.rdPlay : null;
  var rate = 1, aspect = "fit", meta = null;
  var thumbC = {}, thumbBusy = false, thumbOk = true, thumbFail = 0, thumbWant = -1;

  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") + m : m) + ":" + (x < 10 ? "0" : "") + x;
  }
  function $(id) { return D.getElementById(id); }
  function call(m, a) { var p = plug(); if (!p || !p[m]) return Promise.reject(new Error("sin plugin")); return p[m](a || {}); }
  function isTv() { return !!(W._addonCtx && W._addonCtx.type === "tv"); }

  /* ---------- posición guardada (para continuar donde lo dejaste) ---------- */
  function posMap() { try { return JSON.parse(localStorage.getItem("znp_pos") || "{}") || {}; } catch (e) { return {}; } }
  function savePos(force) {
    if (!curTitle || st.length <= 0) return;
    var now = Date.now();
    if (!force && now - lastSave < 5000) return;
    lastSave = now;
    try { if (meta && W.ZCW) W.ZCW.progress(meta, st.time, st.length, false); } catch (e) {}
    var m = posMap();
    if (st.time > 30000 && st.time < st.length - 45000) m[curTitle] = st.time; else delete m[curTitle];
    var keys = Object.keys(m);
    if (keys.length > 80) delete m[keys[0]];
    try { localStorage.setItem("znp_pos", JSON.stringify(m)); } catch (e) {}
  }

  /* ---------- vista previa de la escena al deslizar la barra ---------- */
  function bucket(ms) { return Math.max(0, Math.round(ms / 5000) * 5000); }
  function showThumb() {
    if (!dragging || !ui.pvI) return;
    var d = thumbC[bucket(dragT)];
    if (d) { ui.pvI.src = d; ui.pvI.classList.add("ok"); }
  }
  function runThumb() {
    var b = thumbWant;
    if (thumbBusy || !thumbOk || b < 0 || thumbC[b]) return;
    thumbBusy = true;
    call("getThumb", { ms: b }).then(function (r) {
      if (r && r.data) { thumbC[b] = r.data; thumbFail = 0; } else thumbFail++;
    }).catch(function () { thumbFail++; }).then(function () {
      thumbBusy = false;
      if (thumbFail >= 3) thumbOk = false;
      showThumb();
      if (dragging && !thumbC[bucket(dragT)]) { thumbWant = bucket(dragT); runThumb(); }
    });
  }
  function movePv(clientX) {
    var r = ui.bar.getBoundingClientRect(), half = 92;
    ui.pv.style.left = Math.max(half, Math.min(r.width - half, clientX - r.left)) + "px";
    ui.pvT.textContent = fmt(dragT);
    ui.pv.classList.add("on");
    var b = bucket(dragT);
    if (thumbC[b]) showThumb(); else { ui.pvI.classList.remove("ok"); thumbWant = b; runThumb(); }
  }

  /* ---------- construcción de la interfaz ---------- */
  function build() {
    if (root) return;
    var s = D.createElement("style"); s.textContent = CSS; D.head.appendChild(s);
    root = D.createElement("div"); root.id = "znpRoot"; root.hidden = true;
    root.innerHTML =
      '<div class="znp-tap" id="znpTap"></div><div class="znp-spin"></div>' +
      '<div class="znp-flash l" id="znpFl"></div><div class="znp-flash r" id="znpFr"></div>' +
      '<div class="znp-msg" id="znpMsg"></div>' +
      '<div class="znp-ui" id="znpUi">' +
        '<div class="znp-top"><button class="znp-round" id="znpBack" aria-label="Volver">' + ICON.back + '</button>' +
          '<div class="znp-ttl"><b id="znpTitle"></b><small id="znpSub"></small></div></div>' +
        '<div class="znp-mid"><button class="znp-skip" id="znpRew" aria-label="Retroceder 10 segundos">' + ICON.skip + '</button>' +
          '<button class="znp-big" id="znpPlay" aria-label="Reproducir o pausar"></button>' +
          '<button class="znp-skip f" id="znpFwd" aria-label="Adelantar 10 segundos">' + ICON.skip + '</button></div>' +
        '<div class="znp-bot"><div class="znp-bar" id="znpBar"><div class="znp-pv" id="znpPv"><img id="znpPvI" alt=""><span id="znpPvT"></span></div><div class="znp-trk"></div><div class="znp-fill" id="znpFill"></div><div class="znp-knob" id="znpKnob"></div></div>' +
          '<div class="znp-row"><span id="znpCur">0:00</span><span id="znpDur"></span></div>' +
          '<div class="znp-acts"><button data-p="audio">Audio</button><button data-p="subs">Subtítulos</button><button data-p="speed" id="znpSpeed">Velocidad 1x</button><button data-p="aspect">Pantalla</button>' +
          '<button class="znp-nx" id="znpNext" hidden>Siguiente ▶</button></div></div>' +
      '</div>' +
      '<div class="znp-sheet" id="znpSheet" hidden><div class="znp-sh-t" id="znpShT"></div><div class="znp-sh-l" id="znpShL"></div></div>';
    D.body.appendChild(root);
    ["Tap", "Ui", "Back", "Title", "Sub", "Rew", "Play", "Fwd", "Bar", "Fill", "Knob", "Cur", "Dur", "Pv", "PvI", "PvT", "Speed", "Next", "Sheet", "ShT", "ShL", "Fl", "Fr", "Msg"]
      .forEach(function (k) { ui[k.charAt(0).toLowerCase() + k.slice(1)] = $("znp" + k); });

    ui.back.onclick = function () { close(true); };
    ui.rew.onclick = function () { seekBy(-10000); };
    ui.fwd.onclick = function () { seekBy(10000); };
    ui.play.onclick = function () { toggle(); };
    ui.next.onclick = function () { close(true); if (typeof W.addonStep === "function") W.addonStep(1); };
    root.querySelectorAll(".znp-acts [data-p]").forEach(function (b) { b.onclick = function () { openSheet(b.getAttribute("data-p")); }; });

    /* toque en el video: un toque muestra/oculta controles; doble toque a los lados salta 10 s, al centro pausa */
    ui.tap.addEventListener("click", function (e) {
      if (sheetOpen) { closeSheet(); return; }
      var w = ui.tap.clientWidth, side = e.clientX < w * 0.33 ? -1 : (e.clientX > w * 0.67 ? 1 : 0), now = Date.now();
      if (now - lastTap < 320 && side === lastSide) {
        clearTimeout(tapT); lastTap = 0;
        if (side === 0) toggle(); else { seekBy(side * 10000); flash(side); }
        return;
      }
      lastTap = now; lastSide = side; clearTimeout(tapT);
      tapT = setTimeout(function () {
        if (root.classList.contains("znp-hide")) showUi(); else root.classList.add("znp-hide");
      }, 320);
    });

    /* barra de progreso: arrastrar o tocar */
    function frac(e) { var r = ui.bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
    ui.bar.addEventListener("pointerdown", function (e) {
      if (st.length <= 0) return;
      dragging = true; dragT = frac(e) * st.length; try { ui.bar.setPointerCapture(e.pointerId); } catch (x) {}
      clearTimeout(hideT); paint(); movePv(e.clientX);
    });
    ui.bar.addEventListener("pointermove", function (e) { if (dragging) { dragT = frac(e) * st.length; paint(); movePv(e.clientX); } });
    function endDrag() {
      if (!dragging) return;
      dragging = false; ui.pv.classList.remove("on"); st.time = dragT; call("seekTo", { ms: Math.round(dragT) }).catch(noop); paint(); showUi();
    }
    ui.bar.addEventListener("pointerup", endDrag);
    ui.bar.addEventListener("pointercancel", endDrag);
  }

  /* ---------- pintar estado ---------- */
  function paint() {
    if (!root) return;
    var len = st.length, t = dragging ? dragT : st.time, f = len > 0 ? Math.min(1, t / len) : 0;
    ui.fill.style.width = (f * 100) + "%";
    ui.knob.style.left = (f * 100) + "%";
    ui.cur.textContent = fmt(t);
    ui.dur.textContent = len > 0 ? "-" + fmt(len - t) : "";
    ui.play.innerHTML = st.playing ? ICON.pause : ICON.play;
    root.classList.toggle("znp-busy", !!st.buffering || (!st.playing && st.time === 0 && len === 0));
  }
  function showUi() {
    if (!root) return;
    root.classList.remove("znp-hide");
    clearTimeout(hideT);
    hideT = setTimeout(function () { if (st.playing && !sheetOpen && !dragging) root.classList.add("znp-hide"); }, 3500);
  }
  function msg(t) {
    ui.msg.textContent = t; ui.msg.classList.add("on");
    clearTimeout(msgT); msgT = setTimeout(function () { ui.msg.classList.remove("on"); }, 1800);
  }
  function flash(side) {
    var el = side < 0 ? ui.fl : ui.fr;
    el.textContent = (side < 0 ? "−10 s" : "+10 s"); el.classList.add("on");
    clearTimeout(flashT); flashT = setTimeout(function () { el.classList.remove("on"); }, 500);
  }

  /* ---------- acciones ---------- */
  function toggle() { call("togglePlay").catch(noop); st.playing = !st.playing; paint(); showUi(); }
  function seekBy(ms) {
    call("seekBy", { ms: ms }).catch(noop);
    st.time = Math.max(0, Math.min(st.length || 1e12, st.time + ms)); paint(); showUi();
  }

  /* ---------- panel lateral: audio, subtítulos, velocidad, pantalla ---------- */
  function closeSheet() { sheetOpen = false; if (ui.sheet) ui.sheet.hidden = true; showUi(); }
  function fillSheet(title, items, empty) {
    ui.shT.textContent = title; ui.shL.innerHTML = "";
    if (!items.length) { var e = D.createElement("div"); e.className = "znp-sh-e"; e.textContent = empty || "Nada disponible"; ui.shL.appendChild(e); return; }
    items.forEach(function (it) {
      var b = D.createElement("button"); b.type = "button"; b.textContent = it.label;
      if (it.on) b.className = "on";
      b.onclick = function () { it.fn(); closeSheet(); };
      ui.shL.appendChild(b);
    });
  }
  function openSheet(kind) {
    sheetOpen = true; ui.sheet.hidden = false; clearTimeout(hideT);
    if (kind === "speed") {
      fillSheet("Velocidad", [0.5, 0.75, 1, 1.25, 1.5, 2].map(function (r) {
        return { label: r === 1 ? "Normal" : r + "x", on: r === rate, fn: function () { rate = r; ui.speed.textContent = "Velocidad " + r + "x"; call("setRate", { rate: r }).catch(noop); } };
      }));
    } else if (kind === "aspect") {
      fillSheet("Pantalla", [["fit", "Ajustar"], ["zoom", "Zoom (recorta los bordes)"], ["fill", "Estirar"], ["16:9", "16:9"], ["4:3", "4:3"]].map(function (a) {
        return { label: a[1], on: a[0] === aspect, fn: function () { aspect = a[0]; call("setAspect", { mode: a[0] }).catch(noop); } };
      }));
    } else {
      fillSheet(kind === "audio" ? "Audio" : "Subtítulos", [], "Cargando…");
      call("getTracks").then(function (t) {
        if (!sheetOpen) return;
        var list = (kind === "audio" ? t.audio : t.subs) || [], cur = kind === "audio" ? t.audioCurrent : t.subCurrent;
        var items = list.map(function (x) {
          var off = Number(x.id) === -1;
          return {
            label: off ? (kind === "audio" ? "Sin audio" : "Desactivados") : (x.name || "Pista " + x.id),
            on: Number(x.id) === Number(cur),
            fn: function () { call(kind === "audio" ? "setAudio" : "setSubtitle", { id: Number(x.id) }).catch(noop); }
          };
        });
        fillSheet(kind === "audio" ? "Audio" : "Subtítulos", items, kind === "audio" ? "Este video no trae otras pistas de audio" : "Este video no trae subtítulos");
      }).catch(function () { fillSheet(kind === "audio" ? "Audio" : "Subtítulos", [], "No se pudieron leer las pistas"); });
    }
  }

  /* ---------- botón Atrás del celular ---------- */
  function attachBack() {
    var A = W.Capacitor && W.Capacitor.Plugins && W.Capacitor.Plugins.App;
    if (!A || !A.addListener || backH) return;
    try { backH = A.addListener("backButton", function () { if (sheetOpen) closeSheet(); else close(true); }); } catch (e) { backH = null; }
  }
  function detachBack() {
    if (!backH) return;
    var h = backH; backH = null;
    Promise.resolve(h).then(function (x) { if (x && x.remove) x.remove(); }).catch(noop);
  }

  /* ---------- eventos que manda el plugin nativo ---------- */
  function listen(p) {
    if (listening || !p.addListener) return;
    listening = true;
    p.addListener("znpState", function (s) {
      if (!isOpen || !s) return;
      st.time = Number(s.time) || 0; st.length = Number(s.length) || 0; st.playing = !!s.playing; st.buffering = !!s.buffering;
      if (!resumed && st.length > 0) {
        resumed = true;
        var saved = Number(posMap()[curTitle]) || 0;
        if (saved > 30000 && saved < st.length - 60000) { call("seekTo", { ms: saved }).catch(noop); msg("Continuando desde " + fmt(saved)); }
      }
      savePos(false);
      if (!dragging) paint();
    });
    p.addListener("znpEnded", function () {
      if (!isOpen) return;
      var tv = isTv(); st.time = st.length; try { if (meta && W.ZCW) W.ZCW.progress(meta, st.length, st.length, true); } catch (e) {} meta = null; close(true);
      if (tv && typeof W.addonStep === "function") W.addonStep(1);
    });
    p.addListener("znpError", function () {
      if (!isOpen) return;
      var fb = fallback; close(true);
      if (fb) { say("El reproductor nativo falló; se usa el interno"); fb(); } else say("No se pudo reproducir este video. Prueba otra fuente.");
    });
  }

  /* ---------- abrir y cerrar ---------- */
  function open(url, title, fb, mt) {
    var p = plug(); if (!p) return false;
    build(); listen(p);
    meta = mt || null; thumbC = {}; thumbBusy = false; thumbOk = true; thumbFail = 0; thumbWant = -1;
    curTitle = title || ""; fallback = fb || (origPlay ? function () { origPlay({ download: url }, title); } : null); resumed = false; rate = 1; aspect = "fit"; lastSave = 0;
    st = { time: 0, length: 0, playing: false, buffering: true };
    ui.title.textContent = curTitle || "Reproduciendo";
    var c = W._addonCtx;
    ui.sub.textContent = c && c.type === "tv" ? "Temporada " + c.season + " · Episodio " + c.episode : "";
    ui.next.hidden = !isTv();
    ui.speed.textContent = "Velocidad 1x";
    sheetOpen = false; ui.sheet.hidden = true; dragging = false;
    isOpen = true; root.hidden = false; D.documentElement.classList.add("znp-on");
    paint(); showUi(); attachBack();
    p.play({ url: url, title: curTitle }).catch(function (e) {
      var f = fallback; close(false);
      if (f) { say("No se pudo abrir el reproductor nativo; se usa el interno"); f(); }
      else alert("No se pudo abrir el reproductor: " + ((e && e.message) || e));
    });
    return true;
  }
  function close(stopNative) {
    if (!isOpen) return;
    savePos(true);
    isOpen = false; sheetOpen = false;
    clearTimeout(hideT); clearTimeout(tapT);
    detachBack();
    root.hidden = true;
    D.documentElement.classList.remove("znp-on");
    try { D.dispatchEvent(new Event("znp:closed")); } catch (e) {}
    if (stopNative !== false) { var p = plug(); if (p && p.stop) p.stop().catch(noop); }
  }

  /* ---------- enganche con la app ---------- */
  var origVlc = typeof W.rdOpenVlc === "function" ? W.rdOpenVlc : null;
  W.rdPlay = function (r, title) {
    if (r && r.download && open(r.download, title, origPlay ? function () { origPlay(r, title); } : null)) return;
    if (origPlay) return origPlay.apply(this, arguments);
  };
  W.rdOpenVlc = function (url, title) {
    try { var v = D.getElementById("rdVideo"); if (v) v.pause(); } catch (e) {}
    if (open(url, title, null)) return;
    if (origVlc) return origVlc.apply(this, arguments);
  };
  W.ZNP = { open: open, close: close, available: function () { return !!plug(); } };
})();
