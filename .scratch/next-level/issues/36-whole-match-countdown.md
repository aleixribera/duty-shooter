# The whole match is the countdown

Status: open

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, identity 4/10, the lowest): the game's idea is ground that is about to stop existing, but for nine minutes of ten the HUD shows a plain timer and nothing knows how long the place has left; the countdown (ticket 24) lives only in the last minute. Make the whole match the countdown: the clock reads T-minus from the first second over a fuse that burns down to the last minute, and the middle of the match gets a beat of its own (Range Control's "T minus five minutes", one short test blast of the distant siren, the score moving into a middle section), so the first, middle and last minutes look and sound different.

## Comments

**Part 1 (v2.176.0): the clock.** The match clock reads `T−9:59` from the first second, in the text colour, over a quiet fuse (`--ds-text-2` on `--ds-line`, 3 px, burning from both ends like the last minute's) that runs out as the last minute starts; there the alert clock and its alert fuse light full, as before. `clockFace(secondsLeft, length)` takes the match's length (`status.timeLimit`); without one the quiet fuse stays whole. Charge's round clock is unchanged. Verified: `last-minute.test.ts` (a new test of the quiet fuse), typecheck, and `../countdown/whole-match.mjs` (a 90 s Bot Match, `?matchtime=90`): the bar read `T−1:30` with the fuse at 1, `T−1:20` at 0.655, `T−1:02` at 0.05 (`../countdown/whole-match/`). Next: the middle beat (voice, siren, music).
