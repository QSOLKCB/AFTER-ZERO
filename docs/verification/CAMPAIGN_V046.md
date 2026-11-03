# Campaign controls and bounded presentation reuse — 0.4.6

## Controls

Previously, Controls discarded any locked mouse event with an axis larger than
400 pixels. Coalesced/high-DPI fast turns could therefore disappear. Finite
locked deltas are now conserved, while capture transitions clear pending input.

Previously, mouse-look was consumed only inside the 120 Hz physics loop. At
240 Hz, alternate display frames could show no response to newly received mouse
motion. CampaignFrame now applies pending mouse motion once per display frame.
Movement, keyboard turning, firing, bullet time and collision retain the fixed
120 Hz step and bounded backlog. Frames without a step retain action edges, so
brief clicks are not swallowed. The combat ray and rendered camera use the same
player yaw/pitch; no smoothing offset is added.

Starting/resuming previously set the game to playing before mouse capture had
succeeded. The new capture state waits for pointerlockchange, clears inputs at
acquisition, handles both event-only and promise APIs, falls back from unsupported
raw movement, and cancels late grants. Blur, hidden tab and Escape/P pause and
clear input, including during acquisition. No drag fallback is introduced.

The original A/D turning and Z/C strafing remain the default. The optional saved
WASD strafe setting assigns A/D to lateral movement; arrow keys still turn.
Held left and right buttons release independently. Campaign progression,
weapon unlocks, shot cadence, per-weapon recovery and saved upgrades are unchanged.

## Reuse

The shared 0.4.4 renderer optimizations already apply to the campaign. The new
work targets its Canvas overlays rather than adding duplicate geometry caches.

- Radar: one retained terrain canvas and bounded byte-array tile snapshot per
  destination canvas. Exact tile comparisons, dimensions and grid mode invalidate
  the terrain. Actors, facing, relays and the exit are drawn each frame. Mutating
  Forge data in place or replacing a map cannot keep stale terrain.
- Sights: one effective-input signature per canvas. Viewport/DPR, preview mode,
  weapon, aimed mode, reload visibility and effective recoil invalidate paint.
  Geometry changes still repaint; unchanged drawings remain in the canvas.
- Neither cache accumulates frame history. Editor painting remains uncached.
  No new runtime dependencies, assets, paid services or server changes.

## Verification

The full Node suite passes 127 tests. Added cases cover conserved fast turns,
30/60/144/240 Hz schedules, sub-tick clicks/jumps, displayed aim versus actual
shot damage, both movement layouts, button chords, backlog reset, confirmed
capture, raw-input fallback, legacy errors and cancelled late grants. Cache
cases cover changing inputs, dimensions, DPR, map mutations and rapid edits.

Native Canvas 2D in cloud Chromium passed **336 exact pixel comparisons** against
the previous uncached drawing functions: all eight maps with moving markers,
terrain edits, grid and size changes, plus 240 weapon/recoil/scope/reload states.
Reference functions are frozen in `tests/fixtures`. The browser harness is
`tests/browser/campaign-canvas.html`; serve the repository root over local HTTP
and open that path to reproduce. Do not publish a repository-root file server.

One warm-up pair and seven alternating measured pairs produced these medians:

| 240-frame workload | Before | After |
| --- | ---: | ---: |
| Radar terrain with a moving player marker | 69.0 ms | 1.8 ms |
| Settled sight | 0.9 ms | 0.1 ms |
| Rapidly changing sight | 0.8 ms | 0.9 ms |

These are **CPU Canvas submission timings**, not completed GPU work, whole-game
FPS or an end-to-end latency measurement. Small sight timings are especially
sensitive to timer resolution/noise. Rapid-change reuse checks can add overhead;
no universal speedup is claimed. See `CAMPAIGN_V046_CANVAS.json`.

The real game menu loaded, the new layout preference survived reload, and its
help text changed accordingly. The cloud browser still lacks WebGL; its separate
pointer-capture probe was also blocked. Native GPU combat and physical mouse
feel therefore remain unverified. No claim is made that online lag is solved.
