# Benchmark link

Status: resolved
Release: v2.155.0

Spec: `../spec.md`

battle-royale ticket 25: a page anyone can open that flies a scripted view and prints frame times, so a real laptop can be measured (ticket 27 there is the human's part).

## Comments

### 2026-11-10, implementation agent

Built: `packages/fps-client/src/ui/benchmark-page.ts` (the page) and the `?benchmark` route in `apps/range/src/main.ts`, which flies each map's benchmark path through the existing `Benchmark`. Settings > Video > Benchmark links to it ("Open the benchmark", a new tab).

The page:

- **Before a run:** pick a tier (Low to Ultra; your own setting is untouched) and dynamic resolution on or off. It shows the backend, the adapter, the window in device pixels, and how long the run takes.
- **During a run:** one plate in the corner with the map's name, "Map n of N · %" and the live fps, plus Stop.
- **After a run:** a one-sentence verdict, a table of each map's average and 1 % low (ms and fps) and the render scale dynamic resolution settled on, a "Use <tier> in the game" button, and a line to copy (the clipboard, or the line selected where the clipboard is refused).
- **For scripts:** `globalThis.duty.benchmark` holds the reports and `body[data-benchmark=done]` marks the end. `&maps=`, `&tier=`, `&dynres=on|off` and `&run` are in README's dev parameters.

Decisions:

- **The verdict** is judged against 60 fps for the average and 30 fps for the 1 % low, the floor a player notices as stutter. It names the slowest or choppiest map and the tier below to try, or says when the rate was held only by drawing smaller. (`benchmarkVerdict`, tested in `test/settings-screen.test.ts`.)
- **"Use <tier> in the game"** writes `quality` to the saved settings; the next visit draws at it.
- **On a phone, once results exist they lead the page** and the choices follow. Before, the results sat below the fold under the footer, which the design audit flagged.
- **The flying plate's progress** is body size, bold and tabular: the audit found it the smallest and dimmest text on screen.

Verified: run in the browser over Practice Range, Survival Town and Switchyard (`.scratch/next-level/settings/bench/desktop-3-done.png`); the line it produced was "Duty Shooter dev | High | WebGPU | nvidia blackwell | drawn at 1920x1080 | Practice Range 4.5 ms avg, 12.8 ms 1% low, scale 100% | …". The tier table in ticket 22 was measured with this page. It was captured at 1920x1080 and 390x844 before, during and after a run for the design audit.
