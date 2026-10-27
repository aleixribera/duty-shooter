# 05 The sniper

Status: open
Blocked by: 02

Bolt cycling, one-shot upper zones, two-shot lower/limbs, scope (zoom + overlay), sway settling over 1.5 s on the weapon clock, glint, higher penetration; model, animations, sound.

## Comments

- Core done (v1.4.4): `test/sniper.test.ts` checks one-shot kills to the head, neck and upper torso at 6, 40 and 80 m, two hits to the lower torso, an arm or a leg, the bolt cycle, scope sway (full while moving, settled to a fifth after 1.5 s standing still, starting over on moving), shots going where the sway points, zoom above every iron sight and no sway on any other weapon, the slowest ADS and worst hipfire, and a round through three wooden walls that stop the M4A1.
- Sway is deterministic: a figure-of-eight from the weapon clock (0.31 Hz across, 0.53 Hz up and down at 70 %), scaled by ADS, settling linearly to 20 % over the settle time while aimed, grounded and still. The outputs carry it (`weapon.sway`), so the scope overlay and bots read the same drift the shot takes.
- Decision: at 80 m the neck isn't checked: the round drops about 5 cm over that distance (gravity on the projectile, as for every weapon), which is more than the neck's height, so a neck-aimed shot lands on the chest and still kills.
- Still to do here: the model, scope overlay, bolt animation, glint, sounds and third-person weapon.
