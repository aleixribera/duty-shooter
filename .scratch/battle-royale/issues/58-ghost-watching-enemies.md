# Out of a Battle Royale, you can watch an enemy while your Squad still fights

Status: resolved
Release: v2.114.1
Severity: S2
Found by: 35 (pass 2, coordinator review)

## Repro
Duos Battle Royale with two people in one Squad. One goes out while the other fights. The one out steps to an enemy with next/previous (or names one with `watch`).

The server sends that enemy's surroundings and the person out sees where the enemy's Squad is, and can call it out to their mate (ghosting).

## Evidence
- `#viewerOf` in `packages/fps-core/src/net/server.ts` limits watching to the team only in `teamMode` modes; Battle Royale isn't one, so any living seat may be watched.
- `Spectator.candidates` in `packages/fps-client/src/spectate.ts` offers the killer and every enemy after the Squad (ticket 32).

## Rule
While any seat in your Squad is still in the fight (standing or Downed), you may watch only your Squad. Once the whole Squad is out, anyone left.

## Comments
- Fix: the server's `#viewerOf` sends someone out the surroundings of an enemy only once no seat of their Squad is in the fight; until then it sends their own. The client's `Spectator.candidates` offers only the Squad (standing first, then Downed) while any of it is in the fight, so next/previous and the automatic switch never land on an enemy the server won't send. Once the Squad is out, the killer and then everyone, as before.
- This narrows ticket 32, which let next/previous step on to enemies while the Squad fought: that let someone out call out an enemy Squad to their mate.
- Tests: `packages/fps-core/test/royale-spectate.test.ts` (an enemy named while the Squad fights is refused; anyone once it's out) and the stepping cases in `packages/fps-client/test/spectate.test.ts`.
