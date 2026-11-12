# The countdown's loadout prompt goes in its card

Status: resolved

Release: v2.183.0

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, UI/UX 6/10): during a match's opening countdown, "F LOADOUT" sat on a plate of its own just under the crosshair (`../reviews/2026-11-12/04-play-start.jpg`). That made two plates in the middle of the screen and one of them over the aim point, with the countdown card above saying the rest.

## Comments

**v2.183.0.** While the round card is up (a match's opening countdown, or a Charge round's freeze), the button prompt is the card's last line, under a hairline, and the floating plate under the crosshair stays hidden. Dead, at the range's station, and every other prompt (plant, defuse, revive, reboot, supply drops) are unchanged. The rules are `roundCardUp` and `cardPrompt` in `hud.ts`.

Verified:
- `hud-round-card.test.ts` (new): the card takes the prompt during the countdown and a Charge freeze, but not after the countdown, not in a Battle Royale, and not under a message. Passes.
- Typecheck passes.
- `../card/countdown-card.mjs`: a Survival Town Bot Match through the menu. During the countdown the card reads the mode, the count, the goal and "F LOADOUT", with no plate under the crosshair (`../card/after/countdown.jpg`). After it, neither shows. No errors.
