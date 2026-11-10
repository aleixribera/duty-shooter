# Pad aim assist and rumble

Status: resolved
Release: v2.164.0

Spec: `../spec.md`

Slowdown aim assist for controllers offline and against bots (server-side legality considered for online), rumble on fire, hit and damage.

## Comments

What shipped:

- **Aim slowdown on the controller.** It is the same slowdown touch already had: the look stick turns slower, down to 55 %, while the crosshair is on or just beside an enemy (`aimSlowdown` in `touch/logic.ts`). The `padAimAssist` setting turns it off; it is on by default.
- **Rumble.** `rumble.ts` maps each event to a dual-rumble effect:
  - your own shot, by the gun's camera kick: a 9 mm is a short buzz, the sniper a thump;
  - a hit you made: a tick, firmer for the head, a knock for a kill;
  - damage you take, by its amount;
  - a frag near you within 20 m, and a flash within 12 m;
  - a fall from more than 1.5 m.
  
  The `padRumble` setting sets the strength from 0 to 100 %; it is full by default. A pause stops the motors.
- **Settings:** two rows under Settings → Mouse and pad → Controller.

Decisions made without the owner:

- **Allowed online, against people as well as bots.** The slowdown only scales the player's own stick and never moves the view. The server gets a view angle, as from any input. A mouse player is treated the same by the server, and the client already draws every enemy it is sent. There is no rotational assist (a pull toward the target): that would be a real edge over a mouse and is left out on purpose.
- **What the helps may know of.** The touch and controller helps now ignore an enemy behind a wall, in soft cover or inside a Smoke (`aim-sight.ts`). Before this, a slowdown over a man in a smoke told you where he was. That leak affected touch's slowdown and auto-fire too. The client's predicting world keeps no smoke, so the clouds are rebuilt from the grenades it sees, at the server's time.
- **Mixing effects.** A pad plays one effect at a time, and a new one cuts the old. `Rumbler` keeps every effect being felt and runs each motor at the strongest level until the soonest of them ends, then works it out again each frame.
  - The review of this ticket found the first version merged effects into one. It carried a blast's weight through a whole SMG burst: the heavy motor stayed at 0.76 for 1.6 s.
  - The new version has a test for this, which fails on the old mixer.
- **Smoke near sight (shipped first, in v2.163.0).** The Switchyard Outposts soak found bots standing side by side unseen inside a smoked zone. Smoke now never hides a body within 2.5 m.

How it was checked:

- **Unit tests:** `packages/fps-client/test/pad-assist.test.ts`. The slowdown test fails with the slowdown taken out of the stick.
- **In the game, with a scripted DualShock** whose motors record every effect (`.scratch/next-level/pad/rumble.mjs`):
  - on a dummy 14 m away, the same short push turned 0.66–0.72 as far as over open ground (the push leaves the dummy's slow zone partway through);
  - a burst at the dummy sent shot buzzes, plus hit and headshot ticks mixed on top;
  - pausing sent a reset.
- **Settings rows:** screenshots at 1920×1080 and 390×844 (`.scratch/next-level/pad/settings.mjs`), with no overflow.
- **Not checked:** no one has felt it on a real controller. Chrome's `dual-rumble` was only called through the fake pad.
