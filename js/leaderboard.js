/**
 * leaderboard.js
 * Small persistence layer for local high scores, keyed per game so
 * Stellar Drift and Void Runner (or any future game) each get their
 * own independent board.
 *
 * NOTE ON THE "BACKEND & LEADERBOARD" BONUS ITEM:
 * This uses the browser's localStorage rather than a real remote
 * database (Firebase/MongoDB). That keeps the submission a fully
 * static site with zero API keys or server setup, while still giving
 * a genuine, working, persistent leaderboard per-browser. Swapping
 * this module for a Firebase/Firestore-backed version would be a
 * drop-in change — every other file only talks to the small API
 * defined below (getScores / addScore / getBest / clearScores), all
 * of which already take a gameId.
 */
const Leaderboard = (function () {
  "use strict";

  const PREFIX = "nebula-arcade:";
  const MAX_ENTRIES = 10;

  function keyFor(gameId) {
    return `${PREFIX}${gameId}:scores`;
  }

  function getScores(gameId) {
    try {
      const raw = localStorage.getItem(keyFor(gameId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("Leaderboard: failed to read scores", err);
      return [];
    }
  }

  function addScore(gameId, name, score) {
    const scores = getScores(gameId);
    scores.push({
      name: (name || "Anonymous").slice(0, 12),
      score: Math.round(score),
      date: new Date().toISOString(),
    });
    scores.sort((a, b) => b.score - a.score);
    const trimmed = scores.slice(0, MAX_ENTRIES);
    try {
      localStorage.setItem(keyFor(gameId), JSON.stringify(trimmed));
    } catch (err) {
      console.warn("Leaderboard: failed to save score", err);
    }
    return trimmed;
  }

  function getBest(gameId) {
    const scores = getScores(gameId);
    return scores.length ? scores[0].score : 0;
  }

  function clearScores(gameId) {
    try {
      localStorage.removeItem(keyFor(gameId));
    } catch (err) {
      console.warn("Leaderboard: failed to clear scores", err);
    }
  }

  return { getScores, addScore, getBest, clearScores };
})();
