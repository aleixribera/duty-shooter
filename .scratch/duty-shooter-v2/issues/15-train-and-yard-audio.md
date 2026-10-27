# 15 The freight train and Switchyard's audio

Status: resolved
Release: v1.10.0
Blocked by: 14

End-of-match freight train (presentation only) on the intermission timeline; ambience bank; train approach and pass-by.

## Comments

- The train (`FreightTrain` in the map definition, `Train` and `TrainSounds` in `packages/fps-client/src/train.ts`):
  - Two locos (the yard's `loco` model, the first cab first) and 22 wagons: oxide, brown and teal boxcars, covered hoppers and tank cars, each body on the yard's `frame-12` underframe. Westbound on the main line's near track (z -32.5).
  - Timed on the intermission clock (`sinceMatchEnd`), as the nuke is. It starts at x 132 at 26 m/s, sounds its horn at 0.3 s and 3.6 s, and runs the length of the yard within the 6 s nuke phase. Its tail clears the west end at about 18 s, before the vote ends.
  - It is never part of the collision. Its placements tie no solids.
- New Blender assets in `tools/map/switchyard.py`: `boxcar-oxide`, `boxcar-brown`, `boxcar-teal`, `hopper` and `deck-12`. They are exported in the same `switchyard.glb` (877 kB). Previews and in-game shots looked at: the ribbed boxcar sides, sliding doors, ladders and roof walks, and the hoppers' hatches.
- Light: the lead loco's two headlights are glow sprites, with a soft additive beam down the line and a pool of light on the ballast ahead. There is no realtime light, because the yard's surfaces are baked and would not take one.
- Sound (`audio/train.ts`):
  - A five-chime horn (two long blasts).
  - The roar, as 2 s segments from the train's nearest point. The diesels are heard near the head, the wagons' rail roar down the rest.
  - A double clack as each bogie passes the listener, from the rail joint beside them. That gives the clickety-clack rhythm at the right speed.
- Switchyard's ambience bank (`Ambience`), all held at least 6 dB under footsteps and gunfire by the loudness test:
  - a train's horn far out on the plain every 35-80 s, from one of two places;
  - wagons being shunted beyond the east and south walls every 12-30 s;
  - the low lamps (wall and hanging) humming, heard only close by.
- Charge sounds, which no ticket had made yet (`ChargeSounds`, `audio/charge.ts`):
  - keypad taps while the charge is planted, and a chirp once it is armed;
  - the fuse beep, once a second at the plant and quickening to ten a second at the end;
  - tool clicks while it is defused, and falling tones when it is disarmed.
  - The round's state is read through the intermission too, so a match-winning defuse is heard.
- `Game.previewEnding` (dev): shows a map's ending at a given second with no match on, for screenshots. Example: `duty.game.previewEnding = 6`.
- The glossary gains "Freight train", and "Intermission" now names the map's ending instead of the nuke. The server phase keeps the name `nuke`, because renaming it would change protocol 7.
