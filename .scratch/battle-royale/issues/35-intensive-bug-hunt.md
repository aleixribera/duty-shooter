# Intensive bug hunt across the whole game

Status: open
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
