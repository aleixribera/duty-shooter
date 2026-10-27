# 07 The loadout screen and the range additions

Status: resolved
Release: v1.4.7
Blocked by: 03, 04, 05, 06

Loadout screen (pause menu + death screen, pad-driven, stat bars, stored locally), range loadout station, 100 m sniping lane (25/50/75/100 m), dummies report damage per hit.

## Comments
- The loadout screen (`#renderLoadout` in `ui/menu.ts`) opens from the pause menu, from the death screen (Use while dead: "F  Loadout", or the pad's L1), and at the range's loadout station. Primary, secondary and grenade are rows of tiles a pad walks with up and down; the card under them shows the focused weapon's role and four bars (rate of fire, damage, range, handling) from `weaponCard` in `ui/model.ts`, each with its figure. A choice is saved at once with the settings (`Settings.loadout`, validated by `parseLoadout`, the M4A1, pistol and frag by default).
- Decision: the bars are against the rest of the arsenal: rate of fire against the fastest gun; damage as a share of a full health bar per shot (all pellets for the shotgun); range as how far the damage stays within three quarters of its close value, capped by how far a shotgun's aimed pattern stays on a torso, shown up to 100 m; handling as ADS plus sprint-to-fire against the quickest.
- Online and in a Bot Match the loadout goes in the join and a change is sent as a `loadout` message, applying from the next spawn. Decision: offline (the range, Explore) a change applies at once while alive (`Simulation.equip` re-arms in place), since there is no one to be fair to; the screen says which.
- The range: a loadout station (a rack table) just behind the firing line, and a 100 m sniping lane on the grass strip behind the backstop, from a bench at its west end, with targets at 25, 50, 75 and 100 m staggered across the lane so each is in clear view, each in front of a board showing its distance, and an earth bank behind. A sign by the firing line points the way. The map test fires a sniper round and an M4A1 round at each target from the bench.
- Dummies report each hit: the damage rises from where it landed, with the distance (and pellets for the shotgun), and the overlay's last hit names the zone and distance. The TTK readout now times gunfire only (a frag kill no longer reads as a 4 ms engagement) and uses each weapon's muzzle velocity.
- Found and fixed while checking the lane: the scope's sway moved the round but not the view, so a scoped shot at range landed off the reticle. The camera now drifts with the sway.
