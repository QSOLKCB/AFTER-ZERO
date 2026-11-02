# AFTER//ZERO engineering rules

Read README.md and public/NOTICE before making changes. Preserve donor provenance.

- Vanilla HTML/CSS/JS, raw WebGL, Canvas editor, Pointer Lock and Web Audio. No frameworks, CDNs, imported game assets or runtime package dependencies in the browser game. Sites uses its maintained Vinext Worker starter for the same-origin arena API, with D1 storage.
- Preserve the original cyberpunk single-player game and its eight-sector campaign. Never overwrite the donor QUICKSCOPER project.
- Campaign simulation stays in game.js; shared ground navigation stays in navigation.js. Input/presentation stays in app.js; map format and validation stay in maps.js. Rendering and collision must agree on geometry and hit volumes.
- Keep the 120 Hz fixed step, bounded backlog, normalized movement, swept collision and seeded gameplay randomness. Pause/lost focus/hidden tab/pointer unlock must stop single-player simulation and clear input. Online rooms continue on the server; neutralize local input and say that the player remains vulnerable.
- Bullet time scales enemies and travelling projectiles together. Player aim stays responsive. Weapons repeat at their own cadence while held; brief taps are buffered for 150 ms. Weapon switching must preserve each weapon’s recovery.
- Campaign reward accounting must grant one credit per mission’s first completion. Custom-map tests must not alter campaign progress. Save failures must be nonfatal and visible.
- Map imports are bounded data, never scripts/HTML/URLs. Every playable map must validate geometry, entity placement and reachability. Keep editor changes isolated from campaign templates.
- Run npm test, npm run check and npm run build. Test meaningful behavior, not implementation copies. Run GPU browser QA when the environment supports it; do not claim it passed if WebGL is unavailable.
- Keep relative runtime paths. Author the game in public/; build deployable output in dist/ using the Sites build helper. Update the downloadable source ZIP after source edits with python3 scripts/source-archive.py. Never place credentials in the repo or ZIP.
- Do not merge, tag, or change an existing Site’s audience without user authorization.

- Arena simulation is server-authoritative. Never trust client positions, hits, health or scores. Persist rooms with D1 writer leases and compare-and-swap revisions; fence commits against unprocessed inputs. Keep the authenticated inbox bounded, validate input sequences and retain unacknowledged shot/action edges. Keep a bot on each mixed team.
- Procedural layouts must validate and preserve a connected floor graph; generation must be repeatable and undoable.
- Keep walkability separate from sight lines. Navigation shortcuts must clear the body footprint; inaccessible targets must never fall back to moving through solids. Arena route state must remain JSON-serializable.

- The optional Render adapter in server/standalone.mjs reuses the same arena API and simulation with SQLite. Do not forward untrusted provider identity headers. Keep its origin allowlist, body/rate/concurrency/room limits, and single-writer persistence.
- public/src/arena-endpoint.js is the only permitted external browser API endpoint. Generate its HTTPS value with scripts/configure-arena.mjs; retain the relative default for Sites.
- Render deployment requires a confirmed workspace and approval for the selected paid resources. Preparing a Blueprint or PR does not deploy it. Preserve the Sites deployment during migration.
