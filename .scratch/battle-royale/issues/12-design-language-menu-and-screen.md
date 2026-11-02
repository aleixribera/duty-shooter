# New design language, main menu, Battle Royale screen

Status: resolved
Release: v2.107.0
Blocked by: 07

Spec: `../spec.md`

Spec: UI redesign, Main menu and Battle Royale screen. Rewrite `DESIGN.md` with the design skills, add theme tokens, redesign the main menu, build the Battle Royale screen with Server / Local bots, Squad picker and slots. Update `AGENTS.md`'s menu rule.

## Comments

- Direction: "a machined instrument over a live map". `DESIGN.md` rewritten (five type sizes, motion tokens, destination list, readouts strip, squad slot, connection line); `theme.ts` holds the tokens. Lobby, settings and pause keep their look until tickets 23/24; the pause screen still uses `.ds-item`.
- Main menu: destinations in display type with one-line readouts; the Zero Island button is gone (`?explore=zero-island` stays). The entrance stagger plays once per page load.
- Battle Royale screen: Play on (Server; Local bots disabled with "Coming soon" until ticket 15's worker), Solos/Duos/Trios, your Squad's slots (bot seats dashed), other Squads with Join, Start a new Squad, island picture and readouts, one-line server state, Start. It replaces the lobby page for any Battle Royale lobby.
- Decision: the Squad size picked before joining is applied only when joining opens the lobby (empty server, nothing under way): the joiner becomes host and the page sends it once. Otherwise the host's size stands and the seg is read-only.
- Decision: the server holds Zero Island beside the team maps when its nav is built and bots are on; `/status` gains `royale` so the screen can say plainly when a server has no island. The team lobby's map list doesn't offer it.
- Decision: a late arrival joins to watch ("Watch the match") and plays the next one; seated players see "Join the match".
- Measured: host into the lobby 4.9 s (island built on the main thread, shown as a step), friend 2.5 s; Start to playing about 1 s; 60 seats, host + friend + 1 bot in one Trio, 58 bots. perf.mjs: menu steps painted in 8-27 ms (Battle Royale 20.1 ms, back 8.3 ms), cold toMenuMs 198 ms, 28 requests, no three.js on first load; play p95 4.8 ms.
- Server memory (Windows working set): 106 MB without the island, 214 MB idle with it, about 317 MB during a 60-seat match. The live container's limit is 512 MB; ticket 13's own process should watch this.
- Known, not fixed here: after a Battle Royale ends with nobody left, `/status` keeps `lobbyMode: battle-royale` until the next join resets it, so the Play Online tile can briefly read "Battle Royale on Zero Island". A late arrival's spectating HUD says "You're out / your squad fights on" (HUD, ticket 24). No warm-up on this server (ticket 13). Key-hint caps are 11px in the shared theme (ticket 23).
- design-audit (contrast/size): fixed the menu's Name label (now full ink with a shadow) and "Coming soon" (12px). The phone Duos/Trios fails were the sticky footer covering them in the capture, not the colours. Shots in `.scratch/battle-royale/shots/ui/`.
