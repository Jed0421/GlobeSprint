/* Drives the pixel loader on the web page: text layout, tips, progress and the dissolve into the game. */
(function () {
  "use strict";
  var TIPS = [
    "TIP: ARROW KEYS, A/D OR SWIPE TO CHANGE LANES",
    "TIP: SPACE, W OR SWIPE UP TO JUMP",
    "TIP: S, DOWN OR SWIPE DOWN TO SLIDE",
    "TIP: GRAB THE WINGS TO FLY OVER EVERYTHING",
    "TIP: DIVE INTO A PORTAL TO UNLOCK ITS STORY",
    "TIP: SLOW PC? LOWER GRAPHICS IN SETTINGS"
  ];

  var root = document.getElementById("gs-loader");
  var px = document.getElementById("gs-px");
  var el = {
    title: document.getElementById("gs-title"), status: document.getElementById("gs-status"),
    pct: document.getElementById("gs-pct"), tip: document.getElementById("gs-tip"), err: document.getElementById("gs-error")
  };
  var loader = new window.GSLoader(px);
  var last = performance.now(), tipT = 0, tipI = Math.floor(Math.random() * TIPS.length), finished = false;
  el.tip.textContent = TIPS[tipI];

  function layout() {
    var L = loader.L, s = window.innerHeight / loader.H;
    var titleY = Math.max(4, (L.cy - L.R - 24) / 2);
    el.title.style.fontSize = (12 * s) + "px";
    el.title.style.top = ((titleY - 6) * s) + "px";
    var sy = (L.barY + 11) * s, fs = 4.2 * s;
    el.status.style.fontSize = fs + "px"; el.status.style.top = sy + "px"; el.status.style.left = (L.barX * s) + "px";
    el.pct.style.fontSize = fs + "px"; el.pct.style.top = sy + "px";
    el.pct.style.right = ((loader.W - L.barX - L.barW) * s) + "px";
    el.tip.style.fontSize = (3.4 * s) + "px"; el.tip.style.top = ((loader.H - 9) * s) + "px";
    el.err.style.fontSize = (4 * s) + "px";
  }

  function tick(now) {
    var dt = (now - last) / 1000; last = now;
    loader.frame(dt);
    layout();
    el.pct.textContent = Math.floor(loader.progress * 100 + 0.001) + "%";
    tipT += dt;
    if (tipT > 3.6) { tipT = 0; tipI = (tipI + 1) % TIPS.length; el.tip.textContent = TIPS[tipI]; }
    if (loader.dissolve >= 0) {
      loader.dissolve += dt / 0.7;
      var o = Math.max(0, 1 - loader.dissolve * 2.2);
      el.title.style.opacity = el.status.style.opacity = el.pct.style.opacity = el.tip.style.opacity = o;
      root.style.background = "transparent";
      if (loader.dissolve >= 1.05) { root.className = "gone"; return; }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.GSPage = {
    progress: function (p) {
      loader.target = Math.max(loader.target, p * 0.98);
      el.status.textContent = p < 0.9 ? "DOWNLOADING THE WORLD..." : "WAKING UP THE GLOBE...";
    },
    done: function () {
      if (finished) return;
      finished = true;
      loader.target = 1;
      el.status.textContent = "READY!";
      // let the bar fill, then dissolve into the game
      setTimeout(function () { loader.dissolve = 0; }, 450);
    },
    error: function (msg) {
      el.err.style.display = "block";
      el.err.textContent = msg;
      el.status.textContent = "SOMETHING WENT WRONG";
    },
    loader: loader,
    hud: function (unity) {
      var hud = document.getElementById("gs-hud"), home = document.getElementById("gs-home"), full = document.getElementById("gs-full");
      if (!hud) return;
      // the Home link only makes sense when the game sits under the website's /play/ folder
      var onSite = /\/play\/?(index\.html)?$/.test(location.pathname);
      home.style.display = onSite ? "" : "none";
      var canFull = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
      full.style.display = canFull ? "" : "none";
      if (!onSite && !canFull) return;
      hud.hidden = false;
      full.addEventListener("click", function () { unity.SetFullscreen(1); });
      var t;
      function wake() { hud.classList.remove("idle"); clearTimeout(t); t = setTimeout(function () { hud.classList.add("idle"); }, 2500); }
      ["mousemove", "touchstart", "keydown"].forEach(function (e) { window.addEventListener(e, wake, { passive: true }); });
      wake();
    }
  };
})();
