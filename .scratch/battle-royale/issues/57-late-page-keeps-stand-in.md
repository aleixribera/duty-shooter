# A page that loads after the Preparation keeps its stand-in for the whole match

Status: resolved
Release: v2.114.2
Severity: S2
Found by: 35 (pass 2, coordinator review)

## Repro
Two people in a Battle Royale lobby. Bea's page runs no frame through the Preparation but stays connected (a slow page still building its shaders, or a tab that's back within the idle timeout). The Preparation waits its 10 s for her, then a bot holds her seat.

When her page runs again it never says `loaded`: `apps/range/src/main.ts` sent it only while `match.preparation` was non-null. The server hands a stand-in's seat back on `loaded`, so the bot plays Bea's seat for the rest of the match while she watches.

## Evidence
- Before: Bea's frames held back through the Preparation, a timer keeping her socket alive. Afterwards `loaded` was sent 0 times, the server counted 59 bots with 2 people in, and her seat walked on its own (`[-40,5,182]` to `[-42,5,202]` with no input). `shots/bugs/t57/before-bea-after-prep.jpg`.

## Comments
- Fix: `LoadReport` (`apps/range/src/load-report.ts`) decides when the page says `loaded`: once per Battle Royale, on the first frame it runs seated in one, in the Preparation or after it (and again for a new Preparation). `updatePreparation` asks it every frame. The server already accepted `loaded` after the Preparation and handed the seat back from the bot.
- After: the same run sends `loaded` once on the first frame back, the server's bots drop from 59 to 58, the seat holds still, and after Join the match Bea walks it herself (`[310,5,-506]` to `[318,4,-508]`). `shots/bugs/t57/after-bea-joined.jpg`.
- A tab hidden for longer than the idle timeout (20 s, and the Preparation is at least 20 s) is dropped and takes its seat back on reconnect through the resume token; that path already worked (pass 2).
- Left as is: a page that never saw the Preparation comes back to the lobby view ("The match has started. Join it to drop in."), one press from its seat.
- Test: `apps/range/test/load-report.test.ts`.
