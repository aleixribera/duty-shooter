# Zero Island blockout

Status: resolved
Release: v2.97.0
Blocked by: 04

Spec: `../spec.md`

Spec: Zero Island. New map id `zero-island`, full terrain with the six Regions in place, Boundary, shallow water, bridges, plateau reachable and summit not, grey Cores, `?explore=zero-island`. Chunked world rendering good enough to walk it.

## Comments

- Pushed early at the owner's request, relayed by the coordinator: the island is walkable from the main menu's temporary Zero Island button. Ticket 12 replaces that button. Button first shipped in v2.96.0.
- `AGENTS.md` still says the main menu keeps to four items. The request to note the button there came through the coordinator, and instruction files take a change only from the owner directly, so it stands until the owner edits it or asks.
- Test seams, chosen without the owner since no one is around to confirm them: the built map through core `Terrain` and a headless match, and the pure chunk mesher against `Terrain.heightAt`. The browser walk covers the rest.
- The ground is generated, not shipped as data: about 0.6 s to build in Node, no data file to download, and exact arithmetic only so client and server get the same bytes.
- 975,432 m2 of land. The island runs 1264 m at its widest, about 200 s at a sprint, so ticket 07 should check the 2:40 sprint across the ring.
- Five bridges at deck 4, the two the railway uses at deck 7: the ring stands too high for a train to drop to 4 at 7 percent. Rail grade is 7 percent everywhere.
- Palette entries repeat materials so Regions can look different. Snow sounds as `dirt` for now.
- `nav: null` until ticket 06. No bake until ticket 10, so zero-island stays out of the Vite bake list and the page doesn't ask for a file. Ground takes the sun's shadow but casts none, and is lit by sky, sun angle and noise.
- The sea is cut out round the land: from far off one depth step is over a metre, and a whole sea plane flickered through low ground. Deck tops sit 4 cm above their roads for the same reason. The sea still reads tan from the air under the dusk haze; ticket 10 owns that.
- Measured on this PC, Chrome 1920x1080 at the WebGPU backend: `?bench` frame p50 4.1 ms, p99 15.4 ms, 158k triangles, 139 draws; one 274 ms frame in the run. Production `?explore=zero-island` plays 1.7 s after navigation. The map adds no data file.
- Walked with real keys: Dustlands, Harbor, Neon, Jungle and Ground Zero to the plateau at y 48, over two bridges, wading at 5.29 m/s, stopped at the Boundary, and stopped at the summit's foot at y 51.
