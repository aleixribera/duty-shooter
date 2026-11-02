# Sunlight jitters when the Ring is around

Status: resolved
Release: v2.110.1
Blocked by: 35

Owner report: "The sun gets messed up with the ring, its light jitters in a very ugly way."

Reproduce it first on video or frame sequences: stand inside, near and outside the Ring at several distances, looking toward and away from the sun, while still and while moving. Suspects to separate by measurement: the Ring wall casting or receiving shadows, the sun shadow camera snapping as it follows the player (±45 m box, texel snapping), the Ring's transparent pass sorting against the sky or the sun glow, the sun glare's occlusion test flickering through the wall's lattice, and tone mapping or exposure reacting to the wall's brightness. Fix the cause, not the symptom, without adding draw calls. Then capture the same sequences after, and compare with the Ring hidden to prove the jitter is gone.

## Comments

Reproduced in a real Battle Royale (real server, headless muted Chrome, `.scratch/battle-royale/t53/play.mjs`). The script puts Ada inside, near and outside the wall, facing toward and away from the sun, standing still and turning. It films each spot as a run of frames and measures, per pixel, the mean step from one frame to the next. The Ring was held where it stood so a closing Ring didn't move under the camera. Sun elevation was 11.5 deg.

Suspects, separated:
- Shadows and the shadow camera's snapping: not it. The wall casts no shadow (`castShadow` off). With the wall's animation frozen, the frame is as still as with the Ring hidden (inside 30 m toward the sun: 0.44 against 1.58; at 150 m: 0.50 against 0.53).
- Transparent sorting against the sky: not it, for the same reason. A frozen wall doesn't flicker.
- Glare occlusion: the sun has no occlusion test. Only the gun's light checks for sun with `sightBlocked`, and the wall isn't solid.
- Exposure: none. Tone mapping is fixed.
- **The sun shafts and the bloom: the cause.** Both take the frame's own brightness for the sun: the shafts take the sky past 2.5, the bloom anything past 1.6. The wall's crackle and lattice are added light, so over the sun's glow and the lit cloud round it they lifted the sky across those thresholds. The sun's beams and glow then flickered with the crackle. Each was measured alone with the Ring on and off (mean step):

| Spot | Shafts, Ring on | Shafts, Ring off | Bloom, Ring on | Bloom, Ring off |
| --- | --- | --- | --- | --- |
| Inside, 30 m | 0.21 | 0.08 | 0.62 | 0.14 |
| Inside, 8 m | 0.17 | 0.31 | 1.22 | 0.22 |

The "light jitters" is that: blobs of bloom and a ragged fringe of shafts round the sun, switching on and off with each filament.

Fix (v2.110.1): the wall's lattice and crackle fade where the sky behind them is bright: full below a luminance of 0.3, gone at 1.2. The sun burns through them, as it already does through cloud. The wall reads the sky with the background's own `cloudySky` for its view direction, injected into `RingWall`. The fade is set so that the crackle can't lift sky that sits short of a highlight past the bloom's 1.6 (tested in `ring-wall.test.ts`). The sheet, the foot glow and the streams are unchanged, so the wall still reads in front of the sun.

After (mean step):

| Spot | Shafts, Ring on | Shafts, Ring off | Bloom, Ring on | Bloom, Ring off |
| --- | --- | --- | --- | --- |
| Inside, 30 m | 0.22 | 0.30 | 0.16 | 0.17 |
| Inside, 8 m | 0.70 | 0.32 | 0.41 | 0.31 |
| Outside, 15 m, toward the sun | 0.27 | 0.28 | 0.13 | 0.12 |
| Outside, 15 m, toward the wall | 0.03 | 0.03 | 0.02 | 0.03 |

Run-to-run noise from bots and drifting cloud is about ±0.2. At 8 m the shafts' remaining difference is the HUD's "The Ring is closing" toast fading in during the capture, not the sun (seen in the flicker map).

The sheets are in `shots/bugs/sun/`: `sheet-flicker-before-after-ringless.jpg` shows the flicker maps before, after and with the Ring hidden; `sheet-look-before-after.jpg` shows the look. The raw numbers are in `flicker-*.json`.

Cost: no new draw call. The wall reads the cloud picture twice more per pixel. Frame time measured with vsync off was the same with and without the read: 1.89/3.87/3.80 ms against 1.85/3.95/3.85 ms at three spots.

A real Battle Royale on the final code (t52's play-through) showed the wall drawing normally, with no console errors.
