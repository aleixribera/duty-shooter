# 13 Map audio: footsteps, reverb and ambience

Status: ready-for-agent
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

- [ ] A test checks that every material has a footstep bank and an impact sound.
- [ ] The playtester agent confirms the reverb switches at every house and garage door, and that ambient sources play where they're placed.
- [ ] Ambient loudness is measured and recorded below footstep and gunfire levels.

## Comments
