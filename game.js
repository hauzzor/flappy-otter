/* Flappy Otter - the game
 *
 * The canvas is 320x200 logical pixels and CSS scales it up with nearest
 * neighbour, so every value below is in whole logical pixels and nothing
 * needs to know about the display size.
 *
 * Simulation runs on a fixed 1/120s step with an accumulator so the physics
 * are identical on a 60Hz laptop and a 144Hz monitor, and so a test can step
 * the world deterministically.
 */
window.OtterGame = (function () {
  "use strict";

  var W = 320;
  var H = 200;
  var GROUND_Y = 168;              // top of the dirt
  var OTTER_X = 56;                // fixed on screen; the world scrolls past
  /* The otter's stance, in sprite-local pixels: where the four feet actually
     are in the 20px-wide frames. Ground support is judged on this span rather
     than a single point, so the body stays on screen-correct ground. */
  var FOOT_LEFT = 3;
  var FOOT_RIGHT = 17;
  var TILE = 8;

  var GRAVITY = 1500;              // px/s^2
  var JUMP_VELOCITY = 620;         // px/s at the instant of take-off -> ~128px
  /* Releasing before the top of the arc multiplies the remaining upward
     speed, which is what makes a short press a low hop and a long press a
     full jump. The jump itself always starts on key-down. */
  var JUMP_CUT = 0.4;
  var COYOTE_TIME = 0.09;          // grace after walking off a ledge
  /* How far below the surface the otter may still be caught by a ledge. One
     falling step covers at most ~5px, so 8 covers normal overshoot while
     stopping an otter that has already dropped into a gap from drifting onto
     the far lip and snapping back up to ground level. */
  var LAND_DEPTH = 8;

  var BASE_SPEED = 105;            // px/s
  var MAX_SPEED = 190;
  var SPEED_PER_FISH = 1.4;

  var COIN_MIN = 45;               // band the otter can actually reach:
  var COIN_MAX = 135;              // ground 168 - 128 highest jump .. - 30 lowest
  var COIN_GAP_MIN = 68;
  var COIN_GAP_MAX = 104;
  var BAD_CHANCE = 0.18;           // spec: bad fish are the occasional one
  var BAD_REPEAT_LIMIT = 2;        // never three purple fish in a row

  var VOMIT_STAGGER = 0.6;         // seconds of no coin hits after spitting
  var MAX_SPIT_FISH = 26;
  var DUST_EVERY = 0.16;           // seconds between running dust puffs

  var TERRAIN_AHEAD = 800;           // generate this far beyond the right edge
  var COIN_AHEAD = 200;

  var STEP = 1 / 120;
  var MAX_STEPS_PER_FRAME = 8;

  var SKY_TOP = "#3d7fc4";
  var SKY_BOTTOM = "#a5d6ee";
  var HILL_FAR = "#6fa36b";
  var HILL_NEAR = "#4f8a52";
  var GRASS = "#57a94f";
  var GRASS_LIGHT = "#6fc25e";
  var DIRT = "#8a5a34";
  var DIRT_DARK = "#6b4423";
  var CLOUD = "#f2f8fb";

  /* deterministic RNG so a test can replay an exact run */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function clamp(value, low, high) {
    return value < low ? low : value > high ? high : value;
  }

  /* ---------- sound ----------
   * A few short synthesised blips. Created lazily on the first real key press
   * so no autoplay policy is ever violated, and muted until M is pressed. */
  var Audio = {
    context: null,
    muted: true,

    ensure: function () {
      if (this.muted) return null;
      if (!this.context) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try { this.context = new Ctor(); } catch (err) { return null; }
      }
      if (this.context.state === "suspended") this.context.resume();
      return this.context;
    },

    blip: function (from, to, duration, type, gain) {
      var ctx = this.ensure();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var amp = ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(from, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ctx.currentTime + duration);
      amp.gain.setValueAtTime(gain || 0.06, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },

    jump: function (power) { this.blip(220 + power * 260, 620, 0.14, "square", 0.05); },
    coin: function () { this.blip(880, 1320, 0.09, "square", 0.05); },
    spit: function () { this.blip(300, 70, 0.34, "sawtooth", 0.07); },
    over: function () { this.blip(420, 80, 0.6, "triangle", 0.07); }
  };

  /* ---------- game ---------- */

  function Game(canvas, options) {
    var opts = options || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sprites = window.OtterSprites;
    this.coinSize = this.sprites.COIN_SIZE;

    this.rand = opts.random || makeRng(opts.seed || 20240607);
    this.autoStart = opts.autoStart !== false;
    this.frozen = false;                 // test hook: hold the world still

    this.state = "ready";                // ready | playing | dead
    this.score = 0;
    this.bestThisRun = 0;

    this.travel = 0;
    this.speed = BASE_SPEED;
    this.distanceAtLastFish = 0;

    this.otter = { y: GROUND_Y, vy: 0, onGround: true, coyote: 0, runPhase: 0 };
    this.holding = false;

    this.coins = [];
    this.particles = [];
    this.shake = 0;
    this.stagger = 0;
    this.badStreak = 0;
    this.dustTimer = 0;
    this.elapsed = 0;

    this.ground = [];
    this.groundCursor = 0;
    this.nextCoinX = 260;
    this.nextCoinBad = false;

    this.reset(true);

    this.listeners = [];
    this._accumulator = 0;
    this._lastTime = 0;
    this._raf = null;
  }

  Game.W = W;
  Game.H = H;
  Game.GROUND_Y = GROUND_Y;

  /* ---------- terrain ---------- */

  Game.prototype.buildGround = function () {
    this.ground.length = 0;
    this.pushGroundSegment(-400, 620);
    /* the cursor must continue from the end of that segment, otherwise the
       generator lays overlapping segments back over the opening runway */
    this.groundCursor = 620;
  };

  Game.prototype.pushGroundSegment = function (from, to) {
    this.ground.push({ x0: from, x1: to });
  };

  /* Gaps are 48-74px. A full-charge jump travels ~87px horizontally at the
     starting speed, so the widest gap leaves about 13px of timing room -
     tight, but never a coin-flip. Jumping late is better than jumping early:
     every pixel spent airborne over solid ground is a pixel not spent over
     the hole. */
  Game.prototype.extendGround = function () {
    while (this.groundCursor < this.travel + W + TERRAIN_AHEAD) {
      var safe = 130 + this.rand() * 190;
      var gap = 48 + this.rand() * 26;
      this.pushGroundSegment(this.groundCursor, this.groundCursor + safe);
      this.groundCursor += safe + gap;
    }
    while (this.ground.length && this.ground[0].x1 < this.travel - 200) {
      this.ground.shift();
    }
  };

  Game.prototype.solidAt = function (worldX) {
    for (var i = 0; i < this.ground.length; i++) {
      var seg = this.ground[i];
      if (worldX >= seg.x0 && worldX <= seg.x1) return true;
    }
    return false;
  };

  /* the otter's feet, in world coordinates */
  Game.prototype.feetWorldX = function () {
    return this.travel + OTTER_X + 10;
  };

  /* The full stance in world coordinates. */
  Game.prototype.footBounds = function () {
    return {
      left: this.travel + OTTER_X + FOOT_LEFT,
      right: this.travel + OTTER_X + FOOT_RIGHT
    };
  };

  /* True while any part of the stance is over solid ground, so the otter runs
     right off the edge before it drops - if only a point were tested it would
     fall while its body was still visibly standing on the platform. */
  Game.prototype.groundedHere = function () {
    var feet = this.footBounds();
    for (var i = 0; i < this.ground.length; i++) {
      var seg = this.ground[i];
      if (seg.x0 <= feet.right && seg.x1 >= feet.left) return true;
    }
    return false;
  };

  Game.prototype.speedForScore = function () {
    return Math.min(MAX_SPEED, BASE_SPEED + this.score * SPEED_PER_FISH);
  };

  /* ---------- coins ---------- */

  Game.prototype.extendCoins = function () {
    while (this.nextCoinX < this.travel + W + COIN_AHEAD) {
      var bad = this.badStreak < BAD_REPEAT_LIMIT && this.rand() < BAD_CHANCE;
      var y = COIN_MIN + this.rand() * (COIN_MAX - COIN_MIN);
      this.coins.push({ x: this.nextCoinX, y: y, bad: bad, taken: false, seed: this.rand() });
      this.badStreak = bad ? this.badStreak + 1 : 0;
      this.nextCoinX += COIN_GAP_MIN + this.rand() * (COIN_GAP_MAX - COIN_GAP_MIN);
    }
    while (this.coins.length && this.coins[0].x < this.travel - 120) {
      this.coins.shift();
    }
  };

  /* ---------- otter ---------- */

  Game.prototype.hitBox = function () {
    var o = this.otter;
    return { x: OTTER_X + 4, y: o.y - 12, w: 13, h: 11 };
  };

  Game.prototype.spits = function () {
    var lost = this.score;
    this.score = 0;
    this.stagger = VOMIT_STAGGER;
    this.shake = 0.32;

    var count = Math.min(lost, MAX_SPIT_FISH);
    for (var i = 0; i < count; i++) {
      var spread = (i / Math.max(1, count - 1)) - 0.5;
      this.particles.push({
        x: OTTER_X + 14,
        y: this.otter.y - 9,
        vx: 20 + spread * 150 + this.rand() * 30,
        vy: -260 - this.rand() * 130,
        spin: (this.rand() - 0.5) * 6,
        life: 1.1 + this.rand() * 0.5,
        kind: "fish"
      });
    }
    this.spawnDust(4, OTTER_X + 12, this.otter.y);
    Audio.spit();
    this.emit("spit", { lost: lost });
  };

  Game.prototype.spawnDust = function (count, x, y) {
    for (var i = 0; i < count; i++) {
      this.particles.push({
        x: x + (this.rand() - 0.5) * 8,
        y: y,
        vx: -30 - this.rand() * 40,
        vy: -20 - this.rand() * 40,
        spin: 0,
        life: 0.3 + this.rand() * 0.25,
        kind: "dust"
      });
    }
  };

  Game.prototype.die = function () {
    if (this.state === "dead") return;
    this.state = "dead";
    this.shake = 0.4;
    Audio.over();
    this.emit("dead", { score: this.score });
  };

  /* ---------- input ---------- */

  Game.prototype.press = function () {
    if (this.state === "dead") return;
    /* jump the instant the key goes down - there is no wind-up */
    if (this.otter.onGround || this.otter.coyote > 0) {
      this.holding = true;
      this.jump();
    }
  };

  Game.prototype.release = function () {
    if (this.state === "dead") return;
    if (this.holding && this.otter.vy < 0) {
      /* let go on the way up and the rest of the climb is cut short; hold to
         the top and the jump reaches its full height */
      this.otter.vy *= JUMP_CUT;
    }
    this.holding = false;
  };

  Game.prototype.jump = function () {
    this.otter.vy = -JUMP_VELOCITY;
    this.otter.onGround = false;
    this.otter.coyote = 0;
    if (this.state === "ready") {
      this.state = "playing";
      this.emit("start", {});
    }
    this.spawnDust(3, OTTER_X + 6, this.otter.y);
    Audio.jump(0.7);
  };

  /* ---------- events ---------- */

  Game.prototype.on = function (fn) {
    this.listeners.push(fn);
    return this;
  };

  Game.prototype.emit = function (name, payload) {
    for (var i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](name, payload || {}); }
      catch (err) { if (window.console) window.console.error("Game listener failed", err); }
    }
  };

  /* ---------- simulation ---------- */

  Game.prototype.reset = function (initial) {
    if (!initial) this.emit("reset", {});
    this.state = "ready";
    this.score = 0;
    this.bestThisRun = 0;
    this.travel = 0;
    this.speed = BASE_SPEED;
    this.otter.y = GROUND_Y;
    this.otter.vy = 0;
    this.otter.onGround = true;
    this.otter.coyote = 0;
    this.otter.runPhase = 0;
    this.holding = false;
    this.coins.length = 0;
    this.particles.length = 0;
    this.shake = 0;
    this.stagger = 0;
    this.badStreak = 0;
    this.dustTimer = 0;
    this.elapsed = 0;
    this.nextCoinX = 260;
    this.nextCoinBad = false;
    this.buildGround();
    this.extendGround();
    this.extendCoins();
  };

  Game.prototype.step = function (dt) {
    if (this.frozen) return;
    if (this.state === "ready") {
      /* world is parked until the first jump; the otter just idles */
      this.otter.runPhase += dt * 2;
      return;
    }
    if (this.state === "dead") {
      this.updateParticles(dt);
      this.otter.vy += GRAVITY * dt;
      this.otter.y += this.otter.vy * dt;
      this.shake = Math.max(0, this.shake - dt);
      return;
    }

    this.elapsed += dt;

    /* horizontal scroll */
    this.speed = this.speedForScore();
    this.travel += this.speed * dt;

    this.extendGround();
    this.extendCoins();

    /* gravity */
    this.otter.vy += GRAVITY * dt;
    this.otter.y += this.otter.vy * dt;

    if (this.otter.onGround) this.otter.coyote = COYOTE_TIME;
    else this.otter.coyote = Math.max(0, this.otter.coyote - dt);

    var supported = this.groundedHere();
    var atSurface = this.otter.y >= GROUND_Y &&
      this.otter.y - GROUND_Y <= LAND_DEPTH;

    if (supported && atSurface && this.otter.vy >= 0) {
      if (!this.otter.onGround) {
        this.spawnDust(4, OTTER_X + 8, GROUND_Y);
      }
      this.otter.y = GROUND_Y;
      this.otter.vy = 0;
      this.otter.onGround = true;
    } else {
      /* nothing under the stance, or too far below to be caught: keep falling */
      this.otter.onGround = false;
    }

    /* fell into a gap */
    if (!this.otter.onGround && this.otter.y > H + 20) {
      this.die();
      return;
    }

    this.collectCoins();

    /* running dust */
    if (this.otter.onGround) {
      this.otter.runPhase += dt * 12;
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = DUST_EVERY;
        this.spawnDust(1, OTTER_X + 2, GROUND_Y);
      }
    }

    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt);
    this.stagger = Math.max(0, this.stagger - dt);
  };

  Game.prototype.collectCoins = function () {
    if (this.stagger > 0) return;
    var box = this.hitBox();

    for (var i = 0; i < this.coins.length; i++) {
      var coin = this.coins[i];
      if (coin.taken) continue;

      var sx = coin.x - this.travel + OTTER_X;
      var half = this.coinSize / 2 - 1.5;
      if (sx + half < box.x || sx - half > box.x + box.w) continue;
      if (coin.y + half < box.y || coin.y - half > box.y + box.h) continue;

      coin.taken = true;
      if (coin.bad) {
        this.spits();
      } else {
        this.score += 1;
        if (this.score > this.bestThisRun) this.bestThisRun = this.score;
        Audio.coin();
        this.emit("fish", { score: this.score });
      }
    }
  };

  Game.prototype.updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += (p.kind === "fish" ? GRAVITY * 0.55 : GRAVITY * 0.12) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  };

  /* ---------- rendering ---------- */

  Game.prototype.render = function () {
    var ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.fillStyle = SKY_TOP;
    ctx.fillRect(0, 0, W, Math.floor(H * 0.6));
    ctx.fillStyle = SKY_BOTTOM;
    ctx.fillRect(0, Math.floor(H * 0.6), W, H - Math.floor(H * 0.6));

    this.drawSun();
    this.drawClouds();
    this.drawHills(0.18, HILL_FAR, 78, 26, 0.021);
    this.drawHills(0.38, HILL_NEAR, 96, 18, 0.037);

    var shakeX = 0, shakeY = 0;
    if (this.shake > 0) {
      var mag = Math.round(this.shake * 14);
      shakeX = Math.round((this.rand() - 0.5) * 2 * mag);
      shakeY = Math.round((this.rand() - 0.5) * 2 * mag);
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawGround();
    this.drawCoins();
    this.drawOtter();
    this.drawParticles();
    this.drawLift();

    ctx.restore();
  };

  Game.prototype.drawSun = function () {
    var ctx = this.ctx;
    var cx = W - 44;
    var cy = 26;
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,243,196,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
  };

  Game.prototype.drawClouds = function () {
    var ctx = this.ctx;
    ctx.fillStyle = CLOUD;
    var span = 420;
    for (var i = 0; i < 5; i++) {
      var seedX = i * 137 + 40;
      var x = (((seedX - this.travel * 0.22) % span) + span) % span;
      if (x > W + 30) continue;
      var y = 18 + (i % 3) * 14;
      this.puff(x, y, 7, 3);
      this.puff(x + 9, y - 2, 6, 3);
      this.puff(x + 17, y + 1, 5, 2);
    }
  };

  /* one cloud puff: a few overlapping boxes, chunky on purpose */
  Game.prototype.puff = function (x, y, w, h) {
    var ctx = this.ctx;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
    ctx.fillRect(Math.round(x) + 2, Math.round(y) - 2, w - 4, 2);
  };

  Game.prototype.drawHills = function (parallax, colour, baseY, amp, freq) {
    var ctx = this.ctx;
    var span = 96;
    var offset = (this.travel * parallax) % span;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var x = -span; x <= W + span; x += 4) {
      var wx = (x + offset) * freq * 40;
      var y = baseY + Math.sin(wx) * amp + Math.sin(wx * 2.3) * (amp * 0.35);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + span, H);
    ctx.closePath();
    ctx.fill();
  };

  Game.prototype.drawGround = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.ground.length; i++) {
      var seg = this.ground[i];
      var x0 = Math.round(seg.x0 - this.travel + OTTER_X);
      var x1 = Math.round(seg.x1 - this.travel + OTTER_X);
      if (x1 < 0 || x0 > W) continue;

      var left = Math.max(0, x0);
      var right = Math.min(W, x1);
      var width = right - left;
      if (width <= 0) continue;

      ctx.fillStyle = DIRT;
      ctx.fillRect(left, GROUND_Y, width, H - GROUND_Y);

      /* dirt speckles keyed to world position so they do not crawl */
      ctx.fillStyle = DIRT_DARK;
      var startIndex = Math.floor(seg.x0 / TILE) * TILE;
      for (var wx = startIndex; wx <= seg.x1; wx += TILE) {
        var sx = Math.round(wx - this.travel + OTTER_X);
        if (sx < left - TILE || sx > right + TILE) continue;
        var h = ((wx * 2654435761) >>> 0) % 100;
        var depth = GROUND_Y + 5 + (h % 14);
        if (depth > H - 2) continue;
        ctx.fillRect(sx + (h % 3), depth, 3, 2);
      }

      /* grass cap with a lighter top edge */
      ctx.fillStyle = GRASS;
      ctx.fillRect(left, GROUND_Y, width, 4);
      ctx.fillStyle = GRASS_LIGHT;
      ctx.fillRect(left, GROUND_Y, width, 1);
    }
  };

  Game.prototype.drawCoins = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.coins.length; i++) {
      var coin = this.coins[i];
      if (coin.taken) continue;
      var sx = Math.round(coin.x - this.travel + OTTER_X);
      if (sx < -16 || sx > W + 16) continue;
      var bob = Math.round(Math.sin(this.elapsed * 3 + coin.seed * 6.28) * 1.5);
      var sy = Math.round(coin.y + bob);
      var sprite = coin.bad ? this.sprites.BAD_COIN : this.sprites.GOOD_COIN;
      ctx.drawImage(sprite, sx - (this.coinSize >> 1), sy - (this.coinSize >> 1));
    }
  };

  Game.prototype.drawOtter = function () {
    var ctx = this.ctx;
    var o = this.otter;
    var sprite;

    if (this.state === "dead" || this.stagger > 0) {
      sprite = this.sprites.OTTER.hurt;
    } else if (!o.onGround) {
      sprite = this.sprites.OTTER.jump;
    } else {
      sprite = (Math.floor(o.runPhase) % 2 === 0)
        ? this.sprites.OTTER.runA
        : this.sprites.OTTER.runB;
    }

    var x = Math.round(OTTER_X);
    var y = Math.round(o.y - sprite.height);
    ctx.drawImage(sprite, x, y);
  };

  Game.prototype.drawParticles = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      if (p.kind === "fish") {
        ctx.globalAlpha = p.life > 0.4 ? 1 : p.life / 0.4;
        ctx.drawImage(this.sprites.GOOD_COIN,
          Math.round(p.x - this.coinSize / 2),
          Math.round(p.y - this.coinSize / 2));
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        ctx.fillStyle = "#c8b79a";
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
        ctx.globalAlpha = 1;
      }
    }
  };

  /* While the key is down and the otter is still climbing, a short bar drains
     to show the remaining boost: let go now and the jump stops climbing. It
     is the only feedback that holding is doing anything. */
  Game.prototype.drawLift = function () {
    if (!this.holding || this.otter.onGround || this.otter.vy >= 0) return;
    var ctx = this.ctx;
    var frac = clamp(-this.otter.vy / JUMP_VELOCITY, 0, 1);
    var w = 16;
    var x = Math.round(OTTER_X + 2);
    var y = Math.round(this.otter.y - 22);
    ctx.fillStyle = "#1b1d38";
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = frac > 0.35 ? "#9fd0ea" : "#f2b134";
    ctx.fillRect(x, y, Math.max(1, Math.round(w * frac)), 2);
  };

  /* ---------- loop ---------- */

  Game.prototype.start = function () {
    if (this._raf !== null) return;
    var self = this;
    this._lastTime = 0;
    var frame = function (ts) {
      self._raf = window.requestAnimationFrame(frame);
      if (!self._lastTime) self._lastTime = ts;
      var dt = (ts - self._lastTime) / 1000;
      self._lastTime = ts;
      if (dt > 0.25) dt = 0.25;          // tab was backgrounded

      self._accumulator += dt;
      var steps = 0;
      while (self._accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
        self.step(STEP);
        self._accumulator -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) self._accumulator = 0;

      self.render();
    };
    this._raf = window.requestAnimationFrame(frame);
  };

  Game.prototype.stop = function () {
    if (this._raf !== null) {
      window.cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  };

  /* ---------- test hooks ---------- */

  Game.prototype.spawnCoinAt = function (worldX, y, bad) {
    this.coins.push({ x: worldX, y: y, bad: !!bad, taken: false, seed: 0 });
    return this.coins[this.coins.length - 1];
  };

  Game.prototype.clearCoins = function () {
    this.coins.length = 0;
  };

  Game.prototype.advanceFrames = function (frames) {
    for (var i = 0; i < frames; i++) this.step(STEP);
  };

  return {
    Game: Game,
    W: W,
    H: H,
    GROUND_Y: GROUND_Y,
    OTTER_X: OTTER_X,
    FOOT_LEFT: FOOT_LEFT,
    FOOT_RIGHT: FOOT_RIGHT,
    GRAVITY: GRAVITY,
    JUMP_VELOCITY: JUMP_VELOCITY,
    JUMP_CUT: JUMP_CUT,
    BASE_SPEED: BASE_SPEED,
    MAX_SPEED: MAX_SPEED,
    COYOTE_TIME: COYOTE_TIME,
    COIN_MIN: COIN_MIN,
    COIN_MAX: COIN_MAX,
    BAD_CHANCE: BAD_CHANCE,
    GAP_MAX: 74,
    VOMIT_STAGGER: VOMIT_STAGGER,
    MAX_SPIT_FISH: MAX_SPIT_FISH,
    STEP: STEP,
    Audio: Audio,
    makeRng: makeRng
  };
})();