# Region: The Dustlands

Status: resolved
Release: v2.135.0
Blocked by: 17

Spec: `../spec.md`

Spec: Zero Island table. As ticket 17.

## Comments

- The Dustlands is now a Region kit (`zero-island-dustlands-plan.ts` and `tools/map/regions/dustlands.py`, giving `dustlands.glb` at 1.5 MB). It has the crashed cargo jet, the mine office, shacks, the ore hopper with a wagon line, and cover props: huts, burnt-out pickups, ore wagons, dry-stone walls, crate stacks and drum clusters. It replaces the grey blocks.
- I built a pickup instead of a buggy. The reference art reads as a work truck, and a pickup's closed body gives honest collision (75% fill instead of the buggy's 82% of an open frame, which let shots pass through gaps).
- Stand fit: a kit model now stands on the lowest ground under its footprint, with height measured from the middle (`standing()` in zero-island-kit.ts). Before this, pickups on slopes floated on their downhill side.
- Fitter: touching parts merge into one span. `ONLY=<glb>` refits a single GLB in about 1.5 min instead of 10 and keeps the other blocks as they are.
- I made the cover mix denser (spacing 24, plus walls), because removing the grey blocks pushed two sightline areas to a median of 70.
- Bot fix: a bot healing in cover no longer strafes back out (bot.ts), because zero-island-royale-bots caught one doing it.
- The jet had been wearing tread plate. The ground layer `plate` is now Poly Haven `blue_metal_plate` (CC0).

