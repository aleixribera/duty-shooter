# 06 The frag grenade

Status: resolved
Release: v1.4.6
Blocked by: 02

Core physics (bounce off solids incl. yaw-rotated, rest), 4 s fuse from cook start, in-hand explosion, 150->0 over 7 m with wall blocking per hitbox part, one per life, self damage, no friendly damage, thrower credit after death; grenades in match output/snapshot; model, sounds, HUD indicator, kill feed icon.

## Comments

- Core done (v1.4.5): `combat/grenade.ts` is the physics object (gravity, bounces off anything that blocks bullets or players with 35 % of the speed into the surface kept and 80 % along it, rolling friction, rest); the simulation cooks on the Grenade button, throws on release (17 m/s, 10 degrees above the crosshair, plus the player's own velocity), blows up in the hand when the fuse runs out, and drops the live grenade from a player killed while cooking. Grenades are in the tick outputs and the snapshots; the client's prediction reports the throw but never simulates a grenade (`predictOnly`).
- The blast: damage for the distance to the nearest body part the blast reaches (150 at the centre to 0 at 7 m), times the share of the body not behind something that blocks bullets. A wall that hides the whole body stops it; a low wall that hides the legs and hips takes off their share.
- Decision: with the spec's 150 and 7 m the kill radius is about 2.3 m to the nearest part, which is "about 3 m" from the grenade to the player's centre for a grenade on the ground. The numbers are kept as written.
- Self damage: a player's own frag hurts them only while the match is playing (`selfDamage`), teammates never (the mode's friendly-fire rule); kills count for the thrower even after they died or dropped it. Kill and hit events carry `cause: 'grenade'` and `weapon: 'frag'`, and the kill feed carries the weapon for every kill.
- Tests: `test/grenade.test.ts` (cook and throw, no firing while cooking, one per life, the 4 s fuse from the cook, the in-hand explosion killing the thrower, bounces off an axis-aligned and a 45-degree wall, the floor bounce, roll and rest, never through the floor or a roof, falloff, the kill radius, walls blocking, teammates spared, the drop with its kill credited, and snapshots). The determinism test now cooks and throws one too.
- Presentation done (v1.4.6). The frag is built by `tools/weapon/arsenal.py` (body, fuse, spoon, ring). Cooking lowers the gun and holds the frag up in the support hand; the throw winds back and lets go at 0.2 s, and the gun comes back over the throw time. The pin, throw, bounces (scaled by impact speed) and the explosion are synthesised; the blast has a flash light, sparks, a short fireball, a dust cloud, falling grit and a scorch, and shakes the view within 20 m.
- The player output now carries `grenade: { phase, time }`, which the viewmodel and HUD read. The HUD shows the frags left next to the ammo, and the fuse counting down in red while cooking. The kill feed names the weapon for every kill (Frag for grenades, Melee for melee).
- Online: the thrower's own grenade and switch events are predicted locally, so the server's copies are skipped like shots and reloads; explosions are repeated with the important events in case a snapshot is lost, and the client shows each one once.
- Checked in the range: a thrown frag flies, lands and kills the 25 m dummy, and the feed reads You · Frag · Dummy.
