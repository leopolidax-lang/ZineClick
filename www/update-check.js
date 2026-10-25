/* Zynora: aviso de actualización (revisa la última versión publicada en GitHub) */
(function () {
  var REPO = "leopolidax-lang/ZineClick";
  try {
    var C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
    var A = C.Plugins && C.Plugins.App;
    if (!A || !A.getInfo) return;

    function num(v) {
      return String(v || "").replace(/^v/i, "").split(".").map(function (x) { return parseInt(x, 10) || 0; });
    }
    function newer(a, b) {
      a = num(a); b = num(b);
      for (var i = 0; i < Math.max(a.length, b.length); i++) {
        var x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
      }
      return false;
    }
    function openUrl(u) {
      try {
        var B = C.Plugins && C.Plugins.Browser;
        if (B && B.open) { B.open({ url: u }); return; }
      } catch (e) {}
      window.open(u, "_blank");
    }
    function close() {
      var el = document.getElementById("zyUpdate");
      if (el) el.remove();
    }
    function show(tag, url) {
      if (document.getElementById("zyUpdate")) return;
      var w = document.createElement("div");
      w.id = "zyUpdate";
      w.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px";
      w.innerHTML =
        '<div style="width:min(380px,100%);background:#0c0c14;border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:22px;text-align:center;color:#fff;font-family:inherit">' +
        '<div style="font-size:34px;margin-bottom:6px">⬆️</div>' +
        '<h2 style="margin:0 0 6px;font-size:20px">Nueva versión de Zynora</h2>' +
        '<p style="margin:0 0 18px;color:#9aa0b4;font-size:14px">Ya está disponible la versión ' + tag.replace(/^v/i, "") + '.</p>' +
        '<button id="zyUpdGo" style="width:100%;padding:13px;border:0;border-radius:14px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);color:#fff;font-size:15px;font-weight:600;margin-bottom:10px">Descargar e instalar</button>' +
        '<button id="zyUpdLater" style="width:100%;padding:11px;border:0;border-radius:14px;background:rgba(255,255,255,.08);color:#cfd3e3;font-size:14px">Más tarde</button>' +
        '</div>';
      document.body.appendChild(w);
      document.getElementById("zyUpdGo").onclick = function () { openUrl(url); close(); };
      document.getElementById("zyUpdLater").onclick = function () {
        try { localStorage.setItem("zy_upd_skip", tag); } catch (e) {}
        close();
      };
    }

    setTimeout(function () {
      A.getInfo().then(function (info) {
        var mine = info && info.version;
        if (!mine) return;
        return fetch("https://api.github.com/repos/" + REPO + "/releases/latest")
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (rel) {
            if (!rel || !rel.tag_name) return;
            if (!newer(rel.tag_name, mine)) return;
            var skip = ""; try { skip = localStorage.getItem("zy_upd_skip") || ""; } catch (e) {}
            if (skip === rel.tag_name) return;
            var apk = (rel.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0];
            show(rel.tag_name, apk ? apk.browser_download_url : rel.html_url);
          });
      }).catch(function () {});
    }, 4000);
  } catch (e) {}
})();
