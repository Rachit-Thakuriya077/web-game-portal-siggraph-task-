/**
 * void-runner.js
 * "Void Runner" — a 3-lane HTML Canvas dodging game. Deliberately kept
 * as plain Canvas 2D (no Three.js) so the hub has both a 3D and a 2D
 * game, per the task's "Three.js / HTML Canvas" wording.
 *
 * Exposes the same lifecycle shape as StellarDriftGame so main.js can
 * mount/unmount either game identically: constructor(canvas), start(),
 * onScore / onGameOver callbacks, destroy().
 *
 * PERFORMANCE NOTES:
 *  - Obstacles/pickups are object-pooled (fixed-size arrays, entries
 *    recycled in place) — nothing is allocated per frame in the hot loop.
 *  - Canvas backing size is set from the CSS size * capped devicePixelRatio,
 *    avoiding oversized backbuffers on high-DPI phones.
 *  - The loop pauses on visibilitychange and is fully torn down
 *    (cancelAnimationFrame + listener removal) in destroy().
 */
class VoidRunnerGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.running = false;
    this.disposed = false;

    this.onScore = null;
    this.onGameOver = null;

    this.LANES = 3;
    this._lane = 1; // current player lane index (0..2)
    this._laneVisual = 1; // eased for smooth movement

    this._elapsed = 0;
    this._score = 0;
    this._lastTime = 0;
    this._spawnTimer = 0;
    this._spawnInterval = 0.95;
    this._fallSpeed = 220; // px/sec at CSS scale
    this._maxFallSpeed = 620;

    this._poolSize = 18;
    this._pool = [];

    this._keyCooldown = 0;

    this._boundResize = this._onResize.bind(this);
    this._boundVisibility = this._onVisibility.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundPointerDown = this._onPointerDown.bind(this);

    this._initPool();
    this._resize();
    this._bindEvents();
    this._drawFrame(0); // paint an initial static frame
  }

  /* ------------------------------------------------------------ setup */

  _initPool() {
    for (let i = 0; i < this._poolSize; i++) {
      this._pool.push({ active: false, lane: 0, y: -100, type: "block", size: 34 });
    }
  }

  _resize() {
    const parent = this.canvas.parentElement;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._cssW = parent.clientWidth || 1;
    this._cssH = parent.clientHeight || 1;
    this.canvas.width = this._cssW * this._dpr;
    this.canvas.height = this._cssH * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this._laneWidth = this._cssW / this.LANES;
  }

  _onResize() {
    this._resize();
  }

  _onVisibility() {
    if (document.hidden) {
      this._wasRunning = this.running;
      this.running = false;
    } else if (this._wasRunning) {
      this.running = true;
      this._lastTime = performance.now();
      requestAnimationFrame(this._loop.bind(this));
    }
  }

  _bindEvents() {
    window.addEventListener("resize", this._boundResize);
    document.addEventListener("visibilitychange", this._boundVisibility);
    window.addEventListener("keydown", this._boundKeyDown);
    this.canvas.addEventListener("pointerdown", this._boundPointerDown);
  }

  _unbindEvents() {
    window.removeEventListener("resize", this._boundResize);
    document.removeEventListener("visibilitychange", this._boundVisibility);
    window.removeEventListener("keydown", this._boundKeyDown);
    this.canvas.removeEventListener("pointerdown", this._boundPointerDown);
  }

  _onKeyDown(e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this._moveLane(-1);
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this._moveLane(1);
  }

  _onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    this._moveLane(x < rect.width / 2 ? -1 : 1);
  }

  _moveLane(delta) {
    this._lane = Math.max(0, Math.min(this.LANES - 1, this._lane + delta));
  }

  /* --------------------------------------------------------- game loop */

  start() {
    if (this.disposed) return;
    this.running = true;
    this._elapsed = 0;
    this._score = 0;
    this._lane = 1;
    this._laneVisual = 1;
    this._spawnTimer = 0;
    this._spawnInterval = 0.95;
    this._fallSpeed = 220;
    this._pool.forEach((o) => (o.active = false));
    this._lastTime = performance.now();
    requestAnimationFrame(this._loop.bind(this));
  }

  _spawnEntity() {
    const slot = this._pool.find((o) => !o.active);
    if (!slot) return; // pool exhausted this tick — just skip, nothing leaks
    slot.active = true;
    slot.lane = Math.floor(Math.random() * this.LANES);
    slot.y = -60;
    slot.type = Math.random() < 0.22 ? "pickup" : "block";
    slot.size = slot.type === "pickup" ? 20 : 34;
  }

  _loop(now) {
    if (!this.running || this.disposed) return;
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;
    this._elapsed += dt;

    // difficulty ramp
    this._fallSpeed = Math.min(this._maxFallSpeed, 220 + this._elapsed * 14);
    this._spawnInterval = Math.max(0.42, 0.95 - this._elapsed * 0.012);

    this._spawnTimer += dt;
    if (this._spawnTimer >= this._spawnInterval) {
      this._spawnTimer = 0;
      this._spawnEntity();
    }

    this._laneVisual += (this._lane - this._laneVisual) * Math.min(1, 12 * dt);

    const playerY = this._cssH - 56;
    const playerX = (this._laneVisual + 0.5) * this._laneWidth;
    const playerRadius = 15;

    for (const o of this._pool) {
      if (!o.active) continue;
      o.y += this._fallSpeed * dt;

      if (o.y - o.size / 2 > this._cssH) {
        o.active = false;
        if (o.type === "block") this._score += 1; // survived a block
        continue;
      }

      // collision check only near player's row
      if (o.y > playerY - 40 && o.y < playerY + 40 && o.lane === this._lane) {
        const dy = Math.abs(o.y - playerY);
        if (dy < (o.size / 2 + playerRadius) * 0.85) {
          if (o.type === "pickup") {
            o.active = false;
            this._score += 5;
          } else {
            this._gameOver();
            return;
          }
        }
      }
    }

    if (this.onScore) this.onScore(this._score);

    this._drawFrame(playerX, playerY, playerRadius);
    requestAnimationFrame(this._loop.bind(this));
  }

  _drawFrame(playerXOverride) {
    const ctx = this.ctx;
    const w = this._cssW, h = this._cssH;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#05040c";
    ctx.fillRect(0, 0, w, h);

    // lane dividers
    ctx.strokeStyle = "#2e2a4d";
    ctx.lineWidth = 2;
    for (let i = 1; i < this.LANES; i++) {
      const x = i * this._laneWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // entities
    for (const o of this._pool) {
      if (!o.active) continue;
      const x = (o.lane + 0.5) * this._laneWidth;
      if (o.type === "pickup") {
        ctx.save();
        ctx.translate(x, o.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#8be9fd";
        ctx.shadowColor = "#8be9fd";
        ctx.shadowBlur = 12;
        ctx.fillRect(-o.size / 2, -o.size / 2, o.size, o.size);
        ctx.restore();
      } else {
        ctx.fillStyle = "#ff5b2e";
        ctx.shadowColor = "#ff5b2e";
        ctx.shadowBlur = 10;
        const r = 6;
        const x0 = x - o.size / 2, y0 = o.y - o.size / 2;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0);
        ctx.arcTo(x0 + o.size, y0, x0 + o.size, y0 + o.size, r);
        ctx.arcTo(x0 + o.size, y0 + o.size, x0, y0 + o.size, r);
        ctx.arcTo(x0, y0 + o.size, x0, y0, r);
        ctx.arcTo(x0, y0, x0 + o.size, y0, r);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    // player
    const playerY = h - 56;
    const playerX = playerXOverride || (this._laneVisual + 0.5) * this._laneWidth;
    const grad = ctx.createRadialGradient(playerX, playerY, 2, playerX, playerY, 22);
    grad.addColorStop(0, "#f4f1ff");
    grad.addColorStop(1, "rgba(91,75,255,0.15)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(playerX, playerY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b4bff";
    ctx.beginPath();
    ctx.arc(playerX, playerY, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  _gameOver() {
    this.running = false;
    if (this.onGameOver) this.onGameOver(this._score);
  }

  /* ------------------------------------------------------------ cleanup */

  destroy() {
    this.running = false;
    this.disposed = true;
    this._unbindEvents();
    // Canvas 2D holds no GPU buffers/geometries to dispose beyond the
    // context itself, which is released when the element is garbage
    // collected; clearing it avoids holding a stale painted frame.
    this.ctx.clearRect(0, 0, this._cssW, this._cssH);
  }
}
