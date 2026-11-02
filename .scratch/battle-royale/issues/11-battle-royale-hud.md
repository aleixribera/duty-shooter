# Ring, compass, island map and spectating

Status: resolved
Release: v2.106.0
Blocked by: 07

Spec: `../spec.md`

Spec: User stories 28-35, 45-48. Ring wall in the world with sound, compass, island map on a key with the next circle, alive count, placement, spectating.

## Comments

Decisions (made unattended, per the implementer rules):
- Ring wall (`fps-client/src/ring-wall.ts`): one open 256-segment cylinder, one draw call, unlit, additive, double-sided, no textures (game-textures: runtime TSL pattern). World-space noise streams, a 7 m diamond lattice with a whole number of cells round the circle (no seam), crackle filaments plus a 6x larger arc layer for distance; fine detail fades by its own screen footprint and by distance (50-220 m), so from 200-400 m it reads as a calm translucent purple wall instead of shimmering. Grazing views thicken it. Foot glow sits at sea level, not the terrain under it.
- Cost: 12 m from the wall on this PC, 550 fps facing the wall vs 267 facing the island; the wall isn't the expensive part of the frame. Not measured on an integrated GPU.
- Ring sound (`ring-sounds.ts`, `audio/ring.ts`): a synthesised hum in 3 s overlapping segments from the nearest point of the wall (heard to 260 m, inside or out), crackles along it within 90 m, and a rising two-tone cue plus a "The Ring is closing." toast when a Stage starts to shrink.
- New token `--ds-hazard` `#a68cff` (7.2:1 on ink) for the Ring only; DESIGN.md says so. Map canvas reads its colours from the theme variables.
- Compass: 150 degree strip, ticks every 15, eight named points, heading readout, markers for the way to safety (when outside) and mates. Ring line under it: Stage n/6, countdown or "Ring closing", and the map key.
- Island map: M (pad Share) toggles it, nothing pauses. Painted once off the terrain the client already has (hillshade from the NW), lettered 100 m grid, hazard tint outside the wall, next circle dashed, places from the map data (`places`), mates and you. On a phone the aside goes under the map.
- Out: a panel for 6 s (placement big once your Squad is out, else "You're out / Your Squad fights on"), then only the watch bar (place, who you watch, Esc, M). End screen in a Battle Royale leads with Place n / N Squads and Kills; no "You died" over it.
- Spectating (`spectate.ts`, shared with Charge): standing mates, Downed mates, your killer, anyone standing, anyone; late joiners get anyone. `Spectator.candidates()` is the list ticket 32 can cycle through with next/prev. Relevance still measures a dead seat from its own seat, so a far killer may be culled; left to 32.
- No loadout prompt while you're out of a Battle Royale.
- design-audit done by hand (rules forbid subagents): fixed red "You're out" over bright sky (now on a glass plate), phone kill feed covering the ammo (newest three only), grid A/1 colliding, map scrim letting the HUD through, no hint for the map key while alive (added to the Ring line).

Verified: real server + 58 bots + browser seat (Ada) + a second person (Mate) in her Squad, `TIME_LIMIT=300`, through all six Stages: shots near/far inside (12/180/420 m) and outside (15/140/350 m), the closing toast, outside warning, map on desktop and phone, out at Stage 4 to the Ring, spectating Mate, and the end (1st of 30 Squads). No page errors. Script: `.scratch/battle-royale/hud/play.mjs`, shots `.scratch/battle-royale/shots/hud/`.

