# The Ring reads as energy, and the island's final tuning

Status: open

Spec: `../spec.md`

Carried over from `.scratch/battle-royale/issues/26-final-tuning.md`, left open when that arc stopped. The Ring reads as a purple chain-link fence (a regular diamond lattice) rather than a wall of energy: make it read as moving energy (flowing bands, arcs, a brighter base where it meets the ground, which today sits at sea level), keeping its one draw call and its cost. Then the island's final pass: Ring timing, bots, download size, frame budget and sniper balance, measured on the finished island.

## Comments

- (2026-11-12) The Ring half is already done: ticket 08 (v2.146.0) made it a curtain of drifting rays, pulses climbing from a hot foot line and arcs that strike and go, one cylinder, one draw call, no texture, and battle-royale tickets 44 and 53 set its foot on the ground and the water under it (no longer at sea level) and fade its detail toward the sun. What is left here is the final pass on the finished island (Ring timing, bots, download size, frame budget, sniper balance), which waits on Zero Island's bake (ticket 34) and its frame cost (ticket 35), since both change what gets measured.
