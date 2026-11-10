# The countdown

Status: open

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
