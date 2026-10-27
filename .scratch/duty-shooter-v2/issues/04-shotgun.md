# 04 The shotgun

Status: open
Blocked by: 02

Pellets (seeded pattern, merged damage, one hit marker), pump cycling, shell-by-shell reload cancellable by firing, lower penetration; model, animations, sound.

## Comments

- Core done (v1.4.3): `test/shotgun.test.ts` checks the pellet pattern (8 pellets, inside the cone, the same for the same shot), merged damage (one hit event and one flinch per blast per player, with the pellet count), one-blast kills from the hip at 2.5-5 m, two aimed blasts or fewer at 7-12 m, two blasts never killing at 20 and 30 m, the pump cycle, the shell reload (one at a time, the chamber step when started empty, firing once a shell is in stops it) and pellets stopping at two wooden walls a rifle round goes through. The generic handling checks in `test/arsenal.test.ts` now cover the shotgun and the sniper too.
- Tuning: the 5-12 m band went from 13 to 15 per pellet. Measured in the simulation, an aimed blast at 12 m lands about half its pellets, and 13 left the target on 8 HP after two blasts. With 15 a blast still kills in one up to about 7 m, which the target allows.
- Decision: the pellet pattern is one pellet near the centre and seven in a jittered ring (45-100 % of the cone), seeded per shot, so every blast spreads the same way without looking stamped.
- Still to do here: the model, pump and shell animations, sounds and third-person weapon.
