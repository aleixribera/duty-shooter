# 05 The sniper

Status: resolved
Release: v1.4.6
Blocked by: 02

Bolt cycling, one-shot upper zones, two-shot lower/limbs, scope (zoom + overlay), sway settling over 1.5 s on the weapon clock, glint, higher penetration; model, animations, sound.

## Comments

- Core done (v1.4.4): `test/sniper.test.ts` checks one-shot kills to the head, neck and upper torso at 6, 40 and 80 m, two hits to the lower torso, an arm or a leg, the bolt cycle, scope sway (full while moving, settled to a fifth after 1.5 s standing still, starting over on moving), shots going where the sway points, zoom above every iron sight and no sway on any other weapon, the slowest ADS and worst hipfire, and a round through three wooden walls that stop the M4A1.
- Sway is deterministic: a figure-of-eight from the weapon clock (0.31 Hz across, 0.53 Hz up and down at 70 %), scaled by ADS, settling linearly to 20 % over the settle time while aimed, grounded and still. The outputs carry it (`weapon.sway`), so the scope overlay and bots read the same drift the shot takes.
- Decision: at 80 m the neck isn't checked: the round drops about 5 cm over that distance (gravity on the projectile, as for every weapon), which is more than the neck's height, so a neck-aimed shot lands on the chest and still kills.
- Presentation done (v1.4.6). The models are built by `tools/weapon/arsenal.py` in Blender, in the M4A1's gun space, with the moving parts as separate nodes; the preview sheets were checked from the side, three-quarter, top and front, and every clip was checked in the viewer (`?viewer&weapon=<id>`, `&clip=`, `&t=` to hold a frame). `viewmodel/kit.ts` holds each gun's palms, sight line, eye relief, muzzle, ejection port and kick; `viewmodel.ts` times the tracks (draw, holster, reloads, inspect, melee, pump and bolt cycles) from each row, so the animation lands on the simulation's add-ammo and cycle points.
- Third person: every soldier now holds the gun in their hand as one vertex-coloured mesh per weapon (`GunModels` in players-view.ts), swapped when they switch; the gun is no longer part of the skinned body, so it's one extra draw call per soldier.
- Sounds: the gunshot takes a per-weapon character (pitch, length, loudness, brightness, action noise and extra low end for the big bores), and the new handling sounds are synthesised in `audio/arsenal.ts`.
- The bolt: the right hand leaves the grip for the handle, lifts it, draws it back and runs it home (`boltOpen` and `boltClose` sounds). Aimed past 90 % the viewmodel steps aside for a scope overlay (black surround, duplex reticle), and the camera and the ADS sensitivity use each weapon's zoom.
- The glint (`arsenal-view.ts`): a camera-facing flare at the scope of anyone aiming a sniper past 60 %, shown to viewers more than 20 m away within 20° of their aim, brightest straight down the barrel.
