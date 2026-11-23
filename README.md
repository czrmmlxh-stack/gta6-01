# gta6-01
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/czrmmlxh-stack/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/czrmmlxh-stack/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunvale is a 2D top-down open-world crime game that runs in the browser. You arrive in a small city with a few dollars in your pocket and a contact named Marla who has work for you. Take on her missions, earn cash, and try not to spend the night in a cell.

## How to run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step and no network access is needed — the game is plain JavaScript and canvas.

## Controls

- **WASD / arrow keys** — move on foot, steer while driving
- **E** — enter a car, exit a car, steal a parked car
- **Space** — punch, or shoot if you have a pistol
- **Mouse click** — aim and fire
- **Shift** — sprint
- **P** — pause

## What is in the game

- **A living city.** Streets, blocks, sidewalks, traffic that follows the roads, and pedestrians walking the pavements. The camera follows you and the minimap shows where you are.
- **Driving.** Any car on the street can be yours. Hop in, drive, and watch the handling change with speed. Crashes spark particles and shake the screen.
- **Wanted stars.** Cause trouble and the police come looking. Wanted level runs from 0 to 5 stars; patrol cars chase you, foot cops try to arrest you, and laying low lets the heat decay.
- **Missions.** Marla hands you three jobs: Borrowed Wheels ($150), The Package ($300), and Break the Dragnet ($500). Each has an objective marker on the map and a payout when you finish it.
- **Combat.** Fists and a pistol, with health on the HUD. Get arrested or lose all your health and the run ends.
- **Sound.** Engine hums, sirens, gunshots, crashes, and cash — all synthesized in the browser with WebAudio.
- **Save.** Progress is stored in localStorage, so you can close the tab and pick up where you left off.

Sunvale is an original game: an original city, an original story, and original code. Nothing is copied from any existing game.

Built by an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC.
