# Hearing the island

Status: resolved
Release: v2.133.0
Blocked by: none
Labels: enhancement

From `../research/mode-elements.md` (A list, new) and `../research/bots.md` change 2.

**Ticket: hearing the island.** Make distant fights readable by ear, and give bots the same ears. (1) Gunfire beyond about 60 m has its own distant voice for each weapon: a dull thump with a long echo for a far rifle, a sharp crack overhead for a supersonic round going past. Its level follows the 400 m hearing range clients already have, so a player can judge "fight to the north-east, about 200 m". (2) Add two or three cheap **sound traps** per Region, using the island's foliage and props: birds flushing out of Jungle canopy and Peaks pines when someone sprints within about 8 m, rattling sheet metal in the Dustlands shacks, loose gravel in the crater. Each one plays at the spot and is sent as a world event, so people and bots (via `#hear`) both learn someone passed by. (3) Spoken announcer lines on Ring events and squads left: "Ring closing", "5 squads left". Keep each trap to one pooled sound with no physics. Check it at dusk in a full 59-bot match, with the frame time and the server tick from before and after. It is independent of ticket 64's bot hearing change but should land alongside it.

## Comments

Choices made (the owner was away; these follow the ticket and the glossary):

- **Far gunfire.** Each family has its own far bank: rifle (M4A1), sniper, shotgun, and light (SMG and pistol).
  - The rifle is a dull thump with a rolling echo.
  - The sniper's supersonic crack arrives 60–100 ms ahead of a deep boom, then a 1.4 s echo.
  - The shotgun is a broad boom with no crack.
  - The light guns are a flat pop over by about 0.25 s.
  - The near and far cross-fade stays at 40–110 m.
  - Over 320–400 m the far shot fades out, since 400 m is the hearing range that shots are sent within. It no longer stops dead at the edge.
  - A shot holds its voice slot only as long as it rings: 0.75 s near, up to the family's tail when far. Full auto therefore isn't voice-stolen.
- **Bullet crack.** It now plays for rifle rounds only (M4A1 and sniper), using each gun's own muzzle velocity, and is heard when a round passes within 5 m (was 3 m).
- **Sound traps.** There are 17, built from the cover pass (`zero-island-traps.ts`).
  - Ground Zero: gravel ×3. The Dustlands: metal ×3. Frostbite Peaks: birds ×3. Mutant Jungle: birds ×3. Neon City: metal ×2. Rogue Harbor: metal ×2 and birds ×1.
  - Each stands on a real piece (a trunk, shed, wreck, container or rock), at least 30 m from the others in its Region and within 2.5 core radii of the Core.
  - A trap goes off when someone sprints, tactical-sprints, slides or lands within 8 m. Walking and crouching don't set it off.
  - After going off, a trap rests for 30 s.
  - The event is a `trap` ModeEvent, sent once with quiet relevance (250 m on the island). Protocol is now 23.
  - Each trap is one pooled sound (cap 2 per kind) with no physics.
- **Bots** hear a trap within 90 m.
  - They place it roughly, on the ground under the trap, blurred more the farther off it is. The same rough placement goes to their Squad's intel.
  - Within 40 m, a bot with no fight on turns to look, and may go after it, more often the bolder it is.
  - Bots skip their own side, and ignore anyone they saw under 1 s ago.
  - A bot that thinks only every few ticks still hears it on its next thought.
- **Announcer.** It uses the browser's speech synthesis behind a small `Speaker`, so it needs no assets, and a recorded voice can replace it later.
  - Lines: "Ring closing" when the wall starts moving, and "N squads left" ("players" in Solos) on the way down past 10, 5, 3 and 2.
  - It speaks at the game's volume and is silent at 0.
  - In a scripted browser (`navigator.webdriver`) it only writes its lines to `__announced`, because the PC's speech engine isn't reached by `--mute-audio`. `launchChrome` now sets `--enable-automation` unless `SOUND=1`.

**Measured**

- **Server pace**, Zero Island, 60 seats, seed 1, remote-test:
  - Before: Solos tick mean 0.75, p99 2.15. Trios tick mean 0.94, p99 2.62.
  - After: Solos tick mean 0.87, p99 2.30. Trios tick mean 1.12, p99 2.77.
  - Back-to-back runs with bots deaf to traps (seeds 2, 3 and 4) put the difference within run-to-run noise: Solos 0.84 hearing vs 0.91 deaf; Trios 0.95 vs 0.92.
  - Longest stuck bot varies between 8 and 24.5 s by seed whether bots hear traps or not. Seed 3 shows the same 24.5 s at the same spot with bots deaf, so it predates this ticket and is left for ticket 67.
- **Local bots in Chrome**, 59 bots, Solos, dusk, headless, 40 s:
  - Frame time: 4.41 ms mean, p99 6.7. The earlier baseline was 4.11 / 6.5; a re-run of the old build just before was 5.18 / 7.2.
  - Worker tick: 0.96 ms mean, p99 1.8 (baseline 1.00 / 1.9).
  - A 90 s run heard a `trapMetal` at the Dustlands shack (-189, 7, 295) through the sound log. In a 120 s run the announcer said "Ring closing", recorded silently to `__announced`.

**Tests:** new `sound-traps.test.ts` (8), `island-audio.test.ts` (7), and a Zero Island trap layout test (3). Totals: core, client and server 1304; range 141 + 176 + 97; typecheck clean.

**Not done:** nobody has listened to the new sounds. The headless runs are muted, so the voices were checked by tests only (clean, decaying, and the right shape per family).
