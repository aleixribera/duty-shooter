# Bot Match shows which side you're on

Status: resolved

Release: v2.186.1

Spec: `../spec.md`

From the capture of 2026-11-12 (`../reviews/2026-11-12c/`): the Bot Match setup's biggest panel was eight numbered rows, seven of which just said "Bot". In a team mode it never said which team you'd be on, even though the two columns were already the two teams.

## Comments

**v2.186.1.** In the offline Bot Match setup, team modes now head the two columns ◆ Blue and ▲ Orange, in the team colours and with the team marks (`DESIGN.md`). You head the Blue side.

How the seats are split (`botMatchSides` in `ui/model.ts`):
- In mixed teams, you plus bots up to half the match are Blue and the rest are Orange: 4v4, or 3/2 on an odd count.
- In humans vs bots, you alone are Blue and every bot is Orange.

The note under the seats ("You on Blue against 4 bots on Orange.", "Bots fill the match to 4v4.") only repeated what the headings now show, so it is gone when the sides show. Free-for-all and the online lobby are unchanged. On a phone the two sides stack, Blue first.

Verified:
- `bot-match-sides.test.ts` (3 tests) passes: 4v4, the odd count, and humans vs bots.
- Typecheck passes.
- `../sides/setup.mjs` opens the setup and reads the headings:
  - mixed: "◆ BLUE: You, Bot, Bot, Bot" and "▲ ORANGE: Bot, Bot, Bot, Bot";
  - humans vs bots: "◆ BLUE: You" and "▲ ORANGE: Bot ×4";
  - free-for-all: no headings, the old grid;
  - phone (390 px): stacked, with no horizontal overflow and no page errors.
- Screenshots are in `../sides/after/`.

A second opinion (a subagent review of the diff) checked the shown split against the real start. `TeamRoster.start` fills Blue first, with you as the first entrant, so Blue ends up with ceil(n/2). In humans vs bots the server puts people on Blue and bots on Orange. Both match `botMatchSides`, and no render path broke.

Its small points:
- A side with no seats (a map with no bots) now gets no heading.
- A redundant phone CSS selector is gone.
- Free-for-all with humans vs bots still set used to say "You on Blue against N bots on Orange". It now says "Bots fill the match to N players".
- Left open: `botMatchSides` repeats `TeamRoster`'s fill rule by hand, and no test ties the two together.
