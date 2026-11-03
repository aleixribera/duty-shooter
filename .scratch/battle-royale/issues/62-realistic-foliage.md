# Foliage reads as low-poly blobs, not the spec's realistic look

Status: open
Blocked by: 29

Spec: `../spec.md` (realistic style, permanent dusk)

Seen by the lead in ticket 29's shots (`shots/t29/final/mutant-jungle-near.jpg`, `the-dustlands-grazing.jpg`): ground surfaces read as real photo materials, but bushes and tree crowns are solid faceted lumps and the jungle canopy goes near-black. Next to the photo ground the mismatch is the most visible thing on the island.

Make the plant kit match the ground: crowns and bushes built from alpha-tested leaf cards (atlas through the `game-textures` skill, Claude-only sources), generated in Blender (`blender` skill), with wrap/translucent lighting so dusk-lit foliage isn't black, and wind sway in the vertex shader. Keep the same instancing, distance levels, soft-cover rules and placement from ticket 29; keep inside its frame-time and draw-call numbers (alpha-test overdraw is the risk: measure). Also from 29: draw distance of bushes and grass (220-320 m unscoped) should match how far they hide players from bots, or bots get blind spots players don't share.

## Comments
