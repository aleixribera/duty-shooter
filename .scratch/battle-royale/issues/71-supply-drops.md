# Supply Drops carry the only sniper

Status: resolved
Release: v2.126.0
Blocked by: none
Labels: enhancement

Owner: supply drops "which will contain the sniper, and block it from being picked from the start, and tell the player where he can get it." Spec: Match rules, "Supply Drops".

The Ridgeline .308 leaves the Battle Royale loadout picker (other modes keep it); the Preparation says where it comes from ("Sniper: Supply Drops only"). Lead's numbers (tune, write in Comments): one crate at the start of Stages 2, 3 and 4, landing inside the next Ring, announced 20 s ahead on the HUD and island map with a red flare column visible across the island; a crate falls under a parachute (Blender model) and opens with a 2 s hold; it gives one sniper that replaces your primary (your old primary drops so a squadmate can take it) with 3 reserve magazines (snipers are the exception to unlimited reserve). Bots weigh contesting a drop against the Ring. Pings (66) can mark it.

## Comments

- Numbers (stats.ts `royale.supplyDrop`): Stages 2-4 as the lead said; announced 20 s ahead, falls 14 s, 2 s hold within 2.2 m, 3 spare magazines (5 + 15 rounds), lands within 70% of the next circle's radius, a loose weapon is taken within 1.5 m. Kept the lead's numbers: the pace runs show the crates are contested, not ignored.
- The sniper leaves only the Battle Royale picker (`royaleLoadout`); bots in Battle Royale reroll it (`profile.ts`). Reloads are bounded by `reserve`; other weapons stay unlimited and the HUD shows `/ ∞`, the sniper `/ 15` (red at 0); a bot out of reserve switches to its pistol.
- Bots: no director. Each bot weighs a crate it heard announced on its own (75% go, 20% if careful, not when the crate lands under 25 s before the Ring closes, not past 30 m beyond its route, 1.5x for a Squad that's already headed there) and goes there through its squad plan's rally; at the crate it opens it like a person (same `use` hold).
- The fallen drop the sniper (if it has rounds left) as a Loose weapon; at most 16 lie on the island.
- Protocol 19: drops and loose weapons ride the sticky `match` objective, resent only on 'drop' and 'loose' events (both in the server's resend set). No new codec words (the table is full).
- Model: `tools/weapon/supply_drop.py` (crate, lid on a hinge, parachute, flare) baked through the gunsmith pipeline at WORLD_SCALE 18; 2910 tris, 797 KB. Materials are converted to node materials at load so the island's probe light reaches them (plain glTF materials rendered black). The flare's smoke fades out within 8-30 m so it doesn't fill your view at the crate.
- Seen in a real Duos match (server + headless Chrome, `.scratch/battle-royale/t71/play.mjs`): nobody starts with the sniper; the announcement names the cell and the seconds; the compass and island map mark the crate with its distance and countdown; the crate falls under its canopy with the red column; "Hold F  Open Supply Drop" at the crate. In the first run I opened it, held the sniper with `/ 15` and my M4A1 lay beside the crate; in the last run a bot (Moss), 4 m away when it landed, beat me to it and the feed said "Moss took the sniper from the Supply Drop in I10". Bots reaching the second crate is chance: one run a bot opened it, another nobody came within 2 min.
- Measures (60 seats, all bots, `ROYALE_PACE=2:1,2:2,3:1`): match 528/498 s (Duos), 298 s (Trios), unchanged from before; 3/3/2 crates announced and landed, 2/2/1 opened by bots, at about 160 s and 365 s. Server tick mean 0.65-0.83 ms, p99 1.9-2.5 ms. Local bots worker (`WORKER_TICK=1`, local-royale.test): tick mean 1.06-1.28 ms, p99 2.5-3.1 ms. People vs bots: in pace runs every seat is a bot; in the play runs a person opened 1, bots 2.
- Left for later: the crate isn't a Solid (you walk through it); "Opening Supply Drop" has no progress bar; the design-audit skill (it spawns reviewer subagents, which this run may not use) wasn't run, only the desktop and phone screenshots were checked; on the phone the drop toast shows through the open island map; pings (66) don't mark crates yet.
