# Smarter bots

Status: resolved
Release: v2.201.0

Spec: `../spec.md`; Aleix's request 7 (2026-11-13): "Smarter bots (not faster or more accurate): cover, routes, situation, ammo, players left, weapon (shotgun pushes close cover, sniper holds long lines, SMG flanks)."

Acceptance (rough): in bot-only team deathmatch on three maps (30 minutes of play), bots die while reloading clearly less often than before, an SMG goes round a target that ducked out of sight while long guns hold their angle, and tests hold each behaviour (each fails on the old bot).

## Comments

**2026-11-13, loop pass 30 (pass 1).**

Where the bots stood (read from `packages/fps-core/src/bots/bot.ts`): most of the list was already there. Routes keep out of sight of danger spots; a sniper roams to long sightlines and holds them (`#roam`, `longSightlines`); a shotgun pushes in by the way the target can't see (`push`); a hurt bot breaks off to heal in cover; caution weighs the round, the scoreboard and health. The gaps: going round (`#flanks`) ran only in Battle Royale and by personality, never by gun; an empty gun was reloaded where the bot stood, in the enemy's view; the end of a Battle Royale made bots bolder, not more patient (fewer foes counted as an advantage).

Patterns from well-liked shooters' AI (the patterns, not their content):
- F.E.A.R. (Jeff Orkin, "Three States and a Plan", GDC 2006): soldiers flank a player who hides and reload behind cover, calling it out; the impression of smarts comes from these few readable moves, not from aim.
- Halo 2 (Damian Isla, "Handling Complexity in the Halo 2 AI", GDC 2005): self-preservation: enemies break off to cover when vulnerable (shields down) and come back when ready.
- Killzone (Remco Straatman et al., "Killzone's AI: dynamic procedural combat tactics", 2005): a position is weighed by its lines of fire to the threat; each weapon's preferred distance picks which positions are good.

What changed:
- **Going round, by gun, in every mode.** A bot that lost sight of its target may now flank in Bot Match and Play Online too, not only in Battle Royale. How readily is its boldness times a per-gun lean (`TACTICS[...].flank`): SMG 1.6, pistol and revolver 1, M4A1 and Trident 0.8, and none for the shotgun (it pushes straight in by the hidden way), LMG, Vantage and sniper (they hold the angle they have). Flankers always go with a gun that goes at all. Never on the way to plant or defuse, and a bot sent to a zone goes round only as far as it would chase a noise from it (`OBJECTIVE_LEASH`; without this Station Nine's Outposts soak saw one team never take a zone).
- **Reloading in cover.** Down to the last tenth of the magazine (none left for a small one) in a fight beyond 10 m, a bot reloads on its way to cover out of the enemy's sight (a reload carries on through a sprint), comes back out once there and loaded, and doesn't go again for 2 s. Shot on the way, it stays to heal as well. Within 10 m the pistol comes out as before.
- **Topping up.** Out of a fight a bot reloads below 40 % of its magazine (or its old fixed threshold, whichever is higher), so the next fight doesn't find it short.
- **Players left.** In a Battle Royale with 8 or fewer others alive, a bot plays more carefully (caution +0.15): the end game rewards waiting for the other to move.

Measured (`.scratch/next-level/bots-smarter/measure.soak.test.ts`, copied into `apps/range/test/` to run; bot-only TDM 6 a side, 10 minutes each on Switchyard, Survival Town and Station Nine; `before.txt`, `after.txt`):

| | before | after |
| --- | --- | --- |
| deaths while reloading | 81 of 956 (8.5 %) | 50 of 928 (5.4 %) |
| damage taken per reload | 17.5 | 10.7 |
| SMG flanks per minute alive | 0 | 3.2 |
| sniper, LMG, shotgun flanks | 0 | 0 |

The "exposed" column (an enemy with a line of sight when a reload starts) barely moves (50 % to 53 %), as designed: the reload starts at once, on the way to cover. Kills per weapon move within the run-to-run noise (one 30-minute run each; a shotgun went 98/90 then 73-83/90-104 with flanking on or off, so that swing is noise, not this change).

Tests (each fails on the old bot): `bots-awareness.test.ts` "losing a target, a flanker goes round to it with the SMG, and holds its angle with the sniper rifle" and "shot dry at range, reloads on its way to cover out of the enemy's sight, and fights on once loaded" (3 rounds of 30 left, 15 m off; it comes back out loaded from where the enemy can't see it).

Second opinion (one read-only reviewer): flanks ignored the zone leash (fixed, above); a bot hit on its way to reload cover walked back out hurt (fixed: it stays to heal); the reload test used an empty magazine, which skipped the threshold (now 3 rounds).

Left for later (BACKLOG): fighting from cover mid-fight (`#takeStand`) still needs the cover data only Zero Island's nav has; the small maps would need cover spots baked into their nav. LMG bots almost never reload in a match (0-1 in 30 minutes; a probe shows the reload itself works), worth a look.
