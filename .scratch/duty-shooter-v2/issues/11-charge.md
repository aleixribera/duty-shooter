# 11 Charge

Status: resolved
Release: v1.6.0
Blocked by: 10

Round-based plant/defuse, carrier drop/pick-up, 90 s rounds, 40 s fuse, first to 4, swap after round 3, no respawns, spectate teammates, 5 s freeze; Survival Town sites; HUD; bots.

## Comments

- Core: `modes/charge.ts`. The round runs freeze (5 s), then live (90 s), then planted (40 s fuse), then over (5 s showing the result), then the next round's freeze. The mode keeps its own clock from `ctx.matchTime`, and the snapshot carries `remaining` seconds rather than an absolute end time. Team scores are rounds won, and `scoreLimit` is 4, so the match bar reads "Charge · 4".
- The mode interface grows:
  - `frozen()` holds input during a round's freeze.
  - `ModeContext.sites` and `ModeContext.using` (who holds the use button).
  - Mode events `roundStart`, `roundEnd`, and `charge` (pickup, drop, plant, defuse, detonate).
  - `ObjectiveState` has a `charge` variant.
- Plant and defuse:
  - You hold use. Moving more than 0.3 m from where you began cancels it, as do firing, a grenade, a hit, fall damage, letting go of use or dying.
  - A cancelled action loses its progress. If you are still holding use and still in place, it starts again from zero.
  - Only the carrier plants, and only inside a site.
  - Any defender within 1.5 m defuses. One defuser at a time.
- Carrier:
  - Each round the charge goes to the next attacker in join order.
  - It drops where the carrier dies, or where a leaving carrier last stood.
  - Any living attacker within 1.2 m picks it up. Defenders can't.
- Decision: once every defender is dead after the plant, the round goes to the attackers at once (reason `eliminated`), because the detonation is certain by then. Waiting out the fuse would add up to 40 s of nothing. Attackers wiped out after the plant don't end the round: the defenders still have to defuse.
- Decision: a side with no members can't lose by elimination, so a lone player isn't handed rounds. That round runs to the clock.
- Sides: the attackers always use the first team spawn set, so when the sides swap after round 3 the teams swap spawn sets too. `TeamRoster.newRound()` makes every next spawn a first spawn at the side's set.
- Server:
  - On `roundStart` it respawns every seat with its current loadout.
  - During the freeze, usercmds keep their view angles but lose movement, buttons and fire. Bots get no input.
  - A `loadout` message during the freeze re-arms a living player where they stand (`simulation.equip`).
  - A player who joins mid-round (after the freeze) waits dead for the next round.
  - Use comes from each player's latest applied usercmd.
  - Capture, round and charge events are among the events resent for reliability.
- Survival Town sites: A is the south house's living room and B is the back half of the south garage, both at the second team set's end (where the defenders start). A test checks for at least 4 nav nodes inside each site.
- Bots:
  - `planCharge` picks the attackers' target by hashing the round number.
  - The carrier goes to the site centre with a `use` order, and the 2 nearest attackers escort it. The rest go ahead to the site.
  - The nearest attacker fetches a dropped charge.
  - Defenders split across both sites with a crowding cost. After the plant, the nearest one defuses and the rest guard.
  - The brain holds use (standing still, not firing, cooking a grenade or fleeing) once inside a `use` order's radius. A visible enemy interrupts it, unless the order is `urgent` (fuse under defuse time + 2 s).
  - The server replans at once on charge and round events.
- Client:
  - Charge is in the Bot Match and empty-server mode pickers.
  - The match bar shows round wins and the phase clock.
  - A panel under the match bar shows the round, your side and what to do: carry, escort, fetch, defend, guard or defuse.
  - A progress bar shows your own plant or defuse.
  - There is a big countdown during the freeze ("change your loadout now"), and a round banner with the winner and the reason.
  - Markers show the sites, the planted charge (blinking) and, for attackers only, the dropped charge.
  - Prompts: "Hold F Plant" and "Hold F Defuse"; "F Loadout" during the freeze.
  - The client also zeroes its own predicted movement during the freeze.
  - Dead players watch a living teammate from a chase camera that is pulled in short of walls.
  - The kill feed tells pickups and drops to your own side only, and plants, defuses and detonations to everyone. A detonation shows the explosion effect.
- Not done here: the plant, defuse and fuse-beep sounds belong to ticket 15. The intermission vote still offers TDM and FFA; ticket 12 and the lobby rework replace it.
- Tests:
  - `charge.test.ts` (33): timings and cancels, carrier drop and pick-up, every round outcome, the result pause, the side swap and spawns, first to 4, scoreboard points, no respawns. Over the network: the freeze, a loadout change in the freeze, round respawns and a mid-round joiner. Also the planner.
  - Survival Town: sites have nav nodes. Bots-only 3v3 Charge plays to the end, with plants and rounds won by both attackers and defenders. The checked run went 4–2 in 235 s with 4 plants and 2 defuses.
  - Checked in the browser: an offline 3v3 Charge match shows the freeze countdown, the round panel ("You carry the charge"), the match bar and the site markers. The pane wasn't drawing frames, so play past the freeze wasn't watched there.
