# Low health and danger

Status: open

Spec: `../spec.md`

Heartbeat, low-pass and desaturation under 30 health, tinnitus after a close blast, and the grenade indicator stats.ts already specifies (warningRadius).

## Comments

The audio half is released in v2.151.0; the ticket stays open for the desaturation and the grenade indicator. The desaturation and the grenade indicator are not part of this. Measured, not listened to: `.scratch/next-level/audio/danger.md`, `wav/danger/`.

- `sound.setHealth(health)` is called every frame (null when dead, with no match, or in a Preparation's camera shot). Under 30 health a heartbeat starts on that frame and a low-pass closes over the world; both stop when health is back at 30.
- The heart: 74 beats a minute at 25 health, 106 at 12, 134 at 6. Level -28.3 LUFS-M at 25 health rising to -22.9 at 6, which is about 8 dB under your own rifle: the first version read -16.3, as loud as the rifle, and was turned down. It is the Preparation's beat (`audio/preparation.ts`), whose energy sits around 55 Hz: small speakers will barely carry it. Decided at integration: it has a knock now, see below.
- The low-pass runs from 9 kHz just under 30 health to 1.1 kHz at 5. On steady rifle fire 15 m off, the 2 to 6 kHz band falls 12.6 dB at 6 health and the band above 6 kHz 30 dB; a second after healing they are back.
- Tinnitus: a grenade that hurts you and does not kill you rings, scaled by how close it was and how much it took (`tinnitusStrength`). At full strength the world under 2 kHz drops 13.5 dB and is back within 1 dB after 1.4 s; the 4150 Hz tone starts at -28 dBFS and has fallen to -60 a second and a half in. A light blast (strength 0.35) ducks 2.8 dB. Only grenades do this: no other explosion in the game reports its distance to the victim.
- The heart and the ringing play on the effects bus, so the Effects slider covers them.

**Integration (the owning session)**

- The heartbeat has a knock an octave and more above each thump (190 falling to 118 Hz, and 170 to 108 for the dub), 22 ms long, and its low-pass moved from 220 to 260 Hz. Of the beat's energy, 100 to 300 Hz was 1 % and is now over 14 %, which a laptop or a phone plays; under 100 Hz still holds more than 60 %, and next to nothing sits over 300 Hz, so it is still a heart and not a drum (`preparation.test.ts`). The Preparation's beat is the same sound and gets the knock too: it has a silent world to itself, and a beat nobody on a phone could hear was the worse fault there as well.
- Seen live on the range, a grenade thrown short: 9 health for 6.2 s, the world's low-pass at 1,573 Hz, 13 beats in that time (116 a minute), the ears rung once; as health came back the beats stopped and the low-pass was open again within the second. In a scripted free-for-all the filter closed the instant health fell under 30 and was open 0.1 to 0.2 s after each of two deaths; nothing was left running after a death or a respawn.

**After a review (in this release)**

- The heartbeat and the low-pass belong to the fight: they stop with the match (the ending's shot, the scoreboard and the vote were played through a closed filter when you ended it hurt) and through a pause of a Bot Match. Seen in a scripted free-for-all: paused at 28 health, the filter went from 7,700 Hz to open and no beat was played in 4 s of pause.
- The ringing after a blast picks its ramps up from where the last one left them (`cancelAndHoldAtTime`), so a second blast inside the first does not click.
