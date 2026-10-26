# 0001 Separate player clip from bullet surfaces

Status: accepted (2026-10-26, Survival Town spec)

## Context

Until now the world was one list of boxes, and every box blocked both players and bullets. Survival Town needs three things that break that rule:

- **An invisible boundary wall.** Bullets must fly past it into the scenery.
- **Walkable sloped roofs.** Movement only understands boxes, so roofs are walked on via hidden 5 cm steps. Bullets must hit the visible slope instead.
- **Scenery and sloped faces that only bullets need to hit.** They should cost the movement sweep nothing.

The owner's rule is that bullets are never stopped by anything invisible inside or outside the playable area.

## Decision

Every **solid** declares what it blocks: players, bullets or both.

- **Player clip** blocks players only.
- **Bullet surfaces** block bullets only.
- Ordinary geometry blocks both, and a plain box keeps meaning that.

The movement sweep and the bullet raycast each skip the solids that don't apply to them.

## Consequences

- Invisible blockers can be added freely without affecting gunplay. A map test fires bullets along and through every player clip solid to prove it.
- Collision and visuals can now drift apart, so maps must keep them in step. The decoration-to-solid tolerance test (5 cm) is the guard.
- Sloped surfaces need two solids each, the player clip steps and the bullet surface, which raises the solid count. The spatial grid in 0002 absorbs the cost.
