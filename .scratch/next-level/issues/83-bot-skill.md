# Bot skill in Bot Match

Status: resolved

Release: v2.187.32

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), Gameplay depth (7): "03 still offers no bot count, difficulty or match length."

## Comments

- **What it is.** Every Bot Match bot was the same moderate player, a style of its own on top. A new player who keeps dying to them, and a good one who finds them easy, had nothing to turn. Of the three the review names, difficulty matters most: the bot count already follows the map's team size, and the match length is each mode's.
- **The call.** The pick is Easy, Normal and Hard, three choices, with Normal as the moderate bot it was. Skill scales only how a bot fights: how soon it reacts, how wide its aim starts, how well it follows a strafe and pulls recoil, how often it goes for the head. Its style, loadout and the way it moves stay its own, so a lobby keeps its mix of rushers and anchors at any skill.
- **What changed:**
  - `fps-core` `bots/profile.ts`: `BotSkill`, `BOT_SKILLS` and `skilledProfile(profile, skill)`.
    - Easy: reacts 1.6× later, aims 1.8× wider, tracks and turns at 0.7×, half the headshots.
    - Hard: reacts at 0.7×, aims at 0.6×, turns 1.25× faster, 1.4× the headshots.
    - The shares stay within 0 to 1.
  - `fps-core` `harness/duel.ts`: a duel side can carry a skill, and `skillDuels(a, b)` fights the same personalities and spots both ways round.
  - `fps-client` `session.ts`: `BotMatchOptions.skill` reaches the match's server through its `bots.profile` hook, so every bot it seats plays at that skill. A read-only `botProfiles` shows how they play.
  - `lobby.ts`: offline only, a "Bot skill" row of three under Sides, in the setup's own segmented style.
  - `bot-setup.ts` and `main.ts`: the setup keeps the pick between visits, like its others, and Start passes it on.
- **Measured** (`bot-skill.test.ts`): 32 seeded M4A1 duels at 15 m for each pair.
  - Hard beats Normal 75% of the time.
  - Normal beats Easy 69%.
  - Hard beats Easy 88%.
- **Seen in the page** (`../bot-skill/look.mjs`, `after/`):
  - The setup shows the row at 1920 and on a phone, with Hard lit once picked.
  - A Survival Town match started on Hard had seven bots reacting in 0.20 to 0.32 s with 1.9 to 2.4° of aim error. Normal's ranges are 0.28 to 0.48 s and 3 to 5°.
  - No page errors.
- **A second-opinion review** confirmed the hook reaches every bot the match seats, that a Battle Royale's own profile still applies first, the shares' caps, the lobby's keys and lock, and that the duels are seeded. It found one defect, fixed:
  - A bot judges how steadily its target moves from the target's trail, read at its perception lag plus two steadiness windows back. The trail kept only 0.4 s. Easy's lag, up to 0.45 s for a slow bot, ran past it, so the bot read the newest sample as old and saw a strafing player as never steady. A bolt-action Easy bot, which waits for a steady shot, never fired at a moving player.
  - Reproduced with a new test: an Easy sniper at 0.28 s of lag never fired at a target strafing at 45 m. At 0.12 and 0.18 s it did.
  - `bot.ts` now keeps the trail for its lag plus the two windows when that is longer than 0.4 s. The test passes.
- **Not in this slice:** a bot count of your own, a match length, and remembering the skill across reloads. The setup's other picks aren't kept across reloads either.

Verified:
- The `fps-core`, `fps-client` and `range` typechecks pass.
- `bot-skill` tests pass (4/4, new; the fourth failed before the trail fix). `bots-arsenal` tests pass. `bot-match` tests pass (2/2, one new: Hard bots react faster and aim tighter than the same bots at Normal).
- Setup frames at desktop and phone width, and a Hard match started in the page, with the bots' profiles read from it.
