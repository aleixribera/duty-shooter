# First playable release

Status: resolved
Release: v2.115.0
Blocked by: 03,08,09,10,11,13,14,15,28,30,31,32,34,35,52,53,54

Spec: `../spec.md`

Spec: Delivery step 6. Whole island, nearly empty, complete rules, on the server and locally. The nuke ending aimed at Ground Zero. A full match watched on each path. Pushed to `main`.

## Comments

- **Audit against the spec.** Step 6's rules were already in: the whole island, the Ring, Downs and Revives, the Preparation and dive, the Squad sizes, placement, the island map, the heartbeat and Ring sounds, and the Local bots worker. The gap was the ending: Zero Island had `nuke: null`, so a Battle Royale ended with no nuke at all.
- **Built: the nuke over Ground Zero.** Every Battle Royale ending now plays it for everyone, with the place or winner text over it, and then the scoreboard (`INTERMISSION.nuke + scoreboard`, 16 s, because a Battle Royale runs a lobby). The shot is taken from the edge of the Dustlands to the south-west, about 400 m from the crater, with the sun behind the camera. A first pose about 200 m out sat inside the base surge (which reaches about 300 m), and tan dust filled the frame. A test now keeps the shot more than 330 m away, in open air, inside the Boundary, with the cloud unblocked and in frame. The siren is on the Dustlands' edge beside the camera.
- **From ticket 35: the pause screen.** Its Controls list shows "Island map" (M) only in a Battle Royale (`pauseActions`).
- **From ticket 35: leaving in the Preparation.** A person who leaves on purpose before the dive keeps their seat until the dive begins. A bot plays it under their name meanwhile, and on rejoining they take it back and drop with their Squad. Their seat is held until the dive itself, not for a fixed time, because the dive can be delayed by a page that is still loading. Two bugs turned up along the way and are fixed. A person alone in the match who left counted as "everyone ready", so the dive came at once and the match ended noHumans. A seat held this way now keeps the Preparation from ending early. The other bug: after rejoining, the "Joining…" screen stayed on top of the Preparation, and it now hides. To rejoin you open Battle Royale, then Join server, and the page goes straight into the Preparation. Not changed: before Join server the screen still says "Join to watch it", which is misleading for a seat that is still held.
- **Matches watched** (headless, muted Chrome; server and page built from this tree; shots in `shots/t16/`):
  - Online Solos: left and rejoined 3.4 s into the Preparation and got the seat back; the pause screen listed the island map. Ended noHumans at 189 s, "34th / 60 Squads"; nuke, scoreboard, then the lobby with "34TH OF 60".
  - Online Trios: ended at 129 s, "16th / 20".
  - Local bots Solos: ended at 24 s, "58th / 60".
  - Local bots Trios: ended at 171 s, "17th / 20".
  - All four: no page errors. Outside a Battle Royale (`?explore=switchyard`) the pause screen has no Island map.
- These dists were built from the working tree, which also held another session's uncommitted ladder edits in `bots/bot.ts` and `bots/nav.ts`. Those edits are not part of this release.
- Tests: the full suite on the home server passes, 146 files and 1491 tests (14 skipped), and the typecheck is clean. New tests: Zero Island ending (4), Preparation leave and rejoin (3), pause Controls list (2).
