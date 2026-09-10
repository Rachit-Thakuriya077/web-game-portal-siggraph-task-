# Nebula Arcade — Web Game Portal (ACM SIGGRAPH SRMIST Induction Task)

**Name:** _Rachit Thakuriya_
**Registration Number:** _RA2511003011281_
**Tech stack:** HTML5, CSS3, vanilla JavaScript (ES6), Three.js r128 (CDN)
**Live demo:** _https://web-game-portal-siggraph-task-nu.vercel.app/_

## What this is

A small game hub / library site. The landing page lists games with
thumbnails and descriptions; selecting a game mounts it into the hub's
UI without a page reload. Two games are included:

- **Stellar Drift** (mandatory Three.js game) — a 3D dodging game.
  Steer a ship left/right to avoid an oncoming asteroid field that
  speeds up the longer you survive.
- **Void Runner** (HTML Canvas game) — a 3-lane 2D dodge game. Switch
  lanes to avoid falling blocks and grab pickups for bonus points as
  the fall speed ramps up.

Both games share the same mount/start/score/game-over/destroy
lifecycle in `main.js`, so the hub can load either one identically and
fully tears down whichever is active the moment you navigate away.

## Project structure

```
web-game-portal-siggraph-task/
├── index.html          Game Hub, game view, leaderboard view (all one page)
├── css/
│   └── style.css       All styling — layout, theme, responsive rules
├── js/
│   ├── main.js          View switching + game lifecycle wiring
│   ├── game.js          StellarDriftGame class (Three.js scene/logic)
│   ├── void-runner.js   VoidRunnerGame class (Canvas 2D scene/logic)
│   ├── leaderboard.js   localStorage-backed score persistence (per game)
│   └── particles.js     Decorative Canvas 2D starfield background
└── README.md
```

Everything is separated by concern: markup in `index.html`, styling in
`css/style.css`, and behavior split across small, single-purpose JS
modules — no inline `style=`/`onclick=` attributes anywhere.


## Design notes / how the mandatory requirements are met

- **Game Hub Interface:** `#hub` in `index.html` is the landing page —
  a card grid with thumbnail previews (inline SVG, so no extra image
  assets to load) and descriptions, with two real, playable games.
- **Three.js / Canvas integration:** `js/game.js` implements Stellar
  Drift with Three.js (scene, camera, lighting, meshes, render loop);
  `js/void-runner.js` implements Void Runner with plain Canvas 2D.
  Both mount into the same `<canvas>` inside the hub's own layout — no
  iframe, no full page navigation — and share one lifecycle contract
  (`start` / `onScore` / `onGameOver` / `destroy`) so `main.js` can
  swap between them without game-specific branching in the UI logic.
- **Performance:**
  - Asteroids are **object-pooled** — a fixed set of 24 meshes is
    created once at scene setup and recycled (repositioned) instead of
    being created/destroyed every frame, which avoids GC pressure and
    geometry/material churn.
  - Geometry and materials are shared across the whole asteroid pool.
  - Device pixel ratio is capped at 2.
  - The render loop pauses on `visibilitychange` (tab hidden) and
    fully tears itself down — `cancelAnimationFrame`-equivalent stop,
    `renderer.dispose()`, geometry/material `.dispose()`, and removal
    of every event listener — whenever the player leaves the game view
    (see `StellarDriftGame.destroy()` and `main.js`'s `showView()`).
    This is what stops the game from silently rendering (and leaking
    memory) in the background once you navigate elsewhere in the hub.
- **Responsive design:** the game stage, card grid, and toolbar all
  reflow with CSS Grid/Flexbox and container-relative units; there's a
  dedicated mobile breakpoint (`max-width: 640px`) that switches the
  game's aspect ratio for portrait phones and enables a touch-drag
  steering hint. Tested down to 375px width with no horizontal
  overflow.
- **Leaderboard (bonus):** implemented with `localStorage` rather than
  a remote database, with a separate board per game (tabs on the
  Leaderboard page) — see the comment at the top of
  `js/leaderboard.js` for the reasoning and how you'd swap in
  Firebase/MongoDB later without touching any other file.
- **Creative graphics (bonus):** an animated starfield background
  (`js/particles.js`) behind the whole site, plus a parallax starfield
  and low-poly, flat-shaded asteroids/ship inside the 3D scene itself.

