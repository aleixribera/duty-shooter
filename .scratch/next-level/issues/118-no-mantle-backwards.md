# No mantle backwards

Status: resolved
Release: v2.213.8

Spec: `../spec.md`. Broken: CI's soak `switchyard-bots-gungame.soak.test.ts` failed on main (v2.213.6, "p6 at 19.0,1.0,-0.0: expected 9.8 to be less than 8"), the flake STATE.md had carried since v2.192.0.

Acceptance: a player who jumps with their back against a waist-high face does not mantle; Switchyard gun game bots never roam in place near 8 s over many soaks.

## Comments

**2026-11-14, loop pass 78 (pass 1).**
- Cause: `distanceToFootprint` (movement/collision.ts) gave 0 for a solid the hull touches in any direction, also straight away from it, so `findLedge` found a "ledge" behind the player and the mantle carried them backwards into the air at deck height, then they fell. A bot wedged at a car deck while looking on along its route (its route began at a node up on the deck beside it, and went back the way it came) jumped, mantled backwards, fell and walked back, over and over: the soak's 9.8 s at y 1.0 beside a car end.
- Fix: a solid only touched on the side the hull moves away from is not ahead (`exit <= EPSILON` is null). A bot looks at the next node on its route when it is within 1.5 m and above it by more than a step, so the wedged jump faces the ledge and mantles onto it.
- Proof: new mantle test (back against a waist-high face: a plain jump; the same face in front: a mantle) failed before, passes after. 40 soaks of Switchyard gun game before: longest roam in place 5.8 s and 5.0 s, 4 runs over 2.5 s, a traced bot looping mantle-fall-walk at the flatbed (-36, -8.9). After: 40 soaks max 3.0 s; 120 more max 3.9 s, 2 over 2.5 s. Related fast tests 179 files pass; review subagent found no correctness bugs (a hull overlapping a solid by more than 1e-6 m and facing away can still mantle backwards; collision never leaves it that deep).
