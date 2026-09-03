# DEADEYE // Act I: The Timber Line — Co-op

Render-ready Node.js + WebSocket build.

## Phase 2: Shared Expedition World

- Up to 4 players per expedition room
- Real-time player movement
- Shared discovered locations
- Shared scavenging caches
- Shared expedition inventory
- Shared quest/objective progression
- Shared Waystation Key and scrap requirements
- Shared Waystation Stockade gate state
- Shared expedition map markers for other players
- Mobile-friendly touch controls retained

## Phase 3

- Shared server-authoritative co-op encounters and turn order
- Expedition snow truck with synchronized driver/passengers
- New connected frontier regions: Black Pine Forest, White Ridge, Deadwater Settlement, The Last Spike
- Region travel synchronized for the entire expedition
- Mobile overlay close buttons and touch-friendly vehicle control
- Existing Phase 1 movement and Phase 2 shared world systems preserved

## Phase 4

- **Marshal customization**: coat, hat, skin and hair palette, picked from the title screen ("CUSTOMIZE MARSHAL") and saved locally per-browser. The chosen palette rides along in the `create_room` / `join_room` handshake, so every marshal in an expedition renders with their own look instead of a single shared Rick Vance sprite.
- **Fixed a real co-op bug**: previously, only the player who clicked "START CO-OP STORY" actually entered the game — anyone else in the room stayed stuck on the title screen with no prompt to also start. The server now broadcasts an `expedition_started` event the moment anyone starts, and every other room member is pulled straight into the shared field automatically (skipping the storyboard, since it's already been told).

## Phase 5

- **Chase Studios intro**: a re-themed (amber/red, saloon-bell chime) version of the studio splash sequence, playing once before the title screen. Click, Space or Enter skips it early.
- **Character classes**: five playable survivor classes — Marshal, Scout, Brawler, Medic, Trapper — each with its own HP, move speed, ammo/ammo-reserve, torch and bandage loadout, and a small combat perk (Brawler hits harder in melee, Medic's bandages/medkits heal 50% more, Trapper loots extra scrap off downed enemies). Pick one from "CUSTOMIZE MARSHAL" on the title screen; every marshal in an expedition rides in with their own class.
- **Open-world combat**: replaced the old modal turn-based battle screen for regular threats with real-time, on-map combat, State of Decay style. Frost Shamblers, Rime Walkers and Frozen Outlaws wander the timberline, notice you within their aggro range, and chase you down with tile-respecting pathing — no scene transition, no menu. `F` fires, `V` bashes, `R` reloads from your cartridge reserve (also available as on-screen buttons on mobile). In co-op, enemies are server-authoritative and shared: every marshal in the expedition sees the same threats, and any of you can put one down for shared scrap.
- **Frontier field notes**: four hand-placed lore notes scattered around the Timber Line, discovered by walking near them, each expanding on the world and the growing threat outside the wire.
- **Vehicle key moved off V**: the snow truck's enter/exit key is now `G` (was `V`), since `V` is now the melee/bash action.

## Deploy on Render

Create a **Web Service** from GitHub, pointed at this repository.

If this project lives at the repository root, leave **Root Directory** blank. If it's nested in a subfolder (e.g. `deadeye/`), set **Root Directory** to that subfolder's path.

Then use:

- Build Command: `npm install`
- Start Command: `npm start`

The server automatically listens on Render's `PORT`.

## Running locally

```
npm install
npm start
```

Then open `http://localhost:10000` (or whatever `PORT` you set).

## Important limitation

Expedition world state is stored in server memory for the active room. If every player leaves and the room is destroyed, the expedition world resets. Persistent multiplayer saves/database support should be added in a later phase.
