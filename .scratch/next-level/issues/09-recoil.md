# Recoil that returns

Status: resolved

Release: v2.150.0

Spec: `../spec.md`

The view never recentres. Add recovery toward the pre-burst aim (most of the way, cancelled by the player's own pull), and a visual-only kick layer. Per-weapon tuning in the stats file; determinism and prediction tests stay green.

## Comments

- **Recoil return** (glossary). The simulation keeps, beside the recoil offset, how much of it is owed back (`recoilYaw`, `recoilPitch` on the player). Each kick adds its weapon's share (`recoilReturn`); once the weapon in hand has been quiet for `recoilReturnDelay`, what is owed eases out of the view with time constant `recoilReturnTime`. The three are per weapon in the stats file: M4A1 0.7 / 0.1 s / 0.16 s, SMG 0.75 / 0.08 / 0.13, pistol 0.85 / 0.06 / 0.09, shotgun 0.8 / 0.12 / 0.22, sniper 0.9 / 0.15 / 0.3.
- **The player's own pull pays it off.** Any move of the usercmd aim against the kick takes that much off what is owed, so a burst held level by hand ends level and stays there; a burst left alone comes back most of the way. A move the same way as the kick pays nothing. What the pitch limit takes off the view is not owed back either.
- Nothing comes back in the middle of a spray: the delay is longer than the gap between two automatic shots.
- **Flinch returns in full.** It was a permanent 1.2 degrees of aim taken from the victim per hit; it is now a jolt that settles. My call: a hit should break an aim for a moment, not move it for good.
- **The visual-only kick layer** was already there: `Camera.kick` (springs for pitch, yaw and roll, driven per shot from `game.ts`), separate from the simulation's offset. Left as it is.
- Deterministic: all of it is state on the player and runs in the tick, so prediction replays it; the two new fields travel in the self snapshot through the generic codec (spelled out, not yet in `WORDS`). Protocol 25. Another session's open work also names 25 for its own change (score on the scoreboard): when that lands it must take 26, and can add the two keys to `WORDS` in the same bump.
- Tests: `weapon.test.ts` (most of a burst back and the rest left, nothing mid-spray, a full pull, half a pull, a pull the wrong way, repeatability), `combat.test.ts` (flinch at the hit, and gone a second later). Changed: the spread test measured each shot against the tick before, which no longer is the view it left from; the magazine dump reads its peak; the Finish test shoots until it hits; Survival Town's Outposts bot soak plays six minutes instead of four (three bots a side take a zone about every hundred seconds there, and with any change to the fights one team can hold the first four minutes. Ten minutes of it: six captures, both teams, zones changing hands).
- Seen in the game on the range: a six-round burst climbs to 2.6 degrees, hangs a tenth of a second and eases back to 0.9.
- Bots follow the offset a moment late, as before; nothing in them changed.
