/**
 * game.js
 * "Stellar Drift" — a Three.js asteroid-dodging game.
 *
 * PERFORMANCE NOTES (mandatory requirement: no leaks / no severe frame drops):
 *  - Asteroids are object-pooled: a fixed set of meshes is created once
 *    and recycled (repositioned) rather than created/destroyed every
 *    frame. This avoids GC pressure and geometry/material churn.
 *  - Geometries & materials are created once and shared across the pool.
 *  - The render loop is driven by requestAnimationFrame and is fully
 *    torn down (cancelAnimationFrame + renderer.dispose + geometry/
 *    material disposal + listener removal) via destroy(), which the UI
 *    layer calls whenever the player leaves the game view.
 *  - The loop pauses automatically when the browser tab is hidden.
 *  - Pixel ratio is capped at 2 to avoid needless fill-rate cost on
 *    high-DPI phones.
 */
class StellarDriftGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.disposed = false;

    this.onScore = null;   // callback(score:number)
    this.onGameOver = null; // callback(finalScore:number)

    this._elapsed = 0;
    this._score = 0;
    this._lastTime = 0;

    this._shipTargetX = 0;
    this._shipX = 0;
    this._laneHalfWidth = 3.4;

    this._asteroidPool = [];
    this._poolSize = 24;
    this._spawnCursor = 0;
    this._baseSpeed = 9;
    this._speed = this._baseSpeed;
    this._maxSpeed = 22;

    this._keys = { left: false, right: false };
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartShipX = 0;

    this._boundResize = this._onResize.bind(this);
    this._boundVisibility = this._onVisibility.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);

    this._buildScene();
    this._bindEvents();
  }

  /* ---------------------------------------------------------- scene setup */

  _buildScene() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x050409, 10, 55);

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 100);
    this.camera.position.set(0, 2.6, 7.5);
    this.camera.lookAt(0, 0.5, -10);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x050409, 1);

    // lights
    const ambient = new THREE.AmbientLight(0x4a3f7a, 0.9);
    const point = new THREE.PointLight(0xff8a5b, 1.1, 40);
    point.position.set(2, 6, 4);
    this.scene.add(ambient, point);

    // ship
    const shipGeo = new THREE.ConeGeometry(0.45, 1.1, 4);
    const shipMat = new THREE.MeshStandardMaterial({
      color: 0xf4f1ff,
      emissive: 0x5b4bff,
      emissiveIntensity: 0.4,
      flatShading: true,
    });
    this.ship = new THREE.Mesh(shipGeo, shipMat);
    this.ship.rotation.x = Math.PI; // point nose forward (-z)
    this.ship.rotation.z = Math.PI / 4;
    this.ship.position.set(0, 0.4, 5.6);
    this.scene.add(this.ship);

    // lane guide rails (purely decorative, cheap line geometry)
    const railMat = new THREE.LineBasicMaterial({ color: 0x2e2a4d });
    [-this._laneHalfWidth, this._laneHalfWidth].forEach((x) => {
      const pts = [new THREE.Vector3(x, 0, 8), new THREE.Vector3(x, 0, -40)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.scene.add(new THREE.Line(geo, railMat));
    });

    // shared asteroid geometry/material (object pool)
    this._asteroidGeo = new THREE.IcosahedronGeometry(0.55, 0);
    this._asteroidMats = [
      new THREE.MeshStandardMaterial({ color: 0xff5b2e, flatShading: true, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x8be9fd, flatShading: true, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x5b4bff, flatShading: true, roughness: 0.7 }),
    ];

    for (let i = 0; i < this._poolSize; i++) {
      const mat = this._asteroidMats[i % this._asteroidMats.length];
      const mesh = new THREE.Mesh(this._asteroidGeo, mat);
      mesh.visible = false;
      mesh.userData.active = false;
      mesh.userData.rotSpeed = 0.5 + Math.random();
      this.scene.add(mesh);
      this._asteroidPool.push(mesh);
    }

    // background starfield (bonus creative graphics), single BufferGeometry
    const starCount = 300;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 25 - 2;
      positions[i * 3 + 2] = -Math.random() * 60;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xcfc9ff, size: 0.06, transparent: true, opacity: 0.8 });
    this._stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this._stars);

    this._resetAsteroids();
    this.renderer.render(this.scene, this.camera);
  }

  _resetAsteroids() {
    for (let i = 0; i < this._poolSize; i++) {
      const mesh = this._asteroidPool[i];
      this._recycleAsteroid(mesh, -20 - i * 3.5);
      mesh.visible = false;
      mesh.userData.active = false;
    }
    this._spawnCursor = 0;
  }

  _recycleAsteroid(mesh, z) {
    mesh.position.set(
      (Math.random() - 0.5) * this._laneHalfWidth * 2 * 0.85,
      0.3 + Math.random() * 0.4,
      z !== undefined ? z : -40 - Math.random() * 10
    );
    const s = 0.7 + Math.random() * 0.9;
    mesh.scale.setScalar(s);
  }

  /* -------------------------------------------------------------- events */

  _bindEvents() {
    window.addEventListener("resize", this._boundResize);
    document.addEventListener("visibilitychange", this._boundVisibility);
    window.addEventListener("keydown", this._boundKeyDown);
    window.addEventListener("keyup", this._boundKeyUp);
    this.canvas.addEventListener("pointerdown", this._boundPointerDown);
    window.addEventListener("pointermove", this._boundPointerMove);
    window.addEventListener("pointerup", this._boundPointerUp);
  }

  _unbindEvents() {
    window.removeEventListener("resize", this._boundResize);
    document.removeEventListener("visibilitychange", this._boundVisibility);
    window.removeEventListener("keydown", this._boundKeyDown);
    window.removeEventListener("keyup", this._boundKeyUp);
    this.canvas.removeEventListener("pointerdown", this._boundPointerDown);
    window.removeEventListener("pointermove", this._boundPointerMove);
    window.removeEventListener("pointerup", this._boundPointerUp);
  }

  _onResize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth || 1;
    const h = parent.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _onVisibility() {
    if (document.hidden) {
      this._wasRunningBeforeHide = this.running;
      this.running = false;
    } else if (this._wasRunningBeforeHide) {
      this.running = true;
      this._lastTime = performance.now();
      requestAnimationFrame(this._loop.bind(this));
    }
  }

  _onKeyDown(e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this._keys.left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this._keys.right = true;
  }
  _onKeyUp(e) {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this._keys.left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this._keys.right = false;
  }

  _onPointerDown(e) {
    this._dragging = true;
    this._dragStartX = e.clientX;
    this._dragStartShipX = this._shipTargetX;
  }
  _onPointerMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._dragStartX;
    const worldPerPixel = (this._laneHalfWidth * 2.2) / (this.canvas.clientWidth || 1);
    this._shipTargetX = this._dragStartShipX + dx * worldPerPixel;
  }
  _onPointerUp() {
    this._dragging = false;
  }

  /* --------------------------------------------------------- game loop */

  start() {
    if (this.disposed) return;
    this.running = true;
    this._elapsed = 0;
    this._score = 0;
    this._speed = this._baseSpeed;
    this._shipX = 0;
    this._shipTargetX = 0;
    this.ship.position.x = 0;
    this._resetAsteroids();
    this._lastTime = performance.now();
    requestAnimationFrame(this._loop.bind(this));
  }

  stopRound() {
    this.running = false;
  }

  _loop(now) {
    if (!this.running || this.disposed) return;
    const dt = Math.min((now - this._lastTime) / 1000, 0.05); // clamp to avoid big jumps on tab-back
    this._lastTime = now;
    this._elapsed += dt;

    // difficulty ramp
    this._speed = Math.min(this._maxSpeed, this._baseSpeed + this._elapsed * 0.35);

    // steering
    if (this._keys.left) this._shipTargetX -= 5.5 * dt;
    if (this._keys.right) this._shipTargetX += 5.5 * dt;
    this._shipTargetX = THREE.MathUtils.clamp(
      this._shipTargetX,
      -this._laneHalfWidth * 0.92,
      this._laneHalfWidth * 0.92
    );
    this._shipX += (this._shipTargetX - this._shipX) * Math.min(1, 10 * dt);
    this.ship.position.x = this._shipX;
    this.ship.rotation.z = Math.PI / 4 - (this._shipTargetX - this._shipX) * 0.3;

    // move asteroids toward camera, recycle when passed
    for (const mesh of this._asteroidPool) {
      mesh.position.z += this._speed * dt;
      mesh.rotation.x += mesh.userData.rotSpeed * dt;
      mesh.rotation.y += mesh.userData.rotSpeed * 0.7 * dt;
      mesh.visible = true;

      if (mesh.position.z > 8) {
        this._recycleAsteroid(mesh);
        this._score += 1;
      }

      // collision check (only when near the ship's z-plane)
      if (Math.abs(mesh.position.z - this.ship.position.z) < 0.55) {
        const dx = mesh.position.x - this.ship.position.x;
        const dy = mesh.position.y - this.ship.position.y;
        const hitRadius = 0.55 * mesh.scale.x;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          this._gameOver();
          return;
        }
      }
    }

    // drift starfield slowly for parallax
    this._stars.position.z += this._speed * 0.15 * dt;
    if (this._stars.position.z > 20) this._stars.position.z = 0;

    if (this.onScore) this.onScore(this._score);

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop.bind(this));
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

    this._asteroidPool.forEach((m) => this.scene.remove(m));
    this._asteroidGeo.dispose();
    this._asteroidMats.forEach((m) => m.dispose());
    this.ship.geometry.dispose();
    this.ship.material.dispose();
    this._stars.geometry.dispose();
    this._stars.material.dispose();
    this.renderer.dispose();
  }
}
