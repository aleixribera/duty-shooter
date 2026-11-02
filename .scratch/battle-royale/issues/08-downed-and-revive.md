# Downed and Revive

Status: resolved
Release: v2.102.0
Blocked by: 07

Spec: `../spec.md`

Spec: Downed and revive. Rules in the simulation and client, crawl pose and revive action on the soldier through its Blender generator, Downed camera, kill feed tells downs from eliminations.

## Comments

Decisions:

- The Downed pool is 40 HP (`STATS.royale.downedHealth`), so a Finish takes two to four rifle hits. Crawl speed is prone speed, about 0.72 m/s with the M4A1.
- Only an enemy takes the pool: the Ring, a fall and the seat's own frag don't touch a Downed seat, which is what the spec's "not paused or sped up by the Ring" asks of the clock.
- "Taking damage cancels" is strict: a reviver standing in the Ring is cancelled every tick, so nobody Revives there.
- The first reviver owns a Revive. A reviver is forced to crouch, can't fire, and can shift inside the 2 m reach.
- Bleed-out runs through a Revive, and stops only in an intermission (the same gate as self damage).
- A wipe kills the Squad's Downed seats at the end of the tick. Bleed-out and wipe deaths credit whoever Downed the seat. Their causes are `bleedOut` and `wipe`; the feed reads "Bled out" and "Squad out".
- A person Downed is still in it for Early end. The Squads and the seat count on the HUD count only those standing.
- A bot Downed takes no action (no crawl yet): ticket 09 adds judgement. A bot on its feet gets a Revive order from `planRevives`, nearest first, ahead of whatever else it was doing.
- A down gives the feed a line with a DOWNED word beside the weapon, and the shooter a Downed callout. It counts no kill and no death, and the hit marker isn't a kill.
- `crawl` and `revive` are glTF clips from `tools/soldier/soldier.py`, laid over the pose worked out in `soldier.ts`. The gun is hidden under them. Crawl time is distance crawled, so it holds still when the seat does.
- The two words `bleedOut` and `wipe` travel spelled out on the wire: `WORDS` is full at 224.

## Checked

- Sheet: `apps/range/scripts/soldier-sheet.mjs`, Crawl, Downed and Revive columns (`COLS=9,10,11`).
- Browser: `.scratch/battle-royale/downed/play.mjs` plays a Duos match on Zero Island, 60 seats, in real Chrome against the real server (`serve.ts`, which adds a control port to place seats). Revived a bot with F (prompt, bar, back at 50 HP); Downed by real shots from a script client; crawled 2.13 m in 3 s; a bot walked over and Revived the player at 50 HP; Downed again and Finished by a bot's rifle. The scripted enemy ran out of ammo, so that Finish came from a bot near by.
- Spots where the harness failed were its own teleports: a mate dropped from height or into the sea dies, wiping the Squad.
- `design-audit`: the five reviewer subagents weren't run, because this ticket's rules forbid subagents. I went through the HUD, type and colour rules by hand on desktop and phone screenshots: fixed the feed sitting under the match bar below 1000 px, gave the DOWNED word its own dark chip (about 2.5:1 by calculation over the brightest sky without it), and tabular digits on the Bleed-out. Bottom bars on a 390 px tall phone still overlap, as they did before this ticket.

