# 02 Weapon definitions and loadouts in the core

Status: resolved
Release: v1.4.1
Blocked by: 01

Stats `weapons` table keyed by id (M4A1 row = existing values), per-slot weapon state, switching (holster/draw), SwitchWeapon/Grenade/Use buttons, loadout on PlayerSpawn and join, `loadout` client message, outputs gain weapon id + grenades, kill events gain weapon. M4A1 behaviour unchanged.

## Comments

- The weapons table lives in `packages/fps-core/src/stats/weapons.ts` (the four new rows, with the time-to-kill targets in its header) and `STATS.weapons` in stats.ts. The M4A1's row reuses the very stat objects of `STATS.weapon`, `STATS.damage` and `STATS.accuracy`, which stay as they were, so the M4A1 can't drift and every existing test passes unchanged.
- The stats test still forbids bare values; the one exception is strings under `STATS.weapons.<id>.traits` (name, role, slot, fire mode, reload kind, sight), which are words, not numbers.
- Decision: the SMG carries 32 rounds (the Uzi family's long box magazine). The Mini Uzi's own 20-round magazine empties in 1.3 s at 950 rpm, less than one fight, so it's marked estimated with that reason rather than sourced.
- Decision: the sniper's scope is 4x, not the M24's fixed 10x: Switchyard's longest lanes are 60-80 m and 10x would make them a keyhole.
- Decision: the M4A1 gains one new number, a 0.35 s holster (estimated). Every weapon has a holster and a draw; a switch is holster then draw, and nothing fires until the draw ends.
- Weapon state per slot: `PlayerState.weapons` (primary, secondary), `slot`, `loadout` and `grenades`. A switch press puts the weapon in hand away (a reload before its add-ammo point is lost, as MW does), the other comes up keeping its own magazine.
- Fire modes: `auto` as before; `semi`, `pump` and `bolt` fire once per press, capped at the row's rate; pump and bolt then `cycle`. Shell reloads load one at a time and stop when fired. Sway, pellets and the per-weapon damage bands are in place for tickets 03-05, which test each weapon.
- Usercmd buttons `SwitchWeapon`, `Grenade` and `Use` (bits 9-11). The join carries `loadout`, and a new `loadout` message changes it; the server applies it at the next spawn. Protocol 7 (the smoke and load-test scripts read it from /healthz, so nothing else changes).
- Outputs gain `weapon.id`, `weapon.slot`, `weapon.sway`, `loadout` and `grenades`; shot, hit and kill events carry the weapon (`frag` for a grenade, null for a fall); a `switch` event marks a switch.
- Movement speed scales with the weapon in hand (`moveSpeed` in each row; the M4A1's is 1, so its speeds are unchanged).
