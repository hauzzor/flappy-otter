# Flappy Otter

A one-button platformer. An otter runs to the right by itself; your only control is to jump. Press the space bar — or tap — and the otter jumps at once. Keep holding and it climbs higher; let go early and the jump is cut short. Collect fish, jump the gaps, and don't eat the purple ones.

## How to play

- **`SPACE` / tap** — jump immediately. Hold to go higher.
- **`P`** — pause.
- **`M`** — toggle sound. Sound starts muted.
- On a touch screen, press and hold anywhere on the game.

The jump fires the moment the key goes down, not on release: press and the otter leaves the ground that instant. A quick tap is a low hop of about 30px; holding through the climb reaches the full 128px. Releasing part-way up cuts the remaining climb, which is the whole skill of the game. Releasing after the top of the arc does nothing, since there is no climb left to cut.

A full-height jump carries roughly 87px forward at the starting speed, so jumping late beats jumping early: every pixel spent in the air over solid ground is a pixel not spent over the hole.

## The three things that happen

- **Falling in a gap** ends the run. Gaps are 48–74px wide.
- **Eating a bad fish** does not end the run. The otter throws up every fish it has collected, the score drops back to zero, the screen shakes, and there is a brief moment where it can't pick anything up. The purple fish carry a small cross so they stay readable next to the good ones.
- **Good fish** add one point each. The run also speeds up slightly as you collect.

The otter is supported while its horizontal position is over solid ground, and drops the moment that position is over a gap — so it falls exactly on the visible edge of the floor, not early and not after running out over the hole.

## Scores

The scoreboard keeps the **top 10**, not just the winner, sorted by score. Equal scores go to whoever did it first.

- The current run's count is shown as **Fish this run**.
- The **Best ever** score is shown with **Best set**, the date and time that record was made.
- When a run beats the best ever, the game asks for a name before you continue. Enter up to 14 characters.
- The **Best ever** figure only changes once the run is saved, so a record you don't name is not banked.

**Scores are stored in this browser, on this device.** There is no server, no account and no API key — the app makes no network requests at all. Two consequences worth knowing:

- Clearing site data or using private browsing wipes the board.
- Two different devices keep two separate boards. They are not compared.

## Screen size

The game scales to fill the window, and on a wide screen the readouts and the top 10 move to the side so the game gets the full height. The canvas is scaled by whole numbers where that doesn't waste space (2×, 3×, 4×), which keeps every game pixel exactly square; on narrow windows where a whole-number scale would leave a large gap, it fills the width instead and accepts slightly uneven pixels.

## Run it locally

Open `index.html` in a browser — double-clicking the file works, no server needed.

If you prefer a server, run this from this folder and open <http://localhost:8000>:

```powershell
python -m http.server 8000
```

## Deploy to GitHub Pages

Pages needs a **public** repository on the free plan.

1. Create an empty **public** repository on GitHub.
2. Push these files to the `main` branch.
3. In the repository, open **Settings → Pages**, set **Source** to *Deploy from a branch*, pick branch `main` and folder `/ (root)`, then save.

Every later push to `main` republishes automatically; GitHub runs its own Pages build for the new commit, usually within a minute or two. No workflow file is needed.

## Files

`sprites.js` holds the hand-drawn pixel otter frames and builds the fish; the canvas is 320×200 logical pixels and CSS scales it up with nearest-neighbour. `game.js` is the loop, the jump physics, collision and the terrain generator. `storage.js` and `leaderboard.js` handle the device board. `app.js` wires keys, taps and DOM to the game, and works out the display size. `config.js` holds the name length limit.

All scripts are plain `<script defer>` tags sharing globals, with no build step, so the page also works when opened straight from disk.

## Tuning

The feel is set by a block of constants at the top of `game.js`:

- `JUMP_VELOCITY` (620) and `JUMP_CUT` (0.4) — how high the jump starts and how much is lost by releasing early. Raise the cut to make taps flatter, lower it to make them floatier.
- `GRAVITY`, `COYOTE_TIME`, and `LAND_DEPTH` — the last caps how far below the surface a ledge can still catch a falling otter.
- `BASE_SPEED` / `MAX_SPEED` / `SPEED_PER_FISH` — the run's pace.
- The gap range (48–74px) and `BAD_CHANCE` (18%, never three in a row) — how cruel the level gets.
