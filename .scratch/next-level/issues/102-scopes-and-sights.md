# Scopes and sights

Status: open

Release: v2.192.0 (pass 1), v2.193.4 (pass 2)

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

**2026-11-13, loop pass 16 (pass 2: sights on the target).** Review 13b failed objective 4 on "no sight puts the 25 m dummy under the reticle; the sniper's sits ~360 px low; the Vantage shows a front post inside its optic". The first was the capture's: its range part walked forward and fired without ever aiming, and recoil left the view on the 64 m back wall. The other two were real.

Built:
- **The Vantage's optic shows the reticle alone** (`tools/weapon/dmr.py`, rebaked `dmr.glb`): the handguard now runs to 0.405 over a low-profile gas block; the raised gas block, gas tube and the front post base it carried are gone, so nothing post-like stands under the chevron.
- **The red dot and the Prism's ring read on any target** (`viewmodel/optics.ts`): the reticle glows a pure, moderate red (emissive 1, 0, 0.004 at 1.4) instead of a hot one the film curve washed to salmon, which vanished on the orange dummies. The Reflex dot is 0.76 mm across instead of 0.48 (`tools/weapon/optics.py`, rebaked `reflex.glb`): about 10 px at 1080 lines, 3 px on an 844x390 phone.
- **The review aims** (`reviews/capture.mjs`): each sight is laid on the 25 m target's chest (the shotgun's on the 10 m one), net of recoil and flinch, before the ADS frame and before each shot; `summary.json` logs the range's shots/hits per sight.

Checked:
- `sights2/look.mjs` in the Practice Range, irons, Reflex and Prism on the M4A1, Reflex on the Bulwark, the Vantage and the Ridgeline, at 1920x1080 and 844x390 (`sights2/sheet.jpg`): every reticle sits on the dummy's chest, and every shot hit (4/4, 2/2 semi, 1/1 bolt).
- The capture's range part rerun with the aim: every sight on its target, every shot a hit (shotgun 2/2 at 10 m, SMG 7/6), no page errors (`sights2/capture-sheet.jpg`).
- `optics.test.ts`, `prerendered-kit.test.ts`, `ui-model.test.ts`, the client typecheck.

Second opinion (read-only, final diff): no bugs; the gas block stays inside the handguard (1.5 mm shows through the last vent), the larger dot still clears the glass and the test's off-axis rays.

Left for item 6: the M4A1's front sight tower still shows low in the Reflex and Prism; the Prism's lens is a small circle in a big eyecup; the dot has no size floor on small phones; third-person guns carry no optic; a clip per weapon with sound.
