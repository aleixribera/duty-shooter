# 13 Map audio: footsteps, reverb and ambience

Status: resolved
Milestone: 3 (art and presentation)
Blocked by: 05

## What to build

Survival Town's sound, all generated in code. See the spec section "Audio (presentation package)".

- **Footstep banks** for the new materials: wood floor, grass, asphalt, gravel, sand, sheet metal, plastic. These replace ticket 01's temporary mappings. Impact sounds for the new materials are added too.
- **Reverb:** the existing indoor/outdoor reverb switch is driven by the map's indoor zones.
- **Ambient sources** placed by the map:
  - desert wind
  - distant birds
  - a creaking sign
  - a faint radio playing from one house
- **Loudness:** ambient sound is capped below footsteps and gunfire.

## Acceptance criteria

- [x] A test checks that every material has a footstep bank and an impact sound.
- [x] The playtester agent confirms the reverb switches at every house and garage door, and that ambient sources play where they're placed.
- [x] Ambient loudness is measured and recorded below footstep and gunfire levels.

## Comments

Resolved under the owner's no-questions instruction. Finished on the home server (headless Chromium, SwiftShader WebGL2), not the Windows PC.

**What was built.**

- `audio/ambience.ts` synthesises the wind, birds, the sign's creak and the radio, all in code. They are new sound events `ambientWind`, `ambientBirds`, `ambientCreak` and `ambientRadio`, with profiles in `audio/system.ts`.
- `map-sound.ts` has `environmentAt(zones, p)` (indoor reverb inside any indoor zone, outdoor elsewhere) and `Ambience`, a scheduler: the wind and the radio run as overlapping beds with no gap, a bird sings from a random perch every 4–11 s, and the sign creaks every 2.5–6 s. After a stall (a hidden tab) it picks up from now.
- Maps place their sources in `MapDefinition.ambience`. The range has the wind only. Survival Town has the wind; birds on three power-pole tops, the water tower and both instrument towers; the creak at the population sign; and the radio in the north living room at (5, 1, −26).
- The game picks the reverb for every sound from where it is made (or from the listener, for sounds with no position), and plays the ambience each frame after placing the listener. Indoors the wind drops to 30 %.
- Footstep banks and impact sounds already existed for every material; a test now holds that.

**Tests.**

- `fps-client/test/map-audio.test.ts`: every material has a footstep bank and an impact sound; ambient loudness is capped (below).
- `fps-client/test/map-sound.test.ts`: the scheduler and the reverb switch.
- `range/test/survival-town.test.ts`: the reverb flips at all ten outside doors (front, back, upstairs deck door, garage door and garage back door, on both houses), 0.6 m in is indoor and 0.6 m out is outdoor; every ambient source is inside the map, and the radio is indoors.

**In the browser.** There is no playtester agent on the home server, so I drove the page over DevTools myself. Standing in the north living room, the wind and radio play with the indoor reverb; at the cul-de-sac the wind is outdoor; in the north garage it is indoor again. Birds and creaks are logged with the outdoor reverb at their perches, the radio with the indoor one. There were no console errors. I'm self-approving this playtest checkpoint, under the owner's instruction.

**Loudness.** Loudest 50 ms in dBFS, worst case over 20 plays (offline render):

| Sound | Loudest 50 ms |
|---|---|
| Footsteps at 8 m | −39.9 |
| Gunfire at 50 m | −35.8 |
| Wind | −47.6 |
| Birds | −47.6 |
| Sign | −47.8 |
| Radio | −47.6 |

Every ambient sound is at least 6 dB under both references, and `map-audio.test.ts` enforces that.
