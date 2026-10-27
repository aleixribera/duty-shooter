# 03 The SMG and the pistol

Status: resolved
Release: v1.4.6
Blocked by: 02

Core rows and behaviour (pistol semi-auto with fire cap), Blender models, viewmodel animations, synthesised sound, third-person.

## Comments

- Core done (v1.4.2): `test/arsenal.test.ts` checks the SMG's and pistol's fire rate, magazine, reload timings, ADS and sprint-to-fire against their rows, and that each kills in the shots its bands say at 8, 20 and 40 m, played through the simulation with recoil pulled down. The SMG kills in 189 ms within 12 m (target about 170 ms) and 316 ms at 24 m (target about 330 ms); the pistol in 450 ms within 10 m.
- `shotsToKill`, `timeToKill` and `timeToKillTable` (combat/ttk.ts) give the table the balance report prints.
- Decision: "the SMG beats every other primary up close" is checked as time from raising the sights to the kill, because the sniper's one-shot would otherwise win on paper; its 0.55 s ADS is what loses it the fight. The balance runs (ticket 09) check the real fights.
- The determinism test now runs every primary with switching, reloads and ADS.
- Presentation done (v1.4.6). The models are built by `tools/weapon/arsenal.py` in Blender, in the M4A1's gun space, with the moving parts as separate nodes; the preview sheets were checked from the side, three-quarter, top and front, and every clip was checked in the viewer (`?viewer&weapon=<id>`, `&clip=`, `&t=` to hold a frame). `viewmodel/kit.ts` holds each gun's palms, sight line, eye relief, muzzle, ejection port and kick; `viewmodel.ts` times the tracks (draw, holster, reloads, inspect, melee, pump and bolt cycles) from each row, so the animation lands on the simulation's add-ammo and cycle points.
- Third person: every soldier now holds the gun in their hand as one vertex-coloured mesh per weapon (`GunModels` in players-view.ts), swapped when they switch; the gun is no longer part of the skinned body, so it's one extra draw call per soldier.
- Sounds: the gunshot takes a per-weapon character (pitch, length, loudness, brightness, action noise and extra low end for the big bores), and the new handling sounds are synthesised in `audio/arsenal.ts`.
- The pistol's slide runs back on each shot and locks open on empty; both guns use the magazine reload tracks with the charging step folded into the hand coming away.
- Checked in the range: 1 and 2, Q and the wheel switch between the M4A1 and the Warden 9, and the HUD names the gun and sizes the magazine bar to it.
