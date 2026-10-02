/* Flappy Otter - sprite baking
 *
 * The canvas is 320x200 logical pixels and CSS scales it up with
 * `image-rendering: pixelated`, so every sprite is drawn at 1:1 logical
 * pixels and must be baked into a small canvas once, up front.
 *
 * The otter is hand-drawn as character maps. Rows may be ragged; they are
 * right-padded with transparency so a slightly short row can never shift a
 * sprite. The fish are generated procedurally from the same circle geometry
 * the collision code uses, so what you see is what you hit.
 */
window.OtterSprites = (function () {
  "use strict";

  var PALETTE = {
    ".": null,          // transparent
    o: "#33200f",       // outline
    b: "#9a6b3f",       // body
    d: "#6b4423",       // shadow / legs
    l: "#e8c79a",       // belly + muzzle
    e: "#14100c",       // eye
    w: "#fdf6e8",       // eye white
    p: "#d98a8a"        // nose
  };

  /* ---------- otter frames (facing right) ---------- */

  var RUN_A = [
    "............oo......",
    "...........obbooo...",
    "...........obbbbbo..",
    "...........obwwwbbo.",
    "...........obwewlpo.",
    "......oooooobbbbllo.",
    ".....obbbbbbbbbbbo..",
    "..ooobbbbbbbbbooo...",
    ".obbbbbbbbbbbbo.....",
    "obbbbbbllllllbo.....",
    ".ooooobllllllo......",
    ".....obbbbboo.......",
    ".....obbobbo........",
    ".....obbobbo........",
  ];

var RUN_B = [
    "....................",
    "............oo......",
    "...........obbooo...",
    "...........obbbbbo..",
    "...........obwwwbbo.",
    "...........obwewlpo.",
    "......oooooobbbbllo.",
    "..oooobbbbbbbbbbbo..",
    ".obbbbbbbbbbbbooo...",
    "obbbbbbbbbbbbbo.....",
    ".ooobbbllllllbo.....",
    "...obbbllllllo......",
    "...obboobbbbo.......",
    "...obbo.oobbo.......",
  ];

  var JUMP = [
    "...........obbooo...",
    "...........obbbbbo..",
    "...........obwwwbbo.",
    "...........obwewlpo.",
    "......oooooobbbbllo.",
    ".....obbbbbbbbbbbo..",
    "..ooobbbbbbbbbooo...",
    ".obbbbbbbbbbbbo.....",
    "obbbbbbllllllbo.....",
    ".ooooobllllllo......",
    "....obbobbboo.......",
    "....obboobbo........",
    "....obboobbo........",
    ".....oo..oo.........",
  ];

  var HURT = [
    "............oo......",
    "...........obbooo...",
    "...........obbbbbo..",
    "...........obwwwbbo.",
    "...........obewelpo.",
    "...........obbbbllo.",
    "......oooooobbbdddo.",
    "..oooobbbbbbbooooo..",
    ".obbbbbbbbbbbbo.....",
    "obbbbbbbbbbbbbo.....",
    ".oooobbllllllbo.....",
    "....obbllllllo......",
    "....obbobbboo.......",
    "....obboobbo........",
  ];

  /* ---------- baking ---------- */

  var FRAME_W = 20;
  var FRAME_H = 14;

  /* Rows are right-padded with transparency and anything past the frame box
     is trimmed, so every otter frame is exactly FRAME_W x FRAME_H and the
     silhouette cannot wobble between frames. */
  function normalise(rows) {
    var out = new Array(FRAME_H);
    for (var i = 0; i < FRAME_H; i++) {
      var row = i < rows.length ? String(rows[i]) : "";
      if (row.length > FRAME_W) {
        throw new Error("OtterSprites: row " + i + " is " + row.length +
          "px wide, frame box is " + FRAME_W + "px: " + row);
      }
      while (row.length < FRAME_W) row += ".";
      out[i] = row;
    }
    return out;
  }

  function bake(rawRows) {
    var rows = normalise(rawRows);
    var canvas = document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    var ctx = canvas.getContext("2d");

    for (var y = 0; y < FRAME_H; y++) {
      var line = rows[y];
      for (var x = 0; x < FRAME_W; x++) {
        var key = line.charAt(x);
        if (!(key in PALETTE)) {
          throw new Error("OtterSprites: unknown pixel '" + key + "' (U+" +
            ("0000" + line.charCodeAt(x).toString(16).toUpperCase()).slice(-4) +
            ") at " + x + "," + y);
        }
        var colour = PALETTE[key];
        if (!colour) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    canvas.ox = 0.5;
    canvas.oy = 1;                 // feet sit on the baseline
    return canvas;
  }

  /* ---------- fish coins ---------- */

  /* A coin of `size` logical pixels. `mark` draws a small cross in the
     middle, which is how the bad fish stay readable next to the good ones
     without changing their shape. */
  function coin(size, colours, mark) {
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    var c = (size - 1) / 2;
    var r = size / 2 - 0.4;

    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var dx = x - c;
        var dy = y - c;
        var d = Math.sqrt(dx * dx + dy * dy);

        if (d > r) continue;

        var colour = (d > r - 1.1) ? colours.dark : colours.main;
        if (d <= r - 1.1) {
          var glint = Math.sqrt((dx + 1.6) * (dx + 1.6) + (dy + 1.6) * (dy + 1.6));
          if (glint < r - 1.6) colour = colours.light;
        }
        if (mark && Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.8 && d < r - 0.6) {
          colour = colours.dark;
        }

        ctx.fillStyle = colour;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    canvas.ox = 0.5;
    canvas.oy = 0.5;
    return canvas;
  }

  var COIN_SIZE = 11;

  var GOOD_COLOURS = { main: "#f2b134", light: "#ffd97a", dark: "#a97a1f" };
  var BAD_COLOURS = { main: "#a05bd6", light: "#c78ce8", dark: "#5f2f80" };

  return {
    PALETTE: PALETTE,
    COIN_SIZE: COIN_SIZE,
    GOOD_COLOURS: GOOD_COLOURS,
    BAD_COLOURS: BAD_COLOURS,

    OTTER: {
      runA: bake(RUN_A),
      runB: bake(RUN_B),
      jump: bake(JUMP),
      hurt: bake(HURT)
    },

    GOOD_COIN: coin(COIN_SIZE, GOOD_COLOURS, false),
    BAD_COIN: coin(COIN_SIZE, BAD_COLOURS, true),

    /* debug helper, also used by the test harness */
    bakeRows: bake,
    buildCoin: coin
  };
})();