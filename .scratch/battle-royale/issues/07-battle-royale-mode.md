# Battle Royale mode rules

Status: open
Blocked by: 02,05

Spec: `../spec.md`

Spec: Match rules. Mode class, 60 seats, Squads (Solos, Duos, Trios), spawn rules, one life, 3 frags, the Ring with Stages and a seed, regen pause, Winning with tie-break, early end, reconnect with a bot holding the seat, late joiners spectate.

## Comments

From ticket 03: rerun the 60-seat gate (`results/gate.sh`) on this mode's own opening. Free-for-all's opening ticks cost 22 to 30 ms with bots, over the worst-tick bar, and that number was left out of the gate because this mode doesn't use that spawn scoring. All bots starting at once needs checking too.
