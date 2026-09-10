/**
 * particles.js
 * Lightweight animated starfield for the site background.
 * Pure Canvas 2D — decorative only, kept cheap so it never competes
 * with the Three.js game loop for frame budget.
 */
(function () {
  "use strict";

  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let width, height, dpr;
  let stars = [];
  let rafId = null;
  let running = true;

  const STAR_COUNT_DESKTOP = 140;
  const STAR_COUNT_MOBILE = 60;

  function starCount() {
    return window.innerWidth < 640 ? STAR_COUNT_MOBILE : STAR_COUNT_DESKTOP;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }

  function seedStars() {
    const count = starCount();
    stars = new Array(count).fill(0).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.4 + 0.3,
      speed: Math.random() * 0.15 + 0.02,
      twinkle: Math.random() * Math.PI * 2,
    }));
  }

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      s.twinkle += 0.02;
      s.y += s.speed;
      if (s.y > height) {
        s.y = -2;
        s.x = Math.random() * width;
      }
      const alpha = 0.4 + 0.6 * Math.abs(Math.sin(s.twinkle));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 195, 255, ${alpha.toFixed(2)})`;
      ctx.fill();
    }

    rafId = requestAnimationFrame(tick);
  }

  // Pause when the tab isn't visible — saves battery / CPU, avoids leaks.
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running && rafId === null) {
      rafId = requestAnimationFrame(tick);
    } else if (!running && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  resize();
  rafId = requestAnimationFrame(tick);
})();
