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

## Phase 6: UI/UX overhaul

- **Fills the browser window**: the game used to be capped at a fixed 1080x680px box, wasting most of a normal monitor. It now scales up to fill the actual browser viewport (capped generously at 2200x1240 so it doesn't get absurd on ultrawide displays).
- **Fullscreen button**: a new ⛶ FULLSCREEN button in the top HUD uses the browser's real Fullscreen API (hidden on mobile, where it's less reliable).
- **Frontier reskin**: replaced the flat dark-navy/black HUD look with a warm weathered wood/leather/iron palette, a Rye western display font for titles and panel headers, and gradient-accented panels and buttons, while keeping the blizzard world itself cold and blue. Primary action buttons (New Game, Done) now visually stand out from secondary ones.
- **World render scale bumped up (1.0 → 1.6x)** for better legibility of sprites, combat hit-flashes and HP bars now that there's more screen to work with.
- **Fixed the character-customize screen**: it previously had no background panel at all and its content (including the 5th class card and the Done button) silently overflowed the screen with no way to scroll to it. It's now a proper scrollable card, reachable on any screen size.
- **Removed internal dev labels** ("PHASE 1 CO-OP EXPEDITION", "PHASE 2 // SHARED EXPEDITION WORLD", "CO-OP ALPHA") that were leaking into player-facing UI.
- **Mobile touch controls decluttered**: shrunk the action-button cluster, reorganized it into a tighter 3-column layout, and fixed a real gap where mobile players had no way to loot scavenge sites or open the stockade gate (added a dedicated LOOT button). The vehicle TRUCK button no longer clutters the cluster for solo players — it now only appears once you're actually in a co-op expedition.

## Phase 7: The biggest update yet

- **Combat sound**: procedurally synthesized (no audio files, same Web Audio approach as the ambient music) gunshots, dry-fire clicks, melee thuds, reload racks, hit markers, enemy death groans and a blizzard-surge warning sting. A new SFX: ON/OFF button sits next to the music toggle.
- **Distinct enemy silhouettes**: Frost Shamblers, Rime Walkers and Frozen Outlaws used to share one sprite with only a color/name difference. Each now has its own hand-drawn silhouette and gait — hunched and lurching, tall and upright, or broad-shouldered with a wide-brim hat — readable at a glance in both solo and co-op.
- **Blizzard Surge horde events**: every few minutes, a telegraphed wave of 3-6 extra threats converges on the player (or the whole expedition in co-op), with a warning toast, a warning sting, and a temporary whiteout intensifying the snowfall. Solo surges are client-timed; co-op surges are server-authoritative so every marshal in the room sees the same surge at the same time.
- **Day/night + weather cycle**: a slow six-minute ambient lighting cycle (dawn/day/dusk/night) darkens the timberline over time, and snowfall visibly thickens during a Blizzard Surge. Purely atmospheric — doesn't affect enemy aggro or combat.
- **Field crafting**: a new CRAFT section in the inventory panel turns salvaged iron scrap into medkits, storm matches or rations (3/2/2 scrap respectively). Works the same in solo and co-op, where the shared expedition scrap pool pays the cost.
- **More frontier field notes**: four new environmental lore notes (Barrow Creek Ledger, Lumber Camp Tally Board, Railway Dispatch, Warden's Last Order) scattered near the existing waypoints, doubling the field-note count to eight and building the story toward the Waystation Stockade.

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
