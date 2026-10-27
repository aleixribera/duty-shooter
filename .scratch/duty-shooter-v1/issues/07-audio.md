# 07 Procedural audio behind a sound interface

Status: resolved
Milestone: 3 (audio, effects, HUD, graphics presets)
Blocked by: 06

## What to build

A sound interface in `fps-client` (play an event at a position with parameters) so recorded samples can replace any voice later (50). Web Audio synthesis: layered gunshot (transient crack, low body, mechanical action, environment-dependent tail) (44), distant vs near gunshots (45), positional footsteps by surface material and movement state (46), reload sounds (mag out, mag in, bolt release) (47), slide, mantle, landing and prone (48), hit-marker, kill and headshot sounds (49). Hook every event into the game.

## Acceptance criteria

- [ ] Playtester agent: no console errors, the audio context starts on first input, each event triggers a sound (verify via the sound interface's event log).
- [ ] Synthesis sits behind the interface; swapping one voice for a sample needs no game-code change.
