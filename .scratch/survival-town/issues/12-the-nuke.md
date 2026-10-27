# 12 The nuke

Status: resolved
Milestone: 3 (art and presentation)
Blocked by: 04, 08

## What to build

The end-of-match moment. See the spec section "Rendering (presentation package)".

- **A presentation-only nuke** driven by the intermission's nuke phase (0–6 s after `matchEnd`):
  - an air-raid siren
  - a flash
  - the shockwave rolling across the town
  - a mushroom cloud
  - a colour grade
  - a synthesised blast that arrives on time for its distance

  Each player sees it from where they're standing.
- **It never touches collision or the simulation.** The world is restored visually at `matchStart`.
- **It scales with the graphics presets.** Low keeps the flash, the cloud and the sound, but drops expensive particles.

## Acceptance criteria

- [x] The playtester agent captures the nuke from at least three spots, on each preset, with no console errors.
- [x] After `matchStart` the map is fully restored: screenshots match the reference spots.
- [x] Frame time during the nuke stays within twice the preset's budget, with no hitches longer than 50 ms.

## Comments

Resolved under the owner's no-questions instruction.

**What it is.** `packages/fps-client/src/nuke.ts` draws the nuke; `Game` drives it from the match status alone, so everyone sees the same moment from where they stand, and a player who joins mid-intermission sees it from that point.

- **The clock.** `sinceMatchEnd(match, serverTime)` turns the phase and its end time into seconds since the match ended (0–6 s nuke, 6–20 s vote). `INTERMISSION` (6 s and 14 s) now lives in `fps-core`'s protocol, and the server uses it too, so the two can't drift.
- **The timeline** (`nukeFrame`). The siren starts at 0 s and the bomb goes off at 2.4 s. The flash peaks within 50 ms and fades in about 1.5 s. The scorched grade (burnt orange, deeper shadows) comes in over 1.2 s and holds through the vote. The camera shakes when the shock front reaches the player, at 343 m/s.
- **The picture.**
  - A fireball that climbs into a mushroom cloud: a noise-displaced cap, a rolled ring and a stem, glowing (HDR, so bloom catches it) and then cooling into sunlit smoke.
  - A base surge of desert dust round the foot.
  - The shock front: a ring-shaped wall of dust rolling out from ground zero through the town and fading out by about 1.4 km.
  - On Normal and High, dust puffs ride the front (700 and 1400, one instanced sprite draw).
  - Ground zero is 450 m east-north-east of the town, out on the test range (`MapDefinition.nuke`; the range has none).
- **The sound.** `audio/nuke.ts` synthesises both sounds:
  - The siren: a two-rotor air-raid siren that winds up, wails and winds down, played from the water tower.
  - The blast: a crack, a sub thump and seconds of rumble with echoes off the desert, played from ground zero. The sound system's distance delay makes it arrive with the shock front.

  Both are rendered at half or quarter rate and interpolated up, because rendering them at full rate took 0.3–0.6 s of main thread while warming.
- **Nothing touches the simulation.** The nuke is a separate group: no collision, no shadows, and hidden whenever a match is being played. It is rebuilt on a preset change.

**Tests.**

- `test/nuke.test.ts` covers:
  - the clock through both phases;
  - the siren comes before anything is seen;
  - the flash at detonation, gone within 2 s;
  - the grade holding through the vote;
  - the shake arriving at distance / 343 m/s;
  - hidden outside the intermission;
  - Low keeps the cloud and shock but drops the dust;
  - nothing casts shadows;
  - disposing it leaves three's shared sprite quad alone (see below).
- `test/nuke-audio.test.ts` checks that the siren winds up to a 450–800 Hz wail, the blast is front-loaded and still rumbling 2–3 s in, both are clean, and the upsampling is correct.

**In the browser.** A dev-page script fakes the match clock, so the nuke can be frozen at any moment or run in real time. It captured the cul-de-sac, the street end and the south yard on every preset, plus the north roof on Normal, each at 1, 2.45, 2.7, 3.6, 5.5 and 12 s. There were no console errors once the bugs below were fixed. After the clock returns to a match, the frame matches the untouched map.

Three bugs turned up and were fixed:

- The nuke disposed its dust sprite's geometry, which three shares between every Sprite. A preset change then broke every other sprite, with WebGPU "buffer used while destroyed" errors. It now disposes only its own meshes.
- The heat shimmer rippled the cloud (a corkscrew stem and torn edges). The shimmer now fades out for anything seen more than about 1–3° above the horizon, which is where heat haze lives anyway.
- The base surge used the cloud's dark smoke underside and read as a black band along the horizon. It now has a desert-dust palette.

**Frame time.** Headless Chrome, uncapped, median frame without and with the nuke:

| Preset | Without | With |
|---|---|---|
| Low | 4.1 ms | 4.5 ms |
| Normal | 6.3 ms | 6.8 ms |
| High | 3.7 ms | 3.7 ms |

The cloud is a few hundred triangles over five draws, and the dust is one instanced draw.

This machine's headless runs stall for 0.2–2 s now and then whether or not the nuke is showing. In a control run, the worst stall (2.3 s) came with the nuke off, and one run with the nuke on had no frame over 34 ms. So the long frames are this machine, not the nuke.
