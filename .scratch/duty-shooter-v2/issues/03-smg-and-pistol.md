# 03 The SMG and the pistol

Status: open
Blocked by: 02

Core rows and behaviour (pistol semi-auto with fire cap), Blender models, viewmodel animations, synthesised sound, third-person.

## Comments

- Core done (v1.4.2): `test/arsenal.test.ts` checks the SMG's and pistol's fire rate, magazine, reload timings, ADS and sprint-to-fire against their rows, and that each kills in the shots its bands say at 8, 20 and 40 m, played through the simulation with recoil pulled down. The SMG kills in 189 ms within 12 m (target about 170 ms) and 316 ms at 24 m (target about 330 ms); the pistol in 450 ms within 10 m.
- `shotsToKill`, `timeToKill` and `timeToKillTable` (combat/ttk.ts) give the table the balance report prints.
- Decision: "the SMG beats every other primary up close" is checked as time from raising the sights to the kill, because the sniper's one-shot would otherwise win on paper; its 0.55 s ADS is what loses it the fight. The balance runs (ticket 09) check the real fights.
- The determinism test now runs every primary with switching, reloads and ADS.
- Still to do here: the Blender models, viewmodel animations, synthesised sounds and third-person weapon.
