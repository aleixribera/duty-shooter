# Announcer and voices

Status: resolved
Release: v2.153.0

Spec: `../spec.md`

The announcer is the browser's speechSynthesis with two lines. A recorded or synthesised test-range controller voice with a real script (match start, lead changes, the last minute, the countdown), and pain and death sounds for soldiers.

## Comments

- **Recorded, not synthesised live.** Range Control is one MP3 (33 lines, 69 s, 403 KB) with a table of where each line is, played on the sound system's voice bus: it has the Announcer volume, ducks the music and effects by 5 dB while it talks, and is cut cleanly. The browser's speech stays only as the stand-in for a page that cannot fetch or decode the file.
- **The voice is Piper's `en_US-joe-medium`, run on this PC** (`tools/voice/`): its dataset is CC0, so the recording can ship; nothing is sent anywhere and nothing is paid for. A paid voice (Gemini's, ElevenLabs') would sound more like a person, but spending money is the owner's call, so it was not used. Swapping the voice later is one script: the lines, the checks and the game do not change.
- **Nobody has heard it.** The build is checked by a speech recogniser instead: each line is taken again (up to six takes) until it is heard as written, the last five seconds are judged as a count and out of order, and lines it could not say clearly were reworded ("Supply drop incoming", "Defenders, keep them off the sites") or respelled for the voice ("Out posts"). Level, length and pitch are measured. Whether it *sounds* right is the one thing left for a person's ears.
- **The script** (`voice-lines.ts`): the match opening by mode ("Team deathmatch. The range is hot."), Charge rounds and the charge planted and defused, the lead changing hands, "T minus sixty seconds" with the map's ending ("This site will be destroyed." / "Clear the main line."), thirty, ten, then five to one each on its second, "Cease fire. Cease fire." for a match stopped by a limit, and the Battle Royale's Ring, Supply Drop and Squads or players left.
- **Lead calls are rare on purpose**: only once a lead has been held 1.5 s, never twice running for the same side, at most every 20 s, and not at all near a clock call or in the last 13 s. In the modes where every player is for themselves, only your own lead is news (taken, lost).
- **Squads left** is said only on landing exactly on 10, 5, 3 or 2: two Squads going at once can step over a count, and then nothing is said, because the number would be wrong.
- **The clock has the voice to itself.** The last five seconds cut in over anything else; nothing else is started within 3 s before sixty, thirty or ten.
- **Captions** (ticket 22's plate) carry every line except where a toast already writes the same words and the last five seconds, which the clock shows. The speaker's name on the plate is Range Control.
- **Soldiers' voices** are synthesised, not recorded: a throat's pulse through three formants. A grunt on a hit (others at most every 0.7 s each; your own only for hits of 25 or more, at most every 1.4 s), a last breath on a death, and nothing at all on a kill through the head. Target dummies have no voice.
- **Second opinion** (a review of the diff) found seven things, all fixed and tested: Charge's first round had no line, a game put away after a map change could cut the next game's voice, a lead call could push "Ten seconds" off its second or be swallowed by the count, "Cease fire" could be said after a clock that ran out (now decided from the result's reason, not the clock), a browser that cannot decode the file could have lost all sound, the stand-in tried to count, and a watcher with no side was told to defend.
- **Seen live** (scripted Bot Matches, 1920x1080 and 844x390): Team Deathmatch, Free-for-All and Charge say the right lines on the right seconds with the duck at 0.56, captions read well at both sizes, 31 grunts and 18 last breaths for 22 kills in a 75 s Free-for-All, no console errors; a match ended early by a kill limit gets "Cease fire", one that ran out its clock does not. In the mix the lines sit at about -14 dBFS (loudest 50 ms) against your own gunshot's -13 ducked to -18; the count's numbers are 2 dB quieter than the rest.
- Not done: the count's numbers could be levelled up to the lines; a match of 60 s or less never gets the sixty-second call.
