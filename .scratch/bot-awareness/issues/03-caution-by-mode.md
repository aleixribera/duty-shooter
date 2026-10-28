# 03 Caution by mode and situation: cover to heal, quiet moves, held angles, hurry

Status: resolved
Release: v2.27.0
Blocked by: 02

## What to build

- **Caution** (0 to 1) per tick:
  - It starts from the style's aggression.
  - It goes up for a round mode (`BotView.lives: 'round'`, Charge), for being the last of its side, for being hurt, and for a teammate's death near it.
  - It goes down for outnumbering the enemy (round modes, where the scoreboard tells), and for a planner's `hurry`.
- **What a careful bot does:**
  - It walks instead of sprinting near known enemies it hasn't been fighting in the last 4 s, and crouch-walks within 10 m.
  - Losing a target, it holds that angle instead of chasing.
  - It holds angles more often at the end of a roam.
- **Breaking off to heal:** when hurt and losing (its health under a threshold set by caution, below the enemy's estimated health), it dashes to cover out of the enemy's sight, 6 m away at most. There it reloads, faces the threat and waits for its health to come back. If the enemy shows up, it fights from cover. `activity` reports it as `cover`.
- **Hurry:** `planCharge` sets `hurry` for attackers in the last 25 s with no plant, and for defenders when the fuse has less than the defuse time and 10 s left.

See the spec.

## Acceptance

- [x] Losing a target, a careful bot in Charge holds the angle and a rusher in team deathmatch chases.
- [x] A hurt bot losing a fight goes to cover out of the enemy's sight and stays until healed.
- [x] A careful bot near a known enemy doesn't sprint.
- [x] The Charge planner says hurry late in a round.
- [x] The full suite passes, the balance runs included.

## Comments

Measured on the balance duels, SMG against M4A1 at 15 m, 600 duels each.

- **Cover is a short dash.** Searching 12 m for cover cost the SMG 4 points in its own band: a long run under fire is a shot in the back. Cover is now at most 6 m off.
- **Quiet only before a fight.** Going quietly near any known enemy kept careful bots from ever sprinting in a duel, where the enemy is always known. A bot now goes quietly only if it hasn't seen an enemy in the last 4 s. Once spotted, speed beats silence.
- **Close-range guns push.** A gun whose band ends under 15 m (the SMG, shotgun and pistol) lowers caution by 0.15.
- **Result.** SMG against M4A1 at 15 m came out at 49.8 % over 6,000 duels, against 50.7 % on v2.25.0: within the noise. The shotgun's overall is 41 %. `docs/balance.md` is regenerated.
- **Charge uses all of this.** The server tells bots `lives: 'round'` in Charge, from `canRespawn`.
