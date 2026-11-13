# Scopes and sights

Status: open

Release: v2.192.0 (pass 1)

Spec: `../spec.md`

`PLAN.md` item 6 (objective 4), its first part; takes over ticket 19's optic models and sight pictures (its phase 2, optics only). Every gun's iron sights, the Reflex and the Prism 2x, and the sniper's and the Vantage's scopes: each a real model on the gun, lined up when aiming down sights, with a clean sight picture (reticle, lens, eye relief, edge), zooming and swaying as its gun should.

Acceptance: a frame of every gun aimed down sights with each sight it can take, at desktop and phone width, all aligned on the target.

## Comments

**2026-11-13, loop pass 11 (pass 1, rough).** Before this pass, picking the Reflex changed nothing a player could see, and the Prism 2x only zoomed: the irons stayed in view either way.

Built:
- **Two Blender models** (`tools/weapon/optics.py`, on the gunsmith; `reflex.glb`, `prism.glb`). The Reflex: a hooded window on a riser, a clamp with cross-bolts, an emitter, buttons and a battery cap; its glass is a thin tinted pane and its dot a red insert on the axis, 32 mm over the rail. The Prism 2x: a bored body on a clamp, eyecup, objective bell, three turrets and "2x" lettering; its reticle is a red ring, a centre dot and a post from below. Both bodies are built ring to ring with no boolean, so the bore stays open (a boolean cut left faces across the hole).
- **On the gun** (`viewmodel/optics.ts`): each gun that takes an optic (M4A1, Vector, Breacher, Bulwark, Burst) has a mount on its rail, measured from its generator, forward of the folded rear sight. The Bulwark's sits on the feed cover and lifts with it in a reload. The model loads once and each gun takes a clone.
- **The irons fold away** under an optic: the Vector's, Bulwark's and Burst's sight ears, hoods and posts are now their own `irons` part (rebaked), and the M4A1's front post its own mesh (high detail); the rail clamps and bases stay.
- **Aiming lines up through the optic**: the aim point is worked out each frame from what is mounted, the optic's axis at its rear rim plus its eye relief (70 mm for the Reflex, so its window fills about a third of the view; 35 mm for the Prism, so the eyepiece fills most of it).
- The game feeds the held gun's optic to the viewmodel; the viewer takes `&optic=reflex|prism` (README).

Decisions (spec and glossary silent):
- The glass is a near-clear tinted material (opacity 0.1) and the reticle a glowing red, both swapped in at load in place of the baked finish, so the dot reads on any background without a post effect.
- The Prism's sight picture is the eyepiece's own bore, not a full-screen overlay: it stays a model, as the plan asks, and it sways with the gun.

Checked:
- Viewer frames of all five guns × irons / Reflex / Prism at 1920×1080 and 844×390 (`sights/after/sheet-desktop.jpg`, `sheet-phone.jpg`). The Reflex dot's centre is within 0.5 px across and 2.7 px down of the screen's centre at desktop, 0.5 px at phone; the Prism ring is centred (the measured centroid sits low only because the post is counted).
- In the Practice Range, the M4A1 and the Bulwark aimed with each sight at a 25 m target: the dot on its chest, the Prism's ring round it at 2× (`sights/after/range-sheet.jpg`).
- The Bulwark's reload with the Reflex at 0, 1.2, 2.4 and 3.6 s (`sights/after/lmg-reload-sheet.jpg`): the optic rides the lifted cover, its window facing forward, and the rear ears stay folded.
- In play with the Reflex raised over the targets, the dot sits on the screen's centre (`sights/after/sky-reflex.jpg`).
- `packages/fps-client/test/optics.test.ts` (5 tests): mounts on exactly the guns that take an optic; for each optic, a ray on its axis meets the reticle through the glass and rays 5 to 6 mm off it meet only glass; the irons are separate nodes; an optic on a turned part sits at its mount and lifts with it.

Second opinion (one read-only reviewer on the final diff): no correctness bugs; the mount maths, aim signs, async guards and dispose order hold. Acted on:
- The optics were neither fetched nor compiled before play, so the first life with one would fetch it mid-match and compile its glass and reticle on sight. `prepare()` now loads both and keeps a hidden copy of each that `showAll()`'s warm-up frame shows.
- Nothing tested an optic on a turned part (the Bulwark's cover rests unturned). A test now mounts one on an offset, turned part and checks it sits at its mount and lifts with the part.
- The Breacher has no rail: its optic clamps to the receiver's flat top, and its comment and the irons test say so. The aim maths now goes through one function, without a new vector each frame, and the replaced finishes are disposed.

Gaps, for the next pass of this item:
- The Prism's view is a smallish circle inside a large eyecup; a wider bore or a shorter eyecup would give more picture.
- The M4A1's front sight tower (not the post) still shows low in the Reflex window, as on a real carbine; the Breacher's bead stays.
- Third-person guns carry no optic yet.
- The optic's shaders are not built in the warm-up, so the first mount in a match may hitch.
- The Reflex dot is small and pale in play: about 5 px and salmon over the range's bright walls at 1080p (`sights/after/sky-reflex.jpg`), about 2 px on a phone (emulated at device scale 1). It wants a size floor and a hotter red.
- Still to do in item 6: the sniper's and the Vantage's scopes, and a clip per weapon with sound.
