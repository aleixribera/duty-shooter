# Movement momentum

Status: resolved
Release: v2.153.0

Spec: `../spec.md`

Slide into jump keeps speed, a little more air control, sprint hold as an option. Movement course records on the Practice Range.

## Comments

Built by the owner session. Decisions, each taken without asking:

- **The Kick, not a slide-cancel exploit.** A Slide out of a Sprint of 0.6 s or more (`STATS.slide.runUp`, counted by a new `MoveState.run`, ticks of unbroken sprint) enters at 1.15x the sprint speed (`STATS.slide.kick`), capped at what the weapon's own sprint allows. A slide started any other way has no Kick, and cancelling a slide and sliding again does not re-kick until the run-up is run again: no chain of kicks. The Kick lives in the speed the slide decays from (`SLIDE_DECELERATION` now uses the kicked speed, so the slide still lasts its 0.9 s and its 5 m, which `slide.distance` now states in metres instead of IW units).
- **Slide into jump keeps speed.** It already did in the air (air control does not brake); what was missing was a reason to do it. With the Kick, a slide-jump is the fastest way across a gap, and the momentum tests hold that the speed comes back down to a sprint on landing instead of stacking.
- **Landing slide.** Holding Crouch as you land at a run (5.2 m/s or faster, `STATS.slide.landSpeed`) goes straight into a slide, no Kick. A landing at a walk or standing up is a plain landing.
- **Air control 1 -> 1.4** (`movement.airAcceleration`): a little more steering in a jump, not enough to change a jump's length: the range's gap tests (a walking jump still falls short of the 3.9 m and 4.1 m gaps, a sprint jump clears them) still pass.
- **Sprint hold** is a Controls setting (`sprintMode`, Toggle by default, beside Aim and Crouch). Hold ends the run the tick the key comes up; a tap shorter than a tick still runs that tick. Touch keeps its own stick sprint and lock.
- **The Course** (GLOSSARY): a start pad at the foot of the stairs and a finish on the 10 m tower, a straight line along -Z through the stairs, both gaps and five climbs. The clock (`course-run.ts`) is fed the player's position each simulation tick, so a time is the simulation's, never the frame rate's. Leaving the pad the right way starts it (a flying start from behind the pad counts); the pad again, death, or 180 s ends it. Off while a match is on (the range can host one online).
- **Par from a scripted runner** (`apps/range/test/course-run.test.ts`): clean timing makes 13.7 s, a runner who presses Jump early at each climb 16.5 s. So Gold 14.00, Silver 16.50, Bronze 21.00. The test holds clean timing to Gold and early climbing to Silver, so a change to movement that makes the Course trivial or impossible fails a test.
- **The best time is in the Profile** (`courseBest`, `ProfileStore.bankCourse`), read back as null from an older save. The HUD shows a plate at the top centre: ready on the pad with the three grades (or your best and Gold), the running time and your best, then for 6 s the grade, the time and "New best -0.42" or "+0.80 on best". A new best is a heavier top rule, not an accent colour (DESIGN.md: signal is for what can be acted on). The Medal sound plays for a new best.

Verified:

- Unit: `packages/fps-core/test/momentum.test.ts` (kick, no kick without a run-up, no re-kick, weapon scale, slide-jump returning to sprint, landing slides, air control), `slide.test.ts`, `packages/fps-client/test/course-run.test.ts` (clock rules, time format, grades, the HUD's lines), `profile.test.ts` (best time kept, only beaten by a faster run, old save), `sprint-toggle.test.ts` (hold), `apps/range/test/course-run.test.ts`, `apps/range/test/map.test.ts`.
- Live, in the page (`.scratch/next-level/momentum/course21.mjs`, an in-page runner pressing W, Shift and Space): ready plate on the pad, the clock running through the gaps and climbs, Gold in 13.80 s at 1920x1080 and 13.83 s at 844x390, the best saved in the Profile. Screenshots in `.scratch/next-level/momentum/shots/`.

Not done: no separate camera feel for the Kick (the settings agent's ticket 10 owns the slide pose and camera motion; it was told about the Kick). Nobody has run the Course by hand: the par times come from scripted runners, so Gold may prove easier or harder for a person; the test makes retuning them a one-line change.
