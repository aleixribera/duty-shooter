# Bot awareness: bots that read the match like people

Status: resolved

## Problem Statement

Bots see, hear gunfire and chase, but they play every mode and every moment the same way. They don't hear footsteps or a reload. A teammate dying next to them tells them nothing. They forget an enemy who stepped out of sight once they reach the last spot. They don't care whether a death costs them the round. I want them to act on their surroundings, on what they hear, on who just died and where, and on the mode, the way people do.

## Solution

All of this lives in the bot brain (`fps-core/src/bots`), from what a player could know: what they see and hear, the kill feed, the scoreboard (who is alive) and the round clock.

- **Hearing more** (01):
  - Footsteps, by gait: sprinting heard to 20 m, walking to 11 m, a crouch-walk to 4 m, standing still not at all. A landing, slide or mantle is heard to 14 m.
  - An enemy's reload is heard to 15 m.
  - Through walls, each sound carries about half as far and gives only a rough idea of where.
  - A noise behind a bot that isn't fighting turns it to look.
- **Last seen** (01): bots remember how an enemy was moving. Chasing one who slipped out of sight, they go to the corner where the enemy vanished, eyes on it. If nobody is there, they stop and search the way the enemy was heading for a moment before moving on.
- **Pushing a reload** (01): an aggressive bot fighting someone it hears reloading closes in.
- **Teammates' deaths** (02): when a teammate dies, the bot learns roughly where the killer was (the kill feed plus a callout), more roughly the farther away it happened. Its own death works the same way, exactly. That spot is a **danger spot** for a while, and it lasts through a respawn.
  - A bot near the death goes to trade, if it plays aggressively. A cautious one watches the spot.
  - Routes keep out of a danger spot's sight where there is a way round.
  - Moving past one, the bot checks that angle. Holding, it faces the newest danger.
  - Roaming goals near a danger spot are avoided by cautious bots and sought by aggressive ones.
- **Caution, by mode and situation** (03): each tick a bot weighs how carefully to play, from its style:
  - More careful when a death is for the round (Charge), when it is the last of its side, when it is hurt, or when a teammate just died near it.
  - Less careful when its side outnumbers the enemy, or when the clock says hurry.
  - A careful bot:
    - walks instead of sprinting near known enemies it isn't yet fighting (footsteps give it away) and crouch-walks when close;
    - holds the angle where a lost target vanished instead of chasing;
    - stops to hold angles more often.
  - Hurt and losing a fight, it dashes to cover out of the enemy's sight (a few metres at most), reloads and waits for its health to come back, then fights on.
  - The Charge planner says **hurry**:
    - to attackers while the clock runs out with no plant;
    - to defenders once the fuse is nearly out.
  - A hurrying bot sprints and doesn't hold back.

## Testing Decisions

- Core tests in `packages/fps-core/test/bots-awareness.test.ts`:
  - A sprinting enemy behind the bot is heard and looked at; a crouch-walking or still one at the same distance is not.
  - A teammate's death makes the killer's spot a danger spot, rough at range. An aggressive bot near it goes to trade.
  - A target that slips out of sight is chased to where it vanished, then searched for the way it was heading.
  - Losing a target, a careful bot in Charge holds the angle and a rusher in team deathmatch chases.
  - A hurt bot losing a fight goes to cover out of the enemy's sight and stays until healed.
  - A careful bot near a known enemy doesn't sprint.
  - The Charge planner says hurry late in a round.
- The existing bot tests, the soaks on both maps in every mode, the balance runs, and determinism keep passing.

## Out of Scope

- Bots telling people anything (voice or text callouts).
- Difficulty settings.
- Sharing sightings between bots beyond deaths.
