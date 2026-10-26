# 0002 Yaw-rotated solids and a spatial grid, not mesh collision

Status: accepted (2026-10-26, Survival Town spec)

## Context

Survival Town has angled vehicles, diagonal fences and sloped roofs, and collision must match the visuals within a few centimetres. Movement only knew axis-aligned boxes and scanned all of them every sweep. That's fine for the range, but the server's cost would grow with a detailed map.

The options were:

- staircase approximations with axis-aligned boxes: errors of 20–30 cm on angled objects
- solids rotated around the vertical axis
- full triangle-mesh collision: a rewrite of the movement sweep, with the most new-bug risk

## Decision

Solids that block players may be axis-aligned boxes, or boxes rotated around the vertical axis. Bullet surfaces may have any orientation, because a ray against an oriented box is cheap and exact. Sloped walkable surfaces use player clip steps (see 0001), not tilted solids.

A uniform spatial grid of about 4 m cells is built once per world. The movement sweep and the bullet raycast query only the cells they cross, and must give results identical to a linear scan.

## Consequences

- Angled vehicles and fences collide exactly. Movement code changes stay small, and determinism is preserved.
- No true slope physics: no sliding down roofs, and no slope-dependent speed. If a future map needs those, this decision gets revisited.
- The server's cost stays roughly flat as solid counts grow, which keeps the home server's 8-player budget.
