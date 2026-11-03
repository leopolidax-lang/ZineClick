/* Zynora · web-player.js
   Controles del reproductor de la WEB con el mismo diseño que el reproductor de la app (native-player.js):
   íconos de línea fina sin cuadro ni círculo, botones ±10 s animados, barra con degradado, paneles laterales
   translúcidos (audio, subtítulos, calidad, velocidad, pantalla, fuentes) y toques como en el celular.
   Se monta encima del Plyr que ya existe en index.html; si Plyr no carga, no hace nada y quedan los controles de siempre. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.__zwpLoaded) return;
  W.__zwpLoaded = true;

  function noop() {}
  function $(id) { return D.getElementById(id); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") + m : m) + ":" + (x < 10 ? "0" : "") + x;
  }
  function plyr() { try { return typeof rdPlyr !== "undefined" ? rdPlyr : null; } catch (e) { return null; } }
  function hls() { try { return typeof rdHls !== "undefined" ? rdHls : null; } catch (e) { return null; } }

  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    skip: '<svg viewBox="0 0 24 24"><path d="M12 4.6A7.9 7.9 0 1 1 5.95 7.42"/><path d="M14.7 2.2 12 4.6l2.7 2.4"/></svg><b>10</b>',
    audio: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.6l4.4 4V5.5l-4.4 4z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.3 6.6a8 8 0 0 1 0 10.8"/></svg>',
    quality: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M7.5 9.5v5M7.5 12h3M10.5 9.5v5M14 9.5h1.6a1.9 1.9 0 0 1 0 5H14z"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M7 10.5h4M13.5 10.5H17M7 14.5h2.6M12.2 14.5H17"/></svg>',
    speed: '<svg viewBox="0 0 24 24"><path d="M4.6 17.5a8.5 8.5 0 1 1 14.8 0"/><path d="M12 14l3.8-4.6"/><circle cx="12" cy="14.2" r="1.1"/></svg>',
    aspect: '<svg viewBox="0 0 24 24"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6.5 5.5v13l9.5-6.5z"/><path d="M19 5.5v13"/></svg>',
    src: '<svg viewBox="0 0 24 24"><path d="M12 3.5 21 8.5 12 13.5 3 8.5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 16.5l9 5 9-5"/></svg>',
    cast: '<svg viewBox="0 0 24 24"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 20h.01"/></svg>',
    check: '<svg class="zwp-ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.6l4.4 4V5.5l-4.4 4z"/><path d="M15.8 9.4a3.6 3.6 0 0 1 0 5.2"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5v5h3.6l4.4 4V5.5l-4.4 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><rect x="12" y="11.5" width="6.5" height="4.5" rx="1.2"/></svg>',
    fs: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>',
    fsx: '<svg viewBox="0 0 24 24"><path d="M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7"/></svg>'
  };

  var CSS = '' +
    /* ocultar los controles de Plyr cuando los nuestros están activos */
    '#rdPlayer.zwp-on .plyr__controls,#rdPlayer.zwp-on .plyr__control--overlaid,#rdPlayer.zwp-on .rd-x{display:none!important}' +
    '#zwpRoot{position:absolute;inset:0;z-index:5;pointer-events:none;color:#fff;font:600 14px/1.3 Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;overflow:hidden;--zwp-end:var(--purple,#a78bfa)}' +
    'html[data-accent="violet"] #zwpRoot{--zwp-end:#ff67c8}html[data-accent="neutral"] #zwpRoot{--zwp-end:#9fb4ff}' +
    '#zwpRoot.zwp-hide{cursor:none}' +
    '#zwpRoot button{font:inherit;color:inherit;border:0;background:none;padding:0;margin:0;cursor:pointer;outline:0;box-shadow:none;border-radius:0;min-height:0}' +
    '#zwpRoot svg{fill:currentColor;width:24px;height:24px;display:block}' +
    '.zwp-tap{position:absolute;inset:0;z-index:1;pointer-events:auto}' +
    '.zwp-ui{position:absolute;inset:0;z-index:2;pointer-events:none;transition:opacity .22s}' +
    '.zwp-ui::before,.zwp-ui::after{content:"";position:absolute;left:0;right:0;pointer-events:none}' +
    '.zwp-ui::before{top:0;height:34%;background:linear-gradient(rgba(0,0,0,.78),transparent)}' +
    '.zwp-ui::after{bottom:0;height:50%;background:linear-gradient(transparent,rgba(0,0,0,.86))}' +
    '#zwpRoot.zwp-hide .zwp-ui{opacity:0}' +
    '#zwpRoot.zwp-hide .zwp-ui *{pointer-events:none!important}' +
    '.zwp-top{position:absolute;z-index:1;top:0;left:0;right:0;display:flex;align-items:center;gap:12px;pointer-events:auto;padding:max(env(safe-area-inset-top),14px) max(env(safe-area-inset-right),22px) 0 max(env(safe-area-inset-left),22px)}' +
    '#zwpRoot .zwp-round{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);transition:transform .15s,opacity .15s}' +
    '#zwpRoot .zwp-round:active{transform:scale(.9);opacity:.8}' +
    '.zwp-ttl{min-width:0;display:flex;flex-direction:column}' +
    '.zwp-ttl b{font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.zwp-ttl small{color:#c8d0e6;font-weight:600}.zwp-ttl small:empty{display:none}' +
    '.zwp-r{margin-left:auto;display:flex;align-items:center}' +
    '.zwp-mid{position:absolute;z-index:1;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;justify-content:center;align-items:center;gap:clamp(28px,12vw,110px);pointer-events:none}' +
    '.zwp-mid button{pointer-events:auto}' +
    '#zwpRoot .zwp-skip{position:relative;width:60px;height:60px;display:grid;place-items:center;color:rgba(255,255,255,.95);transition:transform .15s,opacity .15s}' +
    '#zwpRoot .zwp-skip:active{transform:scale(.88);opacity:.75}' +
    '#zwpRoot .zwp-skip svg{width:54px;height:54px;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 8px rgba(0,0,0,.55))}' +
    '#zwpRoot .zwp-skip.f svg{transform:scaleX(-1)}' +
    '#zwpRoot .zwp-skip b{position:absolute;left:0;right:0;top:53%;transform:translateY(-50%);font-size:12px;font-weight:600;letter-spacing:.3px;text-align:center;text-shadow:0 1px 6px rgba(0,0,0,.6)}' +
    '#zwpRoot .zwp-skip.spin svg{animation:zwpSpinB .6s cubic-bezier(.25,.8,.25,1)}' +
    '#zwpRoot .zwp-skip.f.spin svg{animation:zwpSpinF .6s cubic-bezier(.25,.8,.25,1)}' +
    '#zwpRoot .zwp-skip.spin b{animation:zwpPop .6s ease-out}' +
    '@keyframes zwpSpinB{from{transform:rotate(0)}to{transform:rotate(-360deg)}}' +
    '@keyframes zwpSpinF{from{transform:scaleX(-1) rotate(0)}to{transform:scaleX(-1) rotate(-360deg)}}' +
    '@keyframes zwpPop{0%{transform:translateY(-50%) scale(1)}35%{transform:translateY(-50%) scale(1.28);color:var(--cyan,#64f4ff)}100%{transform:translateY(-50%) scale(1)}}' +
    '#zwpRoot .zwp-big{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--cyan,#64f4ff),var(--zwp-end));color:#06101a;box-shadow:0 8px 30px rgba(0,0,0,.45);transition:transform .15s,opacity .2s}' +
    '#zwpRoot .zwp-big:active{transform:scale(.92)}' +
    '#zwpRoot .zwp-big svg{width:40px;height:40px}' +
    '#zwpRoot.zwp-busy .zwp-big{opacity:0;pointer-events:none}' +
    '.zwp-bot{position:absolute;z-index:1;left:0;right:0;bottom:0;pointer-events:auto;padding:0 max(env(safe-area-inset-right),24px) max(env(safe-area-inset-bottom),14px) max(env(safe-area-inset-left),24px)}' +
    '.zwp-bar{position:relative;height:34px;display:flex;align-items:center;touch-action:none;cursor:pointer}' +
    '.zwp-trk{position:absolute;left:0;right:0;height:4px;border-radius:4px;background:rgba(255,255,255,.25)}' +
    '.zwp-buf{position:absolute;left:0;height:4px;border-radius:4px;width:0;background:rgba(255,255,255,.28)}' +
    '.zwp-fill{position:absolute;left:0;height:4px;border-radius:4px;width:0;background:linear-gradient(90deg,var(--cyan,#64f4ff),var(--zwp-end));box-shadow:0 0 12px rgba(var(--acc-rgb,100,244,255),.35)}' +
    '.zwp-knob{position:absolute;left:0;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(var(--acc-rgb,100,244,255),.28),0 0 14px rgba(var(--acc-rgb,100,244,255),.45);transition:transform .12s}' +
    '.zwp-bar:hover .zwp-knob{transform:scale(1.15)}' +
    '.zwp-pv{position:absolute;bottom:38px;left:0;transform:translateX(-50%);display:none;pointer-events:none}' +
    '.zwp-pv.on{display:block}' +
    '.zwp-pv span{display:block;padding:3px 10px;border-radius:8px;background:rgba(0,0,0,.72);font-size:13px;white-space:nowrap}' +
    '.zwp-row{display:flex;justify-content:space-between;color:#d6dcef;font-size:13px;margin-top:-2px}' +
    '.zwp-acts{display:flex;align-items:center;gap:clamp(6px,2.2vw,22px);margin-top:2px}' +
    '.zwp-sp{flex:1}' +
    '#zwpRoot .zwp-ic{position:relative;flex:none;display:grid;place-items:center;min-width:46px;height:46px;padding:0;color:rgba(255,255,255,.92);transition:transform .15s,opacity .15s,color .15s}' +
    '#zwpRoot .zwp-ic svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 6px rgba(0,0,0,.55))}' +
    '#zwpRoot .zwp-ic:active{transform:scale(.86);opacity:.7}' +
    '#zwpRoot .zwp-ic:hover{color:#fff}' +
    '#zwpRoot [hidden]{display:none!important}' +
    '#zwpRoot .zwp-ic small{position:absolute;right:-1px;top:3px;font-size:10px;font-weight:800;line-height:1;color:var(--cyan,#64f4ff);text-shadow:0 1px 4px rgba(0,0,0,.7)}' +
    '#zwpRoot .zwp-ic.on{color:var(--cyan,#64f4ff)}' +
    /* volumen (solo con ratón) */
    '.zwp-volw{display:flex;align-items:center}' +
    '.zwp-volw input{width:76px;margin:0;opacity:0;visibility:hidden;transition:opacity .2s .1s,visibility 0s .35s;accent-color:var(--cyan,#64f4ff);height:4px;cursor:pointer}' +
    '.zwp-volw .zwp-ic:hover + input,.zwp-volw input:hover,.zwp-volw input:active{opacity:1;visibility:visible;transition-delay:0s}' +
    '@media (hover:none){.zwp-volw{display:none}}' +
    /* tarjeta lateral: pegada a la pared, sin borde de ese lado */
    '.zwp-sheet{position:absolute;z-index:4;top:max(env(safe-area-inset-top),12px);bottom:max(env(safe-area-inset-bottom),12px);right:env(safe-area-inset-right,0px);width:min(350px,54%);display:flex;flex-direction:column;padding:10px 8px 8px;background:rgba(14,18,32,.66);-webkit-backdrop-filter:blur(22px) saturate(1.3);backdrop-filter:blur(22px) saturate(1.3);border:1px solid rgba(255,255,255,.13);border-right:0;border-radius:22px 0 0 22px;box-shadow:-14px 0 44px rgba(0,0,0,.45),inset 1px 0 0 rgba(255,255,255,.06);pointer-events:auto;animation:zwpIn .24s cubic-bezier(.2,.8,.2,1)}' +
    '@keyframes zwpIn{from{transform:translateX(36px);opacity:0}to{transform:none;opacity:1}}' +
    '.zwp-sh-t{font-size:15px;font-weight:800;letter-spacing:.2px;padding:8px 14px 10px;color:#fff}' +
    '.zwp-sh-l{overflow-y:auto;flex:1;scrollbar-width:none;padding:2px 2px 4px}.zwp-sh-l::-webkit-scrollbar{display:none}' +
    '#zwpRoot .zwp-sh-l button{display:flex;width:100%;text-align:left;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;color:#d6dcef;font-weight:600}' +
    '#zwpRoot .zwp-sh-l button:hover,#zwpRoot .zwp-sh-l button:active{background:rgba(255,255,255,.08)}' +
    '#zwpRoot .zwp-sh-l button.on{background:rgba(var(--acc-rgb,100,244,255),.14);color:var(--cyan,#64f4ff)}' +
    '.zwp-sh-l .zwp-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
    '.zwp-sh-l .zwp-tx small{color:#8f9ab5;font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#zwpRoot svg.zwp-ck{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;flex:none;margin-left:auto}' +
    '.zwp-sh-e{padding:14px 12px;color:#9aa6c1;font-weight:500;line-height:1.45}' +
    '.zwp-flash{position:absolute;z-index:3;top:50%;margin-top:-22px;padding:10px 18px;border-radius:999px;background:rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .2s}' +
    '.zwp-flash.on{opacity:1}.zwp-flash.l{left:14%}.zwp-flash.r{right:14%}' +
    '.zwp-msg{position:absolute;z-index:3;left:50%;bottom:92px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:rgba(0,0,0,.72);opacity:0;pointer-events:none;transition:opacity .2s;white-space:nowrap;max-width:80%;overflow:hidden;text-overflow:ellipsis}' +
    '.zwp-msg.on{opacity:1}' +
    /* reproductor pequeño (celular en vertical, ventana angosta) */
    '#zwpRoot.zwp-s .zwp-top{padding:8px 12px 0;gap:8px}' +
    '#zwpRoot.zwp-s .zwp-round{width:38px;height:38px}' +
    '#zwpRoot.zwp-s .zwp-ttl b{font-size:14px}' +
    '#zwpRoot.zwp-s .zwp-mid{gap:clamp(18px,10vw,60px)}' +
    '#zwpRoot.zwp-s .zwp-skip{width:44px;height:44px}#zwpRoot.zwp-s .zwp-skip svg{width:40px;height:40px}#zwpRoot.zwp-s .zwp-skip b{font-size:10px}' +
    '#zwpRoot.zwp-s .zwp-big{width:54px;height:54px}#zwpRoot.zwp-s .zwp-big svg{width:30px;height:30px}' +
    '#zwpRoot.zwp-s .zwp-bot{padding:0 12px 4px}' +
    '#zwpRoot.zwp-s .zwp-bar{height:28px}' +
    '#zwpRoot.zwp-s .zwp-ic{min-width:38px;height:38px}#zwpRoot.zwp-s .zwp-ic svg{width:22px;height:22px}' +
    '#zwpRoot.zwp-s .zwp-acts{gap:2px}' +
    '#zwpRoot.zwp-s .zwp-sheet{width:min(300px,72%);top:6px;bottom:6px}' +
    '#zwpRoot.zwp-s .zwp-msg{bottom:76px}';
  /* base: los elementos del modo Elegante no se ven en el modo colorido */
  CSS += '#zwpRoot .zwp-intro,#zwpRoot .zwp-nx{display:none}';

  /* base: la píldora "Seguir viendo" solo se ve en el modo Elegante (y no en ventanas muy angostas) */
  CSS += '#zwpRoot .zwp-pill{display:inline-flex;align-items:center;flex:none;height:38px;padding:0 18px;border-radius:999px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(var(--acc-rgb,100,244,255),.5);color:var(--cyan,#64f4ff);font-size:14px;font-weight:700;white-space:nowrap;transition:background .15s,opacity .15s}' +
    '#zwpRoot .zwp-pill:hover{background:rgba(var(--acc-rgb,100,244,255),.18)}#zwpRoot .zwp-pill:active{opacity:.7}' +
    'html:not([data-style=elegant]) #zwpRoot .zwp-cwp{background:linear-gradient(135deg,var(--cyan,#64f4ff),var(--zwp-end));color:#06101a;font-weight:800}' +
    'html:not([data-style=elegant]) #zwpRoot .zwp-cwg u{background:linear-gradient(90deg,var(--cyan,#64f4ff),var(--zwp-end))}' +
    '#zwpRoot .zwp-cw{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;padding:calc(max(env(safe-area-inset-top),14px) + 62px) 0 max(env(safe-area-inset-bottom),34px);background:linear-gradient(rgba(0,0,0,.8),rgba(0,0,0,.62));animation:zwpCw .28s ease;pointer-events:auto}' +
    '#zwpRoot .zwp-cw[hidden]{display:none}' +
    '@keyframes zwpCw{from{opacity:0}to{opacity:1}}' +
    '#zwpRoot .zwp-cw-h{display:flex;gap:10px;padding:0 max(env(safe-area-inset-right),24px) 14px max(env(safe-area-inset-left),24px)}' +
    '#zwpRoot .zwp-cwp{display:inline-flex;align-items:center;height:36px;padding:0 18px;border-radius:999px;background:#fff;color:#000;font-size:15px;font-weight:600}' +
    '#zwpRoot .zwp-cwp:active{opacity:.75}' +
    '#zwpRoot .zwp-cw-r{display:flex;gap:14px;overflow-x:auto;padding:2px max(env(safe-area-inset-right),24px) 10px max(env(safe-area-inset-left),24px);scrollbar-width:none}' +
    '#zwpRoot .zwp-cw-r::-webkit-scrollbar{display:none}' +
    '#zwpRoot .zwp-cwc{flex:none;width:clamp(150px,28%,260px);display:flex;flex-direction:column;gap:8px;text-align:left}' +
    '#zwpRoot .zwp-cwc:hover{opacity:.9}#zwpRoot .zwp-cwc:active{opacity:.75}' +
    '#zwpRoot .zwp-cwt{position:relative;display:block;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#15181f;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}' +
    '#zwpRoot .zwp-cwt img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
    '#zwpRoot .zwp-cwt::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(0,0,0,.55))}' +
    '#zwpRoot .zwp-cwg{position:absolute;z-index:1;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.3)}' +
    '#zwpRoot .zwp-cwg u{display:block;height:100%;background:#fff;text-decoration:none}' +
    '#zwpRoot .zwp-cwx{display:flex;flex-direction:column;gap:1px;min-width:0;padding:0 4px}' +
    '#zwpRoot .zwp-cwx b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#zwpRoot .zwp-cwx small{font-size:13px;font-weight:500;color:rgba(255,255,255,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#zwpRoot.zwp-s .zwp-cw{padding-top:56px;padding-bottom:max(env(safe-area-inset-bottom),20px)}#zwpRoot.zwp-s .zwp-cwc{width:clamp(130px,60%,220px)}#zwpRoot.zwp-s .zwp-pill{display:none!important}' +
    /* con el panel abierto: se ocultan los controles centrales e inferiores, la barra de arriba queda */
    '#zwpRoot.zwp-cwo .zwp-ui{z-index:4}' +
    '#zwpRoot.zwp-cwo .zwp-ui::after{display:none}' +
    '#zwpRoot.zwp-cwo .zwp-mid,#zwpRoot.zwp-cwo .zwp-bot,#zwpRoot.zwp-cwo .zwp-ttl{visibility:hidden}' +
    '#zwpRoot.zwp-cwo .zwp-intro,#zwpRoot.zwp-cwo .zwp-nx{display:none!important}';

  CSS += [
    "html[data-style=elegant] #zwpRoot .zwp-pill{display:inline-flex;align-items:center;flex:none;height:36px;padding:0 18px;border-radius:999px;background:rgba(255,255,255,.14);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);font-size:15px;font-weight:600;color:#fff;white-space:nowrap}",
    "html[data-style=elegant] #zwpRoot .zwp-pill:hover{background:rgba(255,255,255,.22)}",
    "html[data-style=elegant] #zwpRoot .zwp-pill:active{opacity:.7}",
    "#zwpRoot .zwp-pill[hidden]{display:none!important}",
    "html[data-style=elegant] #zwpRoot .zwp-ui{transition:opacity .5s cubic-bezier(.4,0,.2,1)}",
    "html[data-style=elegant] #zwpRoot .zwp-top,html[data-style=elegant] #zwpRoot .zwp-bot{transition:transform .5s cubic-bezier(.4,0,.2,1)}",
    "html[data-style=elegant] #zwpRoot.zwp-hide .zwp-top{transform:translateY(-8px)}",
    "html[data-style=elegant] #zwpRoot.zwp-hide .zwp-bot{transform:translateY(8px)}",
    "html[data-style=elegant] #zwpRoot .zwp-ui::before{height:30%;background:linear-gradient(rgba(0,0,0,.6),rgba(0,0,0,.22) 60%,transparent)}",
    "html[data-style=elegant] #zwpRoot .zwp-ui::after{height:44%;background:linear-gradient(transparent,rgba(0,0,0,.34) 38%,rgba(0,0,0,.8))}",
    "html[data-style=elegant] #zwpRoot .zwp-ttl b{font-size:19px;font-weight:600;letter-spacing:-.01em}",
    "html[data-style=elegant] #zwpRoot .zwp-ttl small{color:rgba(255,255,255,.62);font-weight:500;font-size:14px}",
    "html[data-style=elegant] #zwpRoot .zwp-round{background:rgba(255,255,255,.14);border:0;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}",
    "html[data-style=elegant] #zwpRoot .zwp-big{width:88px;height:88px;background:rgba(255,255,255,.16);color:#fff;-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}",
    "html[data-style=elegant] #zwpRoot .zwp-big svg{width:42px;height:42px}",
    "html[data-style=elegant] #zwpRoot.zwp-s .zwp-big{width:60px;height:60px}",
    "html[data-style=elegant] #zwpRoot.zwp-s .zwp-big svg{width:32px;height:32px}",
    "html[data-style=elegant] #zwpRoot .zwp-skip svg{stroke-width:1.2}",
    "html[data-style=elegant] #zwpRoot .zwp-ic svg{stroke-width:1.4}",
    "html[data-style=elegant] #zwpRoot .zwp-bar{height:30px}",
    "html[data-style=elegant] #zwpRoot .zwp-trk,html[data-style=elegant] #zwpRoot .zwp-fill{height:3px;border-radius:3px;transition:height .18s ease}",
    "html[data-style=elegant] #zwpRoot .zwp-buf{height:3px;border-radius:3px;transition:height .18s ease}",
    "html[data-style=elegant] #zwpRoot .zwp-bar:active .zwp-trk,html[data-style=elegant] #zwpRoot .zwp-bar:active .zwp-fill,html[data-style=elegant] #zwpRoot .zwp-bar:active .zwp-buf,html[data-style=elegant] #zwpRoot .zwp-bar:hover .zwp-trk,html[data-style=elegant] #zwpRoot .zwp-bar:hover .zwp-fill,html[data-style=elegant] #zwpRoot .zwp-bar:hover .zwp-buf{height:7px}",
    "html[data-style=elegant] #zwpRoot .zwp-fill{box-shadow:none}",
    "html[data-style=elegant] #zwpRoot .zwp-knob{width:14px;height:14px;margin-left:-7px;background:#fff;box-shadow:0 0 10px rgba(0,0,0,.45);transform:scale(0);transition:transform .18s}",
    "html[data-style=elegant] #zwpRoot .zwp-bar:active .zwp-knob,html[data-style=elegant] #zwpRoot .zwp-bar:hover .zwp-knob{transform:scale(1)}",
    "html[data-style=elegant] #zwpRoot .zwp-row{font-size:13px;font-weight:500;color:rgba(255,255,255,.62);font-variant-numeric:tabular-nums;margin-top:0}",
    "html[data-style=elegant] #zwpRoot .zwp-intro,html[data-style=elegant] #zwpRoot .zwp-nx{position:absolute;z-index:3;right:max(env(safe-area-inset-right),24px);bottom:128px;opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .4s,transform .4s,bottom .5s cubic-bezier(.4,0,.2,1)}",
    "html[data-style=elegant] #zwpRoot .zwp-intro{display:block;padding:12px 22px;border-radius:12px;background:rgba(32,32,36,.62);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);-webkit-backdrop-filter:blur(22px) saturate(1.3);backdrop-filter:blur(22px) saturate(1.3);font-size:15px;font-weight:600;color:#fff}",
    "html[data-style=elegant] #zwpRoot .zwp-intro:active{background:rgba(70,70,76,.78)}",
    "html[data-style=elegant] #zwpRoot .zwp-intro.on,html[data-style=elegant] #zwpRoot .zwp-nx.on{opacity:1;transform:none;pointer-events:auto}",
    "html[data-style=elegant] #zwpRoot.zwp-hide .zwp-intro,html[data-style=elegant] #zwpRoot.zwp-hide .zwp-nx{bottom:32px}",
    "html[data-style=elegant] #zwpRoot .zwp-nx{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:18px;background:rgba(28,28,30,.74);-webkit-backdrop-filter:blur(26px) saturate(1.4);backdrop-filter:blur(26px) saturate(1.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 12px 40px rgba(0,0,0,.45);color:#fff}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr{position:relative;width:46px;height:46px;flex:none}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr svg{width:46px;height:46px;fill:none;display:block}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr svg:first-child{transform:rotate(-90deg)}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr circle{fill:none;stroke-width:2.5}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr .bg{stroke:rgba(255,255,255,.2)}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr .fg{stroke:#fff;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:0}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr.run .fg{animation:zwp-ring var(--cd,5s) linear forwards}",
    "@keyframes zwp-ring{to{stroke-dashoffset:100}}",
    "html[data-style=elegant] #zwpRoot .zwp-nxr .zwp-nxg{position:absolute;left:13px;top:13px;width:20px;height:20px;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    "html[data-style=elegant] #zwpRoot .zwp-nxb b{display:block;font-size:15px;font-weight:600;white-space:nowrap}",
    "html[data-style=elegant] #zwpRoot .zwp-nxb b span{display:inline-block;min-width:.7em;text-align:center;font-variant-numeric:tabular-nums}",
    "html[data-style=elegant] #zwpRoot .zwp-nxa{display:flex;gap:8px;margin-top:9px}",
    "html[data-style=elegant] #zwpRoot .zwp-nxa button{padding:7px 14px;border-radius:9px;background:rgba(255,255,255,.16);font-size:13px;font-weight:600;color:#fff}",
    "html[data-style=elegant] #zwpRoot .zwp-nxa button.go{background:#fff;color:#000}",
    "html[data-style=elegant] #zwpRoot .zwp-nxa button:active{opacity:.7}",
    "#zwpRoot.zwp-pip .zwp-intro,#zwpRoot.zwp-pip .zwp-nx{display:none!important}",
    "html[data-style=elegant] #zwpRoot.zwp-s .zwp-intro,html[data-style=elegant] #zwpRoot.zwp-s .zwp-nx{right:12px;bottom:98px}",
    "html[data-style=elegant] #zwpRoot.zwp-hide.zwp-s .zwp-intro,html[data-style=elegant] #zwpRoot.zwp-hide.zwp-s .zwp-nx{bottom:20px}",
    "html[data-style=elegant] #zwpRoot .zwp-sh-h{padding:12px 14px 4px;font-size:12px;font-weight:600;color:rgba(255,255,255,.5)}",
    "html.reduce-motion html[data-style=elegant] #zwpRoot .zwp-ui,html.reduce-motion html[data-style=elegant] #zwpRoot .zwp-top,html.reduce-motion html[data-style=elegant] #zwpRoot .zwp-bot,html.reduce-motion html[data-style=elegant] #zwpRoot .zwp-intro,html.reduce-motion html[data-style=elegant] #zwpRoot .zwp-nx{transition-duration:.01s!important}"
  ].join("");


  var ZR = null, ui = {}, v = null, host = null, bound = false, fsBound = false;
  var sheetOpen = false, sheetKind = "", dragging = false, dragT = 0;
  var hideT = 0, msgT = 0, flashT = 0, tapT = 0, lastTap = 0, lastSide = 0, mvT = 0;
  var aspect = "fit", shownPlay = null, flashAcc = 0, flashDir = 0;
  var cwOpen = false, TMI = "https://image.tmdb.org/t/p/w500";

  /* ---------- construcción ---------- */
  function build() {
    if (ZR) return;
    subSt = subLoad();
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    ZR = D.createElement("div"); ZR.id = "zwpRoot";
    ZR.innerHTML =
      '<div class="zwp-tap" id="zwpTap"></div>' +
      '<div class="zwp-flash l" id="zwpFl"></div><div class="zwp-flash r" id="zwpFr"></div>' +
      '<div class="zwp-msg" id="zwpMsg"></div>' +
      '<button class="zwp-intro" id="zwpIntro">Saltar intro</button>' +
      '<div class="zwp-nx" id="zwpNx"><div class="zwp-nxr" id="zwpNxR"><svg viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="20"/><circle class="fg" cx="23" cy="23" r="20" pathLength="100"/></svg><svg class="zwp-nxg" viewBox="0 0 24 24"><path d="M6.5 5.5v13l9.5-6.5z"/><path d="M19 5.5v13"/></svg></div>' +
        '<div class="zwp-nxb"><b>Siguiente episodio en <span id="zwpNxN">5</span>…</b><div class="zwp-nxa"><button class="go" id="zwpNxGo">Ver ya</button><button id="zwpNxNo">Cancelar</button></div></div></div>' +
      '<div class="zwp-ui" id="zwpUi">' +
        '<div class="zwp-top"><button class="zwp-round" id="zwpBack" aria-label="Volver">' + ICON.back + '</button>' +
          '<div class="zwp-ttl"><b id="zwpTitle"></b><small id="zwpSub"></small></div>' +
          '<div class="zwp-r"><button class="zwp-ic zwp-cast" id="zwpCast" aria-label="Transmitir a otro dispositivo" title="Transmitir" hidden>' + ICON.cast + '</button>' +
          '<button class="zwp-ic zwp-src" id="zwpSrc" aria-label="Cambiar de fuente" title="Cambiar de fuente" hidden>' + ICON.src + '</button></div></div>' +
        '<div class="zwp-mid"><button class="zwp-skip" id="zwpRew" aria-label="Retroceder 10 segundos">' + ICON.skip + '</button>' +
          '<button class="zwp-big" id="zwpPlay" aria-label="Reproducir o pausar"></button>' +
          '<button class="zwp-skip f" id="zwpFwd" aria-label="Adelantar 10 segundos">' + ICON.skip + '</button></div>' +
        '<div class="zwp-bot"><div class="zwp-bar" id="zwpBar"><div class="zwp-pv" id="zwpPv"><span id="zwpPvT"></span></div><div class="zwp-trk"></div><div class="zwp-buf" id="zwpBuf"></div><div class="zwp-fill" id="zwpFill"></div><div class="zwp-knob" id="zwpKnob"></div></div>' +
          '<div class="zwp-row"><span id="zwpCur">0:00</span><span id="zwpDur"></span></div>' +
          '<div class="zwp-acts">' +
            '<button class="zwp-ic" data-p="audio" aria-label="Audio" title="Audio">' + ICON.audio + '</button>' +
            '<button class="zwp-ic" data-p="subs" aria-label="Subtítulos" title="Subtítulos">' + ICON.subs + '</button>' +
            '<button class="zwp-ic" data-p="quality" id="zwpQ" aria-label="Calidad" title="Calidad" hidden>' + ICON.quality + '</button>' +
            '<button class="zwp-ic" data-p="speed" id="zwpSpeed" aria-label="Velocidad" title="Velocidad">' + ICON.speed + '<small id="zwpSpeedB"></small></button>' +
            '<button class="zwp-ic" data-p="aspect" aria-label="Pantalla" title="Pantalla">' + ICON.aspect + '</button>' +
            '<span class="zwp-sp"></span>' +
            '<button class="zwp-pill" id="zwpCwB" hidden>Seguir viendo</button>' +
            '<button class="zwp-ic" id="zwpNext" aria-label="Siguiente episodio" title="Siguiente episodio" hidden>' + ICON.next + '</button>' +
            '<div class="zwp-volw"><button class="zwp-ic" id="zwpMute" aria-label="Silenciar" title="Silenciar (M)"></button><input type="range" id="zwpVol" min="0" max="1" step="0.02" aria-label="Volumen"></div>' +
            '<button class="zwp-ic" id="zwpPip" aria-label="Ventana flotante" title="Ventana flotante" hidden>' + ICON.pip + '</button>' +
            '<button class="zwp-ic" id="zwpFs" aria-label="Pantalla completa" title="Pantalla completa (F)"></button>' +
          '</div></div>' +
      '</div>' +
      '<div class="zwp-sheet" id="zwpSheet" hidden><div class="zwp-sh-t" id="zwpShT"></div><div class="zwp-sh-l" id="zwpShL"></div></div>' +
      '<div class="zwp-cw" id="zwpCw" hidden><div class="zwp-cw-h"><button class="zwp-cwp" id="zwpCwP">Seguir viendo</button></div><div class="zwp-cw-r" id="zwpCwR"></div></div>';
    ["Tap", "Ui", "Back", "Title", "Sub", "Rew", "Play", "Fwd", "Bar", "Fill", "Buf", "Knob", "Cur", "Dur", "Pv", "PvT", "Speed", "SpeedB", "Src", "Cast", "Next", "Sheet", "ShT", "ShL", "Fl", "Fr", "Msg", "Intro", "Nx", "NxR", "NxN", "NxGo", "NxNo", "Q", "Mute", "Vol", "Pip", "Fs", "CwB", "Cw", "CwP", "CwR"]
      .forEach(function (k) { ui[k.charAt(0).toLowerCase() + k.slice(1)] = ZR.querySelector("#zwp" + k); });

    ui.back.onclick = function () {
      if (cwOpen) { closeCw(); return; }
      var pl = plyr();
      if (pl && pl.fullscreen && pl.fullscreen.active) { pl.fullscreen.exit(); setTimeout(fsIcon, 200); }
      else if (typeof W.rdClosePlayer === "function") W.rdClosePlayer();
    };
    ui.rew.onclick = function () { seekBy(-10); flash(-1); pulseSkip(-1); };
    ui.fwd.onclick = function () { seekBy(10); flash(1); pulseSkip(1); };
    ui.play.onclick = function () { toggle(); };
    ui.next.onclick = function () {
      var Z = W.ZAM;
      try { if (Z && Z.saveWeb) Z.saveWeb(); } catch (e) {}
      if (typeof W.addonStep === "function") W.addonStep(1);
    };
    ui.src.onclick = function () { toggleSheet("src"); };
    ui.cast.onclick = function () {
      var r = v && v.remote;
      if (!r || !r.prompt) { msg("Este navegador no permite transmitir"); return; }
      r.prompt().catch(function (e) { if (!e || e.name !== "NotAllowedError") msg("No se encontraron dispositivos para transmitir"); });
    };
    ui.mute.onclick = function () { v.muted = !v.muted; };
    ui.vol.oninput = function () { v.muted = false; v.volume = Number(ui.vol.value); };
    ui.pip.onclick = togglePip;
    ui.intro.onclick = function () { if (!curSeg) return; var e = curSeg.e; curSeg = null; ui.intro.classList.remove("on"); try { v.currentTime = e / 1000; } catch (x) {} paint(); };
    ui.nxGo.onclick = function () { goNext(); };
    ui.nxNo.onclick = function () { stopCd(); };
    ui.fs.onclick = toggleFs;
    ui.cwB.onclick = function () { openCw(); };
    ui.cwP.onclick = function () { closeCw(); };
    ui.cw.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest("[data-k]");
      if (c) { playCw(c.getAttribute("data-k")); return; }
      if (!(e.target.closest && e.target.closest(".zwp-cwp"))) closeCw();
    });
    ZR.querySelectorAll(".zwp-acts [data-p]").forEach(function (b) { b.onclick = function () { toggleSheet(b.getAttribute("data-p")); }; });
    /* para que la barra espaciadora siga pausando después de pulsar un botón */
    ZR.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (b) setTimeout(function () { try { b.blur(); } catch (x) {} }, 0);
    });
    ZR.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var n = Date.now(); if (n - mvT < 150) return; mvT = n; showUi();
    });

    /* toque en el video:
       celular: un toque muestra u oculta los controles; doble toque a los lados salta 10 s y al centro pausa.
       ratón: un clic pausa o reanuda; doble clic = pantalla completa. */
    ui.tap.addEventListener("click", function (e) {
      if (sheetOpen) { closeSheet(); return; }
      var mouse = e.pointerType ? e.pointerType === "mouse" : !!(W.matchMedia && W.matchMedia("(hover:hover)").matches);
      var now = Date.now(), rc = ui.tap.getBoundingClientRect(), x = e.clientX - rc.left;
      var side = x < rc.width * 0.33 ? -1 : (x > rc.width * 0.67 ? 1 : 0);
      if (mouse) {
        if (now - lastTap < 320) { lastTap = 0; toggle(); toggleFs(); return; }
        lastTap = now; toggle(); showUi(); return;
      }
      if (now - lastTap < 320 && side === lastSide) {
        clearTimeout(tapT); lastTap = 0;
        if (side === 0) toggle(); else { seekBy(side * 10); flash(side); pulseSkip(side); }
        return;
      }
      lastTap = now; lastSide = side; clearTimeout(tapT);
      tapT = setTimeout(function () {
        if (ZR.classList.contains("zwp-hide")) showUi(); else ZR.classList.add("zwp-hide");
      }, 320);
    });

    /* barra de progreso: arrastrar, tocar o pasar el ratón */
    function dur() { var d = v && v.duration; return d && isFinite(d) ? d : 0; }
    function frac(e) { var r = ui.bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
    function movePv(clientX, t) {
      var r = ui.bar.getBoundingClientRect(), half = 34;
      ui.pv.style.left = Math.max(half, Math.min(r.width - half, clientX - r.left)) + "px";
      ui.pvT.textContent = fmt(t);
      ui.pv.classList.add("on");
    }
    ui.bar.addEventListener("pointerdown", function (e) {
      var d = dur(); if (!d) return;
      dragging = true; dragT = frac(e) * d;
      try { ui.bar.setPointerCapture(e.pointerId); } catch (x) {}
      clearTimeout(hideT); paint(); movePv(e.clientX, dragT);
    });
    ui.bar.addEventListener("pointermove", function (e) {
      var d = dur(); if (!d) return;
      if (dragging) { dragT = frac(e) * d; paint(); movePv(e.clientX, dragT); }
      else if (e.pointerType === "mouse") movePv(e.clientX, frac(e) * d);
    });
    ui.bar.addEventListener("pointerleave", function () { if (!dragging) ui.pv.classList.remove("on"); });
    function endDrag() {
      if (!dragging) return;
      dragging = false; ui.pv.classList.remove("on");
      try { v.currentTime = dragT; } catch (x) {}
      paint(); showUi();
    }
    ui.bar.addEventListener("pointerup", endDrag);
    ui.bar.addEventListener("pointercancel", endDrag);

    D.addEventListener("keydown", onKey, true);
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (n) { D.addEventListener(n, function () { setTimeout(function () { fsIcon(); applyAspect(); }, 120); }); });
    W.addEventListener("resize", applyAspect);
  }

  /* ---------- montaje encima de Plyr ---------- */
  function mount() {
    var pl = plyr();
    if (!pl || !pl.elements || !pl.elements.container) return false;
    v = $("rdVideo"); if (!v) return false;
    build();
    host = pl.elements.container;
    if (ZR.parentNode !== host) host.appendChild(ZR);
    var pr = $("rdPlayer"); if (pr) pr.classList.add("zwp-on");
    if (!bound) {
      bound = true;
      bindVideo();
      var L = $("rdLoading");
      if (L && W.MutationObserver) {
        var sync = function () { ZR.classList.toggle("zwp-busy", !L.hidden); };
        new MutationObserver(sync).observe(L, { attributes: true, attributeFilter: ["hidden"] });
        sync();
      }
      if (W.ResizeObserver) new ResizeObserver(function () { ZR.classList.toggle("zwp-s", host.clientWidth < 560); applyAspect(); subApply(); }).observe(host);
      if (W.MutationObserver) new MutationObserver(function () { subApply(); updateSeg(); }).observe(D.documentElement, { attributes: true, attributeFilter: ["data-style"] });
      ZR.classList.toggle("zwp-s", host.clientWidth < 560);
      try { pl.on("enterfullscreen", function () { setTimeout(fsIcon, 50); }); pl.on("exitfullscreen", function () { setTimeout(fsIcon, 50); }); } catch (e) {}
    }
    return true;
  }

  function bindVideo() {
    ["play", "pause", "playing", "timeupdate", "durationchange", "progress", "seeked", "emptied"].forEach(function (n) { v.addEventListener(n, function () { if (!dragging) paint(); }); });
    v.addEventListener("loadedmetadata", function () { avail(); applyAspect(); paint(); });
    v.addEventListener("playing", avail);
    v.addEventListener("ratechange", function () { var r = v.playbackRate; ui.speedB.textContent = r === 1 ? "" : r + "x"; });
    v.addEventListener("volumechange", volPaint);
    v.addEventListener("ended", function () {
      /* al terminar un episodio pasa al siguiente (igual que en la app) */
      var c = W._addonCtx;
      if (!(c && c.type === "tv" && typeof W.addonStep === "function")) return;
      if (eleg()) { startCd(); showUi(); return; }   /* modo Elegante: cuenta regresiva */
      setTimeout(function () { W.addonStep(1); }, 0);
    });
    v.addEventListener("play", function () { stopCd(); });
    v.addEventListener("enterpictureinpicture", function () { ui.pip.classList.add("on"); });
    v.addEventListener("leavepictureinpicture", function () { ui.pip.classList.remove("on"); });
    if (v.remote && v.remote.addEventListener) {
      v.remote.addEventListener("connect", function () { ui.cast.classList.add("on"); });
      v.remote.addEventListener("disconnect", function () { ui.cast.classList.remove("on"); });
    }
  }

  function avail() {
    if (!ZR || !v) return;
    var h = hls(), c = W._addonCtx, Z = W.ZAM;
    ui.q.hidden = !(h && h.levels && h.levels.length > 1);
    ui.pip.hidden = !(D.pictureInPictureEnabled && v.requestPictureInPicture && !v.disablePictureInPicture);
    ui.cast.hidden = !(v.remote && v.remote.prompt);
    ui.next.hidden = !(c && c.type === "tv");
    ui.src.hidden = !(Z && Z.sources && Z.webMeta && Z.webMeta());
    cwPill();
  }

  /* ---------- estado ---------- */
  function paint() {
    if (!ZR || !v) return;
    var d = v.duration, len = d && isFinite(d) ? d : 0, t = dragging ? dragT : (v.currentTime || 0), f = len ? Math.min(1, t / len) : 0;
    ui.fill.style.width = (f * 100) + "%";
    ui.knob.style.left = (f * 100) + "%";
    var be = 0;
    try { var b = v.buffered; for (var i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) > be) be = b.end(i); } catch (e) {}
    ui.buf.style.width = len ? Math.min(100, be / len * 100) + "%" : "0";
    ui.cur.textContent = fmt(t);
    ui.dur.textContent = len ? "-" + fmt(len - t) : "";
    var playing = !(v.paused || v.ended);
    if (playing !== shownPlay) { shownPlay = playing; ui.play.innerHTML = playing ? ICON.pause : ICON.play; if (playing) showUi(); }
    updateSeg();
  }
  function volPaint() {
    if (!ZR || !v) return;
    var off = v.muted || v.volume === 0;
    ui.mute.innerHTML = off ? ICON.mute : ICON.vol;
    ui.vol.value = v.muted ? 0 : v.volume;
  }
  function fsIcon() {
    if (!ZR) return;
    var pl = plyr(), on = !!(pl && pl.fullscreen && pl.fullscreen.active);
    ui.fs.innerHTML = on ? ICON.fsx : ICON.fs;
  }
  function showUi() {
    if (!ZR) return;
    ZR.classList.remove("zwp-hide");
    clearTimeout(hideT);
    hideT = setTimeout(function () { if (v && !v.paused && !sheetOpen && !dragging && !cwOpen) ZR.classList.add("zwp-hide"); }, 3500);
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
    var el = side < 0 ? ui.fl : ui.fr, other = side < 0 ? ui.fr : ui.fl;
    other.classList.remove("on");
    if (flashDir !== side) { flashAcc = 0; flashDir = side; }
    flashAcc += 10;
    el.textContent = (side < 0 ? "−" : "+") + flashAcc + " s"; el.classList.add("on");
    clearTimeout(flashT); flashT = setTimeout(function () { el.classList.remove("on"); flashAcc = 0; flashDir = 0; }, 1100);
  }

  /* ---------- acciones ---------- */
  function toggle() {
    if (!v) return;
    if (v.paused || v.ended) { var p = v.play(); if (p && p.catch) p.catch(noop); } else v.pause();
    showUi();
  }
  function seekBy(sec) {
    if (!v) return;
    var d = v.duration, max = d && isFinite(d) ? d : 1e12;
    try { v.currentTime = Math.max(0, Math.min(max, (v.currentTime || 0) + sec)); } catch (e) {}
    paint(); showUi();
  }
  function toggleFs() {
    var pl = plyr();
    if (pl && pl.fullscreen) { pl.fullscreen.toggle(); setTimeout(fsIcon, 200); }
  }
  function togglePip() {
    if (D.pictureInPictureElement) { D.exitPictureInPicture().catch(noop); return; }
    if (v && v.requestPictureInPicture) v.requestPictureInPicture().catch(function () { msg("No se pudo abrir la ventana flotante"); });
  }

  /* formato de pantalla: ajustar, zoom, estirar, 16:9, 4:3 */
  function applyAspect() {
    if (!v) return;
    var s = v.style;
    function set(p, val) { if (val) s.setProperty(p, val, "important"); else s.removeProperty(p); }
    var fit = "", tf = "";
    if (aspect === "zoom") fit = "cover";
    else if (aspect === "fill") fit = "fill";
    else if (aspect === "16:9" || aspect === "4:3") {
      var A = aspect === "16:9" ? 16 / 9 : 4 / 3, w = v.clientWidth, h = v.clientHeight;
      if (w > 0 && h > 0) {
        fit = "fill";
        var tw, th;
        if (A > w / h) { tw = w; th = w / A; } else { th = h; tw = h * A; }
        tf = "scale(" + (tw / w) + "," + (th / h) + ")";
      }
    }
    set("object-fit", fit); set("transform", tf);
  }

  /* ---------- panel lateral ---------- */
  function toggleSheet(kind) { if (sheetOpen && sheetKind === kind) { closeSheet(); return; } openSheet(kind); }
  function closeSheet() { sheetOpen = false; if (ui.sheet) ui.sheet.hidden = true; showUi(); }
  function fillSheet(title, items, empty) {
    ui.shT.textContent = title; ui.shL.innerHTML = "";
    if (!items.length) { var e = D.createElement("div"); e.className = "zwp-sh-e"; e.textContent = empty || "Nada disponible"; ui.shL.appendChild(e); return; }
    items.forEach(function (it) {
      if (it.head) { var h = D.createElement("div"); h.className = "zwp-sh-h"; h.textContent = it.head; ui.shL.appendChild(h); return; }
      var b = D.createElement("button"); b.type = "button";
      var tx = D.createElement("span"); tx.className = "zwp-tx";
      var l = D.createElement("span"); l.textContent = it.label; tx.appendChild(l);
      if (it.sub) { var sm = D.createElement("small"); sm.textContent = it.sub; tx.appendChild(sm); }
      b.appendChild(tx);
      if (it.on) { b.className = "on"; b.insertAdjacentHTML("beforeend", ICON.check); }
      b.onclick = function () { it.fn(); if (it.keep) openSheet(sheetKind); else closeSheet(); };
      ui.shL.appendChild(b);
    });
  }
  function audioItems() {
    var h = hls(), out = [], i;
    if (h && h.audioTracks && h.audioTracks.length > 1) {
      h.audioTracks.forEach(function (t, k) {
        out.push({ label: t.name || t.lang || "Pista " + (k + 1), sub: t.lang && t.name && t.name !== t.lang ? t.lang : "", on: h.audioTrack === k, fn: function () { h.audioTrack = k; } });
      });
      return out;
    }
    var a = v.audioTracks;
    if (a && a.length > 1) {
      var arr = []; for (i = 0; i < a.length; i++) arr.push(a[i]);
      arr.forEach(function (t, k) {
        out.push({ label: t.label || t.language || "Pista " + (k + 1), on: !!t.enabled, fn: function () { arr.forEach(function (x) { x.enabled = x === t; }); } });
      });
    }
    return out;
  }
  function subItems() {
    var h = hls(), out = [];
    if (h && h.subtitleTracks && h.subtitleTracks.length) {
      out.push({ label: "Desactivados", on: h.subtitleTrack === -1, fn: function () { h.subtitleTrack = -1; } });
      h.subtitleTracks.forEach(function (t, k) {
        out.push({ label: t.name || t.lang || "Subtítulos " + (k + 1), on: h.subtitleTrack === k, fn: function () { h.subtitleTrack = k; } });
      });
      return out;
    }
    var tt = Array.prototype.slice.call(v.textTracks || []).filter(function (t) { return t.kind === "subtitles" || t.kind === "captions"; });
    if (tt.length) {
      out.push({ label: "Desactivados", on: tt.every(function (t) { return t.mode !== "showing"; }), fn: function () { tt.forEach(function (t) { t.mode = "disabled"; }); } });
      tt.forEach(function (t, k) {
        out.push({ label: t.label || t.language || "Subtítulos " + (k + 1), on: t.mode === "showing", fn: function () { tt.forEach(function (x) { x.mode = x === t ? "showing" : "disabled"; }); } });
      });
    }
    return out;
  }
  function openSheet(kind) {
    sheetOpen = true; sheetKind = kind; ui.sheet.hidden = false; clearTimeout(hideT);
    if (kind === "speed") {
      fillSheet("Velocidad", [0.5, 0.75, 1, 1.25, 1.5, 2].map(function (r) {
        return { label: r === 1 ? "Normal" : r + "x", on: v.playbackRate === r, fn: function () { v.playbackRate = r; } };
      }));
    } else if (kind === "quality") {
      var h = hls(), lv = (h && h.levels) || [];
      var items = [{ label: "Automática", on: !!h && h.autoLevelEnabled, fn: function () { h.currentLevel = -1; } }];
      lv.map(function (l, k) { return { l: l, k: k }; }).sort(function (a, b) { return (b.l.height || 0) - (a.l.height || 0) || (b.l.bitrate || 0) - (a.l.bitrate || 0); }).forEach(function (o) {
        items.push({ label: o.l.height ? o.l.height + "p" : Math.round((o.l.bitrate || 0) / 1000) + " kbps", on: !h.autoLevelEnabled && h.currentLevel === o.k, fn: function () { h.currentLevel = o.k; } });
      });
      fillSheet("Calidad", items);
    } else if (kind === "aspect") {
      fillSheet("Pantalla", [["fit", "Ajustar"], ["zoom", "Zoom (recorta los bordes)"], ["fill", "Estirar"], ["16:9", "16:9"], ["4:3", "4:3"]].map(function (a) {
        return { label: a[1], on: a[0] === aspect, fn: function () { aspect = a[0]; applyAspect(); } };
      }));
    } else if (kind === "audio") {
      fillSheet("Audio", audioItems(), "Este video no trae otras pistas de audio. El navegador solo puede cambiarlas en listas HLS; con «Abrir con VLC» puedes elegir el idioma.");
    } else if (kind === "subs") {
      var sit = subItems();
      if (sit.length && eleg()) sit.push({ label: "Estilo de los subtítulos", sub: "Tamaño y fondo", keep: true, fn: function () { sheetKind = "substyle"; } });
      fillSheet("Subtítulos", sit, "Este video no trae subtítulos que el navegador pueda mostrar. Con «Abrir con VLC» puedes cargar los del archivo.");
    } else if (kind === "substyle") {
      var cs = subSt || { size: "m", bg: "normal" };
      var setS = function (k, val) { subSt = { size: cs.size, bg: cs.bg }; subSt[k] = val; try { localStorage.setItem(SUBK, JSON.stringify(subSt)); } catch (e) {} subApply(); };
      var sty = [{ label: "‹  Subtítulos", keep: true, fn: function () { sheetKind = "subs"; } }, { head: "Tamaño" }];
      [["s", "Pequeño"], ["m", "Mediano"], ["l", "Grande"], ["xl", "Muy grande"]].forEach(function (a) {
        sty.push({ label: a[1], on: cs.size === a[0], keep: true, fn: function () { setS("size", a[0]); } });
      });
      sty.push({ head: "Fondo" });
      [["shadow", "Solo sombra"], ["light", "Translúcido"], ["normal", "Normal"], ["solid", "Negro sólido"]].forEach(function (a) {
        sty.push({ label: a[1], on: cs.bg === a[0], keep: true, fn: function () { setS("bg", a[0]); } });
      });
      fillSheet("Estilo de subtítulos", sty);
    } else if (kind === "src") {
      var Z = W.ZAM, m = Z && Z.webMeta && Z.webMeta();
      if (!m || !Z.sources) { fillSheet("Fuentes", [], "No hay fuentes disponibles"); return; }
      fillSheet("Fuentes", [], "Buscando fuentes…");
      Z.sources(m).then(function (list) {
        if (!sheetOpen || sheetKind !== "src") return;
        fillSheet("Fuentes", list.map(function (x) { return { label: x.label, sub: x.sub, on: x.on, fn: function () { switchSource(x, m); } }; }), "Ningún addon encontró fuentes");
      }).catch(function () { if (sheetOpen && sheetKind === "src") fillSheet("Fuentes", [], "No se pudieron consultar las fuentes"); });
    }
  }
  function switchSource(x, m) {
    var Z = W.ZAM; if (!Z || !Z.resolve || !Z.webSwitch) return;
    var t = v.currentTime || 0;
    msg("Cambiando de fuente…");
    Z.resolve(m, x.snap).then(function (r) { Z.webSwitch(r, t); })
      .catch(function (e) { msg((e && (e.userMessage || e.message)) || "No se pudo abrir esa fuente"); });
  }


  /* ---------- modo Elegante: saltar intro y siguiente episodio con cuenta regresiva ---------- */
  function eleg() { return D.documentElement.getAttribute("data-style") === "elegant"; }
  var segs = [], curSeg = null, segKey = "", segCache = {}, cdT = 0, cdLeft = 0;
  /* busca el id de TMDB / IMDb en el contexto del episodio (los nombres de campo se pueden ajustar aquí) */
  function segIds() {
    var out = { tmdb: "", imdb: "" }, c = W._addonCtx || {}, m = (function () { try { var Z = W.ZAM; return Z && Z.webMeta && Z.webMeta(); } catch (e) { return null; } })();
    [c, m].forEach(function (o) {
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
  /* marcas de intro/resumen de la comunidad (TheIntroDB); si no hay datos, el botón simplemente no aparece */
  function loadSegs() {
    segs = []; curSeg = null; segKey = "";
    if (ui.intro) ui.intro.classList.remove("on");
    var c = W._addonCtx;
    if (!eleg() || !c || c.type !== "tv" || !W.fetch) return;
    var id = segIds(), q = id.tmdb ? "tmdb_id=" + id.tmdb : (id.imdb ? "imdb_id=" + id.imdb : "");
    if (!q) return;
    var key = q + "|" + c.season + "|" + c.episode; segKey = key;
    if (segCache[key]) { segs = segCache[key]; updateSeg(); return; }
    fetch("https://api.theintrodb.org/v2/media?" + q + "&season=" + encodeURIComponent(c.season) + "&episode=" + encodeURIComponent(c.episode))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var out = [];
        [["intro", "Saltar intro"], ["recap", "Saltar resumen"]].forEach(function (t) {
          var arr = j[t[0]]; if (!arr) return;
          if (!Array.isArray(arr)) arr = [arr];
          arr.forEach(function (s) {
            if (!s || s.end_ms == null) return;
            var a = Number(s.start_ms) || 0, b = Number(s.end_ms);
            if (b > a + 3000) out.push({ s: a, e: b, label: t[1] });
          });
        });
        segCache[key] = out;
        if (segKey === key) { segs = out; updateSeg(); }
      }).catch(noop);
  }
  function updateSeg() {
    if (!ui.intro) return;
    var t = (v ? (v.currentTime || 0) * 1000 : 0), hit = null, i;
    if (eleg() && ZR) for (i = 0; i < segs.length; i++) if (t >= segs[i].s && t < segs[i].e - 1000) { hit = segs[i]; break; }
    if (hit !== curSeg) {
      curSeg = hit;
      if (hit) ui.intro.textContent = hit.label;
      ui.intro.classList.toggle("on", !!hit);
    }
  }
  function stopCd() {
    clearInterval(cdT); cdT = 0;
    if (ui.nx) { ui.nx.classList.remove("on"); ui.nxR.classList.remove("run"); }
    
  }
  function startCd() {
    if (cdT || !ui.nx) return;
    closeCw();
    var N = 5; cdLeft = N; ui.nxN.textContent = N;
    ui.nxR.style.setProperty("--cd", N + "s"); void ui.nxR.offsetWidth; ui.nxR.classList.add("run");
    ui.nx.classList.add("on");
    cdT = setInterval(function () { cdLeft--; ui.nxN.textContent = Math.max(cdLeft, 0); if (cdLeft <= 0) goNext(); }, 1000);
  }
  function goNext() {
    stopCd();
    if (typeof W.addonStep === "function") W.addonStep(1);
  }

  /* estilo de los subtítulos (tamaño y fondo) — solo en modo Elegante; se guarda en el dispositivo */
  var SUBK = "zy_sub", SUBSZ = { s: 0.8, m: 1, l: 1.35, xl: 1.8 };
  var SUBBG = { shadow: ["transparent", "0 0 3px #000,0 0 6px #000,0 1px 8px #000"], light: ["rgba(0,0,0,.45)", "none"], normal: ["rgba(0,0,0,.75)", "none"], solid: ["#000", "none"] };
  var subSt = null, subCss = null;
  function subLoad() {
    try { var o = JSON.parse(localStorage.getItem(SUBK) || "null"); if (o && SUBSZ[o.size] && SUBBG[o.bg]) return o; } catch (e) {}
    return null;
  }
  function subApply() {
    if (!subCss) { subCss = D.createElement("style"); D.head.appendChild(subCss); }
    if (!subSt || !eleg() || !host) { subCss.textContent = ""; return; }
    var px = Math.max(12, Math.round((host.clientHeight || 400) * 0.048 * SUBSZ[subSt.size])), b = SUBBG[subSt.bg];
    subCss.textContent = "#rdVideo::cue{font-size:" + px + "px;color:#fff;background-color:" + b[0] + ";text-shadow:" + b[1] + "}";
  }

  /* ---------- Seguir viendo dentro del reproductor (como Apple TV) ---------- */
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function curKey() { var c = W._addonCtx; return c && c.tmdbId ? (c.type === "tv" ? "tv" : "movie") + ":" + c.tmdbId : ""; }
  function cwItems() {
    var k = curKey(), all = [];
    try { all = (W.ZCW && W.ZCW.list && W.ZCW.list()) || []; } catch (e) {}
    return all.filter(function (x) { return x && x.key !== k; });
  }
  function cwPill() { if (ui.cwB) ui.cwB.hidden = !cwItems().length; }
  function cwCard(en) {
    var img = en.backdrop ? TMI + en.backdrop : (en.poster ? TMI + en.poster : "");
    var nx = !!(en.done && en.ns), s = nx ? en.ns : en.s, e = nx ? en.ne : en.e;
    var left = (!nx && en.len > 0) ? Math.max(1, Math.round((en.len - en.pos) / 60000)) : 0;
    var pct = left ? Math.max(1, Math.min(99, Math.round(en.pos / en.len * 100))) : 0;
    var sub = en.type === "tv" ? (nx ? "Siguiente · " : "") + "T" + s + ", E" + e + (left ? " · " + left + " min" : "") : (left ? left + " min" : "");
    return '<button type="button" class="zwp-cwc" data-k="' + esc(en.key) + '"><span class="zwp-cwt">' + (img ? '<img alt="" src="' + esc(img) + '">' : "") +
      (pct ? '<i class="zwp-cwg"><u style="width:' + pct + '%"></u></i>' : "") + '</span>' +
      '<span class="zwp-cwx"><b>' + esc(en.title) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</span></button>";
  }
  function backIcon() { if (!ui.back) return; ui.back.innerHTML = cwOpen ? ICON.close : ICON.back; ui.back.setAttribute("aria-label", cwOpen ? "Cerrar Seguir viendo" : "Volver"); }
  function openCw() {
    var items = cwItems(); if (!items.length) { cwPill(); return; }
    closeSheet(); cwOpen = true;
    ui.cwR.innerHTML = items.map(cwCard).join("");
    ui.cwR.scrollLeft = 0;
    ui.cw.hidden = false; ZR.classList.add("zwp-cwo"); backIcon();
    clearTimeout(hideT); ZR.classList.remove("zwp-hide");
  }
  function closeCw() {
    if (!cwOpen) return;
    cwOpen = false; ui.cw.hidden = true; ZR.classList.remove("zwp-cwo"); backIcon(); showUi();
  }
  function playCw(key) {
    var en = W.ZCW && W.ZCW.get && W.ZCW.get(key), Z = W.ZAM;
    if (!en || !Z || !Z.resume) return;
    try { if (Z.saveWeb) Z.saveWeb(); } catch (e) {}
    closeCw(); Z.resume(en);
  }

  /* ---------- teclado ---------- */
  function onKey(e) {
    var pr = $("rdPlayer");
    if (!ZR || !pr || !pr.classList.contains("open") || !pr.classList.contains("zwp-on")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (tag === "BUTTON" && !(ZR.contains && ZR.contains(t))) return;
    var k = e.key, used = true;
    if (k === " " || k === "k" || k === "K") toggle();
    else if (k === "ArrowLeft" || k === "j" || k === "J") { seekBy(-10); flash(-1); pulseSkip(-1); }
    else if (k === "ArrowRight" || k === "l" || k === "L") { seekBy(10); flash(1); pulseSkip(1); }
    else if (k === "f" || k === "F") toggleFs();
    else if (k === "m" || k === "M") v.muted = !v.muted;
    else if (k === "Escape" && cwOpen) closeCw();
    else if (k === "Escape" && sheetOpen) closeSheet();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); showUi(); }
  }

  /* ---------- enganche con el reproductor existente ---------- */
  function onOpen(title) {
    if (!mount()) return;
    ui.title.textContent = title || "Reproduciendo";
    var c = W._addonCtx;
    ui.sub.textContent = c && c.type === "tv" ? "Temporada " + c.season + " · Episodio " + c.episode : "";
    aspect = "fit"; applyAspect();
    try { v.playbackRate = 1; } catch (e) {}
    ui.speedB.textContent = "";
    sheetOpen = false; ui.sheet.hidden = true; cwOpen = false; ui.cw.hidden = true; ZR.classList.remove("zwp-cwo"); backIcon();
    shownPlay = null; avail(); volPaint(); fsIcon(); stopCd(); loadSegs(); subApply(); paint(); showUi();
  }
  var origPlay = typeof W.rdPlay === "function" ? W.rdPlay : null;
  if (origPlay) W.rdPlay = function () {
    var r = origPlay.apply(this, arguments);
    try { onOpen(arguments[1]); } catch (e) {}
    return r;
  };
  var origClose = typeof W.rdClosePlayer === "function" ? W.rdClosePlayer : null;
  if (origClose) W.rdClosePlayer = function () {
    try {
      if (ZR) {
        stopCd();
        closeSheet();
        cwOpen = false; ui.cw.hidden = true; ZR.classList.remove("zwp-cwo");
        if (D.pictureInPictureElement) D.exitPictureInPicture().catch(noop);
        var pl = plyr(); if (pl && pl.fullscreen && pl.fullscreen.active) pl.fullscreen.exit();
        aspect = "fit"; applyAspect();
      }
    } catch (e) {}
    return origClose.apply(this, arguments);
  };
})();
