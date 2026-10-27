# 04 The shotgun

Status: resolved
Release: v1.4.6
Blocked by: 02

Pellets (seeded pattern, merged damage, one hit marker), pump cycling, shell-by-shell reload cancellable by firing, lower penetration; model, animations, sound.

## Comments

- Core done (v1.4.3): `test/shotgun.test.ts` checks the pellet pattern (8 pellets, inside the cone, the same for the same shot), merged damage (one hit event and one flinch per blast per player, with the pellet count), one-blast kills from the hip at 2.5-5 m, two aimed blasts or fewer at 7-12 m, two blasts never killing at 20 and 30 m, the pump cycle, the shell reload (one at a time, the chamber step when started empty, firing once a shell is in stops it) and pellets stopping at two wooden walls a rifle round goes through. The generic handling checks in `test/arsenal.test.ts` now cover the shotgun and the sniper too.
- Tuning: the 5-12 m band went from 13 to 15 per pellet. Measured in the simulation, an aimed blast at 12 m lands about half its pellets, and 13 left the target on 8 HP after two blasts. With 15 a blast still kills in one up to about 7 m, which the target allows.
- Decision: the pellet pattern is one pellet near the centre and seven in a jittered ring (45-100 % of the cone), seeded per shot, so every blast spreads the same way without looking stamped.
- Presentation done (v1.4.6). The models are built by `tools/weapon/arsenal.py` in Blender, in the M4A1's gun space, with the moving parts as separate nodes; the preview sheets were checked from the side, three-quarter, top and front, and every clip was checked in the viewer (`?viewer&weapon=<id>`, `&clip=`, `&t=` to hold a frame). `viewmodel/kit.ts` holds each gun's palms, sight line, eye relief, muzzle, ejection port and kick; `viewmodel.ts` times the tracks (draw, holster, reloads, inspect, melee, pump and bolt cycles) from each row, so the animation lands on the simulation's add-ammo and cycle points.
- Third person: every soldier now holds the gun in their hand as one vertex-coloured mesh per weapon (`GunModels` in players-view.ts), swapped when they switch; the gun is no longer part of the skinned body, so it's one extra draw call per soldier.
- Sounds: the gunshot takes a per-weapon character (pitch, length, loudness, brightness, action noise and extra low end for the big bores), and the new handling sounds are synthesised in `audio/arsenal.ts`.
- The pump runs the forend back and forward over the cycle time, with the support hand riding it. A shell reload is worked out per frame from how far in it is and the shells in the tube: the hand reaches the loading port as each shell goes in and works the pump at the end of an empty reload. A `shellInsert` sound plays at each add point and `pumpRack` on the cycle.
- Decision: the stock's comb is dropped and the sight line raised to 5.6 cm, so aimed down the rib the bead sits just under the centre instead of the stock filling the view.
