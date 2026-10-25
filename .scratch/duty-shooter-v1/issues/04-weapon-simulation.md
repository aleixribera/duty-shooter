# 04 Weapon simulation in fps-core

Status: ready-for-agent
Milestone: 2 (weapon simulation, viewmodel and the range, offline)
Blocked by: 03

## What to build

Stock M4A1 in `fps-core` (spec "Simulation", stories 17-32 minus presentation, 77-78): weapon state machine (idle, firing, ADS in/out, sprint-to-fire and tac-sprint-to-fire, reload tactical vs empty with add-ammo point and cancel rules, inspect, draw, melee), fire rate using sub-tick fire timestamps, hipfire spread growing with movement and airborne, ADS with no spread beyond recoil, deterministic recoil pattern per shot index (affects view angles), projectiles with muzzle velocity and gravity drop, player hitboxes with MW2019 hit zones and M4A1 multipliers, damage by range band, health regen after delay, flinch on the victim's view, melee lunge and damage. Static dummies (player-like targets with hitboxes) usable in the harness. All numbers from the stats file.

## Acceptance criteria

- [ ] Headless tests: fire rate, damage by range and hit zone, TTK at 10/25/50 m, ADS time, sprint-to-fire, tactical vs empty reload timing and add-ammo point, reload-cancel rules, hipfire spread bounds, recoil pattern repeats exactly, projectile travel time and drop at range, melee lunge and damage, flinch magnitude, health regen delay.
- [ ] Only match outputs asserted. Determinism holds.
