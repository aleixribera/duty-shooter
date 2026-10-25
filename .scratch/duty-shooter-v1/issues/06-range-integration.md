# 06 Firing range playable offline

Status: ready-for-agent
Milestone: 2 (weapon simulation, viewmodel and the range, offline)
Blocked by: 04, 05

## What to build

Wire the weapon simulation to the client: viewmodel fed by the core's weapon state, firing, ADS with the iron-sight zoom/FOV change, MW2019 affected/independent ADS FOV and ADS sensitivity multiplier (18, 61), hold/toggle ADS (59), recoil applied to the view, flinch. Range lanes at 10/25/50 m with static dummies that have MW2019 hit zones and reset after being killed (83), and dummies on rails at walk and sprint speed (84). Minimal temporary feedback (ammo text, a basic crosshair) is fine; the proper HUD is ticket 09.

## Acceptance criteria

- [ ] Playtester agent: range loads; shooting, ADS, tactical and empty reloads, inspect, melee and draw on spawn all work; dummies take damage, die and reset; moving dummies move.
- [ ] Headless test: a dummy at 25 m dies in the stats-file TTK when scripted fire hits its upper torso.
