/* Flappy Otter - top 10 logic
 *
 * The board is always kept sorted and trimmed in memory, and written straight
 * back to device storage. Nothing here talks to a network.
 */
window.OtterLeaderboard = (function () {
  "use strict";

  var MAX_ENTRIES = 10;

  /* Highest score first. Equal scores are broken by the earlier run, so a
     score matched months later does not displace the original. */
  function compare(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var ta = Date.parse(a.date);
    var tb = Date.parse(b.date);
    if (ta !== tb) return ta - tb;
    if (a.name === b.name) return 0;
    return a.name < b.name ? -1 : 1;
  }

  function merge() {
    var byId = {};
    for (var i = 0; i < arguments.length; i++) {
      var list = arguments[i];
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        var entry = list[j];
        if (entry && typeof entry.id === "string" && entry.id) byId[entry.id] = entry;
      }
    }
    var out = [];
    for (var key in byId) {
      if (Object.prototype.hasOwnProperty.call(byId, key)) out.push(byId[key]);
    }
    out.sort(compare);
    return out.slice(0, MAX_ENTRIES);
  }

  function Leaderboard(store) {
    this.store = store || window.OtterStorage;
    this.entries = [];
    this.listeners = [];
  }

  Leaderboard.prototype.onChange = function (fn) {
    this.listeners.push(fn);
    return this;
  };

  Leaderboard.prototype.emit = function () {
    for (var i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](this.entries);
      } catch (err) {
        if (window.console) window.console.error("Leaderboard listener failed", err);
      }
    }
  };

  /* Never trust what storage hands back: anything without a usable name,
     score or date is dropped here rather than being rendered. */
  Leaderboard.prototype.normalise = function (list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var entry = typeof this.store.normaliseEntry === "function"
        ? this.store.normaliseEntry(list[i])
        : list[i];
      if (entry) out.push(entry);
    }
    return out;
  };

  Leaderboard.prototype.load = function () {
    this.entries = merge(this.normalise(this.store.loadLocal()));
    this.emit();
    return Promise.resolve(this.entries);
  };

  /* Records are written to storage before the callback fires, so the score is
     banked even if the page is closed immediately afterwards. */
  Leaderboard.prototype.submit = function (name, score) {
    var value = Math.max(0, Math.floor(Number(score) || 0));
    if (value <= 0) return null;

    var entry = {
      id: this.store.makeId(),
      name: this.store.sanitizeName(name),
      score: value,
      date: new Date().toISOString()
    };

    this.entries = merge(this.entries, [entry]);
    this.store.saveLocal(this.entries);
    this.emit();
    return entry;
  };

  Leaderboard.prototype.best = function () {
    return this.entries.length ? this.entries[0] : null;
  };

  Leaderboard.prototype.isRecord = function (score) {
    var value = Math.max(0, Math.floor(Number(score) || 0));
    if (value <= 0) return false;
    var best = this.best();
    return !best || value > best.score;
  };

  Leaderboard.MAX_ENTRIES = MAX_ENTRIES;
  Leaderboard.merge = merge;
  Leaderboard.compare = compare;

  return {
    Leaderboard: Leaderboard,
    MAX_ENTRIES: MAX_ENTRIES,
    merge: merge,
    compare: compare
  };
})();