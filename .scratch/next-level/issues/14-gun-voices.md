# A voice per gun

Status: resolved

Release: v2.151.0

Spec: `../spec.md`

One M4 core is rate-shifted for all five guns (audio/gunshot.ts). Each weapon gets its own synthesis: mechanism, body, crack, sub, and tails that differ indoors and outdoors, near and far.

## Comments

Released in v2.151.0. Nobody listened: everything below is what the meters read. Tables and 48 kHz WAVs are in `.scratch/next-level/audio/` (`guns-before.md`, `guns-after.md`, `handling.md`, `wav/`).

**The guns** (`audio/gunshot.ts`)

- Each weapon has its own recipe: mechanism, body, crack, sub and its own baked tail, rendered for your own shot, a shot nearby and a shot far off, outdoors and indoors. Nothing is rate-shifted from another gun.
- Loudness is ordered sniper, shotgun, rifle, SMG, pistol in all six views. Your own shot outdoors, before the master chain: sniper -16.7 LUFS-M, shotgun -17.1, M4A1 -19.5, SMG -23.0, pistol -24.2. At 15 m: -25.4, -27.0, -29.1, -33.5, -34.5. At 150 m: -36.6, -37.3, -38.2, -41.5, -42.1.
- They differ in the measurements a listener would notice: centroid of your own shot 413 Hz (shotgun), 489 (sniper), 1150 (M4A1), 1696 (pistol), 2210 (SMG); sub-bass share from -2.8 dB (sniper) to -24.3 (pistol); length to -40 dB outdoors 166 ms (pistol), 167 (SMG), 299 (M4A1), 579 (shotgun), 1166 (sniper).
- Nothing clips: no sample over the master's clip knee, the highest peak heard is -1.8 dBFS (your own sniper).
- The tail is baked into each gun, so the shared reverb send on gunshots dropped to 0.03 outdoors and 0.05 indoors. A shot from another player at 15 m reads 2 to 3 dB quieter than the old mix; far shots are raised so that they still carry.
- The sniper's own front is held under the clip knee (`front.gain` 1.35), while other players' sniper shots keep the height (`away` 1.55).
- `guns-before.md` was measured through the master chain and `guns-after.md` before it: the chain adds about 4.7 dB to quiet signals, so compare shapes across the two, not levels.

**Handling** (`audio/weapon.ts`)

- Dry fire, magazine out, magazine in, bolt release, charging handle and raising the weapon were one take shared by every gun. Each now has a take per weapon that has that part (`perWeapon`), told apart by the event's `weapon`; a weapon without its own take falls back to the rifle's.
- The sniper's empty reload now ends on its own bolt (`boltOpen`, `boltClose`) rather than the rifle's charging handle; the pistol releases its slide.
- Measured apart, for example: magazine in 83 ms at 2311 Hz (pistol) against 253 ms at 1107 Hz (sniper); raising the weapon 217 ms (SMG) to 471 ms (sniper). Each sits 11 dB or more under the same gun's shot (the closest is the SMG's magazine coming out, -33.8 LUFS-M against -23.0).
- The per-weapon dry fire exists but the game never plays `dryFire` (it did not before either). Wired at integration, see below.

**Cost**

- The effects prerender, timed on one thread against the committed sources at the same moment: 1676 ms before, 1971 ms after at best, 2451 ms in the other pair on a busy PC. It runs in a worker. Memory for the prerendered effects went from 56.4 MB to 74.3 MB; the gunshots are 10.1 MB of that (36 buffers to 92), the countdown's siren 4.6 MB, and the score and medal sounds of ticket 11 about 1.9 MB.

**Integration (the owning session)**

- Dry fire is played: a fresh pull of the trigger on an empty, ready weapon clicks once, in that weapon's own voice (`#selfFoley` in `game.ts`). A trigger held as the magazine runs out does not click, since the reload starts by itself. Seen on the range: no click after emptying the M4A1 with the trigger held, one `dryFire` with `weapon: 'm4a1'` after breaking the reload off and pulling again.
- Still nobody has listened. The WAVs to judge by ear are in `.scratch/next-level/audio/wav/` (kept out of the repo: 180 MB; `measure-guns.mjs` renders them again).

**After a review (in this release)**

- Only the first weapon's sounds are rendered inside the press that starts the audio; the rest wait their turn behind it. Rendering every weapon's own voice there held the first press up.
- A sample the worker hands over after the main thread already made the same one is dropped, instead of replacing a buffer that voices are playing.
- No test says the five guns' recipes differ from each other; `measure-guns.mjs` shows it in numbers, and an ear has still to.
