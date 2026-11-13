# The other weapons against real games

Status: resolved
Release: v2.200.0

Spec: `../spec.md` (objective 4, every weapon feels good); Aleix's request 6 (2026-11-13): "Other weapons (not the M4, sniper or SMG): review against real games (TTK, spread, rate, movement, feedback), redesign the pump shotgun, burst SCAR, semi-auto rifle (sight, role) and revolver; prove with TTK and hits-per-kill at range, range runs and frames; list the changes."

Acceptance: each of the four has a role no other gun fills and one sourced pattern from a well-liked shooter behind it; the TTK and hits-per-kill table (`docs/balance.md`) and tests hold the new numbers; in the Practice Range each is fired at the distance its design is about and does what the table says, with frames at desktop and phone width.

## Comments

**2026-11-13, loop pass 29 (pass 1).**

Review against well-liked shooters (the patterns, not their content):

| Gun | Where it stood | The pattern from real games | What was wrong |
| --- | --- | --- | --- |
| Harrow 12 pump | one blast kills inside 7 m, then 15 a pellet: six of eight pellets at 8 m left 90 HP | a pump kills with one well-placed blast past arm's length and loses the kill by degrees; aiming tightens the pattern; a head bonus that counts (Apex Legends' Peacekeeper: 11 pellets, head x1.5 until Nov 2019, x1.25 after; gamespot.com, dexerto.com) | the cliff at 7 m: a blast that looked on target "hit for 90"; aiming barely tightened the cone; a 1.2 head bonus nobody felt |
| Trident 5.56 burst | one burst kills inside 26 m (150 ms), 0.34 s between bursts | a burst rifle owns the middle distance: one whole burst kills out to mid range, the wait between bursts short, the burst flat (Call of Duty 4's M16; Apex Legends' Hemlok, 0.28 s burst delay in its game files, Apex Legends wiki) | a close-range gun beside the SMG; the third round climbed over the shoulder past 26 m; a missed round cost 490 ms |
| Vantage 7.62 marksman | two hits anywhere on the body to 30 m (250 ms), a black reticle | a marksman rifle is for range: three to the body, a head and a body kill, same damage near and far (Apex Legends' G7 Scout: 30 body, 60 head, 240 rpm; progameguides.com); an illuminated low-power reticle | inside 30 m it was a better M4A1 (two hits, any zone); its chevron sat black in a dark tube and vanished on a target in shade |
| Marshal .357 revolver | two body hits or one head inside 12 m, 2.6 s reload | a hand cannon kills with one head shot well past arm's length and is accurate on the first shot, punishing on the second (Valorant's Sheriff: 55 body, 160 head out to 30 m against 150 HP, 4 rounds a second, 2.25 s reload; dodge.gg, pcgamer.com) | the head kill ended at 12 m, so it was a slower pistol; the reload was longer than any rifle's |

Left as they were: the Warden 9 (redone in tickets 107 and 109) and the Bulwark 5.56 (a lane-holding role nothing else fills; 43 % of its bot duels, inside the 40-60 % rule). Movement speeds (shotgun 1.35, revolver 1.3, burst 1, Vantage 0.96, Bulwark 0.88) already follow the real-game order (close guns fastest, heavy guns slowest).

The changes (every number says why in `stats/weapons.ts`):
- **Harrow 12:** 22 a pellet from 7 to 11 m (was 15 to 12 m), so any five of eight kill: one aimed blast kills to about 10 m. 13 to 16 m (two blasts), 6 to 24 m, 4 past it (a full blast 32, was 24). Aimed cone 3.2 -> 2.6 deg. Head x1.2 -> x1.5 a pellet.
- **Trident 5.56:** one-burst band 26 -> 36 m; burst delay 0.34 -> 0.28 s (a stray round costs 430 ms, was 490); the burst climbs 0.46 deg, was 0.68 (kicks 0.32/0.36 -> 0.22/0.24), so it stays on a chest at 36 m; from the hip 2.6 -> 3.4 deg still, 4.2 -> 5 moving, and ADS 0.26 -> 0.28 s, so up close it must be aimed.
- **Vantage 7.62:** 40 to 50 m and 38 past it (was 52 to 30 m, 44 past): three to the body at any range, two never; head x1.5 -> x1.8, so a head and a body kill anywhere and a head alone never does. 240 -> 380 rpm (158 ms, a quick finger) so three body hits take 316 ms, about the M4A1 at 40 m and quicker than it past 50 m; 12 -> 15 rounds; kick 1.7 -> 1.2 deg, return 0.11 -> 0.08 s. **Sight:** its built-in chevron, post and bars now glow red like the rail optics' reticles (`glowBuiltInReticle`).
- **Marshal .357:** 52 to 15 m (was 12), 40 to 35 m (was 36 to 30), 34 past (was 26); head x2 -> x2.6: one head shot kills inside 35 m (was 12). Hip spread 1.8 -> 1.2 deg (first shot goes where it points). Reload 2.0/2.6 -> 1.8/2.3 s.

TTK, torso hits at the fastest rate (shots / ms; `docs/balance.md`):

| Gun | 5 m | 10 m | 15 m | 25 m | 40 m | 60 m |
| --- | --- | --- | --- | --- | --- | --- |
| Harrow 12, before | 1 / 0 | 1 / 0 | 2 / 800 | 5 / 3200 | 5 / 3200 | 5 / 3200 |
| Harrow 12, after | 1 / 0 | 1 / 0 | 1 / 0 (all 8; half takes 2) | 4 / 2400 | 4 / 2400 | 4 / 2400 |
| Trident, before | 3 / 150 | 3 / 150 | 3 / 150 | 3 / 150 | 4 / 490 | 4 / 490 |
| Trident, after | 3 / 150 | 3 / 150 | 3 / 150 | 3 / 150 (to 36 m) | 4 / 430 | 4 / 430 |
| Vantage, before | 2 / 250 | 2 / 250 | 2 / 250 | 2 / 250 | 3 / 500 | 3 / 500 |
| Vantage, after | 3 / 316 | 3 / 316 | 3 / 316 | 3 / 316 | 3 / 316 | 3 / 316 (head + body: 2 / 158 anywhere) |
| Marshal, before | 2 / 286 | 2 / 286 | 3 / 571 | 3 / 571 | 4 / 857 | 4 / 857 |
| Marshal, after | 2 / 286 | 2 / 286 | 2 / 286 | 3 / 571 | 3 / 571 | 3 / 571 (head: 1 to 35 m) |

Bot duels (`docs/balance.md`, 48 a cell): the Vantage 43 % of all its duels (was 43 %), 16 % at 5 m, 60 % at 30 m, 56 % at 60 m: at 270 and 320 rpm it won 35 and 37 %, so the rate went to 380. The Trident 50 % (was 50 %). The shotgun 44 % overall (was 41 %), its 5 m band 69 % (was 66 %).

Checked:
- Typecheck; `arsenal-four.test.ts` (Vantage: three to the body at every range and a head and a body anywhere; Marshal: one head kills to the end of its 35 m band and not past it), `balance.test.ts` (shotgun: five of eight pellets kill at 6, 8, 10 m; every duel rule), `bots-arsenal`, `stats`, `attachments`, `arsenal`, `optics`, `ui-model`: all pass.
- `weapons/look.mjs` in the Practice Range, aimed (`weapons/after/`, desktop and 844x390): the Harrow 12 at 8 m killed with one blast, "128, 6/8 pellets" (the old numbers gave 90 and no kill); the Marshal at 24 m killed with one head shot, 104 HP (was 72); the Trident at 23 m killed with one burst, 3/3; the Vantage at 48 m killed with three chest hits (40 each) and with a head and a chest. Its reticle glows red on the 50 m dummy (`dmr-54m-chest-sight-*.jpg`).

Bots fight each gun where its design is: the Vantage holds 30-46 m (was 24-38) and paces long rounds 0.3 s (was 0.36); the Trident 16-30 m (was 14-24).

Second opinion (read-only review): every number in the explanations checked against the damage code; it found a stale header line on the Vantage, the bots' tactics comments still naming the old bands, the shotgun's "nothing past 24 m" (it still chips), all fixed; and that the Vantage's fire-mode "F" shares the reticle's paint in the model, so it glows too (left: a model rebuild for a letter).

Open, for Aleix (STATE "Needs Aleix"): he calls the burst rifle a "SCAR", but its model is a bullpup; a SCAR-shaped model would be its own step. A clip per gun with its sound stays with PLAN item 6.
