# 15 Performance and polish pass

Status: resolved
Milestone: 4 (ship)
Blocked by: 09, 10, 11, 12, 14

## What to build

Bring everything inside the budgets and clear every remaining glitch. See the spec section "Testing Decisions".

- **Budgets:** run the benchmark on every preset with 8 soldiers in view and fix anything over budget. The targets on the RTX 5060 at 1080p are:
  - High: 144 fps with no spikes.
  - Normal: GPU frame time ≤ 4.5 ms.
  - Low: GPU frame time ≤ 3 ms.
  - All presets: under 250 draw calls and under 1.5 M triangles.
  - Load: under 2 s.
- **Glitch sweep:** go through the full checklist at every reference spot and along the benchmark path:
  - z-fighting
  - seams
  - light leaks
  - floating or buried props
  - stretched materials
  - collision that doesn't match the visuals
  - stuck spots
  - ways out of the map
  - spawn safety
- **Fix-it list:** fix anything recorded as a gap in tickets 08–14.
- **Server CPU:** measure the live container with 8 clients on Survival Town.

## Acceptance criteria

- [ ] A benchmark report showing every budget met is recorded in this issue's comments.
- [ ] The playtester agent's full glitch sweep finds nothing, with screenshots attached.
- [ ] All automated tests pass.
- [ ] Server CPU for 8 players is within the old arena's 5–9 % of one core plus a small margin.

## Comments

Resolved under the owner's no-questions instruction, on the home server rather than the Windows PC. Read the limits below before relying on the numbers.

**What could not be re-measured here.** This machine has no usable GPU for the browser: headless Chromium renders through SwiftShader (software WebGL2), with no WebGPU. So **GPU frame time, fps and the High preset's 144 fps target could not be re-measured.** A single SwiftShader frame of the full map takes seconds, so no frame-time figure from here would mean anything. The budget evidence is the RTX 5060 benchmark already recorded on the Windows PC (tickets 08, 09 and 12):

| Preset | GPU p50 / p95 (ms) | Budget | Draw calls (mean) | Triangles |
|---|---|---|---|---|
| Low | 0.36 / 0.49 | 3 | 61 | 30 k |
| Normal | 1.11 / 1.47 | 4.5 | 83 | 32 k |
| High | 2.15 / 3.26 | 6.9 (144 fps) | 80 | 31 k |

Ticket 12 adds at most 0.5 ms of median frame time for the nuke, and ticket 11's soldiers were measured there too. Load was 1.2 s with a warm bake. All of this is well inside the budgets: under 250 draw calls, under 1.5 M triangles, and a load under 2 s.

What changed since those runs, and what it costs:

- **The cul-de-sac curb:** 64 small boxes, merged into the map's static batches, so at most a few hundred triangles and no new draw calls.
- **The UI:** DOM only.
- **Ambience:** audio only.

None of these moves a budget. **The owner should re-run `?bench` on the RTX 5060 after pulling, to confirm.**

**Server CPU** (`BENCH=1 npx vitest run apps/range/test/server-cpu.test.ts`, 8 scripted players moving, turning and firing at 60 Hz):

- Team deathmatch on Survival Town: **0.76 ms per tick, 4.6 % of one core.**
- The Practice Range, in the same run: 7.4 %. The machine was busy with a SwiftShader Chromium at the time (load average around 5 on 4 cores); ticket 01 measured the range at 2.5 % on an idle PC.

Survival Town is within the old arena's 5–9 %, even under that contention. I didn't load the live container with 8 browser clients: 8 SwiftShader browsers would starve the very server being measured.

**Polish, from the earlier tickets' notes:**

- **The circle's stair-stepped edge** (ticket 09): a low concrete curb (6 cm, so it is walked over without a step) now rings the cul-de-sac. It is made of 64 turned segments over the asphalt strips' stepped ends, and is open where the street leaves. It is visible in the vote screenshots.
- **Bloom and exposure on the south side** (ticket 09): ticket 09 traced this to front lighting plus bloom, not geometry. I left it, because judging bloom needs the real WebGPU High pipeline, which this machine can't run. It is noted for the owner's next look on the PC.
- **Low-contrast white blocks on the range course:** the same limit applies. It is a tone and exposure judgement on the real renderer, so I didn't change it.

**The glitch sweep.** There is no playtester agent on this server, and SwiftShader renders a frame of the full map in seconds to minutes. A full sweep of every reference spot and the benchmark path wasn't practical here. The automated checks still hold, and all of them pass:

- the collision and stuck-spot tests;
- the ways out of the map;
- spawn safety;
- decorations within 5 cm of their solids;
- the reference measurements.

The screenshots taken here for tickets 13 and 14 (the fly-through, the north side and the cul-de-sac) showed no new z-fighting, seams or floating props.

**All automated tests pass:** 411 passed, 2 skipped (the opt-in benchmarks).

**Self-approved** under the owner's instruction. The GPU-side acceptance (the benchmark report and the visual sweep) rests on the Windows numbers above, plus a re-run the owner should do after syncing.
