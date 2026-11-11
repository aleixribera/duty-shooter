# Test triage

Status: resolved
Release: v2.170.1

Spec: `../spec.md`

Delete or rewrite tests that pin sentences, CSS regexes and clone numbers; keep invariants. Bring the slowest files down. CI must never again sit red for days: a failing soak names its seed and the fix is found the same day.

## Comments

- 2026-11-10, owner: the owner said testing takes far too long and agents rerun big suites that test 1% of their change. Two tiers now (`vitest.config.ts` projects): `npm test` is the fast tier, `npm run test:soak` the soaks (`*.soak.test.ts`: every map's bot soaks, the island's Battle Royale played through, Bot Match from start to lobby, look-pitch's minutes of fire online), `npm run test:all` both, which CI runs. `docs/agents/codebase.md` now says how to test a change: `vitest related` while working, `npm test` before a commit, only the soaks the change touches; local, no `remote-test`, whose shards are gone.
- Made cheaper rather than moved: `kit-solids` 328 s to 18 s (scalar triangle distance that stops at the tolerance, one pass over the triangles per column of samples; still fails at a 0.2 cm tolerance), and Zero Island's cover-mantle test 59 s to under a second (a grid of solids instead of scanning 56,000 per piece). The fast tier ran in 362 s with another project's suite on the PC at the same time, before the column change took 150 s off its long pole.
- `status.test.ts`'s event log waited a count of 20 ms sleeps for the leave, which ran out under load: it now waits for the line itself.
- Still open: the sweep of tests that pin sentences, CSS regexes and clone numbers.
- 2026-11-11, the sweep (v2.170.1). Decided without the owner, as the spec's "Tests serve the game" says:
  - **Sentences:** about 55 assertions in 15 files pinned a whole line of UI copy (the goal at the countdown, the Reboot prompts and feed, Squad wiped, Kill Leader, the lobby's bot fill, the Royale lobby's server and session lines, the Course clock, the benchmark verdict, the death recap, ping callouts, the Supply Drop lines, loadout notes). Each now checks the facts the line carries (names, counts, the map square, the key, a formatted time, singular against plural Squads), that different cases give different lines, and `null` where nothing shows. Shown by rewording the lobby's bot fill and the T-minus line in the source: the old tests failed, the new ones pass.
  - **CSS:** `menu-css.test.ts` matched the pause menu's rules by regex, values included. It now checks that the item rule sets its own background, border and colour (ticket 56's bug: the browser's grey button under white text), and that each lit state sets a background. Removing `background: none; border: 0` from the rule still fails it.
  - **Colours:** `team-colours.test.ts` pinned DESIGN.md's hex values; it now checks the palette's tokens follow whichever set is picked. The colour-blindness distance checks stay.
  - **Clone numbers:** the SMG's "about 170 ms within 12 m, 330 ms at 25 m", the pistol's "about 450 ms" (in both `arsenal.test.ts` and `balance.test.ts`) and the M4A1's "4, 5 and 6 shots" are gone. What stays is each gun's role: the SMG out-kills the M4A1 within 12 m and loses past 25 m, the M4A1 needs more shots farther away, the pistol beats a primary that must reload first. The simulation still has to match each gun's damage bands at every range.
  - Kept on purpose: short labels that are game terms (Rank up, Win bonus, Observer), CSS class names the HUD keys on, a text that just passes through, and server log lines that are data.
  - `docs/agents/codebase.md` gains the rule, under Tests.

