# Region: Mutant Jungle

Status: resolved
Release: v2.139.0
Blocked by: 21

Spec: `../spec.md`

Spec: Zero Island table. As ticket 17, keeping foliage inside the frame budget. The densest Region, with the giant tree and forest from ticket 29.

## Comments

- Built from `apps/range/src/map/zero-island-jungle-plan.ts` and `tools/map/regions/jungle.py` into `models/jungle.glb` (2.7 MB): the giant tree (an octagonal trunk with glowing veins, a flared foot, six lofted roots to hide behind, four boughs, a two-tier canopy hung with magenta and cyan pods), the temple on its plinth (broken ashlar walls with a door, a window and a breach, half its roof, a crystal growing out of the altar, columns), two gateways with glowing runes on their lintels, a colonnade, three crystal outcrops, and the camp on stilts by the stream's spring. The kit dresses 20 extras: ruined walls, crystal clusters, crates and overgrown jeeps.
- The canopy's lower box was lowered to start at 17 m (it was 19.5 m), so the boughs reach into it instead of hanging under a gap. It is still well out of reach.
- Every model vertex is inside its plan boxes (worst stray 0). Solids are refitted to the models. Walking into the ruin wall, the crystal cluster and the crates stops at their visible faces (.scratch/battle-royale/jungle/edges).
- Solid fitting: blobs clamped to a box are clamped a few millimetres inside it, each by a different amount, and crate bodies stop just short of their bands. The fitter's inside test merges entry faces at the same height, so faces lying on one plane broke its fit.
- Test changes: `kit-solids`' built-piece check now has 240 s (it took 124 s, and the tree is about 100 fitted boxes). `zero-island`'s mantle pool now needs more than 15 lone boxes, down from 20, because the built Regions replaced their blockout's single boxes with fitted models.
- The stream is wadeable: its water is 0.65 m deep and nothing stands in it (tested). Its clear, shallow water shows the pale bed, so it reads as nearly dry from eye height, not as the glowing stream in the reference art. Restyling the island's water material is left for a later ticket.
- The canopy masses are smooth, faceted shapes. They look more stylised than the forest's leaf-card trees round them.
- Measures: frames on the dev server are 3.2–4.6 ms mean (p99 ≤ 6.8) in the jungle, against 4.5 ms at the Neon control. A 60-seat Local bots match ran at 6.8 ms mean (p99 10.3), with worker p99 1.8 ms and a download of 30.7 MB. Server tick p99 was 4.25 ms. Longest-stuck bot in the soak: 2.3 s at (13,43,-325), outside the jungle.

