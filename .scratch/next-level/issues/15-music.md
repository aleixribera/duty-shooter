# The score and the mix

Status: resolved

Release: v2.151.0

Spec: `../spec.md`

No music exists. A synthesised score: menu theme, match start sting, a bed that tightens with the countdown, victory and defeat. Buses for music, effects, voice and UI with their own sliders, and ducking under gunfire.

## Comments

Released in v2.151.0. Nobody listened: everything below is what the meters read. Tables and WAVs: `.scratch/next-level/audio/music.md`, `bot-match.md`, `wav/music/`.

**The mix** (`audio/mix.ts`, `audio/system.ts`, `settings.ts`, `ui/menu.ts`)

- Four buses under the master: music, effects, voice, UI. Settings has Master volume, Music, Effects, Announcer and Interface sounds; a save from before keeps its one volume as the master and takes the defaults for the rest (master 0.8, music 0.7, the others 1). The announcer speaks through the browser's speech engine, outside the audio graph, so its slider and the master reach it as one volume.
- Gunfire and explosions duck the music by how loud they are where you stand, down fast and back in under a second. Measured against the same render with nothing ducking it: ten of your own rifle rounds 9.0 dB, back within 1 dB 0.83 s after the last; a frag 8 m off 14.0 dB, back 1.09 s after; a rifle 60 m off 2.8 dB; a rifle past about 210 m does not duck at all.
- The announcer ducks everything but the UI by 5.0 dB for the length of the line (estimated from its words, since the speech engine gives no timing), back 0.34 s after.
- The master limiter and soft clip are as they were.

**The score** (`audio/music/scene.ts`, `score.ts`, `player.ts`)

- All synthesised, rendered once into stems at half rate by a worker of its own, and played as a handful of buffer sources. `music.setScene(scene, timeLeft)` is called every frame by the menu loop (`main.ts`) and by the game (`game.ts`); nothing happens until the scene changes.
- Scenes: `menu` (the theme: a 32 s pad loop with a motif, an answering phrase, a far siren and a counter arranged a cycle at a time, so that it does not repeat the same way), `match` (silence: players need their ears; stings still play), `lastMinute`, `final10`, `finalStage` (a Battle Royale's last Stage: the bed a semitone down and half closed), `victory`, `defeat`, `silence`.
- Stings: `matchStart` when the opening countdown runs out (not when joining a match under way), `ringClosing` beside the Ring's own sound, `victory` or `defeat` when the match has a result. A draw plays neither. In a Battle Royale the ending's sting comes at the match's end, not at your own elimination.
- Levels at the default mix, after the master chain: menu theme -21.5 LUFS-I (peak -9.7 dBFS); stings -18.9 to -19.5 LUFS-M; the last minute's bed about -26.5 dBFS RMS, centroid near 100 Hz. For scale, your own rifle is about -15 LUFS-M through the same chain.
- The last minute: the bed's tape speed rises a semitone and its low-pass opens from 420 Hz to 2600 Hz over the fifty seconds to the final ten. The riser then joins the bed rather than replacing it (the first version handed over and fell 15 dB at T-10): the final ten read -23.6 dBFS against -26.7 for the ten before, the last three seconds -21.7, -21.2, -21.0, and it ends on a knock when the clock runs out.
- The bed stops when the match's phase changes, not at a time set from the audio clock: a Bot Match on a struggling machine runs its clock slower than real time (50 s of match took 73 s in one run), and a bed cut by the audio clock went silent before the end.
- Checked in the 100 s render: no click at the loop point (worst sample step within 30 ms of each seam 0.0045, against 0.049 elsewhere, which is a counter tick), DC offset 1.7e-5, level across the seam within 1.2 dB.
- It starts only once the browser allows audio, and a hidden page plays nothing; back in view the scene starts again. Both seen in the scripted match (the hidden page was simulated by a made-up `visibilitychange`).
- Cost: the stems render in 0.9 to 1.3 s on one thread, in their own worker, and hold 18.8 MB. On the main thread, across a 119 s scripted Bot Match: the score's own scheduling 11 calls, 3.8 ms in all, worst 1.5 ms; the per-frame calls (scene, health, listener) 4.4 us each.

**Left open**

- `#won` in `game.ts` repeats what the Profile's record of a match already works out; one of them should call the other once ticket 17 lands.
- One early scripted run showed two stalls of about 1.5 s inside audio calls, on a PC that was saturated at the time. Three later runs that logged every call over 8 ms had none above 13.8 ms. Not explained.

**Integration (the owning session)**

- Run again on the combined tree (Score, Profile and sound together): the scripted Bot Match's 18 checks pass (scenes in order, both stings, the siren and the counter, never more than 54 of 64 voices, no page errors).
- Still nobody has listened; the meters say it sits where it should, an ear has to say whether it is good. WAVs: `.scratch/next-level/audio/wav/music/` (not in the repo; `measure-music.mjs` renders them again).

**After a review (in this release)**

- A fault in the music can no longer take the game's frame with it: changing scene and playing a sting are wrapped, and a failure leaves the match silent of music, not frozen.
- The match's opening sting is played after the scene changes to the fight, so the scene's fade-in does not swallow it.
