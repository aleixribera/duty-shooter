# 01 Monorepo scaffold, fixed-tick simulation and headless match harness

Status: ready-for-agent
Milestone: 1 (movement and course, offline)
Blocked by: none

## What to build

The foundation every later ticket builds on. See spec sections "Platform and structure", "Simulation", "Stats" and "Testing Decisions".

- npm workspaces monorepo on Node 24, TypeScript strict, Vitest, Vite. Packages `packages/fps-core`, `packages/fps-client`, apps `apps/range`, `apps/server` (server may be a stub for now).
- `fps-core`: fixed 60 Hz deterministic simulation; usercmd type (buttons, movement axes, view angles, sub-tick fire timestamps); a world made of material-tagged boxes (1 unit = 1 m); a player entity with a team ID; a `Simulation` API that steps one tick from a set of usercmds and exposes outputs. No DOM, three, or audio imports.
- The stats file in `fps-core`: every movement and weapon number with source, date collected and tolerance, or `estimated` + method. Fill it from the research notes (the implementer brief gives the notes directory). Movement values are needed now; weapon values may be added now or in ticket 04.
- The headless match harness: build a world from tagged boxes, script usercmds tick by tick, read outputs. This is the single automated seam; later tickets extend it with the server, clients and transport.
- `apps/range` boots a Vite page showing a blank Three.js scene (WebGPU renderer, WebGL2 fallback) so the build pipeline is proven.
- Root scripts: `npm test`, `npm run dev`, `npm run build`, `npm run typecheck`.

## Acceptance criteria

- [ ] `npm install && npm test && npm run typecheck && npm run build` pass from a clean checkout.
- [ ] A headless match test steps an idle player in a box world and asserts outputs; a determinism test runs the same usercmd script twice and gets identical outputs.
- [ ] `fps-core` has no imports of three, DOM or audio (enforced by a test or lint rule).
- [ ] Stats file exists with sourced movement values.
- [ ] `npm run dev` serves the range app with a rendered scene.
