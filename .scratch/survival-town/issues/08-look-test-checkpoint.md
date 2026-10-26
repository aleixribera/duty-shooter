# 08 Look test: one finished house (checkpoint 2)

Status: ready-for-agent
Milestone: 2 (the map, checkpoints)
Blocked by: 05, 06

## What to build

The rendering pipeline for stylised realism, proven on one house before the rest of the map is built in it. See the spec section "Rendering (presentation package)".

- **Materials:** code-generated node materials, one family per material: siding, shingles, brick, asphalt, grass, sand, concrete, painted metal, sheet metal, wood fence, glass, plastic. Detail comes from patterns computed in world space, with no texture files.
- **Decoration:** visual-only decoration linked to solids (trim, window frames, gutters, porch details). Each piece declares the solid it decorates and stays within 5 cm of its surface. Add a map test that enforces this.
- **The lighting bake:** a CPU bake at build time of sun shadows, ambient occlusion and one bounce, for the fixed afternoon sun. Its output is generated data that ships with the build, never committed. It runs in both the container build and the Pages build.
- **Dynamic lighting:** a light-probe grid lights dynamic objects. Realtime shadows are cast by dynamic objects only.
- **Merging and instancing:** static geometry is merged per material, and repeated props are instanced.
- **Apply all of this to one house**, inside and out, with its yard and fence. The rest of the map stays plain geometry.

## Acceptance criteria

- [ ] At the house's reference spots there's no z-fighting, seams, light leaks, floating or buried decoration, or stretched materials. The playtester agent checks this with screenshots.
- [ ] The decoration-to-solid tolerance test passes.
- [ ] A benchmark run is recorded in this issue's comments, with the house's cost extrapolated to the full map against the budgets.
- [ ] Both the container build and the Pages build run the bake successfully.
- [ ] **The owner approves the look.** Record the approval and any changes in this issue's comments. Ticket 09 builds from the approved version.

## Comments
