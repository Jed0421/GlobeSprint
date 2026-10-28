/* Globe Sprint pixel loading screen (web page side).
 * The same scene is drawn inside the game by LoadingScreen.cs, so the hand-off looks seamless.
 * Everything is drawn into a tiny canvas (about 384 x 216) and scaled up with nearest-neighbour filtering. */
(function () {
  "use strict";
  var ART = window.GS_ART;

  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  var PAL = {};
  for (var k in ART.palette) PAL[k] = hex(ART.palette[k]);

  var C = {
    skyTop: hex("#06010e"), skyMid: hex("#14042a"), skyLow: hex("#33075a"), horizon: hex("#ff2fd0"),
    floor: hex("#0d0119"), grid: hex("#ff2fd0"), gridDim: hex("#6a1466"),
    halo: hex("#5a0f7a"), halo2: hex("#8a1aa8"),
    ocean: [hex("#03051a"), hex("#0a1140"), hex("#13226c"), hex("#1f3b9e")],
    land: [hex("#06240f"), hex("#145c2c"), hex("#22a04a"), hex("#4ee070")],
    gridLine: hex("#ff2fd0"), gridLineDark: hex("#7a1670"),
    rimLit: hex("#7af6ff"), rimDark: hex("#c42aa4"), atmo: hex("#2bd4ff"),
    ring: hex("#3ff2ff"), ringDim: hex("#1a6f8a"),
    coin: hex("#ffd23f"), coinHi: hex("#fff6b0"), coinLo: hex("#c27a12"),
    city: hex("#ffd86a"), star: hex("#ffffff"), star2: hex("#9be8ff"),
    jedGlow: hex("#59f3ff"), mutGlow: hex("#ff3048"),
    dust: hex("#e2d4ff"), dust2: hex("#9a7fc8"), speed: hex("#bff8ff"),
    barEdge: hex("#f6ecff"), barBack: hex("#1b0632"), barA: hex("#ff2fd0"), barB: hex("#3ff2ff"), barGap: hex("#3a0b52"),
    white: hex("#ffffff")
  };
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var BAYER8 = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,
    3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(function (v) { return (v + 0.5) / 64; });

  var WORLD = ART.world.map(function (r) { return r.split("").map(function (c) { return c === "1"; }); });

  function rnd(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function Loader(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.t = 0;
    this.spin = 0;
    this.progress = 0;     // what the bar shows (eases toward target)
    this.target = 0;
    this.dissolve = -1;    // >= 0 while dissolving away
    this.dust = [];
    this.lines = [];
    this.dustT = 0;
    this.resize();
  }

  Loader.prototype.resize = function () {
    var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight), aspect = w / h;
    var W, H;
    if (aspect >= 1) { H = 180; W = Math.round(H * aspect); } else { W = 180; H = Math.round(W / aspect); }
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.cv.width = W; this.cv.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.buf = this.img.data;
    var R = Math.round(Math.min(W * 0.28, H * 0.22));
    this.L = {
      R: R, cx: Math.floor(W / 2), cy: Math.round(aspect >= 1 ? H * 0.5 : H * 0.47),
      horizon: 0, barW: 0, barX: 0, barY: 0
    };
    var L = this.L;
    L.horizon = Math.round(L.cy + R * 0.55);
    L.barW = Math.min(Math.round(W * 0.46), 200) & ~1;
    L.barX = L.cx - L.barW / 2;
    L.barY = Math.round(L.cy + R + (H - (L.cy + R)) * 0.36);
    // stars
    var r = rnd(7), n = Math.round(W * H / 260);
    this.stars = [];
    for (var i = 0; i < n; i++) {
      var sy = Math.floor(r() * (L.horizon - 6));
      this.stars.push({ x: Math.floor(r() * W), y: sy, p: r() * 6.28, f: 0.6 + r() * 2.2, big: r() < 0.08 });
    }
  };

  /* ------------------------------------------------------------------ pixels */
  Loader.prototype.put = function (x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    var i = (y * this.W + x) * 4, b = this.buf;
    b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; b[i + 3] = 255;
  };
  Loader.prototype.mix = function (x, y, c, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H || a <= 0) return;
    var i = (y * this.W + x) * 4, b = this.buf;
    b[i] += (c[0] - b[i]) * a; b[i + 1] += (c[1] - b[i + 1]) * a; b[i + 2] += (c[2] - b[i + 2]) * a; b[i + 3] = 255;
  };
  function lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ------------------------------------------------------------------ scene */
  Loader.prototype.drawBackground = function () {
    var W = this.W, H = this.H, L = this.L, hz = L.horizon, b = this.buf;
    for (var y = 0; y < H; y++) {
      var col;
      if (y < hz) {
        var t = y / hz;
        col = t < 0.6 ? lerpC(C.skyTop, C.skyMid, t / 0.6) : lerpC(C.skyMid, C.skyLow, (t - 0.6) / 0.4);
      } else col = C.floor;
      for (var x = 0; x < W; x++) {
        var i = (y * W + x) * 4;
        b[i] = col[0]; b[i + 1] = col[1]; b[i + 2] = col[2]; b[i + 3] = 255;
      }
    }
    // dithered glow just above the horizon
    for (var y2 = hz - 10; y2 < hz; y2++) {
      var k = (y2 - (hz - 10)) / 10;
      for (var x2 = 0; x2 < W; x2++) if (BAYER[(y2 & 3) * 4 + (x2 & 3)] / 16 < k * 0.7) this.mix(x2, y2, C.horizon, 0.35);
    }
    for (var x3 = 0; x3 < W; x3++) this.put(x3, hz, C.horizon);
    // stars
    for (var s = 0; s < this.stars.length; s++) {
      var st = this.stars[s], tw = Math.sin(this.t * st.f + st.p);
      if (tw < -0.2) continue;
      var c = tw > 0.7 ? C.star : C.star2;
      this.mix(st.x, st.y, c, tw > 0.7 ? 1 : 0.55);
      if (st.big && tw > 0.85) { this.mix(st.x - 1, st.y, c, 0.4); this.mix(st.x + 1, st.y, c, 0.4); this.mix(st.x, st.y - 1, c, 0.4); this.mix(st.x, st.y + 1, c, 0.4); }
    }
    // synthwave floor: converging lines + horizontal lines rushing toward us
    var depth = H - hz;
    for (var n = -24; n <= 24; n++) {
      var xFar = L.cx + n * 4, xNear = L.cx + n * W * 0.09;
      for (var yy = hz + 1; yy < H; yy++) {
        var f = (yy - hz) / depth;
        var xx = xFar + (xNear - xFar) * f;
        this.mix(xx, yy, f < 0.25 ? C.gridDim : C.grid, 0.2 + f * 0.55);
      }
    }
    var phase = (this.t * 1.6) % 1, prevY = H + 10;
    for (var m = 0; m < 14; m++) {
      var z = m + 1 - phase;
      var yl = Math.round(hz + depth * 1.2 / z);
      if (yl <= hz || yl >= H) continue;
      if (prevY - yl < 3) continue;
      prevY = yl;
      var fa = (yl - hz) / depth;
      for (var x4 = 0; x4 < W; x4++) this.mix(x4, yl, fa < 0.25 ? C.gridDim : C.grid, 0.3 + fa * 0.7);
    }
  };

  Loader.prototype.drawShade = function () {
    var W = this.W, H = this.H, y0 = this.L.barY - 5;
    for (var y = y0; y < H; y++) {
      var k = Math.min(1, (y - y0) / 6) * 0.72;
      for (var x = 0; x < W; x++) this.mix(x, y, C.skyTop, k);
    }
  };

  Loader.prototype.drawHalo = function () {
    var L = this.L, R = L.R;
    var r0 = R + 2, r1 = Math.round(R * 1.75);
    for (var y = L.cy - r1; y <= L.cy + r1; y++) for (var x = L.cx - r1; x <= L.cx + r1; x++) {
      var d = Math.sqrt((x - L.cx) * (x - L.cx) + (y - L.cy) * (y - L.cy));
      if (d < r0 || d > r1) continue;
      var k = 1 - (d - r0) / (r1 - r0);
      k = k * k * (0.8 + 0.2 * Math.sin(this.t * 2));
      if (BAYER[(y & 3) * 4 + (x & 3)] / 16 < k) this.mix(x, y, k > 0.5 ? C.halo2 : C.halo, 0.75);
    }
  };

  Loader.prototype.ringPoint = function (t) {
    var L = this.L, rx = L.R * 1.62, ry = L.R * 0.33, rot = -0.2;
    var x = Math.cos(t) * rx, y = Math.sin(t) * ry;
    return { x: L.cx + x * Math.cos(rot) - y * Math.sin(rot), y: L.cy + x * Math.sin(rot) + y * Math.cos(rot), front: Math.sin(t) > 0 };
  };

  Loader.prototype.drawRing = function (front) {
    var L = this.L, steps = Math.round(L.R * 12);
    for (var i = 0; i < steps; i++) {
      var a = i / steps * Math.PI * 2, p = this.ringPoint(a);
      if (p.front !== front) continue;
      var dash = ((i / 3 + this.t * 18) | 0) % 5 !== 0;
      var c = front ? C.ring : C.ringDim;
      if (dash) this.put(p.x, p.y, c);
      this.mix(p.x, p.y + 1, front ? C.ringDim : C.halo, 0.6);
    }
    // coins riding the ring
    for (var j = 0; j < 3; j++) {
      var ca = this.t * 0.7 + j * Math.PI * 2 / 3, cp = this.ringPoint(ca);
      if (cp.front !== front) continue;
      var w = Math.abs(Math.sin(this.t * 5 + j * 1.7)) > 0.45 ? 1 : 0;
      var cx = Math.round(cp.x), cy = Math.round(cp.y) - 1;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3) continue;
        if (w === 0 && Math.abs(dx) > 0) continue;
        if (w === 1 && Math.abs(dx) > 1 && Math.abs(dy) > 0) continue;
        var col = (dx < 0 || dy < 0) ? C.coinHi : (dx + dy >= 2 ? C.coinLo : C.coin);
        if (!front) col = lerpC(col, C.ringDim, 0.6);
        this.put(cx + dx, cy + dy, col);
      }
    }
  };

  Loader.prototype.drawGlobe = function () {
    var L = this.L, R = L.R, tilt = 0.38, ct = Math.cos(tilt), st = Math.sin(tilt);
    var lx = -0.55, ly = 0.5, lz = 0.67, ln = Math.sqrt(lx * lx + ly * ly + lz * lz); lx /= ln; ly /= ln; lz /= ln;
    var deg = 180 / Math.PI, lineW = 95 / R;
    for (var dy = -R - 3; dy <= R + 3; dy++) for (var dx = -R - 3; dx <= R + 3; dx++) {
      var x = L.cx + dx, y = L.cy + dy;
      var fx = dx + 0.5, fy = dy + 0.5, d2 = fx * fx + fy * fy, d = Math.sqrt(d2);
      if (d > R) {
        if (d <= R + 2.5) {
          var k = 1 - (d - R) / 2.5;
          if (BAYER[(y & 3) * 4 + (x & 3)] / 16 < k * 0.9) this.mix(x, y, C.atmo, 0.45);
        }
        continue;
      }
      var nx = fx / R, ny = -fy / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      var wy = ny * ct + nz * st, wz = -ny * st + nz * ct;
      var lat = Math.asin(Math.max(-1, Math.min(1, wy))), lon = Math.atan2(nx, wz) + this.spin;
      var u = lon / (Math.PI * 2); u -= Math.floor(u);
      var col = Math.min(63, Math.floor(u * 64)), row = Math.min(31, Math.max(0, Math.floor((0.5 - lat / Math.PI) * 32)));
      var land = WORLD[row][col];
      var lit = nx * lx + ny * ly + nz * lz;
      var v = lit + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.28;
      var lvl = v > 0.58 ? 3 : v > 0.22 ? 2 : v > -0.12 ? 1 : 0;
      var c = land ? C.land[lvl] : C.ocean[lvl];
      // magenta lat / lon grid like the menu globe
      var latD = lat * deg, lonD = u * 360;
      var gLat = Math.abs(latD - Math.round(latD / 30) * 30) < lineW * 0.6;
      var gLon = Math.abs(lonD - Math.round(lonD / 30) * 30) * Math.cos(lat) < lineW * 0.6;
      if (gLat || gLon) c = lvl >= 2 ? C.gridLine : C.gridLineDark;
      else if (land && lvl === 0 && ((col * 7 + row * 13) % 9 === 0) && Math.sin(this.t * 3 + col + row) > 0) c = C.city;
      if (d > R - 1.2) c = lit > 0.05 ? C.rimLit : C.rimDark;
      this.put(x, y, c);
    }
  };

  Loader.prototype.drawSprite = function (rows, x0, y0, glow, glowA) {
    var h = rows.length, w = rows[0].length;
    // neon outline first
    for (var y = -1; y <= h; y++) for (var x = -1; x <= w; x++) {
      var here = y >= 0 && y < h && x >= 0 && x < w && rows[y][x] !== ".";
      if (here) continue;
      var near = false;
      for (var k = 0; k < 4 && !near; k++) {
        var ox = x + (k === 0 ? 1 : k === 1 ? -1 : 0), oy = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (oy >= 0 && oy < h && ox >= 0 && ox < w && rows[oy][ox] !== ".") near = true;
      }
      if (near) this.mix(x0 + x, y0 + y, glow, glowA);
    }
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      var ch = rows[yy][xx];
      if (ch !== ".") this.put(x0 + xx, y0 + yy, PAL[ch]);
    }
  };

  Loader.prototype.drawRunners = function (dt) {
    var L = this.L, R = L.R;
    // Jed a little right of the top, the Mutant behind him on the curve
    var aJ = 0.2, aM = -0.34;
    var jf = Math.floor(this.t * 11) % 4, mf = Math.floor(this.t * 7) % 2;
    var jRows = ART.jed[jf], mRows = ART.mutant[mf];
    var jx = Math.round(L.cx + Math.sin(aJ) * R) - 6, jy = Math.round(L.cy - Math.cos(aJ) * R) - jRows.length + 1 - (jf % 2);
    var mx = Math.round(L.cx + Math.sin(aM) * R) - 9, my = Math.round(L.cy - Math.cos(aM) * R) - mRows.length + 1 - (mf ? 1 : 0);
    // speed lines and dust behind Jed
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.07;
      if (jf === 0 || jf === 2) this.dust.push({ x: jx + 1, y: jy + jRows.length - 1, vx: -18 - Math.random() * 22, vy: -6 - Math.random() * 8, life: 0.5, max: 0.5, c: C.dust });
      if (mf === 0) this.dust.push({ x: mx + 2, y: my + mRows.length - 1, vx: -14 - Math.random() * 16, vy: -4 - Math.random() * 6, life: 0.6, max: 0.6, c: C.dust2 });
      if (Math.random() < 0.6) this.lines.push({ x: jx - 2, y: jy + 6 + Math.floor(Math.random() * 12), len: 4 + Math.floor(Math.random() * 8), life: 0.35 });
    }
    for (var i = this.lines.length - 1; i >= 0; i--) {
      var ln = this.lines[i]; ln.life -= dt; ln.x -= 70 * dt;
      if (ln.life <= 0) { this.lines.splice(i, 1); continue; }
      for (var k = 0; k < ln.len; k++) this.mix(ln.x - k, ln.y, C.speed, (ln.life / 0.35) * (1 - k / ln.len) * 0.7);
    }
    this.drawSprite(mRows, mx, my, C.mutGlow, 0.5);
    // the Mutant's eyes flare now and then
    if (Math.sin(this.t * 4.3) > 0.6) { this.mix(mx + 10, my + 2, C.mutGlow, 0.6); this.mix(mx + 12, my + 2, C.mutGlow, 0.6); }
    this.drawSprite(jRows, jx, jy, C.jedGlow, 0.55);
    for (var j = this.dust.length - 1; j >= 0; j--) {
      var p = this.dust[j]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt;
      if (p.life <= 0) { this.dust.splice(j, 1); continue; }
      var a = p.life / p.max;
      this.mix(p.x, p.y, p.c, a);
      if (a > 0.6) this.mix(p.x + 1, p.y, p.c, a * 0.5);
    }
  };

  Loader.prototype.drawBar = function () {
    var L = this.L, x0 = L.barX, y0 = L.barY, w = L.barW, h = 7;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (corner) continue;
      var edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      this.put(x0 + x, y0 + y, edge ? C.barEdge : C.barBack);
    }
    var inner = w - 4, fill = Math.round(inner * Math.max(0, Math.min(1, this.progress)));
    var shimmer = ((this.t * 90) % (inner + 30)) - 15;
    for (var xx = 0; xx < fill; xx++) {
      var t = xx / Math.max(1, inner - 1), c = lerpC(C.barA, C.barB, t);
      var gap = (xx % 6) === 5;
      for (var yy = 0; yy < 3; yy++) {
        var cc = gap ? C.barGap : (yy === 0 ? lerpC(c, C.white, 0.45) : c);
        if (!gap && Math.abs(xx - shimmer) < 3) cc = lerpC(cc, C.white, 0.55);
        this.put(x0 + 2 + xx, y0 + 2 + yy, cc);
      }
    }
    if (fill > 0 && fill < inner && Math.sin(this.t * 30) > -0.2) for (var y2 = 1; y2 < h - 1; y2++) this.put(x0 + 2 + fill, y0 + y2, C.white);
  };

  Loader.prototype.applyDissolve = function () {
    if (this.dissolve < 0) return;
    var W = this.W, H = this.H, b = this.buf, f = this.dissolve;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (BAYER8[(y & 7) * 8 + (x & 7)] < f) b[(y * W + x) * 4 + 3] = 0;
    }
  };

  Loader.prototype.frame = function (dt) {
    dt = Math.max(0, Math.min(0.1, dt));
    this.t += dt;
    this.spin += dt * 0.65;
    // bar eases toward the real value and creeps a little while waiting
    var goal = Math.max(this.target, Math.min(this.target + 0.06, this.progress + dt * 0.01));
    this.progress += (goal - this.progress) * Math.min(1, dt * 6);
    this.resize();
    this.drawBackground();
    this.drawHalo();
    this.drawRing(false);
    this.drawGlobe();
    this.drawRing(true);
    this.drawRunners(dt);
    this.drawShade();
    this.drawBar();
    this.applyDissolve();
    this.ctx.putImageData(this.img, 0, 0);
  };

  window.GSLoader = Loader;
})();
