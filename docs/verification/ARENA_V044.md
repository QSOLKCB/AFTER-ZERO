# Arena responsiveness and OPT reuse — 0.4.4

Reviewed VANILLAJS v1.0.0 at immutable release commit
`1f965f4e5b6669de0f954e3a39b11aa679e56720`, specifically projectile moving-frame
queries, fixed-step tests, retained WebGL capacity and the OPT invariant/input
signature pattern. AFTER//ZERO already had fixed 120 Hz timing and relative-motion
projectile sweeps; replacing those wholesale would not repair the observed
network rejection. Attribution is in `public/NOTICE`.

## Hit-registration repair

Every request previously generated a receipt for every human, including people
who never received that response. Four 50 ms polling intervals from 13 other
humans evicted a shooter's delivered clock from the 32-entry list. The API test
reproduced a legitimate 200 ms RTT shot rejected as `expired-clock` before the
fix. Receipts now belong only to the actual response recipient.

A queued response may repeat a receipt while showing a newer committed world.
The client now retains the clock's first delivery time instead of resetting it
on every room revision. The server accepts the newer view while retaining the
receipt's original firing deadline. Rewind, weapon cadence, ammo, cover, team,
life/round and damage authority are unchanged. This does not grant additional
rewind to low-ping clients.

`arena-transport.test.mjs` exercises actual ArenaClient polling, firing,
acknowledgements and response handling through a virtual wire into the persisted
SQLite API. It checks moving-target body damage at 30/90/200 ms and a defined
200 ms + 35 ms jitter schedule for automatic fire. The existing suites also
cover earlier lethal impacts, legitimate trades, moving/rotated/elevated targets,
walls, fields, respawns, forged clocks, duplicate/out-of-order commands and
30/60/144 Hz schedules. These are enumerated deterministic cases, not proof of
all internet conditions or a universal hit guarantee.

## Reuse boundaries

- Collision/navigation: two current tile-grid entries, keyed by the full grid
  rather than room-object identity. Owned tile copies survive JSON restore and
  cannot be changed by an editor mutating its input. Hazards participate in the
  key even when solid geometry is unchanged. The cached world/nav are internal
  read-only data; they are never serialized into room state.
- Weapon geometry: one current mesh keyed by every effective geometry input
  (weapon, translated offsets, glow colour and muzzle flash). Unchanged camera
  angle or time alone causes no rebuild/upload. Finite inputs and signed zero
  are handled explicitly. Successful upload is recorded separately, so failed
  uploads retry. Reset/dispose invalidates the generation.
- GPU buffers: grow storage when needed; otherwise use `bufferSubData`. Empty
  meshes do not draw, and shrinking meshes draw only the live prefix. Dynamic
  actors/effects still update. Static world geometry already uploaded once.
- HUD: compare actual text/style values before assignments, avoid overwriting
  arena labels with campaign labels each frame, and retain scoreboard rows.

An initial cache experiment froze nested numeric arrays and slowed the complete
server workload by 29–38%. That experiment was removed: owned packed arrays
preserve V8's fast collision/navigation access. No simulation work or assertions
were removed to obtain the final gains.

## Local measurements

Run `node scripts/arena-performance.mjs /path/to/clean-v043-checkout`.
The baseline tree is `94254c4b0a7265cf8d91f45c27e600dad6e6e77c` (remote commit
`241ecdc29919817d7ae301840b163174fc4888db`). Two warm-up pairs precede seven
alternating measured pairs. Every pair checks exact serialized simulation or
Float32 rendered-vertex hashes. Hash validation is outside the timing windows.
Raw samples and environment are in [ARENA_V044_PERFORMANCE.json](ARENA_V044_PERFORMANCE.json).

| Workload | Before median | After median | CPU change |
| --- | ---: | ---: | ---: |
| 8 bots, 100 serialized 20 Hz server updates | 245.46 ms | 177.07 ms | −27.9% |
| 16 bots, 100 serialized 20 Hz server updates | 625.23 ms | 476.18 ms | −23.8% |
| 240 settled weapon frames | 5.57 ms | 0.85 ms | −84.7% |
| 240 weapon frames, aim then hold | 4.63 ms | 1.08 ms | −76.8% |
| 240 weapon frames, changing every frame | 6.54 ms | 6.16 ms | −5.8% |

| Weapon workload | Upload calls before → after | Storage allocation calls before → after |
| --- | ---: | ---: |
| Settled | 240 → 1 | 240 → 1 |
| Aim then hold | 240 → 25 | 240 → 1 |
| Rapid change | 240 → 240 | 240 → 6 |

These are CPU preparation timings and modeled WebGL API counts, not whole-game
FPS, GPU timings, native WebGL conformance results or driver-memory measurements.
The model includes upload copies and live draw counts. Cache signatures still
have a cost when nothing can be reused; the rapid-change sample is a limited
observation, not a guarantee of a speedup for every changing scene. No historical
geometry is accumulated. The two-map cache may thrash if more maps alternate.

## Validation and deployment limits

The final local suite passed 111 tests, syntax/path checks and the production
build. Versioned module URLs avoid mixing cached releases. The browser preview
loaded v0.4.4 and the arena setup with no observed game-script errors, but WebGL
was unavailable, so native rendering and manual aiming could not be exercised.
Production endpoints, the single Singapore instance, disk size, traffic budget
and paid plans are unchanged. Publication and browser observations are recorded
separately when completed. Physical-GPU combat feel and worldwide fairness remain
unverified; no claim of eliminating propagation delay is made.
