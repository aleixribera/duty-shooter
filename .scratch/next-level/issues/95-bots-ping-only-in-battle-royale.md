# Bots ping only in Battle Royale

Status: resolved
Release: v2.187.48

Spec: `../spec.md`

Aleix's complaint, 2026-11-13 (`PLAN.md` item 0): a bot that spots an enemy pings it for its side in every mode, which fills the feed with "<bot>: Enemy spotted" and puts markers in the world in Bot Match and Play Online. Keep bot pings, and bots heeding pings, in Battle Royale; turn bot pings off everywhere else. People's own pings stay in every mode.

Acceptance: a Bot Match and a Play Online TDM with bots run several minutes with no bot ping in the feed or the world, a test holding that, and a local Battle Royale where a bot squadmate still pings an enemy.

## Comments

**2026-11-13, loop pass 3.** The server (`net/server.ts`, `#thinkBots`) now sends a bot's ping only when the match has Squads (`#squads`, a Battle Royale). Bot Match and Play Online run the same server, so one gate covers both. A bot still decides on its ping everywhere (it is cheap and keeps `bot.ts` mode-blind), and bots in every mode still heed the pings people make: only what bots say is cut.

Check:
- `test/pings.test.ts`, "from a bot only in a Battle Royale": a TDM with a person and six bots for 20 s gives the person no bot ping (it failed before the fix, with bot "enemy" pings), and a Battle Royale of Squads of two for 90 s gives the person their bot squadmate's pings.
- In the running game (`../bot-pings/look.mjs`, a Survival Town TDM Bot Match, Mixed teams): before the fix, 60 s showed 11 "Enemy spotted" lines and up to 2 enemy marks (`../bot-pings/before/`); after it, 180 s showed none (`../bot-pings/after/`).
- The local Battle Royale is held by the test above rather than a browser run on Zero Island: the server code is the same, and loading the island takes this shared PC a minute and several GB.
