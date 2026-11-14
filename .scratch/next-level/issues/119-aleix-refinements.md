# Aleix's refinements

Status: open

Spec: `../spec.md`; `PLAN.md` item 9 (2026-11-14, from Aleix playing it). Eight parts, a to h, worked in order; each has its acceptance check in `PLAN.md`.

## Comments

**2026-11-14, loop pass 93: a, the clock without "T-" (done, v2.215.0).**
- `clockFace` (fps-client/src/hud/match-clock.ts) reads `9:23` through the match and its last minute, and `10.0` to `0.0` in the last ten seconds, with no "T-" and no leading zero. The announcer's "T-minus five minutes" and "T-minus 60 seconds" stay.
- Width: measured in Chakra Petch 700, "10:00" (the longest face; matches are 10 min at most, Battle Royale shows no match clock) is 3.94 zeros plus 5 x 0.02 em letter spacing = 4.1 ch; the clock holds 4.3 ch (was 6.1 ch for "T−10:00"), the same margin as before. The last minute's own 6 ch rule is gone (the class is now `last`, not `tminus`).
- Proof: last-minute tests (faces, no face longer than "10:00", never counts up). Frames `clock/after/` and `clock/sheet.jpg` (`clock/look.mjs`, Bot Match with 70 s): desktop 1:10, 0:46, 8.8 and phone 1:10, 0:43, 6.3; the bar's left edge and width stay the same in every act (745.6 / 428.9 px desktop, 243.5 / 357 px phone).
- README, GLOSSARY and the trailer's title slates say the clock counts down, without "T-".
