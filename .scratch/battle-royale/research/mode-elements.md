# What makes a Battle Royale work, and what fits ours

For tickets 64-71. Researched 2026-11-03. Sources are listed at the end and cited as [n]. Our decisions are taken from `spec.md` (as of 2026-11-03, including the owner's Reboot and Supply Drop changes).

## The default answer, and why ours differs

Most people would copy the Warzone or Apex kit: loot tiers, armor plates, cash and buy stations, UAVs, contracts, a Gulag, a plane and parachutes, and later a battle pass. That kit exists to solve **100 strangers, 20-30 minute matches, and keeping people coming back for months**. Our situation is different:

- **2-3 friends and 57 bots.** Communication is mostly with *bots*. So pings matter more here than in Apex, because voice chat can't reach a bot. Anything that needs human opponents to be interesting (bounties on players, ranked play) has nothing to work on.
- **10 minutes, with no loot.** There is no early game to fill. Every system has to speed up the first fight, or create a reason to move, within that time.
- **One home server at €0.** Anything per projectile or per seat must be cheap, and bots must understand every rule we add.
- **Friends only.** People come back because the match itself is good and they can tell stories about it, not because of progression.

## Each element, judged

| Element | Why it works (evidence) | Fit with our decisions | Rank | Ticket |
|---|---|---|---|---|
| **Pings and markers** | Respawn tested squads with mics muted and random names for about a month, so pings had to carry all communication [1]. Other studios asked for the same thing [2]. | Fits. For us it is the *only* way a person can talk to bot squadmates. | A | 66 |
| **Visible tracers** | Players need to read where shots are coming from. Ocio Barriales uses deliberately visible misses (tracers past the face, sparks on cover) so players feel under fire [3]. | Fits. It also lets bots' misses do the bot nerf in plain view (bots.md change 1). | A | 65 |
| **Mantling** | Standard in Apex and Warzone. Cover is only usable if you can climb over it. No primary source found on why it works. | Fits. The cover pass added low walls and rocks. Bots need mantle links. | A | 67 |
| **Ring preview, damage rising each Stage, moving final ring** | Apex keeps tuning Ring 1 size, warning time and damage per Stage to set the pace of rotations [4][5]. A known next circle is what turns a rotation into a plan. | Fits. The spec already shows the next circle and raises damage. A moving final ring matches story 33. | A | 68 |
| **Kill feed, Kill Leader, Champion, "Squad wiped", victory beat** | Apex's launch pitch was "you come in with a plan but you leave with a story", with a Champion squad named before the drop [6][7]. | Fits. The nuke ending is already our champion moment. | A | 69 |
| **Reboot Cards and Beacons** | Fortnite: the Card lasts 90 s, the van takes 10 s and then cools down for 120 s, vans sit at major places, and there are none in Solos [8]. The idea came from Apex's banners [9]. Raven built the Gulag because being out early is a "pain point" [10]. | It conflicted with *one life*, and the **owner has now accepted it** for Duos and Trios. | A (decided) | 70 |
| **Supply Drops** | A known, timed event pulls squads to the same place. Warzone's Loadout Drop is the top buy-station priority [11]. | It conflicted with *no items*, and the **owner has now accepted it**: the only sniper comes from drops. | A (decided) | 71 |
| **Sound as information: distant fights, sound traps** | Hunt: Showdown built its design on gunshots being audible across the whole map, plus dogs and crows that give away whoever passes [12][13]. | Fits. Clients already receive shots up to 400 m (`net/relevance.ts:36`). Bots hear only 40 m today (bots.md change 2). | **A, new** | none |
| **Death recap and end-of-match summary** | No primary BR source found. Counter-Strike and L4D both lean on readable cause and effect [14]. | Fits "no stats that persist", because it covers this match only. | **A, new** | none |
| **Choosing a Region to start in** | Apex's jumpmaster and Fortnite's bus let a squad choose its plan [6]. | **Conflicts** with *random ground spawn, no drop zone choice* (Out of Scope). | B | none |
| **Second chance in Solos** (a short duel, Gulag-style) | Infinity Ward: "putting that power in the player's hands", and fair because the arena is symmetric [10]. | **Conflicts** with *one life*, which Solos keeps. | B | none |
| **Match history kept on the device** (personal bests, last 10 placements, in localStorage) | It works because friends talk about the match afterwards. The genre's retention evidence is about progression, which we don't have. | **Conflicts** with *no stats that persist* (Out of Scope). No accounts needed. | B | none |
| **Loot, armor, cash, buy stations** | Gives the long early game something to do [11]. | Conflicts with *no loot, no armour* (owner reconfirmed). We have no long early game to fill, and it is costly for bots. | C | none |
| **UAV or scan** | Warzone's Recon contracts reveal the next circle; its UAVs show nearby players [11]. | Our next circle is always shown. A scan against mostly bots mainly helps a person sit still. Needs items. | C | none |
| **Contracts and bounties** | They give a reason to move and to start fights [10][11]. | They need an economy. Heat and supply drops already do this job. | C | none |
| **Storm Surge** (damage to passive players) | Fortnite turns it on when too many are alive, for server load and to force aggression [15]. | Heat does this for bots. Against people it would punish the one friend who hides in a bush. | C | none |
| **Resurgence** (timed respawns while a mate lives) | Warzone's fastest mode, on a small island [16]. | It would replace Reboot, which the owner just chose. | C | none |
| **Vehicles, plane, battle pass, ranked, skill-based matchmaking** | They solve problems of scale and keeping strangers coming back. | Out of Scope, and pointless at 2-3 humans. | C | none |

## A-list: what's covered and what isn't

Covered by open tickets: tracers (65), pings (66), mantling (67), the Ring preview, damage per Stage and moving final ring (68), big moments (69), Reboot (70), supply drops (71). Two A items have no ticket yet:

**Ticket: hearing the island.** Make distant fights readable by ear, and give bots the same ears. (1) Gunfire beyond about 60 m has its own distant voice for each weapon: a dull thump with a long echo for a far rifle, a sharp crack overhead for a supersonic round going past. Its level follows the 400 m hearing range clients already have, so a player can judge "fight to the north-east, about 200 m". (2) Add two or three cheap **sound traps** per Region, using the island's foliage and props: birds flushing out of Jungle canopy and Peaks pines when someone sprints within about 8 m, rattling sheet metal in the Dustlands shacks, loose gravel in the crater. Each one plays at the spot and is sent as a world event, so people and bots (via `#hear`) both learn someone passed by. (3) Spoken announcer lines on Ring events and squads left: "Ring closing", "5 squads left". Keep each trap to one pooled sound with no physics. Check it at dusk in a full 59-bot match, with the frame time and the server tick from before and after. It is independent of ticket 64's bot hearing change but should land alongside it.

**Ticket: the death recap and the match card.** When you're Downed, Finished or out, the spectator panel shows who did it: their weapon, the distance, the damage each of you dealt to the other, and their health left. On the island map it marks where they stood. At match end, before the Battle Royale screen, each person gets one card: placement, eliminations, Downs, Revives and Reboots, damage, time alive, and their route across the island map, with where they fought and where they fell. The data comes from events the server already sends, nothing is stored after the match, and it follows `DESIGN.md`. Check it at desktop and phone width. It gives friends something to talk about in the 20 s before the next Start, the only retention we can earn without persistence.

## B-list: worth offering the owner

1. **Pick the starting Region during Preparation.** The squad leader taps a Region on the island map during Preparation. The spawn stays random within it, with the 100 m spacing. Bots spread across the rest. It conflicts with "random spawn, no drop choice". It's worth offering because friends could plan a match ("let's play the Jungle") at no cost to the server.
2. **A Solos second chance before Stage 3.** Your first death sends you to a short duel against another seat that died early. The winner respawns at a random safe spot. It conflicts with one life in Solos. Reboot now gives Squads a way back, and Solos would otherwise be the only harsh mode.
3. **Match history on the device.** It conflicts with "no stats that persist". It's cheap and private, and gives "beat my best placement" without accounts.

## Sources

1. Game Developer, "Respawn played with muted mics to get Apex Legends' smart comms system just right": https://gamedeveloper.com/design/respawn-played-with-muted-mics-to-get-i-apex-legends-i-smart-comms-system-just-right
2. Dexerto, Jeff Kaplan on Apex's ping system: https://www.dexerto.com/overwatch/jeff-kaplan-explains-overwatch-doesnt-have-ping-system-like-apex-legends-371493
3. Ocio Barriales, "Using Your Combat AI Accuracy to Balance Difficulty", Game AI Pro 3 ch. 33: http://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter33_Using_Your_Combat_AI_Accuracy_to_Balance_Difficulty.pdf
4. Apex Legends Season 2 patch notes (EA forums): https://forums.ea.com/blog/apex-legends-game-info-hub-en/apex-legends-season-2-patch-notes---722019/9458102
5. Apex Season 18 Ring changes (warning time, damage per Stage), reported: https://esports.gg/news/apex-legends/apex-ring-changes-explained-more-damage-faster-games
6. EA press release, Apex Legends launch: https://ir.ea.com/press-releases/press-release-details/2019/Respawn-Launches-Apex-Legends-a-Free-to-Play-Battle-Royale-Experience-Available-Now-on-PC-PS4-and-Xbox-One/default.aspx
7. TechSpot, Apex first impressions (jumpmaster, champion): https://www.techspot.com/news/78647-first-impressions-apex-legends-adds-good-twists-battle.html
8. Fortnite v8.30 patch notes (Reboot Van): https://www.fortnite.com/patch-notes/v8-30
9. Apex Respawn Beacon (reference wiki): https://apexlegends.wiki.gg/wiki/Respawn_Beacon
10. Engadget, Infinity Ward and Raven on the Gulag and Warzone: https://www.engadget.com/call-of-duty-warzone-gulag-battle-royale-infinity-ward-raven-interview-140051484.html
11. Call of Duty strategy guide, contracts and in-game events: https://www.callofduty.com/content/atvi/callofduty/warzone/web/fr_ca/strategyguide/infil-tactics-in-the-warzone/wz-contracts-and-in-game-events.html . Activision blog on contracts: https://blog.activision.com/call-of-duty/2020-07/Call-of-Duty-Warzone-Contracts-Tips-and-Tricks
12. PlayStation Blog, Crytek audio director and lead designer on Hunt: Showdown's sound: https://blog.playstation.com/?p=221483
13. PC Gamer on Hunt's sound traps: https://www.pcgamer.com/lets-hear-it-for-hunt-showdowns-incredible-sound-design
14. Booth, "The AI Systems of Left 4 Dead" (Valve, 2009): https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf
15. Fortnite competitive, Storm Surge update: https://www.fortnite.com/news/fortnite-chapter-3-season-3-competitive-storm-surge-update
16. Warzone Resurgence rules, reported: https://www.charlieintel.com/call-of-duty-warzone/how-to-get-your-teammates-to-respawn-faster-in-warzone-rebirth-island-resurgence-105870/
