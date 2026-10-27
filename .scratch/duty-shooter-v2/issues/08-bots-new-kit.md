# 08 Bots with the new kit

Status: resolved
Release: v1.4.8
Blocked by: 06

Per-personality loadout weights, preferred range per weapon, pistol switch when dry <10 m, sniper holds long-sightline nodes and scopes only when stopped, SMG/shotgun push, frag throws (solved arc) and fleeing live frags. Moderate band test unchanged.

## Comments

- Loadouts: each profile draws its primary from its style's weights (rusher SMG/shotgun only; anchor mostly sniper/M4A1; support mostly M4A1), always with the pistol and a frag. The server spawns a bot with its profile's loadout.
- Ranges: a per-weapon tactics table. The M4A1 keeps the profiles' own fight range and ADS distance, so the moderate band test is untouched. The other weapons place the bot's preferred distance inside a band (SMG 5–10 m, shotgun 2.5–5 m, sniper 28–45 m, pistol 6–12 m) by where its profile's fight range sits.
- SMG and shotgun push in with the target in view once it's 2 m beyond their range. The shotgun only fires inside 10 m. Semi, pump and bolt weapons fire one press at a time.
- Pistol switch: with the primary empty and a visible enemy under 10 m, the bot switches instead of reloading, and switches back after 2 s without a fight.
- Sniper: nav nodes now carry their longest sightline (16 rays at eye height). A sniper roams between nodes with a 35 m+ view and holds there 2.5× longer, scoped and facing the lane. It stops to aim, fires only when scoped in (ads ≥ 0.9) and nearly still (< 0.6 m/s), and backs off from someone inside 45% of its range.
- Frags: thrown at an enemy seen in the last 4 s, now out of sight, between 8 and 25 m. The arc is solved by stepping `moveGrenade` over pitches (coarse 4°, then fine), with a 1.2 s cook, and thrown only if it goes off within 3 m of the target. 6 s between throws.
- Fleeing: a live frag within blast radius and in sight sends the bot sprinting to the node within 14 m that is hidden from the blast or out of reach, until it goes off. Fleeing overrides fighting and throwing.
- Tests: `bots-arsenal.test.ts` (loadout spread, shotgun and SMG push, sniper stopped and scoped, pistol switch close versus reload far, solved throw onto a crouched target behind a crate, fleeing a dropped cooked frag), plus a server test that bots spawn with their own loadout.

