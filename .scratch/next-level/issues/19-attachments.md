# Attachments

Status: open

Spec: `../spec.md`

Optic, muzzle, magazine and grip as stat modifiers and model parts, unlocked by weapon mastery.

## Comments

### Design (decided without the owner; names are placeholders)

**Why not the usual gunsmith.** The usual answer is many slots, many options, and numbers that only go up. That can't work here: progression lives in the page's localStorage (spec), so the server can't check what a player has unlocked. Any attachment that is strictly better is free to whoever edits their save, and it would beat a new player online. So every option is a **sidegrade**: it buys one thing and pays for it with another. A forged unlock then gains nothing, and a new player with a stock gun is never outgunned, only less specialised.

**Four slots, two choices each, or stock.** That makes 9 builds per slot pair. Few enough that each choice is understood, and enough that a loadout says how you play.

| Slot | Unlocks at Mastery | Option A | Option B |
|---|---|---|---|
| Optic | level 1 (25 kills) | **Reflex**: a clear dot in place of the irons; no cost (the gain is only the sight picture, so it is safe to forge) | **Prism 2x**: a 2× sight; +18 % aim-in time, a narrower view and slower turn in the sights (under the Vantage's 2.2×) |
| Muzzle | level 2 (75 kills) | **Suppressor**: bots hear the shot from half as far, and the shot is quieter and has no flash for others; −15 % damage-band ranges and −15 % round speed | **Compensator**: −25 % horizontal and −10 % vertical recoil; louder, a bigger flash, heard 25 % farther |
| Magazine | level 3 (150 kills) | **Extended**: +50 % rounds; +25 % reload time, +8 % aim-in time | **Speed**: −30 % reload time; −20 % rounds |
| Grip | level 4 (300 kills) | **Vertical**: −20 % vertical recoil; +10 % aim-in time | **Angled**: −15 % aim-in time; +25 % hipfire spread |

Each figure is a starting `estimate` in `STATS`, to tune by play.

**Which guns take which slots:**
- The sniper (scoped) and the Vantage (its own optic) take no Optic.
- The Harrow 12 (shotgun) takes no Muzzle: a choke is another ticket.
- The Marshal (revolver, cylinder reload) takes no Magazine.
- Sidearms take no Grip and no Optic.
- Everything else takes all four.

**Mastery level 5** (500 kills) stays cosmetic, as it is.

**Bots** pick attachments by style, as they pick a primary: a rusher prefers Angled, Speed and Reflex; an anchor prefers Vertical, Extended and Prism. They don't check mastery, since they never had any.

**The wire.** The loadout gains per-gun attachments for the primary and the secondary. The server applies them as given (sidegrades make that safe) and refuses a slot the gun can't take. Protocol v29.

**Models.** Real Blender parts, built on `gunsmith.py` and baked like the guns:
- a reflex sight, a prism scope, a suppressor, a compensator, a vertical grip and an angled grip;
- extended and speed magazines made from each gun's own `mag` mesh (lengthened, or with a pull-tab base plate).

Each gun's generator names its mount points: the top rail, the muzzle and the under-rail. Optics need their own aim-down-sights alignment per gun, measured in the game, not just in previews.

### Phases (each pushed when playable)

1. Core: types, `STATS` modifiers, the sim applying them, the loadout and wire (v29), and tests.
2. Models and mount points; the viewmodel and third-person views showing them; optic sight pictures.
3. The loadout screen: a gunsmith row per slot with mastery locks; bots' picks; sound and flash for the muzzles.

### Phase 1 (v2.165.0)

- `weapon/attachments.ts`: the slots, the choices, which guns take which, and `moddedRow(id, attachments)`, a gun's row with its attachments on, built once per build and kept. The weapon state carries its attachments, and the weapon and the simulation read every number through `rowOf(state)`, so magazine, reload, aim-in, recoil, spread and round speed all follow from one place. A suppressor's shorter bands go with each bullet as `reach`.
- **A finding while testing:** the sniper has one damage band with no range, so a suppressor that only shortened the bands cost it nothing. The suppressor's round is now also 15 % slower (more lead far off), which is a cost on every gun. A test now checks that every attachment, on every gun that takes it, gives something and costs something.
- The loadout carries `attachments: { primary, secondary }`. A gun with something it can't take goes stock, and the rest of the loadout stands (a forged or old save never costs a player their whole loadout). A gun picked up keeps what is on it, and so does the one left behind.
- The shot event says its `muzzle`, and a bot hears a suppressed shot from half as far and a compensated one from 25 % farther.
- Protocol 29: the new words have single entries in the codec's word list. Nothing else on the wire changed, since loadouts and states travel as self-describing values.
- The client reads the gun in hand's modified row for the zoom, the magazine size in the HUD, the reload foley and touch auto-fire's range. A reload animation plays the stock track at the build's pace (`reloadPace`).

### Review of phase 1, and the gunsmith (v2.165.0)

A reviewer read the phase 1 diff. What it found, and what was done:
- **The Compensator cost nothing against humans:** its only cost was that bots heard it farther. Now every player hears it too: the shot is louder and harsher, it carries 25% farther, and the flash is bigger and brighter. A suppressed shot is dulled by a low-pass filter, carries half as far, shows no flash, and gives almost no light. These live in `audio/gunshot.ts` (DEVICE) and `effects.ts` (DEVICE_FLASH), driven by the shot event's `muzzle`.
- **Battle Royale Squads hunted a suppressed shot at full weight.** The noise grid now takes `shotLoudness`.
- **A sniper pick swapped for the M4A1 in Battle Royale kept the sniper's build.** The M4A1 now goes stock.
- **A magazine attachment changed the sideways drift pattern.** The cycle now uses the stock magazine.
- **Tracers and the bullet crack timed a suppressed round at stock speed.** They now use the modded speed.
- **`moddedRow` now keeps only the slots a gun takes**, whatever code path hands the build in.

The gunsmith on the loadout screen is in `ui/gunsmith.ts`:
- Under each gun there is one row per slot, with three tiles: Stock and the two attachments.
- A locked tile counts the kills still needed.
- The card lists what the build gives and costs, with the gun's own figures.
- Settings keeps each gun's build (`builds`), and the loadout carries the builds of the two guns it holds.

It was checked at 1920×1080, 390×844 and 844×390. On a phone the Stock tile is narrower, so COMPENSATOR fits.
