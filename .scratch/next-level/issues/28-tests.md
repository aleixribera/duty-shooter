# Test triage

Status: open

Spec: `../spec.md`

Delete or rewrite tests that pin sentences, CSS regexes and clone numbers; keep invariants. Bring the slowest files down. CI must never again sit red for days: a failing soak names its seed and the fix is found the same day.

## Comments

- 2026-11-10, owner: the owner said testing takes far too long and agents rerun big suites that test 1% of their change. Two tiers now (`vitest.config.ts` projects): `npm test` is the fast tier, `npm run test:soak` the soaks (`*.soak.test.ts`: every map's bot soaks, the island's Battle Royale played through, Bot Match from start to lobby, look-pitch's minutes of fire online), `npm run test:all` both, which CI runs. `docs/agents/codebase.md` now says how to test a change: `vitest related` while working, `npm test` before a commit, only the soaks the change touches; local, no `remote-test`, whose shards are gone.
- Made cheaper rather than moved: `kit-solids` 328 s to 18 s (scalar triangle distance that stops at the tolerance, one pass over the triangles per column of samples; still fails at a 0.2 cm tolerance), and Zero Island's cover-mantle test 59 s to under a second (a grid of solids instead of scanning 56,000 per piece). The fast tier ran in 362 s with another project's suite on the PC at the same time, before the column change took 150 s off its long pole.
- `status.test.ts`'s event log waited a count of 20 ms sleeps for the leave, which ran out under load: it now waits for the line itself.
- Still open: the sweep of tests that pin sentences, CSS regexes and clone numbers.
