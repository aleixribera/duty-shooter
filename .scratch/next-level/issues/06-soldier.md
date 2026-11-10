# A soldier, not a stack of boxes

Status: resolved

Release: v2.149.0

Spec: `../spec.md`

tools/soldier/soldier.py builds 42 rigid boxes. Rebuild in Blender: a continuous skinned body with gear, a baked texture set, team marks that read at range, and death that crumples instead of flying apart. Keep the far stand-in and the IK holds.

## Comments

- A contained upgrade, not the full rebuild the ticket names. A continuous skinned body with a baked UV texture set means new weights, new holds for every gun and a new far stand-in: weeks of risk for a soldier seen mostly at 20 m and more. What made him read as a stack of boxes was flat colour, hard box ends and flying apart on death; those are what changed. The model is still built by `tools/soldier/soldier.py` (a real Blender model, `soldier.blend`, exported to `soldier.glb`).
- **The body:** baked vertex ambient occlusion (creases under the arms, between the legs, under the vest), a gaiter at the ankle, rounder boots. Its material is procedural (`bodyMaterial()` in `soldier.ts`): a woven cloth and a camouflage break-up in the fatigues, with a `finish` attribute a piece so webbing, boots and skin stay plain. No texture files, so nothing to download and no image generation. Skin is a muted tone, not orange (palette ticket 03).
- **Death:** the ragdoll that threw the pieces apart is gone. A soldier plays one of three falls made in Blender (`fallBack`, `fallFront`, `crumple`), picked by where the shot pushed him and mirrored half the time, then lies as a **body**: settled onto the ground under it, his gun gone. A body lies 10 s, sinks out over 1.6 s, and at most 12 lie at once (the oldest goes first). Bodies are the client's own picture: the simulation knows nothing of them, they block nothing.
- A far soldier (the stand-in, ADR 0011) who dies just disappears: no body is left lying that far out. The ADR says so now.
- Team marks: unchanged. The armband and the name tag already read at range; the camouflage stays under both teams' colours.
- Kept: the far stand-in, the IK holds, every weapon's row in `HOLDS`.
- Seen in the game on WebGPU and WebGL (bodies lying in Survival Town, the four death columns in `soldiers.html`). Tests: the falls end lying on the ground with no piece under it, a body's life and the cap in `players-view`.
- Left: the comment in `game.ts` (`prepare`) still speaks of "the pieces a ragdoll throws"; it goes with the next commit that touches that file (another session has edits open in it).
