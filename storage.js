/* Flappy Otter - score storage
 *
 * Everything lives on the player's device in localStorage. No server, no
 * account, no request: a score set on one device stays on that device.
 *
 * The only thing that can realistically go wrong is storage being unavailable
 * (private browsing, storage disabled, a full quota), so every access is
 * guarded and a failure degrades to "this session has no saved board" rather
 * than breaking the game.
 */
window.OtterStorage = (function () {
  "use strict";

  var KEY = "flappyOtter.leaderboard.v1";

  function config() {
    return window.OtterConfig || {};
  }

  function maxName() {
    var cfg = config();
    return typeof cfg.maxNameLength === "number" && cfg.maxNameLength > 0
      ? cfg.maxNameLength
      : 14;
  }

  /* The name is free text from a stranger. It is always displayed through
     textContent, so it can never be parsed as HTML; the stripping here is so
     that the board reads cleanly rather than as a security measure. First
     drop anything tag-shaped, then remove the stray marks that are left. */
  function sanitizeName(raw) {
    var text = String(raw == null ? "" : raw)
      .replace(/[\x00-\x1F\x7F]/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/[<>&"'`\\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) text = "Otter";
    if (text.length > maxName()) text = text.slice(0, maxName());
    return text;
  }

  function validEntry(entry) {
    return !!entry &&
      typeof entry.name === "string" &&
      typeof entry.score === "number" &&
      isFinite(entry.score) &&
      entry.score >= 0 &&
      typeof entry.date === "string" &&
      entry.date.length > 0;
  }

  /* Hand-edited or corrupted storage must never reach the screen, so every
     entry is rebuilt from known-good fields. */
  function normaliseEntry(entry) {
    if (!validEntry(entry)) return null;
    var date = new Date(entry.date);
    if (isNaN(date.getTime())) return null;
    return {
      id: typeof entry.id === "string" && entry.id ? entry.id : makeId(),
      name: sanitizeName(entry.name),
      score: Math.floor(entry.score),
      date: date.toISOString()
    };
  }

  function makeId() {
    return Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8);
  }

  function loadLocal() {
    var raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (err) {
      return [];                      // private mode, storage disabled, etc.
    }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normaliseEntry).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function saveLocal(entries) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries));
      return true;
    } catch (err) {
      return false;
    }
  }

  return {
    sanitizeName: sanitizeName,
    normaliseEntry: normaliseEntry,
    makeId: makeId,
    loadLocal: loadLocal,
    saveLocal: saveLocal,
    KEY: KEY
  };
})();