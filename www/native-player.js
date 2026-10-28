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
    skip: '<svg viewBox="0 0 24 24"><path d="M12 4.6A7.9 7.9 0 1 1 5.95 7.42"/><path d="M14.7 2.2 12 4.6l2.7 2.4"/></svg><b>10</b>',
    /* iconos de línea fina (sin cuadro ni círculo) */
    audio: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.6l4.4 4V5.5l-4.4 4z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.3 6.6a8 8 0 0 1 0 10.8"/></svg>',
    quality: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M7.5 9.5v5M7.5 12h3M10.5 9.5v5M14 9.5h1.6a1.9 1.9 0 0 1 0 5H14z"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M7 10.5h4M13.5 10.5H17M7 14.5h2.6M12.2 14.5H17"/></svg>',
    speed: '<svg viewBox="0 0 24 24"><path d="M4.6 17.5a8.5 8.5 0 1 1 14.8 0"/><path d="M12 14l3.8-4.6"/><circle cx="12" cy="14.2" r="1.1"/></svg>',
    aspect: '<svg viewBox="0 0 24 24"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6.5 5.5v13l9.5-6.5z"/><path d="M19 5.5v13"/></svg>',
    src: '<svg viewBox="0 0 24 24"><path d="M12 3.5 21 8.5 12 13.5 3 8.5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/></svg>',
    cast: '<svg viewBox="0 0 24 24"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 20h.01"/></svg>',
    check: '<svg class="znp-ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
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
    '#znpRoot .znp-skip{position:relative;width:60px;height:60px;display:grid;place-items:center;color:rgba(255,255,255,.95);transition:transform .15s,opacity .15s}' +
    '#znpRoot .znp-skip:active{transform:scale(.88);opacity:.75}' +
    '#znpRoot .znp-skip svg{width:54px;height:54px;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 8px rgba(0,0,0,.55))}' +
    '#znpRoot .znp-skip.f svg{transform:scaleX(-1)}' +
    '#znpRoot .znp-skip b{position:absolute;left:0;right:0;top:53%;transform:translateY(-50%);font-size:12px;font-weight:600;letter-spacing:.3px;text-align:center;text-shadow:0 1px 6px rgba(0,0,0,.6)}' +
    '#znpRoot .znp-skip.spin svg{animation:znpSpinB .6s cubic-bezier(.25,.8,.25,1)}' +
    '#znpRoot .znp-skip.f.spin svg{animation:znpSpinF .6s cubic-bezier(.25,.8,.25,1)}' +
    '#znpRoot .znp-skip.spin b{animation:znpPop .6s ease-out}' +
    '@keyframes znpSpinB{from{transform:rotate(0)}to{transform:rotate(-360deg)}}' +
    '@keyframes znpSpinF{from{transform:scaleX(-1) rotate(0)}to{transform:scaleX(-1) rotate(-360deg)}}' +
    '@keyframes znpPop{0%{transform:translateY(-50%) scale(1)}35%{transform:translateY(-50%) scale(1.28);color:var(--cyan,#64f4ff)}100%{transform:translateY(-50%) scale(1)}}' +
    /* ventana flotante (imagen en imagen): sin controles */
    '#znpRoot.znp-pip .znp-top,#znpRoot.znp-pip .znp-mid,#znpRoot.znp-pip .znp-bot,#znpRoot.znp-pip .znp-sheet,#znpRoot.znp-pip .znp-msg,#znpRoot.znp-pip .znp-flash{display:none!important}' +
    '.znp-big{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--cyan,#64f4ff),var(--znp-end,var(--purple,#a78bfa)));color:#06101a;box-shadow:0 8px 30px rgba(0,0,0,.45)}' +
    '.znp-big svg{width:40px;height:40px}' +
    '#znpRoot.znp-busy .znp-big{opacity:0;pointer-events:none}' +
    '.znp-bot{position:absolute;z-index:1;left:0;right:0;bottom:0;pointer-events:auto;padding:0 max(env(safe-area-inset-right),24px) max(env(safe-area-inset-bottom),14px) max(env(safe-area-inset-left),24px)}' +
    '.znp-bar{position:relative;height:34px;display:flex;align-items:center;touch-action:none;cursor:pointer}' +
    '.znp-trk{position:absolute;left:0;right:0;height:4px;border-radius:4px;background:rgba(255,255,255,.25)}' +
    '.znp-fill{position:absolute;left:0;height:4px;border-radius:4px;width:0;background:linear-gradient(90deg,var(--cyan,#64f4ff),var(--znp-end,var(--purple,#a78bfa)));box-shadow:0 0 12px rgba(var(--acc-rgb,100,244,255),.35)}' +
    'html[data-accent="violet"] #znpRoot{--znp-end:#ff67c8}html[data-accent="neutral"] #znpRoot{--znp-end:#9fb4ff}' +
    '.znp-knob{position:absolute;left:0;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(var(--acc-rgb,100,244,255),.28),0 0 14px rgba(var(--acc-rgb,100,244,255),.45)}' +
    '.znp-pv{position:absolute;bottom:38px;left:0;width:184px;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:5px;pointer-events:none}' +
    '.znp-pv.on{display:flex}' +
    '.znp-pv img{display:none;width:184px;aspect-ratio:16/9;object-fit:cover;border-radius:10px;border:2px solid #fff;background:#0b0e18}' +
    '.znp-pv img.ok{display:block}' +
    '.znp-pv span{padding:3px 10px;border-radius:8px;background:rgba(0,0,0,.72);font-size:13px}' +
    '.znp-row{display:flex;justify-content:space-between;color:#d6dcef;font-size:13px;margin-top:-2px}' +
    /* iconos de la barra inferior y de arriba */
    '.znp-acts{display:flex;align-items:center;gap:clamp(10px,3.4vw,26px);margin-top:2px}' +
    '.znp-acts .znp-nx{margin-left:auto}' +
    '#znpRoot .znp-ic{position:relative;flex:none;display:grid;place-items:center;min-width:46px;height:46px;padding:0;color:rgba(255,255,255,.92);transition:transform .15s,opacity .15s}' +
    '#znpRoot .znp-ic svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 6px rgba(0,0,0,.55))}' +
    '#znpRoot .znp-ic:active{transform:scale(.86);opacity:.7}' +
    '#znpRoot .znp-ic[hidden]{display:none}' +
    '#znpRoot .znp-ic small{position:absolute;right:-1px;top:3px;font-size:10px;font-weight:800;line-height:1;color:var(--cyan,#64f4ff);text-shadow:0 1px 4px rgba(0,0,0,.7)}' +
    '.znp-top .znp-cast{margin-left:auto}' +
    '#znpRoot .znp-ic.on{color:var(--cyan,#64f4ff)}' +
    '.znp-cb{position:absolute;left:0;right:0;top:44%;text-align:center;pointer-events:none;display:none;color:#cfd8ee;font-size:15px;font-weight:600;text-shadow:0 2px 10px rgba(0,0,0,.7)}' +
    '#znpRoot.znp-casting .znp-cb{display:block}' +
    /* tarjeta lateral: pegada a la pared, sin borde de ese lado */
    '.znp-sheet{position:absolute;z-index:3;top:max(env(safe-area-inset-top),12px);bottom:max(env(safe-area-inset-bottom),12px);right:env(safe-area-inset-right,0px);width:min(350px,54vw);display:flex;flex-direction:column;padding:10px 8px 8px;background:rgba(14,18,32,.66);-webkit-backdrop-filter:blur(22px) saturate(1.3);backdrop-filter:blur(22px) saturate(1.3);border:1px solid rgba(255,255,255,.13);border-right:0;border-radius:22px 0 0 22px;box-shadow:-14px 0 44px rgba(0,0,0,.45),inset 1px 0 0 rgba(255,255,255,.06);animation:znpIn .24s cubic-bezier(.2,.8,.2,1)}' +
    '@keyframes znpIn{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}' +
    '.znp-sheet[hidden]{display:none}' +
    '.znp-sh-t{font-size:15px;font-weight:800;letter-spacing:.2px;padding:8px 14px 10px;color:#fff}' +
    '.znp-sh-l{overflow-y:auto;flex:1;scrollbar-width:none;padding:2px 2px 4px}.znp-sh-l::-webkit-scrollbar{display:none}' +
    '#znpRoot .znp-sh-l button{display:flex;width:100%;text-align:left;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;color:#d6dcef;font-weight:600}' +
    '#znpRoot .znp-sh-l button:active{background:rgba(255,255,255,.08)}' +
    '#znpRoot .znp-sh-l button.on{background:rgba(var(--acc-rgb,100,244,255),.14);color:var(--cyan,#64f4ff)}' +
    '.znp-sh-l .znp-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '.znp-sh-l .znp-tx small{color:#8f9ab5;font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#znpRoot svg.znp-ck{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;flex:none;margin-left:auto}' +
    '.znp-spin{position:absolute;left:50%;top:50%;width:min(36vmin,210px);height:min(36vmin,210px);transform:translate(-50%,-50%);pointer-events:none;display:none}.znp-spin .zl{width:100%;height:100%;display:block}' +
    '#znpRoot.znp-busy .znp-spin{display:block}' +
    '@keyframes znpS{to{transform:rotate(360deg)}}' +
    '.znp-sh-e{padding:14px 12px;color:#9aa6c1;font-weight:500}' +
    '.znp-flash{position:absolute;z-index:2;top:50%;margin-top:-22px;padding:10px 18px;border-radius:999px;background:rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .2s}' +
    '.znp-flash.on{opacity:1}.znp-flash.l{left:14%}.znp-flash.r{right:14%}' +
    '.znp-msg{position:absolute;z-index:2;left:50%;bottom:92px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:rgba(0,0,0,.72);opacity:0;pointer-events:none;transition:opacity .2s;white-space:nowrap;max-width:80vw;overflow:hidden;text-overflow:ellipsis}' +
    '.znp-msg.on{opacity:1}';

  var root = null, ui = {};
  var st = { time: 0, length: 0, playing: false, buffering: true };
  var isOpen = false, dragging = false, dragT = 0, sheetOpen = false;
  var wantPlay = null, wantUntil = 0;
  var hideT = 0, msgT = 0, flashT = 0, tapT = 0, lastTap = 0, lastSide = 0;
  var curTitle = "", fallback = null, backH = null, listening = false, resumed = false, lastSave = 0;
  var origPlay = typeof W.rdPlay === "function" ? W.rdPlay : null;
  var castName = "", castPoll = 0, castSig = "", rate = 1, aspect = "fit", meta = null, sheetKind = "", quality = 0, startAt = 0, applied = false, applyTry = 0, applyT = 0;
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
      if (thumbFail >= 6) thumbOk = false;
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
      '<div class="znp-tap" id="znpTap"></div><div class="znp-spin"><svg class="zl" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="38"/><g class="zz"><path class="p1" pathLength="100" d="M21 20 L76 33 L22 45 Z"/><path class="p2" pathLength="100" d="M20 69 L54 39 L77 33 L78 36 L60 56 L31 74 Z"/><path class="p3" pathLength="100" d="M60 52 L78 64 L58 80 L32 74 Z"/></g></svg></div>' +
      '<div class="znp-flash l" id="znpFl"></div><div class="znp-flash r" id="znpFr"></div>' +
      '<div class="znp-msg" id="znpMsg"></div>' +
      '<div class="znp-ui" id="znpUi">' +
        '<div class="znp-top"><button class="znp-round" id="znpBack" aria-label="Volver">' + ICON.back + '</button>' +
          '<div class="znp-ttl"><b id="znpTitle"></b><small id="znpSub"></small></div>' +
          '<button class="znp-ic znp-cast" id="znpCast" aria-label="Transmitir a otro dispositivo" title="Transmitir (Chromecast)">' + ICON.cast + '</button>' +
          '<button class="znp-ic znp-src" id="znpSrc" aria-label="Cambiar de fuente" title="Cambiar de fuente" hidden>' + ICON.src + '</button></div>' +
          '<div class="znp-cb" id="znpCb"></div>' +
        '<div class="znp-mid"><button class="znp-skip" id="znpRew" aria-label="Retroceder 10 segundos">' + ICON.skip + '</button>' +
          '<button class="znp-big" id="znpPlay" aria-label="Reproducir o pausar"></button>' +
          '<button class="znp-skip f" id="znpFwd" aria-label="Adelantar 10 segundos">' + ICON.skip + '</button></div>' +
        '<div class="znp-bot"><div class="znp-bar" id="znpBar"><div class="znp-pv" id="znpPv"><img id="znpPvI" alt=""><span id="znpPvT"></span></div><div class="znp-trk"></div><div class="znp-fill" id="znpFill"></div><div class="znp-knob" id="znpKnob"></div></div>' +
          '<div class="znp-row"><span id="znpCur">0:00</span><span id="znpDur"></span></div>' +
          '<div class="znp-acts">' +
            '<button class="znp-ic" data-p="audio" aria-label="Audio" title="Audio">' + ICON.audio + '</button>' +
            '<button class="znp-ic" data-p="subs" aria-label="Subtítulos" title="Subtítulos">' + ICON.subs + '</button>' +
            '<button class="znp-ic" data-p="quality" aria-label="Calidad" title="Calidad">' + ICON.quality + '</button>' +
            '<button class="znp-ic" data-p="speed" id="znpSpeed" aria-label="Velocidad" title="Velocidad">' + ICON.speed + '<small id="znpSpeedB"></small></button>' +
            '<button class="znp-ic" data-p="aspect" aria-label="Pantalla" title="Pantalla">' + ICON.aspect + '</button>' +
            '<button class="znp-ic znp-nx" id="znpNext" aria-label="Siguiente episodio" title="Siguiente episodio" hidden>' + ICON.next + '</button></div></div>' +
      '</div>' +
      '<div class="znp-sheet" id="znpSheet" hidden><div class="znp-sh-t" id="znpShT"></div><div class="znp-sh-l" id="znpShL"></div></div>';
    D.body.appendChild(root);
    ["Tap", "Ui", "Back", "Title", "Sub", "Rew", "Play", "Fwd", "Bar", "Fill", "Knob", "Cur", "Dur", "Pv", "PvI", "PvT", "Speed", "SpeedB", "Src", "Cast", "Cb", "Next", "Sheet", "ShT", "ShL", "Fl", "Fr", "Msg"]
      .forEach(function (k) { ui[k.charAt(0).toLowerCase() + k.slice(1)] = $("znp" + k); });

    ui.back.onclick = function () { close(true); };
    ui.rew.onclick = function () { seekBy(-10000); pulseSkip(-1); };
    ui.fwd.onclick = function () { seekBy(10000); pulseSkip(1); };
    ui.play.onclick = function () { toggle(); };
    ui.next.onclick = function () { close(true); if (typeof W.addonStep === "function") W.addonStep(1); };
    ui.src.onclick = function () { toggleSheet("src"); };
    ui.cast.onclick = function () { toggleSheet("cast"); };
    root.querySelectorAll(".znp-acts [data-p]").forEach(function (b) { b.onclick = function () { toggleSheet(b.getAttribute("data-p")); }; });

    /* toque en el video: un toque muestra/oculta controles; doble toque a los lados salta 10 s, al centro pausa */
    ui.tap.addEventListener("click", function (e) {
      if (sheetOpen) { closeSheet(); return; }
      var w = ui.tap.clientWidth, side = e.clientX < w * 0.33 ? -1 : (e.clientX > w * 0.67 ? 1 : 0), now = Date.now();
      if (now - lastTap < 320 && side === lastSide) {
        clearTimeout(tapT); lastTap = 0;
        if (side === 0) toggle(); else { seekBy(side * 10000); flash(side); pulseSkip(side); }
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
  function pulseSkip(side) {
    var b = side < 0 ? ui.rew : ui.fwd; if (!b) return;
    b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin");
    setTimeout(function () { b.classList.remove("spin"); }, 700);
  }
  function flash(side) {
    var el = side < 0 ? ui.fl : ui.fr;
    el.textContent = (side < 0 ? "−10 s" : "+10 s"); el.classList.add("on");
    clearTimeout(flashT); flashT = setTimeout(function () { el.classList.remove("on"); }, 500);
  }

  /* ---------- acciones ---------- */
  function toggle() {
    var want = !st.playing;
    wantPlay = want; wantUntil = Date.now() + 1500;
    call("togglePlay", { play: want }).catch(noop);
    st.playing = want; paint(); showUi();
  }
  function seekBy(ms) {
    call("seekBy", { ms: ms }).catch(noop);
    st.time = Math.max(0, Math.min(st.length || 1e12, st.time + ms)); paint(); showUi();
  }

  /* ---------- panel lateral: audio, subtítulos, velocidad, pantalla ---------- */
  function toggleSheet(kind) { if (sheetOpen && sheetKind === kind) { closeSheet(); return; } openSheet(kind); }
  function closeSheet() { clearInterval(castPoll); sheetOpen = false; if (ui.sheet) ui.sheet.hidden = true; showUi(); }
  function fillSheet(title, items, empty) {
    ui.shT.textContent = title; ui.shL.innerHTML = "";
    if (!items.length) { var e = D.createElement("div"); e.className = "znp-sh-e"; e.textContent = empty || "Nada disponible"; ui.shL.appendChild(e); return; }
    items.forEach(function (it) {
      var b = D.createElement("button"); b.type = "button";
      var tx = D.createElement("span"); tx.className = "znp-tx";
      var l = D.createElement("span"); l.textContent = it.label; tx.appendChild(l);
      if (it.sub) { var sm = D.createElement("small"); sm.textContent = it.sub; tx.appendChild(sm); }
      b.appendChild(tx);
      if (it.on) { b.className = "on"; b.insertAdjacentHTML("beforeend", ICON.check); }
      b.onclick = function () { it.fn(); closeSheet(); };
      ui.shL.appendChild(b);
    });
  }
  function openSheet(kind) {
    sheetOpen = true; sheetKind = kind; ui.sheet.hidden = false; clearTimeout(hideT);
    if (kind === "cast") {
      castSig = ""; fillSheet("Transmitir a", [], "Buscando dispositivos…");
      castRefresh();
      clearInterval(castPoll);
      castPoll = setInterval(function () { if (!sheetOpen || sheetKind !== "cast") { clearInterval(castPoll); return; } castRefresh(); }, 1800);
    } else if (kind === "src") {
      fillSheet("Fuentes", [], "Buscando fuentes…");
      var Z = W.ZAM;
      if (!meta || !Z || !Z.sources) { fillSheet("Fuentes", [], "No hay fuentes disponibles"); return; }
      Z.sources(meta).then(function (list) {
        if (!sheetOpen || sheetKind !== "src") return;
        fillSheet("Fuentes", list.map(function (x) { return { label: x.label, sub: x.sub, on: x.on, fn: function () { switchSource(x); } }; }), "Ningún addon encontró fuentes");
      }).catch(function () { if (sheetOpen && sheetKind === "src") fillSheet("Fuentes", [], "No se pudieron consultar las fuentes"); });
    } else if (kind === "speed") {
      fillSheet("Velocidad", [0.5, 0.75, 1, 1.25, 1.5, 2].map(function (r) {
        return { label: r === 1 ? "Normal" : r + "x", on: r === rate, fn: function () { rate = r; speedBadge(); call("setRate", { rate: r }).catch(noop); } };
      }));
    } else if (kind === "quality") {
      fillSheet("Calidad", [[0, "Automática", "Si no cambia nada, este enlace solo trae una calidad"], [1080, "1080p"], [720, "720p"], [480, "480p"], [360, "360p"]].map(function (q) {
        return { label: q[1], sub: q[0] === 0 ? q[2] : "", on: q[0] === quality, fn: function () { quality = q[0]; call("setQuality", { height: q[0] }).catch(noop); } };
      }));
    } else if (kind === "aspect") {
      fillSheet("Pantalla", [["fit", "Ajustar"], ["zoom", "Zoom (recorta los bordes)"], ["fill", "Estirar"], ["16:9", "16:9"], ["4:3", "4:3"]].map(function (a) {
        return { label: a[1], on: a[0] === aspect, fn: function () { aspect = a[0]; call("setAspect", { mode: a[0] }).catch(noop); } };
      }));
    } else {
      fillSheet(kind === "audio" ? "Audio" : "Subtítulos", [], "Cargando…");
      call("getTracks").then(function (t) {
        if (!sheetOpen || sheetKind !== kind) return;
        var list = (kind === "audio" ? t.audio : t.subs) || [], cur = kind === "audio" ? t.audioCurrent : t.subCurrent;
        var items = list.map(function (x) {
          var off = Number(x.id) === -1;
          return {
            label: off ? (kind === "audio" ? "Sin audio" : "Desactivados") : (x.name || "Pista " + x.id),
            on: Number(x.id) === Number(cur),
            fn: function () { call(kind === "audio" ? "setAudio" : "setSubtitle", { id: Number(x.id) }).catch(noop); remember(kind === "audio" ? "a" : "s", x, list); }
          };
        });
        fillSheet(kind === "audio" ? "Audio" : "Subtítulos", items, kind === "audio" ? "Este video no trae otras pistas de audio" : "Este video no trae subtítulos");
      }).catch(function () { fillSheet(kind === "audio" ? "Audio" : "Subtítulos", [], "No se pudieron leer las pistas"); });
    }
  }



  /* ---------- Chromecast (descubrimiento y envío los hace VLC en el APK) ---------- */
  function castRefresh() {
    Promise.all([call("castList"), call("tvList").catch(function () { return {}; })]).then(function (rr) {
      var r = rr[0], tv = rr[1] || {};
      if (!sheetOpen || sheetKind !== "cast") return;
      castName = (r && r.current) || "";
      var devs = (r && r.devices) || [], sig = JSON.stringify(devs) + "|" + castName + "|" + (tv.available ? 1 : 0) + (tv.on ? 1 : 0);
      if (sig === castSig) return;
      castSig = sig;
      var items = [{ label: "Este teléfono", sub: "Reproducir aquí", on: !castName && !tv.on, fn: function () { if (tv.on) tvPick(false); else castPick(-1, ""); } }];
      if (tv.available || tv.on) items.push({ label: "Pantalla inalámbrica", sub: "Solo el video en la tele; los controles quedan en el teléfono", on: !!tv.on, fn: function () { tvPick(!tv.on); } });
      else items.push({ label: "Pantalla inalámbrica", sub: "Activa la proyección desde el panel del teléfono y vuelve a abrir este menú", fn: function () {} });
      devs.forEach(function (d) { items.push({ label: d.name, sub: "Chromecast", on: !!castName && d.name === castName, fn: function () { castPick(d.id, d.name); } }); });
      if (!devs.length && !tv.available && !tv.on) items.push({ label: "Buscando dispositivos…", sub: "Usa la misma red Wi-Fi que tu Chromecast", fn: function () {} });
      fillSheet("Transmitir a", items, "");
    }).catch(function () {
      if (sheetOpen && sheetKind === "cast") fillSheet("Transmitir a", [], "La transmisión no está disponible en esta versión de la app.");
    });
  }
  function tvPick(on) {
    msg(on ? "Enviando el video a la tele…" : "Volviendo al teléfono…");
    call("tvTo", { on: on }).then(function (r) {
      var onNow = !!(r && r.on);
      ui.cast.classList.toggle("on", onNow);
      root.classList.toggle("znp-casting", onNow);
      ui.cb.textContent = onNow ? "Reproduciendo en la tele" : "";
      msg(onNow ? "Reproduciendo en la tele" : "Reproduciendo en el teléfono");
      castSig = "";
    }).catch(function () { msg("No se pudo usar la pantalla de la tele"); });
  }
  function castPick(id, name) {
    msg(id < 0 ? "Volviendo al teléfono…" : "Conectando con " + name + "…");
    call("castTo", { id: id }).then(function (r) {
      castName = (r && r.current) || "";
      ui.cast.classList.toggle("on", !!castName);
      root.classList.toggle("znp-casting", !!castName);
      ui.cb.textContent = castName ? "Transmitiendo a " + castName : "";
      msg(castName ? "Transmitiendo a " + castName : "Reproduciendo en el teléfono");
    }).catch(function () { msg("No se pudo transmitir a ese dispositivo"); });
  }

  function speedBadge() { if (ui.speedB) ui.speedB.textContent = rate === 1 ? "" : rate + "x"; }

  /* ---------- cambiar de fuente sin perder el minuto ---------- */
  function switchSource(x) {
    var Z = W.ZAM, m = meta;
    if (!Z || !Z.resolve || !m) return;
    msg("Cambiando de fuente…");
    Z.resolve(m, x.snap).then(function (r) {
      if (!isOpen) return;
      var t = st.time, title = curTitle;
      close(true);
      setTimeout(function () { open(r.url, title, null, r.meta, t); }, 250);
    }).catch(function (e) { msg((e && (e.userMessage || e.message)) || "No se pudo abrir esa fuente"); });
  }

  /* ---------- recordar idioma de audio y subtítulos entre episodios ---------- */
  function trkMap() { try { return JSON.parse(localStorage.getItem("znp_trk") || "{}") || {}; } catch (e) { return {}; } }
  function trkKey() { return meta && meta.type === "tv" && meta.key ? meta.key : ""; }
  function norm(x) { return String(x == null ? "" : x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
  function langOf(name) {
    var n = norm(name), br = n.match(/\[([^\]]+)\]/g) || [], c = "";
    br.forEach(function (b) { b = b.slice(1, -1).trim(); if (!/^(original|forced|default|sdh|cc)$/.test(b)) c = b; });
    if (!c) c = n;
    if (/spanish|espanol|castellano|latino|\bspa\b/.test(c)) return "es";
    if (/english|ingles|\beng\b/.test(c)) return "en";
    if (/portug/.test(c)) return "pt";
    if (/french|frances|francais/.test(c)) return "fr";
    if (/german|aleman|deutsch/.test(c)) return "de";
    if (/italian/.test(c)) return "it";
    if (/japanese|japones/.test(c)) return "ja";
    if (/korean|coreano/.test(c)) return "ko";
    return c.replace(/[^a-z]/g, "").slice(0, 12);
  }
  function describe(x, list) {
    var n = norm(x.name), ord = 0;
    for (var i = 0; i < list.length; i++) { if (list[i] === x) break; if (list[i].name === x.name) ord++; }
    return { name: x.name || "", lang: langOf(x.name), vr: /latino/.test(n) ? "lat" : (/castellano/.test(n) ? "cas" : ""), ord: ord };
  }
  function pickTrack(list, p) {
    var best = null, bs = 0;
    list.forEach(function (x) {
      if (Number(x.id) === -1) return;
      var d = describe(x, list), sc = 0;
      if (x.name === p.name) sc = d.ord === p.ord ? 100 : 95;
      else if (d.lang && d.lang === p.lang) sc = 40 + (d.vr && d.vr === p.vr ? 10 : 0) + (norm(x.name).replace(/\d+/g, "") === norm(p.name).replace(/\d+/g, "") ? 5 : 0);
      if (sc > bs) { bs = sc; best = x; }
    });
    return best;
  }
  function remember(kind, x, list) {
    var k = trkKey(); if (!k) return;
    if (kind === "a" && Number(x.id) === -1) return;
    var m = trkMap(), p = m[k] || {};
    if (kind === "a") p.a = describe(x, list); else p.s = Number(x.id) === -1 ? { off: true } : describe(x, list);
    m[k] = p;
    var keys = Object.keys(m); if (keys.length > 60) delete m[keys[0]];
    try { localStorage.setItem("znp_trk", JSON.stringify(m)); } catch (e) {}
  }
  function applyPrefs() {
    var k = trkKey(); if (!k || applied || !isOpen) return;
    var retry = function () { if (++applyTry < 8 && isOpen) applyT = setTimeout(applyPrefs, 1500); };
    call("getTracks").then(function (t) {
      if (!isOpen || applied) return;
      var A = (t && t.audio) || [], S = (t && t.subs) || [];
      if (!A.length && !S.length) { retry(); return; }
      applied = true;
      var m = trkMap(), p = m[k] || {}, had = !!(p.a || p.s), ac = Number(t.audioCurrent), sc = Number(t.subCurrent);
      if (p.a) { var x = pickTrack(A, p.a); if (x && Number(x.id) !== ac) { call("setAudio", { id: Number(x.id) }).catch(noop); ac = Number(x.id); } }
      if (p.s) {
        if (p.s.off) { if (sc !== -1) call("setSubtitle", { id: -1 }).catch(noop); sc = -1; }
        else { var y = pickTrack(S, p.s); if (y && Number(y.id) !== sc) { call("setSubtitle", { id: Number(y.id) }).catch(noop); sc = Number(y.id); } }
      }
      /* si aún no había preferencia, guardo lo que se está usando para el siguiente episodio */
      if (!p.a) { var ca = A.filter(function (z) { return Number(z.id) === ac && ac !== -1; })[0]; if (ca) p.a = describe(ca, A); }
      if (!p.s && S.length) { var cs = S.filter(function (z) { return Number(z.id) === sc; })[0]; p.s = sc === -1 || !cs ? { off: true } : describe(cs, S); }
      if (!had || p.a || p.s) { m[k] = p; try { localStorage.setItem("znp_trk", JSON.stringify(m)); } catch (e) {} }
    }).catch(retry);
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
      if (wantUntil) {
        if (st.playing === wantPlay || Date.now() > wantUntil) wantUntil = 0; else st.playing = wantPlay;
      }
      if (!resumed && st.length > 0) {
        resumed = true;
        var want = startAt, saved = want || Number(posMap()[curTitle]) || 0;
        startAt = 0;
        if (saved > (want ? 3000 : 30000) && saved < st.length - (want ? 5000 : 60000)) { call("seekTo", { ms: saved }).catch(noop); if (!want) msg("Continuando desde " + fmt(saved)); }
      }
      if (!applied && !applyT && st.length > 0) applyT = setTimeout(applyPrefs, 1200);
      savePos(false);
      if (!dragging) paint();
    });
    p.addListener("znpEnded", function () {
      if (!isOpen) return;
      var tv = isTv(); st.time = st.length; try { if (meta && W.ZCW) W.ZCW.progress(meta, st.length, st.length, true); } catch (e) {} meta = null; close(true);
      if (tv && typeof W.addonStep === "function") W.addonStep(1);
    });
    p.addListener("znpPip", function (e) {
      if (!isOpen) return;
      var on = !!(e && e.on);
      root.classList.toggle("znp-pip", on);
      if (on) { closeSheet(); } else { showUi(); }
    });
    p.addListener("znpTv", function (e) {
      if (!isOpen) return;
      var on = !!(e && e.on);
      ui.cast.classList.toggle("on", on);
      root.classList.toggle("znp-casting", on);
      ui.cb.textContent = on ? "Reproduciendo en la tele" : "";
      castSig = "";
      if (!on) msg("Volviendo al teléfono");
    });
    p.addListener("znpError", function () {
      if (!isOpen) return;
      var fb = fallback; close(true);
      if (fb) { say("VLC no pudo con esta fuente; se usa el reproductor interno"); try { var pn = D.getElementById("addonStreamsPanel"); if (pn) pn.hidden = true; } catch (e2) {} fb(); } else say("No se pudo reproducir este video. Prueba otra fuente.");
    });
  }

  /* ---------- abrir y cerrar ---------- */
  function open(url, title, fb, mt, startMs) {
    var p = plug(); if (!p) return false;
    build(); listen(p);
    meta = mt || null; thumbC = {}; thumbBusy = false; thumbOk = true; thumbFail = 0; thumbWant = -1;
    curTitle = title || ""; fallback = fb || (origPlay ? function () { origPlay({ download: url }, title); } : null); resumed = false; rate = 1; aspect = "fit"; quality = 0; lastSave = 0;
    castName = ""; castSig = ""; clearInterval(castPoll); if (ui.cast) { ui.cast.classList.remove("on"); } root.classList.remove("znp-casting");
    startAt = Number(startMs) || 0; applied = false; applyTry = 0; clearTimeout(applyT); applyT = 0;
    st = { time: 0, length: 0, playing: false, buffering: true }; wantUntil = 0;
    ui.title.textContent = curTitle || "Reproduciendo";
    var c = W._addonCtx;
    ui.sub.textContent = c && c.type === "tv" ? "Temporada " + c.season + " · Episodio " + c.episode : "";
    ui.next.hidden = !isTv();
    speedBadge(); ui.src.hidden = !(meta && W.ZAM && W.ZAM.sources);
    sheetOpen = false; ui.sheet.hidden = true; dragging = false;
    isOpen = true; root.hidden = false; D.documentElement.classList.add("znp-on");
    paint(); showUi(); attachBack();
    p.play({ url: url, title: curTitle, referer: (W.__zplHdr && (W.__zplHdr.Referer || W.__zplHdr.referer)) || "", userAgent: (W.__zplHdr && (W.__zplHdr["User-Agent"] || W["__zplHdr"]["user-agent"])) || "" }).catch(function (e) {
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
    clearTimeout(hideT); clearTimeout(tapT); clearTimeout(applyT); applyT = 0;
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
