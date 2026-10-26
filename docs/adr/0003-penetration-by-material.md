# 0003 Bullet penetration by material

Status: accepted (2026-10-26, Survival Town spec)

## Context

v1 left penetration out, and tagged world boxes with materials so it could be added later. Shooting through thin walls, fences and the bus is central to how Nuketown plays, and the owner made playability the priority.

## Decision

The stats file holds a penetration table with one row per material: a thickness cost, a damage multiplier, and whether the material stops bullets outright.

- Wood, plaster, glass, sheet metal and plastic are penetrable.
- Brick, concrete, solid metal and every ground material stop bullets.

A bullet carries on through penetrable solids until its budget runs out, losing damage at each one. Both entry and exit produce impact events.

Penetration runs inside the server's existing lag-compensated hit check, so the netcode is unchanged. Props, such as mannequin heads, never reduce a bullet's damage or budget.

## Consequences

- Every material must have a penetration row, and a map test enforces this.
- Choosing a material is now a gameplay decision, not just a visual one. Making a wall brick instead of wood changes the fights around it.
- The table's values are tuned for playability, with the reasoning recorded next to them. They aren't measured from any original game.
