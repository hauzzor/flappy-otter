# Flappy Otter

A one-button platformer. An otter runs to the right by itself, and the only key is the space bar. Hold it longer and the otter jumps higher; the jump fires when you let go. Collect fish, jump the gaps, and don't eat the purple ones.

## How to play

- **`SPACE`** (hold) — charge a jump. Release to jump. Hold longer, jump higher.
- **`SPACE`** (tap) — a small hop, about 30px.
- **`P`** — pause.
- **`M`** — toggle sound. Sound starts muted.
- On a touch screen, press and hold anywhere on the game.

Jump height runs from about 30px on a tap to about 128px at full charge, over 0.42 seconds of holding. A full-power jump carries roughly 87px forward at the starting speed, so a late jump clears a gap better than an early one: every pixel spent in the air over solid ground is a pixel not spent over the hole.

## The three ways a run ends or stumbles

- **Falling in a gap** ends the run. Gaps are 48–74px wide, and they only appear as the ground scrolls.
- **Eating a bad fish** does not end the run. The otter throws up every fish it has collected, the score drops back to zero, the screen shakes, and there is a brief moment where it can't pick anything up. The purple fish carry a small cross so they stay readable next to the good ones.
- **Good fish** add one point each. The run also speeds up slightly as you collect.

## Scores

The scoreboard keeps the **top 10**, not just the winner, sorted by score. Equal scores go to whoever did it first.

- The current run's count is shown as **Fish this run**.
- The **Best ever** score is shown with **Best set**, the date and time that record was made.
- When a run beats the best ever, the game asks for a name before you continue. Enter up to 14 characters.
- The **Best ever** figure only changes once the run is saved, so a record you don't name is not banked.

**Scores are stored in this browser, on this device.** There is no server, no account and no API key — the app makes no network requests at all. Two consequences worth knowing:

- Clearing site data or using private browsing wipes the board.
- Two different devices keep two separate boards. They are not compared.

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

`sprites.js` holds the hand-drawn pixel otter frames and builds the fish; the canvas is 320×200 logical pixels and CSS scales it up with nearest-neighbour, so everything is drawn at 1:1 and stays crisp. `game.js` is the loop, the charge-jump physics, collision and the terrain generator. `storage.js` and `leaderboard.js` handle the device board. `app.js` wires keys and DOM to the game. `config.js` holds the name length limit.

All scripts are plain `<script defer>` tags sharing globals, with no build step, so the page also works when opened straight from disk.

## Tuning

The feel is set by a block of constants at the top of `game.js`: gravity, the minimum and maximum jump velocity, charge time, run speed, gap width, and how often bad fish appear (18%, never three in a row). Changing `BAD_CHANCE` or the gap range is the quickest way to make the game kinder or crueller.
