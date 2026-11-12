# The kill feed without "bot" on every name

Status: resolved

Release: v2.187.7

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, UI and UX): "The kill feed (07) repeats 'bot' four times in two rows." In a Bot Match every name but yours is a bot, so the word after each name told the player nothing and doubled the feed's clutter.

## Comments

**v2.187.7.** The kill feed marks a bot only where the match has someone else who isn't one.

- `eventWords` (`hud/event-words.ts`) works out the kill feed row's bot marks. It now sets them only when some player other than you is human. In a Bot Match (you and bots) no name in the feed carries the word. Online, with people and bots mixed, bots are marked as before.
- The scoreboard and the MVP plate still mark bots everywhere: a table has room for it, and there it reads as a fact about the row, not a repeat.
- DESIGN.md's HUD rule says so.

Verified:
- A new test in `event-words.test.ts` failed before the change and passes after: a match of you and bots leaves both names unmarked, and one more person in the match brings the marks back. The file passes (9/9), along with the existing test that marks a bot among people.
- Typecheck passes for `fps-client`.
- No browser run: the PC was at 90-100% CPU from other sessions' work, and a Bot Match with kills is the heaviest run there is. The change is in the words the feed is given, which the test covers. The feed draws them by the same path as before.
