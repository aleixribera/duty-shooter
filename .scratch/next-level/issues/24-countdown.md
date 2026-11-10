# The countdown

Status: resolved
Release: v2.152.0

Spec: `../spec.md`

The match's last minute is its own act: the HUD clock turns to T-minus, the siren, the announcer, the score's last movement, the light changing. The identity ticket: see the spec.

## Comments

The audio is released in v2.151.0; the ticket stays open for the HUD clock, the announcer's lines and the light. The HUD clock, the announcer's lines and the light are not part of this. Measured, not listened to: `.scratch/next-level/audio/countdown.md`, `music.md`, `bot-match.md`, `wav/countdown/`.

- One clock drives all of it: the time left in a timed match (`#updateScore` in `game.ts`), which is also what picks the score's `lastMinute` and `final10` scenes (ticket 15). Charge and Battle Royale have no such clock and get none of it.
- The siren (`audio/countdown.ts`, `countdown-sounds.ts`): an air-raid siren on a mast past the north-west edge of what is built on the map (`sirenSpot`). It winds up as the clock reaches 60 s, holds its note in 4 s segments that overlap by 0.9 s, and winds down when the clock runs out or the match ends early. Too close to the end when it would start, it does not start.
- It is far off by level as well as by place: -27.1 LUFS-M at 150 m, -30.2 at 250 m, -33.3 at 400 m, and -31.1 heard from indoors at 250 m. A rifle 15 m off is about -25 through the same chain. The first version read -17 at 250 m, as loud as your own rifle, and its level fluttered by 11.5 dB as the note's waver swept through the reverb; the send was cut from 0.6 to 0.14 and the flutter is now 4.6 dB.
- The counter: a Geiger counter's ticks in your hand (not placed in the world), random arrivals from one every two seconds at 60 s to three a second at 10 s, then five a second rising to thirty through the final ten. Counted in the render: 0.1, 0.6, 0.7, 1.4, 2.5 and 12.3 ticks a second across the six ten-second windows, 23 a second in the last two seconds. One tick peaks at -14.2 dBFS and lasts 21 ms.
- In a scripted Bot Match (`?matchtime=75`): the siren's wind-up and the `lastMinute` scene both came with 59.9 s left, `final10` with 9.95 s left, 17 held segments 3.10 s apart, one wind-down, and the most voices at once stayed at 55 of the 64 allowed.

**After a review (in this release)**

- The siren no longer follows you out: leaving the match, or pausing a Bot Match, fades its voices in 0.2 s (`SoundSystem.stop`, new), and a pause that ends takes the held note up again with no second wind-up. Seen in a scripted Bot Match: no siren cue in 8 s of pause, a hold and no rise after it; none after Leave from the pause menu.
- When the clock runs out the wind-down starts at once and the held note fades under it; it used to wait for the segment in hand to finish, up to 3 s into the ending. Seen: the fall logged in the same sample as the phase change, one fall, no hold after it.
- Where the siren stands is worked out only when a clock first needs it, not at the start of every match.

**The clock, the calls and the light (v2.152.0)**

- The clock (`hud/match-clock.ts`): above a minute it reads `m:ss` as before. From 60 s it reads `T−0:58` in the alert colour, with a fuse under it that burns from both ends to the middle, so the state is a different text and a different shape as well as a different colour. In the last ten it counts tenths (`T−08.4`) and each new second ticks: larger and white for 0.2 s. A Charge round's clock is a round's, not the bomb's, and keeps its own face; Battle Royale has no match clock.
- The calls (`last-minute.ts`): the announcer says "T minus sixty seconds", "Thirty seconds", "Ten seconds", each once as the running clock passes it. A clock first seen under a mark (a late join), or set past one, calls nothing. Only the first is written on the HUD, because after it the clock itself says the rest: "T-minus 60 seconds. This site will be destroyed." on a map that ends in the bomb, "T-minus 60 seconds. Clear the main line." on Switchyard, whose ending is the freight train. The lines are spoken by the announcer the game already has (the browser's speech synthesis); a recorded voice is ticket 16.
- The light (`mooded` in `pipeline.ts`, `lastMinuteLight`): from 60 s the picture moves to a warning lamp's light. Shadows and middle tones take amber while the brightest parts keep their colour, the contrast tightens about middle grey and the frame's edge closes in; it comes on with no step (`1 - (left/60)^1.6`) and each of the last ten seconds lifts the whole picture by 9 % for an instant. It is a grade, not a change to the scene's lights, so it costs nothing a frame and looks the same on every map. It leaves over two seconds when the match ends, under the ending's own shot.
- Decided: nothing of this pauses the fight or takes the centre of the screen. The one written line is a toast; on a phone held sideways (844 by 390) the toast sits just under the crosshair for its 4 s, which is the toast's place on short screens and is left for the touch ticket (23) to move.
- Seen in scripted Bot Matches of 75 and 100 s on Survival Town, at 1920 by 1080 and 844 by 390: `T−0:58` with the toast at 58 s, `T−0:30`, `T−08.4` with the fuse nearly burnt, and the sky gone to sodium haze at 3 s against the first minute's blue. Not heard: whether the three lines sound right spoken; nobody has listened to this game's sound yet.
- Scripts: `.scratch/next-level/countdown/mood152.mjs`.

**After a review (in this release)**

- A call is made once: online, the estimate of the server's time is corrected backwards now and then, and a clock that stepped back over 60 would have had its line spoken and written twice. The clock the calls are measured against only runs down (`clockRan`); a set clock or a new match starts it afresh.
- The match bar is not rebuilt for the clock. In the last minute its markup stands still and the clock's text, its tick and the fuse are painted into it (`MatchClockView`), the fuse as a `scaleX`. Counted through the last 11.7 s of a 75 s Bot Match: the bar rebuilt once (a score changed), the clock painted 160 times. Written with the bar, it would have been rebuilt ten times a second.
- Charge keeps its round clock from the first frame (decided by the mode, not by whether the round's state has arrived yet).
- Leaving a match in its last minute takes the light with it at once: the menu's backdrop is not graded.
- Left as it is: a match limited to 60 s or less never hears "T minus sixty seconds", because its clock never passes the mark. Only a server set to such a limit, or `?matchtime=`, makes one.
- Scripts: `.scratch/next-level/countdown/clock152.mjs`.
