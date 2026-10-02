/* Flappy Otter - page wiring
 *
 * Owns the DOM, the keyboard, and the glue between the game and the
 * leaderboard. The game itself knows nothing about HTML, and the leaderboard
 * knows nothing about the game.
 */
(function () {
  "use strict";

  var deps = ["OtterSprites", "OtterStorage", "OtterLeaderboard", "OtterGame"];
  for (var d = 0; d < deps.length; d++) {
    if (!window[deps[d]]) {
      window.showBootError("Could not load " + deps[d] + ".js");
      return;
    }
  }

  var el = function (id) { return document.getElementById(id); };

  var canvas = el("game");
  var overlayStart = el("overlay-start");
  var overlayOver = el("overlay-over");
  var startLead = overlayStart.querySelector(".overlay__lead");
  var startNote = overlayStart.querySelector(".overlay__note");
  var finalScore = el("final-score");
  var newBest = el("new-best");
  var nameForm = el("name-form");
  var nameInput = el("player-name");
  var btnRetry = el("btn-retry");
  var hudScore = el("score");
  var hudBest = el("best");
  var hudBestDate = el("best-date");
  var boardList = el("board-list");
  var boardEmpty = el("board-empty");
  var boardMeta = el("board-meta");

  var START_TEXT = {
    lead: startLead.innerHTML,
    note: startNote.innerHTML
  };
  var PAUSED_TEXT = {
    lead: "Paused",
    note: "Press <kbd>SPACE</kbd> to carry on."
  };

  var game = new window.OtterGame.Game(canvas);
  var board = new window.OtterLeaderboard.Leaderboard();

  var awaitingName = false;

  /* ---------- rendering ---------- */

  function formatWhen(iso) {
    var when = new Date(iso);
    if (isNaN(when.getTime())) return "";
    try {
      return when.toLocaleDateString(undefined,
        { year: "numeric", month: "short", day: "numeric" }) +
        " " + when.toLocaleTimeString(undefined,
        { hour: "2-digit", minute: "2-digit" });
    } catch (err) {
      return when.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function renderBoard(entries) {
    while (boardList.firstChild) boardList.removeChild(boardList.firstChild);

    if (!entries.length) {
      boardEmpty.dataset.open = "true";
      boardMeta.textContent = "";
      return;
    }
    boardEmpty.dataset.open = "false";

    for (var i = 0; i < entries.length; i++) {
      var row = document.createElement("li");
      row.className = "board__row";

      var rank = document.createElement("span");
      rank.className = "board__rank";
      rank.textContent = String(i + 1);

      var name = document.createElement("span");
      name.className = "board__name";
      name.textContent = entries[i].name;

      var score = document.createElement("span");
      score.className = "board__score";
      score.textContent = String(entries[i].score);

      var when = document.createElement("span");
      when.className = "board__date";
      when.textContent = formatWhen(entries[i].date);

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      row.appendChild(when);
      boardList.appendChild(row);
    }

    boardMeta.textContent = entries.length + " of 10 - saved in this browser";
  }

  function renderHud() {
    hudScore.textContent = String(game.score);

    var best = board.best();
    hudBest.textContent = best ? String(best.score) : "0";
    hudBestDate.textContent = best ? formatWhen(best.date) : "—";
  }

  board.onChange(function (entries) {
    renderBoard(entries);
    renderHud();
  });

  /* ---------- overlays ---------- */

  function setOpen(node, open) {
    node.dataset.open = open ? "true" : "false";
  }

  function showStart(text) {
    startLead.innerHTML = (text || START_TEXT).lead;
    startNote.innerHTML = (text || START_TEXT).note;
    setOpen(overlayStart, true);
  }

  function showGameOver(score) {
    finalScore.textContent = String(score);
    setOpen(overlayStart, false);

    var record = board.isRecord(score);
    setOpen(newBest, record);
    setOpen(nameForm, record);
    awaitingName = record;

    if (record) {
      try { nameInput.focus(); } catch (err) { /* nothing to focus */ }
    }
    setOpen(overlayOver, true);
  }

  function restart() {
    awaitingName = false;
    setOpen(overlayOver, false);
    setOpen(nameForm, false);
    setOpen(newBest, false);
    game.reset();
    game.start();
    renderHud();
  }

  btnRetry.addEventListener("click", restart);

  nameForm.addEventListener("submit", function (event) {
    event.preventDefault();
    board.submit(nameInput.value, game.score);
    nameInput.value = "";
    awaitingName = false;
    setOpen(nameForm, false);
    setOpen(newBest, false);
    restart();
  });

  /* ---------- game events ---------- */

  game.on(function (name) {
    if (name === "start" || name === "fish" || name === "spit") {
      setOpen(overlayStart, false);
      renderHud();
    } else if (name === "dead") {
      showGameOver(game.score);
      renderHud();
    } else if (name === "reset") {
      renderHud();
    }
  });

  /* ---------- input ---------- */

  function typingInAField() {
    var active = document.activeElement;
    return !!active &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  }

  document.addEventListener("keydown", function (event) {
    if (event.code === "Space") {
      /* never steal the key while the player is naming their run */
      if (typingInAField()) return;
      event.preventDefault();
      if (event.repeat) return;

      if (game.state === "dead") {
        /* the name form owns space until it is dealt with */
        if (!awaitingName) restart();
        return;
      }
      if (game.frozen) { game.frozen = false; setOpen(overlayStart, false); return; }
      game.press();
      return;
    }

    if (event.code === "KeyP" && !typingInAField()) {
      game.frozen = !game.frozen;
      if (game.frozen && game.state !== "ready") showStart(PAUSED_TEXT);
      else setOpen(overlayStart, false);
      return;
    }

    if (event.code === "KeyM" && !typingInAField()) {
      window.OtterGame.Audio.muted = !window.OtterGame.Audio.muted;
      window.OtterGame.Audio.ensure();
      return;
    }

    if (event.code === "Enter" && game.state === "dead" && !awaitingName) {
      restart();
    }
  });

  document.addEventListener("keyup", function (event) {
    if (event.code !== "Space") return;
    if (typingInAField()) return;
    event.preventDefault();
    game.release();
  });

  /* touch and mouse: press and hold behaves exactly like the space bar */
  function pointerDown(event) {
    if (typingInAField()) return;
    event.preventDefault();
    if (game.state === "dead") {
      if (!awaitingName) restart();
      return;
    }
    if (game.frozen) { game.frozen = false; setOpen(overlayStart, false); return; }
    game.press();
  }

  function pointerUp(event) {
    if (typingInAField()) return;
    event.preventDefault();
    game.release();
  }

  canvas.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);

  /* ---------- boot ---------- */

  renderBoard([]);
  renderHud();
  game.render();
  game.start();

  board.load().then(function () {
    renderBoard(board.entries);
    renderHud();
  });

  window.OtterApp = {
    game: game,
    board: board,
    restart: restart,
    formatWhen: formatWhen
  };
})();