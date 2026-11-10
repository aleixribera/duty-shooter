# A bigger arsenal

Status: resolved
Release: v2.153.0 (the guns), v2.154.0 (balance tables and this ticket)

Spec: `../spec.md`

Five weapons. Add at least four with their own role, Blender model, viewmodel, hold and sound: a light machine gun, a marksman rifle, a burst rifle and a revolver. Gun game and bots take them up.

## Comments

### 2026-11-10: the four guns (implementation agent)

**What each one is.** Names follow the house pattern (a word and a calibre, like Wasp 9, Harrow 12, Ridgeline .308):

| id | name | slot | fire | role in a fight |
|---|---|---|---|---|
| `lmg` | Bulwark 5.56 | primary | auto, belt | Holds a lane: 100 rounds whose climb settles as the burst goes on; the slowest to raise, aim, reload and carry. |
| `dmr` | Vantage 7.62 | primary | semi, 2x prism optic | Two aimed shots: any two to the body inside 30 m, past that two only if one is the head (never one shot: that stays the sniper's). |
| `burst` | Trident 5.56 | primary | three-round burst | One burst kills inside 26 m if all three land (150 ms); a 0.34 s wait between bursts is the price of a miss. |
| `revolver` | Marshal .357 | secondary | semi, cylinder | Six heavy rounds: two to the body or one to the head inside 12 m; slow trigger, its own reload (crane out, empties out, six in, crane shut). |

**Stats** (each value with its reason is in `packages/fps-core/src/stats/weapons.ts`):

| | Bulwark | Vantage | Trident | Marshal |
|---|---|---|---|---|
| fire rate | 680 rpm | 240 rpm | 800 rpm in a burst, 0.34 s between bursts | 150 rpm |
| magazine | 100 | 12 | 30 | 6 |
| damage close / far | 26 to 40 m / 21 | 52 to 30 m / 44 | 34 to 26 m / 21 | 52 to 12 m / 26 |
| head | x1.4 | x1.5 | x1.4 | x2 |
| ADS / draw | 0.42 s / 1.25 s | 0.30 s / 0.90 s | 0.26 s / 0.80 s | 0.20 s / 0.50 s |
| reload tactical / empty | 5.2 / 5.7 s | 2.5 / 2.95 s | 2.3 / 2.8 s | 2.6 / 2.6 s |
| move speed | 0.88 | 0.96 | 1.0 | 1.3 (a secondary) |
| recoil | first shot 0.8 deg, then 0.55 deg settling to 0.16 deg by round 10 | 1.7 deg a shot | 0.32 / 0.36 deg | 3.4 deg a shot |
| recoil return | 0.5 (least of any gun), 0.14 s delay, 0.3 s | 0.9, 0.07 s, 0.11 s | 0.95, 0.09 s, 0.08 s | 0.9, 0.1 s, 0.16 s |

**Time to kill, torso hits (shots / ms)**, from `timeToKillTable` on today's tree:

| weapon | 5 m | 20 m | 50 m | 100 m |
|---|---|---|---|---|
| M4A1 | 4 / 222 | 4 / 222 | 5 / 297 | 6 / 371 |
| Wasp 9 | 4 / 189 | 6 / 316 | 9 / 505 | 9 / 505 |
| Harrow 12 | 1 / 0 | 5 / 3200 | 5 / 3200 | 5 / 3200 |
| Ridgeline .308 | 1 / 0 | 1 / 0 | 1 / 0 | 1 / 0 |
| Warden 9 | 4 / 450 | 5 / 600 | 6 / 750 | 6 / 750 |
| **Bulwark 5.56** | 4 / 265 | 4 / 265 | 5 / 353 | 5 / 353 |
| **Vantage 7.62** | 2 / 250 | 2 / 250 | 3 / 500 | 3 / 500 |
| **Trident 5.56** | 3 / 150 | 3 / 150 | 4 / 490 | 5 / 565 |
| **Marshal .357** | 2 / 400 | 3 / 800 | 4 / 1200 | 4 / 1200 |

Where they sit: the Bulwark loses to the M4A1 inside 27 m (265 against 222 ms) and wins between 27 and 40 m. The Vantage is slower than the carbine up close and quicker than it far out when one shot is the head. The Trident is the fastest automatic kill when the burst lands whole and among the slowest when it does not. The Marshal out-hits the Warden at every range with fewer rounds. `docs/balance.md` is regenerated. The three new primaries own no band (the four band owners keep theirs) and are measured against the four, 48 duels a cell: Bulwark 45 % overall, Vantage 44 %, Trident 50 %, and none wins a band owner's own distance outright.

**Decisions.**
- *Burst fire* is a fire mode in the weapon state machine (`weapon/weapon.ts`). One press fires the whole burst at the fire rate whether or not the trigger stays held. A held trigger starts the next burst once the delay is over. Anything that takes the gun out of ready (reload, switch, sprint, ladder), or an empty magazine, ends the burst. The rounds still owed live in `WeaponState.burstLeft`, so the burst is deterministic, predicted and reconciled like every other mode.
- *Protocol:* five words at the end of `MORE_WORDS` (`lmg`, `dmr`, `burst`, `revolver`, `burstLeft`; `burst` is both a weapon id and the fire mode's name), and `PROTOCOL_VERSION` 26 to 27. `WORDS` is untouched.
- *LMG recoil that settles:* two new optional accuracy rows, `settledKick` and `settleShots`. The climb per shot falls from the vertical kick to the settled kick over the first ten rounds, and the side drift repeats every 30 rounds instead of leaning one way across a belt. Recoil return is the least of any gun (0.5): a heavy gun stays where the burst walked it.
- *Reloads:* two new reload kinds in the traits. `belt` (Bulwark: cover up, box off, box on, belt in, cover shut) and `cylinder` (Marshal: always the whole cylinder, the same hands whatever is left, which is the revolver's trade).
- *Gun game:* the ladder is now 7 guns dealt at random from all nine, 3 kills each (21 kills to win, against 20 before with 5 x 4). Seven keeps most of the arsenal in every match; the two left out make the next match a different climb.
- *Bots:* each new gun has its own tactics row (`bots/bot.ts`). The Bulwark fights at 20-30 m, aimed, holds with a target in view and fires 2.6x longer bursts. The Vantage fights at 24-38 m through the optic, pacing far shots so each waits for the last one's kick to return. The Trident fights at 14-24 m, aimed, one burst a press. The Marshal fights at 5-10 m, every round paced 0.4 s. Styles pick them (`bots/profile.ts`): anchors the Bulwark and Vantage, supports the Bulwark, flankers and roamers the Trident, and about one bot in three carries the Marshal instead of the Warden.
- *Battle Royale:* there is no loot table in the BR code. The only spawned weapon is the Supply Drop's sniper, and the weapons on the ground are the ones fallen players carried. The new guns reach the ground through loadouts (the lobby's pick and the bots' styles), so no table was added. Ground loot beyond drops would be a new feature, not this ticket.
- *UI:* every list takes them from `WEAPON_IDS` / `slotWeapons` (loadout pick, Profile weapon rows, Mastery and Challenges rows). The kill feed and HUD use the traits' name and fire mode (the HUD reads "burst"). Tracers, camera kick and the supersonic crack have a value per gun.
- *Models:* `tools/weapon/{lmg,dmr,burst,revolver}.py` build on `gunsmith.py` / `build_details.py`, with the same baked-material approach as the five before. `check_model.py` passes all four (notes only, no errors). The revolver's crane and cylinder are separate parts that the viewmodel swings out for the reload.

**Sound** (rendered offline through the game's sound system: `.scratch/next-level/arsenal/guns-arsenal.md` and `handling.md`). Own shot outdoors, LUFS-M before the master chain: Ridgeline -16.7, Harrow -17.1, **Vantage -18.0**, **Bulwark -19.3**, M4A1 -19.5, **Trident -19.6**, **Marshal -20.0**, Wasp -23.0, Warden -24.2. At 15 m: Vantage -26.7, Bulwark -28.0, Trident -29.3, Marshal -30.7. At 150 m: -37.6, -38.0, -38.5, -40.4. Ticket 14's order holds with the new guns in sensible places (a 7.62 louder than a 5.56, the .357 louder than the 9 mm). Heard peaks after the master chain stay at -2.4 to -3.2 dBFS, with nothing over the clip knee. Handling and dry-fire sounds sit 13 dB or more under the same gun's shot (dry fire -38 to -41 LUFS-M). Nobody has listened to them: these are measurements only.

**Verified.**
- *Range, first person, today's tree* (`?explore=range&nolock`, headless Chrome, HMR stubbed): all four raised, fired, aimed, fired aimed and reloaded, ammo back to full, no page errors. Shots in `.scratch/next-level/arsenal/range-final/` (1920x1080), with earlier passes in `range/` and `flash-keep/` (muzzle flash at the muzzle, hip and ADS).
- *Muzzle sockets* are within 3 mm of the barrel tips (`muzzle-check.log`).
- *Third person* on the soldier sheet: `soldiers/` (`close-015.png`: both hands on each long gun, the revolver held two-handed).
- *Bot Match:* TDM with bots using the Bulwark and Vantage (`botmatch-tdm/`, kill feed shots).
- *Gun game:* climbed through all seven rungs, all four new guns included (`botmatch-gungame-b.log`, `botmatch-gungame/`).
- *Loadout pick and cards:* `ui/`.

**Owner, at release.** The Bulwark in bot hands broke both bot-only Charge soaks (Switchyard 3v3, Survival Town 4v4): the side with it lost every round and never planted. Its bots fired 2.6x bursts at 30 m and beyond and hit 5 % of their rounds (an SMG bot in the same match about 50 %): past the close band the climb walks off the body before the weight settles it. Bots now fire long bursts only within 36 m (`LONG_BURSTS_WITHIN` in `bots/bot.ts`); farther out, normal ones. 30 m breaks the 34 m duel in `arsenal-four`, 42 m brings the Charge failure back: the window is narrow and wants a second look with more seeds. `docs/balance.md` regenerated after it: only the Bulwark's 45 m column moved (45 % overall to 44 %).
