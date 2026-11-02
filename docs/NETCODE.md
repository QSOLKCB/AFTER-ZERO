# Arena hit timing and responsiveness — 0.4.2

The goal is to preserve legitimate hits across ordinary latency differences. The
server never accepts client positions, hit claims, damage, ammunition or scores.
The same simulation runs in Sites/D1 and the optional Render/SQLite adapter.

## Timing contract

- Input sends run every 50 ms, independently of response time. Shots/actions flush
  sooner, with a minimum 25 ms between sends. Six requests may
  be outstanding. Monotonic room revisions discard stale responses. Shot and
  action IDs are acknowledged separately, so retransmission is idempotent even
  when input packets arrive out of order.
- Each response carries a server-generated receipt bound to that player, life
  and round. Echo timing estimates RTT after subtracting time the receipt spent
  at the client. A recent minimum limits jitter inflation. Each measured receipt
  retains its timing estimate. No client wall clock or claimed ping is used.
- Shot age credit is half the measured RTT (capped at 125 ms), plus one 50 ms
  send interval and 25 ms of jitter allowance, with an absolute 200 ms ceiling.
  Views may rewind at most 250 ms and must agree with the referenced snapshot.
  Future, expired, foreign and previous-life receipts are rejected. Client timing
  is still untrusted: bounds reduce abuse, but cannot prove the physical instant
  of a mouse click or detect all deliberate network delay.
- The server retains approximately 650 ms of poses at 60 Hz and interpolates
  positions. Remote rendering uses timestamped snapshots with a 50 ms buffer,
  capped at the latest snapshot; deaths/respawns are never blended into a path.
- A valid delayed shot starts at the historical authoritative shooter position.
  It catches up in 120 Hz steps against historical moving robot volumes, static
  cover and chronal fields. Head damage uses the intersected head volume. The
  projectile's own lifetime clips travel, including contact at its endpoint.
- Impacts settle after outstanding receipts can no longer authorize an earlier
  shot, ordered by impact time. Each receipt retains its original age budget;
  lowering current ping cannot revoke that outstanding permission. Calibrated
  30/90/200 ms RTT scenarios settle after 110/140/195 ms, rather than the previous
  fixed 250 ms. Unknown timing can require up to 220 ms. In mixed rooms the
  outstanding permissions of every human matter. These are simulation windows,
  not measured click-to-feedback times. Exact-time
  impacts form a batch. A projectile fired after its owner's earlier lethal
  impact cannot score. A round fired before that impact stays valid and may
  trade. Travel distance and bullet time therefore still matter: first trigger
  press alone does not define the winner.
- Local muzzle sound/recoil is predicted immediately and deduplicated against
  the server echo. Confirmed damage and death remain delayed and authoritative.
  Ammo, reload, loadout, switch recovery and per-weapon cadence remain validated.
- Local movement replays recent inputs over the authoritative position before
  smoothing its correction. Jump and dash use the same collision/physics code
  immediately on the client and later on the server. Remote interpolation and
  animation clocks never rewind between snapshots. Roster DOM updates run at
  most four times per second instead of on every response and gameplay frame.

## Room contention fix

Production v0.4.0 logs contained six-attempt compare-and-swap failures returning
409 after approximately 319–621 ms. Increasing the send rate had exposed a
storage contention bottleneck. This is observed server evidence, separate from
unverified GPU combat feel.

Version 0.4.1 atomically queues each authenticated input and claims a short room
writer lease in one D1 batch. Only the lease owner advances the match. Other
requests return the last committed snapshot; their inputs remain queued for the
next writer. There are at most eight envelopes per player, with independently
deduplicated shots/actions repeated until acknowledged. The writer consumes
commands in receipt order, settles combat after consuming the batch, and commits
with both revision and lease checks. A late-command fence prevents deleting an
input that was not simulated. Interrupted leases expire after 1.5 seconds. A
bounded retry handles late arrivals without the previous six-writer retry loop.

The first production 0.4.1 sample had 100 successful responses and no 409s, but
storage wait still dominated: many requests took roughly 330–360 ms with only
3–6 ms CPU, and some writer requests exceeded one second. Version 0.4.2 reduces
the claim/read phase from four SQL statements to two using UPDATE RETURNING.
The Worker build also requests Cloudflare Smart Placement to favor proximity to
its database. The managed host must honor that setting; an emitted configuration
is not proof of production placement or lower latency. A dedicated room backend
remains the next step if storage is still too slow.

## Executed automated scenarios

`tests/arena-network.test.mjs` exercises the real arena simulation and client:

| Scenario | Expected result |
| --- | --- |
| 30 / 90 / 200 ms symmetric RTT; moving target | All three register the validated historical body hit |
| 200 ms shooter fires first; 30 / 90 ms reply arrives first | Earlier lethal impact wins; post-death shot does not score |
| Both rounds leave before either lethal impact | Both rounds remain valid; a trade is possible |
| Exact-time impacts; reversed iteration order | Same result in both orders |
| All five weapons; delayed and duplicated packets | Correct ammo consumption and recovery; no duplicate shot |
| Solid cover, nearest enemy, friendly teammate | Cover and nearest eligible target win; no friendly damage |
| Rotated/elevated robot; head vs torso | Shared rendered hit volumes determine damage |
| Short projectile lifetime / contact at expiry | No overshoot; endpoint hit is retained |
| Chronal field during catch-up | Travelling rounds retain field slowdown |
| Invalid, stale, future, foreign or old-life proof | Rejection; no unearned damage/ammo use |
| Low RTT requesting full rewind; inflated wait | Rejection outside that player's measured allowance |
| Retry and reordered shot/action IDs | Single execution and separate acknowledgements |
| 30 / 60 / 144 Hz request schedules | Identical fixed-step hit result |
| 30 / 90 / 200 ms response delays | 20 sends/second; bounded requests during a prolonged outage |
| Older response, respawn, focus neutralization | No state rewind or carried-over local trigger |
| Predicted muzzle effect and authoritative echo | Immediate local feedback, played once |
| Recent movement replay at 30 / 90 / 200 ms RTT | Similar travelled distance; no backward correction during steady movement |
| Jump/dash before response; collision during replay | Immediate response with shared authoritative motion rules |
| Monotonic remote clock; urgent shot send | No interpolation rewind; shot need not wait for the next regular poll |
| Adaptive deadline; earlier outstanding receipt | Shorter calibrated wait without withdrawing granted shot timing |

`tests/arena-api.test.mjs` also exercises receipts and hits through persisted
SQLite/D1-compatible API calls, including a compare-and-swap conflict and a
duplicate packet. Six overlapping requests, expired writer recovery, a late input
at commit time, bounded/unauthorized inbox writes and finished-round restart are
also tested. The standalone suite checks real local HTTP clients, CORS, limits,
restart persistence, schema-1-to-2 upgrade and consistent backup restoration.

## Production verification — 0.4.2

The published Site successfully created a 12-combatant Team Deathmatch room and
advanced bot scores. A 100-response production sample after deployment contained
100 HTTP 200 responses and no 409s. Worker wall time was 332 ms median, 784 ms at
the sample's 95th percentile, and 1,284 ms maximum; median CPU was 4 ms. The
browser's displayed round trip remained approximately 800–960 ms. These timings
include the particular cloud-browser/hosting path and are not a worldwide
benchmark. They establish that the live lag problem remains unresolved despite
removing the observed retry errors. No placement-routing header was observed, so
the managed host's application of Smart Placement is unverified.

The [live lobby evidence](verification/arena-latency-v042.jpg) shows connected
players, bot scores, an 800 ms round trip and the WebGL limitation. The next
hosting acceptance check is the prepared dedicated Render service, after the
workspace and paid-resource approval. It must demonstrate lower latency before
frontend cutover; no Render service has been created.

## Earlier browser smoke check

The updated browser client created a local Team Deathmatch room, maintained its
connection while bots scored and rounds restarted, and left successfully. The
[recorded lobby screenshot](verification/arena-lobby-v040.jpg) shows the actual
room and the explicit WebGL-unavailable message. Combat rendering was not tested.

## Limits and acceptance work

These are deterministic/synthetic latency tests and local HTTP tests. They are
not measured worldwide connections, packet-loss distributions, host benchmarks
or a GPU gameplay playthrough. Asymmetric routes make half-RTT estimates imperfect.
Jitter or retransmission beyond the allowance rejects a shot and reports a late
signal. Adaptive settlement still adds confirmation delay, especially in a room
with slow players; prediction does not turn pending damage into a confirmed hit.

Movement, repair healing, stations and domination continue on the current server
timeline; this implementation rewinds combat geometry rather than rolling back
the entire world. Healing/ability interactions during the settlement window are
not guaranteed to match a hypothetical zero-latency replay. Spawn/round IDs and
authoritative current resource checks prevent historical damage crossing lives,
but a delayed shot spanning a weapon switch or reload can be rejected.

Rooms are still request-driven HTTP simulations with a bounded 250 ms catch-up
budget. Idle rooms do not run a dedicated background tick; overload/stalls can
drop simulation time. A regional dedicated room process, measured load limits
and geographically distributed testing remain necessary before competitive or
ranked claims. Server authority and timing bounds are not a comprehensive
anti-cheat system. No host advantage or worldwide equality guarantee is made.

## VANILLAJS review

Reviewed [QSOLKCB/VANILLAJS](https://github.com/QSOLKCB/VANILLAJS) at
`7413d0a9b3555e47a97fbcf344718b42d7ec0f2d` (0.2.0). Its projectile lifetime,
chronological hit events and 30/60/144 Hz regression patterns informed these
checks. Its projectile module handles static colliders and has no multiplayer
synchronization. AFTER//ZERO keeps its robot geometry, moving-target sweep and
new timing implementation. No VANILLAJS code or assets were copied; the exact
reference and Apache-2.0 provenance are recorded in `public/NOTICE`.
