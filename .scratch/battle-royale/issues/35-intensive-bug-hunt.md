# Intensive bug hunt across the whole game

Status: resolved
Release: v2.114.8
Blocked by: 34

Owner request: "there are a lot of bugs, from UI to recoil and many more, fix them and run intensive bug checks", after playing one Battle Royale match. The owner's own list goes in Comments when it arrives, and each of those items has to be reproduced and fixed.

Hunt systematically and file every finding as its own ticket here (`36-...` onward), with evidence, then fix them in order of severity:
- **Long play:** full Battle Royale matches online and with two human browsers at every Squad size, played to the end with real input, plus every normal mode on every map. Fail on any page error, warning flood, stuck state, desync or frame spike.
- **Invariants checked every tick in those runs:** view pitch and yaw reachable across their full range, health and ammo within bounds, no seat stuck Downed or alive outside the rules, the HUD matches the server state, sounds stop when they should.
- **UI:** every screen and every transition, keyboard, mouse and gamepad, desktop and phone width, back and escape at every step, reconnect and server-down states, long names, many players.
- **Edge cases:** leaving and rejoining mid-match, host leaving, tab hidden and back, alt-tab with pointer lock, window resize, slow and lossy network (`chaos.mjs`, `bad-link.mjs`), two matches in a row without a reload.
- **Known leftovers:** the late arrival's HUD says "You're out", the winner text reads "Ada, Mate wins", the Ring's glow sits at sea level, bots revive rarely, and the Bottom bars overlap at 390 px.

Report a table of everything found, its severity and its state.

## Comments

- From ticket 13 (high priority, affects playing with friends): players arriving through Tailscale Funnel may all look like one address inside Docker, so they would share the 12-sockets-per-address limit and the failed-join lockout. Check what address the server really sees for two outside clients, and fix it (trusted forwarded header from the proxy only, or a limit that suits a shared address).
- `docs/deploy.md` Funnel section still says port 443; the game is on 10000.

**Hunt pass 1 (findings filed, nothing fixed yet).** Scripts in `.scratch/battle-royale/bugs/` (`driver.mjs` holds headless muted Chromes behind HTTP, `lib.mjs` has a per-frame watcher for health, ammo, NaN, pitch, Downed time, alive-after-out and frame spikes; gamepads hidden). Screenshots in `.scratch/battle-royale/shots/bugs/`.

Filed:
- S2: 36 Funnel visitors share one address (confirmed: 12 sockets from this PC made the homelab get 429; the container sees every peer as 172.28.0.1), 37 empty Battle Royale HUD boxes in every other mode, 38 server-down lobby still says host with Start enabled, 39 "DRAW" after a noHumans Battle Royale, 40 bots revive 8% of Downs, 41 Bottom bars overlap at 390 px.
- S3: 42 "Ada, Mate wins", 43 late arrival's "You're out", 44 Ring glow at sea level, 45 ping overlaps Alive at 390 px, 46 health and ammo stay up when out, 47 "Esc Leave" opens the pause menu, 48 eliminated player offered "Join the match", 49 long names push the phone lobby sideways, 50 objective marker over Health, 51 phone lobby puts Your Squad below the fold.

Clean: recoil after 50 s of fire reaches -85 and +85; `bad-link.mjs` and `chaos.mjs` (9 cuts) no closes; every mode on Survival Town and Switchyard with bots; hidden tab drops after 20 s (IDLE_TIMEOUT, by design) and resumes; host leaving passes host; two matches in a row; no page errors or warnings; watcher found no invariant breaks; live page loads on a phone (nothing played live).

Not tested: gamepad, a Battle Royale played to a winning squad by people, Trios with two humans, the Crash map (being edited elsewhere), Practice Range, real pointer lock and alt-tab, Battle Royale under chaos/bad-link (those scripts only drive Play Online), audible sound, integrated graphics.

**Hunt pass 2 (36-51 were all resolved before it).** Same harness, extended: a gamepad stub (`open(..., {pad})`, `pad`), a pointer-lock stub that loses the lock on blur (`{lock}`), `hide`/`show` to put another tab in front, and `h2/serve.ts`, the real server with a control port that places seats and sets health so people can be brought to a win. `bad-link.mjs` (`MODE=battle-royale`, `SQUADS`, `STATIC_DIR`) and `chaos.mjs` (`CHAOS_MODE=royale`) now drive a Battle Royale. Shots in `shots/bugs/t56`-`t61` and `shots/bugs/p2-*`.

| # | Sev | Finding | State |
|---|---|---|---|
| 56 | S2 | Pause menu buttons light grey under white text since ticket 12 | resolved v2.114.5 |
| 57 | S2 | A page that runs no frame through the Preparation never says `loaded`, so its stand-in plays the whole match (coordinator) | resolved v2.114.2 |
| 58 | S2 | Someone out could watch an enemy while their Squad fought (ghosting) (coordinator) | resolved v2.114.1 |
| 59 | S3 | After the Preparation the loadout screen said "Applies from your next spawn", and the pick was dropped (coordinator) | resolved v2.114.4 |
| 60 | S3 | Ally sight lines kept across matches (coordinator) | resolved v2.114.3 |
| 61 | S2 | Losing the graphics device froze the game without a word | resolved v2.114.6 |

Clean:
- Gamepad: menus, lobby, Start, both sticks (pitch reaches ±85), triggers, buttons, Options to pause.
- Practice Range.
- Alt-tab and lost pointer lock: the menu opens, held keys are released, Resume takes the pointer again.
- Battle Royales played to the end. People won a Duos match: "YOU WIN 1st/2 Squads" for both, "ADA AND BEA WIN" for the one watching. A full online Duos with two people ended noHumans at 402 s, "5th of 30". A full Local bots Trios survived a 60 s alt-tab. The watcher found no invariant broken and no page errors or warnings in any of them.
- Edge cases: Revive during Grace (back at 50 HP); a squadmate Downed while watched; two matches in a row; a tab hidden through the Preparation (dropped at 20 s, then took its seat back); no Ready and no pick (dropped with the default loadout).
- Under a bad link: `bad-link` Battle Royale (mobile, narrow, stalling; 4 clients, 60 s) had no closes. `chaos` Battle Royale (9 cuts) kept all 9, back in a median of 128 ms, at most 3.1 s.
- Ally tags at 390 px portrait and 844 px landscape.
- No audio errors in the console.

Design notes, not filed:
- Leaving on purpose in the Preparation hands the seat to a bot under the person's name, and rejoining then only offers "Watch the match".
- The pause screen's Controls list shows "Island map" (M) in modes without one.
- A page back after the Preparation (57) lands on the lobby view, one "Join the match" press from its seat.
- 58 narrows ticket 32: while your Squad fights, next/previous step only through it.
- Not reproduced, worth a look with a real pad: after Back, the first D-pad press seemed to do nothing until the menu had focus again.
- Dev only: the nav plugin rebuilds `nav/zero-island.nav` on every request (60-70 s per page load).
- Full suite on the home server after pass 2: 146 files, 1482 tests passed.
