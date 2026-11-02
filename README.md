# AFTER//ZERO

**They own the city. You own the next second.**

An original cyberpunk FPS with a single-player campaign and online mixed human/AI arenas, written in vanilla HTML, CSS and JavaScript. Raw WebGL 2 / WebGL 1 renders the world; Pointer Lock handles aim; Web Audio synthesizes the soundtrack and effects. The browser game has no game engine, framework, CDN, remote fonts or imported art. The published arena uses a standalone Node/SQLite server in Singapore on Render. The source retains the Sites Vinext Worker/D1 adapter for same-origin hosting. There are no analytics or external AI services; agents are local game AI running on the authoritative server.

This is a standalone game using a small, attributed foundation from [QSOLKCB/QUICKSCOPER](https://github.com/QSOLKCB/QUICKSCOPER). It does not replace QUICKSCOPER.

## Play

Open the hosted game in a desktop browser with hardware acceleration and WebGL enabled. Select a difficulty and **Jack in**. A keyboard and mouse are required; touch and controller profiles are not implemented. **Jack in / Enter arena / Resume captures the mouse using Pointer Lock.** The cursor stays hidden and aim keeps rotating without screen edges. Escape releases capture and pauses. If an embedded browser blocks capture, the game pauses with a Retry button and an **Open game in full window** link; it no longer silently falls back to drag aim. Arrow keys also aim and `Enter` fires.

| Action | Control |
| --- | --- |
| Forward / back / turn | W / S / A–D |
| Strafe / sprint | Z–C / hold Shift |
| Look / aim down sights | Mouse / hold right click |
| Fire | Hold left click or Enter; tap for one shot |
| Bullet time | Q, toggle |
| Dash / jump | F / Space |
| Reload / change weapon | R / 1–5 or wheel |
| Sever relay / extract | E near the object |
| Pause | Esc or P |

Losing focus, hiding the tab, or losing an acquired pointer lock pauses single-player simulation and clears held input. Online rounds continue; a paused player remains vulnerable and sends neutral input. Resume is deliberate. Restart constructs fresh simulation state without registering another input handler or animation loop.

## Campaign

| Sector | Environment | Relays | Hostiles | Hardware unlocked |
| --- | --- | ---: | ---: | --- |
| 01 Dead Channel | Low-quarter alleys | 1 | 6 | Kestrel pistol |
| 02 Freight Ghost | Container terminal | 2 | 8 | Razor automatic |
| 03 Last Train | Abandoned transit | 2 | 8 | Breach, Null rail rifle, Helix plasma driver |
| 04 Memory Leak | Archive aisles | 3 | 9 | — |
| 05 Hot Metal | Plasma foundry | 3 | 10 | — |
| 06 False Eden | Sky gardens | 3 | 11 | — |
| 07 Hostile Takeover | Executive ring | 3 | 12 | — |
| 08 Zero Hour | Central clock / Architect boss | 3 | 9 | — |

Clear every security unit, sever the cyan relays with E, then use the green extraction gate. Radar shows enemies, relays, extraction and your facing. Plasma floor tiles damage the player. Story, Operative and Zero tune incoming damage and enemy movement; all content is available on every difficulty.

Bullet time runs enemies, their charging, and travelling projectiles at **20% speed**. Player movement retains 82% of its usual speed, while aim and weapon timing stay responsive. The implant drains in real time, recharges when inactive, and gains energy on kills; severing a relay refills it. If drained, it requires a short recovery before reactivation. The Null rifle penetrates up to three enemies but stops at solid cover. Helix rounds travel through the same slowed world and explode on impact, with cover-aware splash damage.

Sector 03 unlocks the complete five-weapon arsenal, including on existing saves. Earned weapons remain available when replaying earlier sectors. Hold fire to repeat at each weapon’s cadence; early taps buffer for 150 ms. Switching weapons cannot bypass their recovery. Aimed sights are aligned to the combat ray; the rail rifle uses a clear 3× scope.

Magazines require reloading; reserves are unlimited, preventing ammunition soft locks. Headshots deal double damage. Health regenerates only to 60% of maximum after six damage-free seconds. Medkits, small kill recovery and strategic movement carry the rest.

Each sector’s **first completion** awards one permanent upgrade credit: +20 health, +25 chronal capacity, or +10% damage. Purchases apply from the next sector or restart. Replays cannot farm credits. Unlocks, best scores, fastest times and purchases persist locally. There is no mid-sector checkpoint; restarting begins that sector again. Saves are browser-local and are not synced between devices.

## Enemy navigation

Campaign enemies and arena bots share a body-aware route planner. Seeing over a low crate no longer makes an enemy walk into it. Routes keep clearance around solid corners, take smooth shortcuts only when the whole body fits, and prefer safe floor over plasma when a safe detour exists. A player standing on a crate is approached from reachable floor.

Agents refresh routes as targets move, give nearby agents space, and recenter/replan when a corner blocks their movement. Arena movement is independent of aiming, so turning no longer curves a straight approach. In-range combat strafing checks for walls and hazards. The Architect remains stationary as designed. Navigation uses bounded weighted A* with cached paths; arena path state survives database round trips.

## Sector Forge

Open **Sector editor** from the menu. Generate a new sector, use a fresh grid or load an independent copy of any campaign map, including the finale.

**Procedural Forge** offers Neon district, Freight lanes and Signal citadel layouts, three map sizes (20, 24 or 32 tiles), and 6–40 hostiles. Enter a seed for repeatable results or use New seed + generate. Generation places connected routes, objectives, pickups and enemies. Every generated map validates before replacing the editor draft; Undo restores the previous map. Generated maps remain fully paintable and exportable.

- Drag terrain tools to paint floor, full walls, low crates, servers or hazardous plasma.
- Click to place the player start, extraction, four enemy classes, relays, medkits and energy cells. Rotate the start with **↻ Start**.
- Right-click erases. Undo/redo keeps up to 60 edits; Ctrl Z and Ctrl Shift Z work when a text field is not focused.
- The validator checks bounded JSON, object types, clear placement, duplicates, a closed boundary, and connected routes to every enemy, relay, pickup and exit.
- **Test sector** plays with all five weapons and neutral upgrades. It cannot change campaign rewards or unlocks. Pause to return to the editor.
- **Save on this device**, JSON export and JSON import keep maps portable. A valid map is required for export/test; an unfinished draft can be saved locally. Export files before clearing site storage.

The version-1 format is plain data: `name`, `brief`, palette index, a rectangular tile grid, player start with yaw in radians, extraction, terminals, enemies and pickups. Each tile is three metres. Imports allow 10–40 tiles per axis, 60 enemies, 8 relays and 60 pickups, with a 120 KB input limit. No imported scripts, HTML or resource URLs execute.

## Online arena

Open **Arena**, choose a callsign and class, then create a room or join with its eight-character code. A room has 8, 12 or 16 combatants. Bots fill every slot not occupied by a human; team modes reserve at least one bot per team. Human joins are assigned to the team with fewer humans. Departures backfill with a bot, and large human imbalances trigger a team swap. Both teams begin with the same AI class composition.

| Mode | Goal |
| --- | --- |
| Deathmatch | 25 kills, everyone is an opponent |
| Team deathmatch | 60 team kills; friendly fire disabled |
| Domination | Capture A/B/C in four seconds; each held, uncontested point scores once per second; first to 150 |

Rounds last at most five minutes, followed by a 12-second result period and automatic restart. Death respawns after three seconds; a brief spawn shield ends when firing. Hold Tab for the live scoreboard. Change class from the room menu to redeploy after three seconds.

| Class | Primary | Health | Specialty |
| --- | --- | ---: | --- |
| Sniper | Null rail rifle | 90 | Precision and 3× scope |
| CQB | Breach scattergun | 125 | Faster movement and close-range pressure |
| Assault | Razor automatic | 110 | Sustained fire and flexible movement |
| Engineer | Helix plasma | 105 | E deploys a 10-second repair station; 22-second cooldown |

Every class has the Kestrel sidearm on 1. Its primary retains its campaign number (2–5); the wheel cycles only the two equipped weapons. Health, weapon cadence, ammunition, collision and damage rules are identical for humans and AI in the same class. Arena damage is tuned separately from campaign damage. Campaign upgrades never apply online.

Q spends 50 energy to deploy a three-second, nine-metre chronal field. **All travelling rounds in the field slow to 25%, regardless of team**, while players retain normal movement and aim. Repair stations heal nearby teammates with a clear path (only their owner in deathmatch). Default room maps use symmetrical generated geometry. To host your own layout, check **Use the current Forge map**; custom layouts are validated but their competitive balance is up to the designer.

Real players need access to the Site as well as the room code. Publication preserves the owner's existing Site audience; a room code does not grant Site access. No chat, friend invites, ranked matchmaking or cross-room progression is implemented. Room state expires after 20 minutes without requests; inactive human sessions become bots after 12 seconds. Browser reload starts a fresh player session.

The server owns simulation, positions, damage, ammo, scoring and team assignment. Inputs use sequence numbers; independently acknowledged shot/action IDs survive retries and reordered packets. A short D1 room lease lets one writer consume a bounded input inbox; other requests queue their inputs and read the latest committed snapshot. Revision and lease checks prevent stale writers from publishing or deleting new inputs. Clients send every 50 ms without waiting for the previous response (at most six outstanding requests), flush shots/actions sooner, replay recent movement over authoritative corrections, and predict jump, dash and firing feedback immediately. Remote poses interpolate on a clock that never moves backward.

Online hit compensation retains 650 ms of server pose history. Server-issued per-player timing receipts and measured round trips bound shot timestamps: at most 200 ms of shot age and 250 ms of target-view rewind, with tighter credit for low-ping players. Travelling rounds catch up through historical hit volumes and chronal fields; walls still block them. Damage settles in impact-time order once outstanding timing receipts can no longer authorize an earlier shot. Calibrated simulations with 30/90/200 ms RTT use 110/140/195 ms confirmation windows respectively, replacing the fixed 250 ms wait; actual receipt age and mixed-player latency affect the window. A shot fired after an earlier lethal impact cannot score; rounds already in flight can trade. These are impact-time rules, so the first trigger press does not necessarily win if its projectile has farther to travel.

The [network verification notes](docs/NETCODE.md) describe tested 30/90/200 ms cases and limits. Severe lag, asymmetric routes, packet loss and server overload cannot be made perfectly fair. This is still a small-room HTTP server advanced by requests; no geographically distributed or capacity playtest is claimed. Confirmed hit/death feedback is deliberately delayed; local muzzle feedback stays immediate. Health, ammo and scores remain authoritative.


## Run locally / deploy

For the complete game, use the maintained Sites Worker build with the `DB` D1 binding declared in `.openai/hosting.json`. Node 22.13+ is required. Install through the Sites helper when editing in Work; standalone development uses `npm ci`.

```sh
npm test
npm run check
npm run build
# Apply each unapplied drizzle migration in journal order, then:
npm run dev
```

Local D1 setup after building:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_moaning_karnak.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_yummy_black_crow.sql
```

Hosted publication applies schema migrations through Sites. Do not replay an already-applied local migration. Source lives in `public/`, `server/` and `app/`; generated `dist/` is the deployment artifact. The source ZIP includes a sanitized manifest without the original Site ID or credentials.

For a static campaign/editor copy, serve `public/` with any HTTP server. `file://` does not support ES modules. The included GitHub Pages workflow publishes `public/`. Online rooms need a server: the optional [Render deployment](docs/RENDER.md) provides the same API using a standalone Node process and persistent SQLite. Set the Pages repository variable `ARENA_API_URL` to the deployed HTTPS `/api/arena` endpoint to connect it. Without that variable, Pages retains campaign/editor support and reports that arena requires a server. The repository default remains relative; the published frontends explicitly select the Singapore API.

The [initial source import record](docs/SOURCE_IMPORT.md) identifies the original v0.3.1 source and provenance. No Render service is created merely by adding this repository or its Blueprint.

```sh
python3 -m http.server 8000 --directory public
```

## Verification and limits

The automated suite covers all eight maps, imports, collision, movement, jump/landing, slow time and recovery, swept projectile hits, shot occlusion, weapon trigger behavior, all weapon damage paths, rail collateral, rotated hit volumes, AI routing, boss damage, objective gating, progression, storage failure and template isolation.

The campaign progression test directly exercises combat/objective state transitions; it is **not a human playthrough**. Geometry for all eight sectors was constructed and checked for finite vertex data. Browser checks exercised the menu, editor painting, undo, template loading, map validation and save/export controls. The update additionally generated and undid a seeded 24-hostile sector, joined two independent browser sessions to one Domination room, observed shared scores and automatic rounds, changed class and verified bot backfill after leaving. Automated tests validate 270 procedural maps, aim projection across pitch/yaw/zoom combinations, API session isolation and retry safety, mixed-team balance, AI combat, repair, respawn and contested objectives. Navigation regressions cover low crates, tight corners, U-shaped barriers, disconnected floor islands, elevated and moving targets, plasma detours, crowd spacing, corner recovery, arena turning and persisted routes. These are simulation checks; no new GPU playthrough is claimed.

**GPU rendering, pointer-lock combat, real audio output and physical gameplay feel remain unverified in the build environment:** its cloud Chromium cannot create a WebGL context. An actionable graphics message appears and the map editor remains usable in that situation. A GPU-capable desktop playthrough of the entire campaign is the next acceptance check. No measured FPS or completion-time claim is made.

## Source

- `public/src/game.js`: pure, seeded 120 Hz simulation and shared collision geometry.
- `public/src/navigation.js`: shared body-clearance routing, weighted A*, smoothing, replanning and local spacing.
- `public/src/maps.js`: original campaign, bounded map format, connectivity validation.
- `public/src/renderer.js`: raw WebGL shaders, procedural city, robot and weapon geometry.
- `public/src/math.js`, `mesh.js`: attributed QUICKSCOPER mathematical/batching donor code.
- `public/src/editor.js`: Canvas map editor, history, import/export and validation UI.
- `public/src/audio.js`: original local sound and musical synthesis.
- `public/src/storage.js`: defensive campaign persistence and first-completion rewards.
- `public/src/app.js`: input, lifecycle, presentation and fixed-step scheduling.

## License / originality

Apache-2.0, retaining the donor license. See `public/LICENSE` and `public/NOTICE`. Campaign layouts, title, story, characters, weapons, colour system, glyph signage, interface and sound sequences are original to AFTER//ZERO. The game borrows genre ideas, not proprietary game assets, branding or levels. It is not affiliated with id Software, Remedy, CD Projekt or their games.

Weapon handling takes conceptual inspiration from LibreQuake’s held attack and next/previous weapon controls. AFTER//ZERO uses original implementation and optics, with no LibreQuake code or assets copied.

- `public/src/generator.js`: reproducible connected map generation.
- `public/src/aim.js`, `controls.js`, `sights.js`: unified aim, held input and original screen-space optics.
- `public/src/arena-sim.js`: shared arena rules, classes and AI; only the server advances authoritative state.
- `public/src/arena-client.js`, `arena-ui.js`: online room transport, prediction, lobbies and scores.
- `server/arena-api.js`, `arena-coordinator.js`, `db/schema.ts`, `drizzle/`: authenticated sessions, leased room updates, bounded input inbox and schema.
