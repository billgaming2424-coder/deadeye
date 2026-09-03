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
