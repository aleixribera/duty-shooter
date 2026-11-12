# Hints wait for a quiet moment

Status: resolved

Release: v2.180.0

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, UI/UX 6/10): "Aim down the sights: tighter, and slower to turn" came up mid-firefight, under the crosshair, with an enemy marked 22 m away (`../reviews/2026-11-12/07-play-mid.jpg`). A lesson given in a fight is read by no one, and it covers the fight.

## Comments

**v2.180.0.** The hints that teach rather than answer the moment (the sights, sprinting, a grenade) never start in a fight. They wait until `HINT_CALM` (4 s) after the last fight frame, and one already up steps aside when a fight starts.

A fight is any frame where:
- the player was hit (health down since the last frame);
- the player fired (a round gone from the same gun);
- an enemy is called out (an enemy ping standing).

Reload and swap still come up mid-fight, because that is their moment. The rules are in `hints.ts` (`HintFacts.clash`, `HintState.clashed`, `LESSONS`), and `Game.#hint` feeds them.

Verified:
- `hints.test.ts` has a new test: no lesson during a fight or in the 4 s after; a lesson up steps aside at a shot; reload still shows mid-fight. It failed before the change and passes after (21/21).
- Typecheck passes.
- `../hints/calm.mjs` walks Survival Town alone with fresh hint memory: walk, hold the trigger 10 s, let go. While firing, only "Reload" and "Swap to your other weapon" showed, never the sights. "Aim down the sights" came up 4.2 s after the last shot.

A second opinion (subagent review of the diff) found two problems, both fixed before release:
- A lesson cut short by a fight stayed in this life's list and counted as a showing, so two interrupted lives dropped it for good unread. Now a fight breaking in is no showing, and the lesson comes back in the quiet after (covered by the test).
- A revive (health from the downed pool to 50) read as a hit. Hits and shots are now only read between two frames of fighting.
