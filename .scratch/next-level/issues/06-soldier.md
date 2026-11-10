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
- **After a review (released in v2.150.1).** A second reader went through the deaths and found twelve things; what changed:
  - A limb no longer snaps across the body while it falls. Keeping a limb out of the ground swung it about its shoulder or hip toward wherever it leaned that frame, and a limb that passed through straight down flipped to the other side in one frame (15 to 68 m/s at a wrist). Each joint is now lifted about the one above it (the wrist about the elbow, the ankle about the knee), and the way a limb is lifted comes round at no more than 2.5 m/s. A test falls from six poses, five shots and two frame rates and allows no joint more than 15 m/s; the fastest honest thing a death does (a slide's legs unfolding) is 14.
  - A soldier who dies prone or Downed dies where it lies. The clips are made for a standing soldier and carried the hips 0.64 m along the ground whatever the body was doing; the hips now move by what the clip moves them from where the body joined it.
  - A body on its back keeps its forearms on the ground. `fallBack`'s last key bent the elbows forward, which over a body lying down is straight up; the arms are turned about their own length there, one dropping beside the head and one out to the side (`tools/soldier/soldier.py`, rebuilt in Blender).
  - A new soldier costs 0.5 ms instead of 16: the merged body of a look is made once and shared (every respawn built it again, a dropped frame each).
  - A body lying still costs nothing: `fall` returns at once when the clip is over.
  - The push that throws a body is the hit that killed it, no older than half a second. A soldier hit and then killed by the Ring, a fall or a grenade ten seconds later was thrown by the old bullet.
  - Where a body may lie is asked of the ground, not of one ray at knee height: two rays (0.45 and 0.25 m) along the slope it stands on, and the ground at the far end, which must be there and within 0.3 m of the slope. A kerb, a low wall or a drop behind a soldier now folds it where it stands, and a slide stops short of an edge or a wall counting the length the body will lie.
  - Bodies follow the soldier levels: shadow near, none at mid range, not drawn past the far line. Bodies over the cap sink away like the rest instead of vanishing.
  - A soldier that was a far stand-in the frame before it died no longer leaves an invisible body; one whose side changes while dead is let go of once, not every frame.
  - The far stand-in carries each piece's baked shade, so a soldier doesn't brighten as it becomes one.
  - Gone: `PlayersView.chest`, which nothing called.
  - Left as it is: the gun vanishes at death (a dropped weapon is the simulation's to give, and Battle Royale already drops one); the shade is baked with the arms hanging, which shows as a slightly dark inner arm when it is raised and is not worth a second bake.
