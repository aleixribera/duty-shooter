# 02 Teammates' deaths: danger spots, trades and checked angles

Status: resolved
Release: v2.27.0
Blocked by: 01

## What to build

- **Danger spots.** A teammate's death in a team mode, or the bot's own death, marks where the killer was. It is blurred by the bot's distance from the death (exact for its own). It lasts 25 s and is kept through respawns.
  - Near the death, an aggressive bot trades: it chases the killer.
  - Routes avoid the spot's sight, goals near it are avoided or sought by style, and hold facing prefers it.
  - Moving within 30 m of a danger spot it can see, the bot checks that angle when it lies within 75° of its way.

See the spec.

## Acceptance

- [x] A teammate killed 20 m away gives a rough danger spot; the bot's own death an exact one, kept after respawning.
- [x] An aggressive bot near the death chases the killer.
- [x] Soaks pass.

## Comments

- `Bot.dangers` lists the spots a bot keeps in mind, for tests and debugging.
- A killer's own death clears their spot.
- Whether a bot trades or watches follows its aggression here; ticket 03 hands that call to caution.
- Free-for-all has no teammates, so only a bot's own death marks a spot there.
- **Shipped with 03.** On its own, this ticket tipped the Switchyard Charge soak: the attackers won all seven rounds, so rounds didn't go both ways. Ticket 03's caution and hurry give the defenders back their holds, and the soak passes with both, so they shipped together in v2.27.0.
