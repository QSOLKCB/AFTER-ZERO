# Stalled HTTP response recovery — 0.4.5

The 0.4.4 busy-room receipt repair and measured rendering/navigation reuse are
deployed. A real two-client probe then exposed an additional send-window problem:
obsolete responses could occupy five of six slots while newer inputs had already
been acknowledged. New shots waited behind them despite a working connection.

Each poll now owns an AbortController. A newer authoritative input acknowledgement
cancels earlier pending responses, releasing their slots. Pending shot/action IDs
remain queued and are retransmitted until separately acknowledged. Expected
cancellation is silent; actual timeouts retain error handling. Leave cancels polls.
The six-request limit, 20 Hz pacing, server authority and timing windows remain.

## Reproduction

The focused virtual-wire case uses actual ArenaClient methods and the SQLite API,
200 ms RTT and five responses stalled for 2.5 seconds. Before the fix, only 2 of
13 automatic-fire shots were accepted; the rest were late/stale. After the fix,
all 13 are accepted. A separate test verifies immediate slot release and that
unacknowledged shots are not discarded. No synthetic hit claims are supplied.

## Live limitations, retained rather than hidden

The first deployed 0.4.4 cloud-runtime sample ran two clients plus six bots for
20 seconds: 356 sync responses were HTTP 200, median RTT 271 ms, p95 555 ms and
maximum 1,004 ms. It also observed a request timeout. Only 3 of 55 recorded shot
results were accepted; the others were late, invalid or expired clocks. This is
not a successful live hit-registration acceptance result.

Two further short one-client probes with cancellation accepted 0/15 and 2/15
shots on the same cloud-runtime route. Tracing showed sends reaching the API in
widely spaced groups, with intermediate requests stalled or cancelled. This
evidence does not identify whether the remaining delay is in the cloud-runtime
network path, connection setup, hosting or another transport layer. Cancellation
fixes the proven local starvation case but does not establish that this live
route is playable. No rewind limits were broadened to conceal these failures.

[The sanitized live record](ARENA_V045_LIVE.json) preserves those observations.
Browser lobby connectivity was also observed at 273 ms RTT, but this browser has
no WebGL and cannot test aiming. CPU preparation/upload reductions from 0.4.4
remain local measurements, not native GPU FPS or guaranteed internet latency.

Physical-GPU playtesting on the player's actual network, and live transport
profiling under representative latency/load, remain outstanding. This update
does not claim to eliminate lag or make every worldwide shot fair. It adds no
paid resources and retains the existing Singapore service and traffic guard.
