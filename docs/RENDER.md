# Render arena backend

This is an optional, separate deployment of the existing arena simulation. The Sites Worker/D1 API remains available. The Render service uses Node's standard library and SQLite; it has no runtime npm dependencies and does not need the Sites framework build.

## Deployed resources

| Setting | Value |
| --- | --- |
| Repository / branch | QSOLKCB/AFTER-ZERO / main; PR #1 merged |
| Service | afterzero-arena, public Node web service |
| Region | Singapore, confirmed by the owner |
| Compute | 0.5c-512mb, one instance |
| Persistent disk | 1 GB mounted at /var/data |
| Database | /var/data/afterzero/arena.sqlite |
| Initial room limit | Two simultaneous rooms, each retaining the existing 8/12/16 slots |
| Automatic deployment | Off |

The owner approved deployment in QSOL-IMC. Render accepted the US$7/month compute plus US$0.25/month disk quote on 3 November 2026 (Adelaide). The workspace is Hobby, with no workspace subscription fee; extra build spending is capped at $0. Service auto-deploy and Blueprint auto-sync are off. The deployed backend is https://afterzero-arena.onrender.com and GitHub Pages uses its `/api/arena` endpoint through the repository variable.

**US$7.25/month is a resource baseline, not an all-in billing cap.** Render includes 5 GB outbound traffic on Hobby and charges US$0.15/GB above that. Applicable tax is not established by the resource quote. Billing continues until resources are stopped or removed; deployment does not purchase a prepaid one-month package. No provider-wide hard bandwidth spending cap was found in the current Dashboard or documentation.

The adapter compresses larger responses with gzip level 1 when the client accepts it. An application allowance reserves compressed body bytes plus 2 KiB per response and pauses arena requests at 3 GB per UTC calendar month, leaving 2 GB of the included allowance for other traffic and measurement differences. The counter is persisted in the standalone-only `arena_egress` SQLite table before sending responses, survives restarts, and resets at the UTC month boundary. HTTP 507 stops game polling with a visible message; Campaign and Forge remain available. Health checks and CORS preflight remain available. This is a conservative application guard, **not a guarantee on Render's total bill**: proxy-generated traffic, repeated rejection responses, unrelated workspace traffic and taxes remain outside its accounting. Monitor provider usage as the billing authority. Do not reset or restore an older traffic counter to extend the allowance.

The selected small plan is a starting configuration, not a measured player-capacity guarantee. This disk architecture supports one instance and briefly interrupts connections during deployment. If a restart lasts beyond the game's 12-second session timeout, players must rejoin. Rooms expire after 20 minutes without requests. Multi-instance scaling would require different storage and room coordination.

## Local verification

Use Node 24.22.1 (the Blueprint pin) or the project's supported compatible Node version. No npm installation is required for the standalone service:

```sh
npm test
npm run check
ARENA_DB_PATH=./data/arena.sqlite ALLOWED_ORIGINS=http://localhost:8000 npm run start:arena
```

The backend listens on `0.0.0.0:$PORT` (default 10000). `GET /healthz` reports liveness; `GET /readyz` checks readiness and SQLite access. `POST /api/arena` retains the create/join/sync/leave/class protocol.

`ALLOWED_ORIGINS` contains comma-separated origins, without paths or trailing slashes. HTTPS is required except for explicit localhost development origins. Production permits the GitHub Pages origin and the existing Sites origin. No wildcard or credentialed CORS is enabled. Caller-supplied Sites, Cloudflare and forwarding identity headers are discarded; anonymous sessions share the API's server-side owner bucket. CORS is not authentication: possession of a valid player token establishes the existing anonymous player session.

The adapter bounds bodies to 125,000 bytes, admits at most 32 concurrent requests and 700 requests/second globally, and applies a per-session token bucket of 30 requests/second with a 60-request burst allowance. SQLite writes and capacity checks are serialized. At most 1,024 recent session rate-limit entries are retained. `MAX_ACTIVE_ROOMS` can be set from one to six; raising it requires measuring CPU, latency and bandwidth on the real service. HTTP clients can forge origins and create tokens; these are resource limits, not an account or anti-cheat identity system.

## Deployment and frontend cutover

1. Review and merge the source/adapter PR. Confirm the intended Render workspace and paid resource quote. No service is created by committing this file.
2. Create a Blueprint using the repository's `render.yaml` on `main`. Check for an existing `afterzero-arena` service before applying; do not accidentally adopt another service with that name. Keep automatic deployment off.
3. Let the startup process apply unapplied migrations from the Drizzle journal after the disk is mounted. Schema version 2 adds the bounded input inbox and room lease; existing version-1 room data is preserved. Build and pre-deploy jobs must not access the persistent disk.
4. Verify `/readyz` and two independent clients against the real public endpoint, including browser preflight, all game modes and restart recovery. Measure actual CPU, memory, response latency and egress before opening more rooms.
5. Set the GitHub Actions repository variable `ARENA_API_URL` to the returned HTTPS URL plus `/api/arena`. This is a public endpoint, not a secret. Run the Pages workflow; it validates and embeds this value in the static artifact. Do not invent an onrender.com hostname before Render returns it.

The source default remains `./api/arena`, preserving same-origin Sites behavior. Without an external endpoint, a Pages copy supports campaign/editor and displays the existing server-required message for arena requests. The existing Sites deployment does not switch automatically. Campaign saves and editor drafts remain browser-origin-local.

## Consistent backup and rollback

From the running service's shell, create a consistent SQLite export using the database engine, not a filesystem snapshot:

```sh
ARENA_DB_PATH=/var/data/afterzero/arena.sqlite node scripts/backup-arena.mjs /var/data/afterzero/backup-2026-11-03.sqlite
```

Use a new destination for each backup. Copy the resulting file off the service with Render's supported SSH/SFTP access; a backup on the same disk is not an off-site backup. Do not serve this file publicly: room session hashes are private state.

For recovery, stop the service, retain the old database and its WAL/SHM files together under a different name, place the consistent export at `ARENA_DB_PATH`, and start the service. Do not mix old WAL/SHM files with a restored database. Restoring a backup rolls rooms back to that point; stale sessions may require rejoining. Local tests open the backup as a fresh server and verify the room and its players.

For a code rollback, redeploy the preceding tested commit. Startup refuses a database with a newer schema version. Back up before schema changes and define a compatible migration rollback before applying them. Reverting the Pages `ARENA_API_URL` to its previous working endpoint is a separate frontend rollback; pointing it at the Sites API requires that API to explicitly allow the Pages origin.

## Evidence and remaining checks

The standalone suite exercises two HTTP clients, balanced teams, replay-safe actions, session isolation, CORS preflight, forged provider headers, concurrent capacity checks, malformed/oversized/chunked bodies, rate limits, restart persistence and backup restoration. The full game suite remains required. The shared lag-compensation tests and limitations are recorded in [NETCODE.md](NETCODE.md).

The initial Render deployment became live on commit `a31b06820d83c4589fbb1efc825d3768ad2a86f0`; `/healthz`, `/readyz` and both configured browser preflights returned success. A 20-second two-client TDM sample observed balanced human teams, six bots and changing scores. Its 91 completed sync responses were all HTTP 200, but cloud-runtime RTT was 342 ms median / 1868 ms p95 with timeouts and rejected late shots. This is not a latency acceptance pass or a worldwide measurement. Initial memory usage remained below 70 MB and the sampled CPU use was about 0.044 CPU; these brief samples do not establish capacity. GPU combat remains unverified because the cloud browser cannot create WebGL.

Native Render validation rejected a custom shutdown delay with a disk attached; removing that override allowed deployment with the platform default. JSON Schema validation alone does not establish platform validity. The gzip/traffic-allowance update additionally tests response equivalence, encoding opt-out, exhaustion across restart, UTC rollover and client polling shutdown.

References: [compute plans](https://render.com/docs/compute-plans), [pricing](https://render.com/pricing), [persistent disks](https://render.com/docs/disks), [Blueprint reference](https://render.com/docs/blueprint-spec).
