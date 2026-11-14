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

### Pass 45 (2026-11-14): the sight window

Review 2026-11-14a's "fix first": through the Prism 2x and the Vantage's optic the gun's own front sight tower, barrel and the far end of the tube sat in the sight picture (24-kill-1, the tower over an enemy's legs), and the reticle's post ran past the visible glass onto the tube wall. Magnified sights in well-loved shooters show the world and the reticle alone inside the eyepiece; the gun never appears in the magnified view.

- `addSightWindow` (`viewmodel/optics.ts`): a disc just past the reticle (muzzle side), the bore's radius, writing a clear pixel at full depth with blending off. The viewmodel pass is laid over the world by its alpha, so inside the window only the world and the reticle show. The Prism's comes with its template (`OPTICS.prism.window`), the Vantage's with its model (`VANTAGE_WINDOW`, `kit.ts`).
- The visible glass is now the bore at the reticle's plane, not the objective: about 1.4x wider, and the posts end at its edge.
- `dmr.py`: the optic saddle poked 1.4 mm into the bore and showed as a flat chord over the top of the new window; it now sits in the tube's wall (dmr.glb rebuilt).
- The Loadout screen's stage hides the windows: with only the page behind its canvas they showed as a dark patch round the optic.
- Your own muzzle flash is hidden inside the window with the rest of the gun (it is out at the muzzle): a call, since 13c counted the flash covering the kill as a defect.

Checked: `optics.test.ts` (rays down the bore meet the window before anything of the gun out to 0.97 of its radius, failing on the old dmr.glb at the saddle; the reticle nearer the eye than the window), related tests, typecheck; frames in `.scratch/next-level/sight-window/` (`sheet.jpg`: before/after for the M4A1, Wasp 9 and Trident with the Prism and the Vantage; `look2/` the Loadout screen).

Second opinion (read-only): the flash point above (kept, deliberately); and the viewmodel composite `mix(world, vm.rgb, vm.a)` treats the MSAA-resolved viewmodel as straight alpha, so anti-aliased edges against a clear pixel come out a little dark (k^2 instead of k), which the reticle's edges now meet. Older than this change; BACKLOG.

### Pass 56 (2026-11-14): the kill behind your own flash and smoke

Review 2026-11-14b's defect 2: at most kills your own muzzle flash or the haze of a burst stood over the target (11-kill-1b, 20-kill-1, 20-kill-2b, 21-kill-2). Down the irons the muzzle sits just under the aim point, so the flash's white heart and its upward tongues, and the smoke rising off the barrel, covered the middle of the screen. Well-loved shooters keep the sight picture readable while you fire: the first-person flash plays round the front sight, not over what you aim at, and barrel smoke is a wisp, not a curtain.

- `effects.ts`: your own gun's flash (and the one you see through a spectated player's eyes) has its own material that fades in a soft circle round the screen's middle: clear within 3.5% of the view's height (~38 px at 1080), in full from 7.5% (~81 px; a man at 25 m is ~45 px tall). Other players' flashes are unchanged.
- The `#smoke` layer (muzzle, frag and flash-pop smoke) parts in the same circle where a puff is within 2.5 m of the eye, fading out by 4 m; only near smoke is touched, so a smoke grenade's cloud (`#cloud`, its own layer) still hides players in full.
- Checked: `muzzle-clear/look.mjs` (Practice Range, M4A1, 1.5 s bursts aimed and from the hip, frames back to back), `before/`, `after/`, `sheet.jpg`: the flash now opens round the front post with its tongues to the sides and the post's tip and the target area clear; the haze over the post after a burst is thinner at the middle. `muzzle-flash.test.ts`, `probe-lit-smoke.test.ts`, client typecheck.
- Second opinion (read-only): no bugs; `screenUV`/`screenSize` follow the bound target, both passes are full size, optics zoom the world camera, the additive composite fades cleanly. Noted: smoke from others' guns and frags within 4 m also parts at the middle (harmless).
- Not touched: during a long burst the climb puts the 25 m dummy under the front post itself; that is the irons and the recoil, not the flash.

### Pass 59 (2026-11-14): the Practice Range panel shows this gun's numbers

Review 2026-11-14b's defect 5: the range panel kept the previous gun's readouts (reflex-ads 5/4 and 606 ms, dmr-ads 4/4 and 28.0 HP, sniper-ads 3/3 and 40 HP, shotgun-ads 1/1 and 105 HP), the Wasp showed 5 shots with 6 hits (30-b), and the sniper's fire frame read 64.1 m against a 25 m hit.

- `range-stats.ts` (new): the panel's tally, out of `game.ts`. A gun drawn (a switch, a new loadout, a respawn: the weapon going into `draw`) clears it and blanks Time to kill, Shots / hits, Last hit and the recoil trace (`hud.clearRangeStats`).
- Shots / hits: a tick fires before it moves bullets (`simulation.ts` `step()`), so the Wasp at 25 m (950 rpm, 375 m/s: both ~4 ticks) fires its next shot in the tick its first hit lands; the engagement started at `shots: 1` and missed it. It now counts every own shot since the one that hit (shots within a tick of `hit time - travel`).
- Distance: the raycast follows the camera, kick included, so 120 ms after a sniper shot it read the wall behind. Through a burst and 0.6 s after its last shot it keeps the reading it had when the burst began.
- Checked: `range-stats.test.ts` (the Wasp's tick order fails the old count: 3 / 4), typecheck; `range-panel/look.mjs` runs the capture's gun order: `before/` stale at every change and 64.1 m on the sniper's fire, `after/` blank at every change and on the switch to the pistol, 25.0 m through the kick; `sheet.jpg` (top before, bottom after: dmr-ads and sniper-fire).
- Second opinion (read-only): no bugs; the window can't take the shot before (the fastest guns fire 3.8 ticks apart); online the panel never shows (the range runs offline only). Not done: a bullet still in flight across a switch opens a 1 / 1 engagement (holster time outlasts the range's flight times).

**2026-11-14, loop pass 61 (review 2026-11-14b, "close behind": the dummy hidden behind the shotgun's receiver).** Aimed through the Harrow 12's bead, the eye sat on the bead's own line, 9 mm over the receiver and 0.2 m behind it, so the receiver's back face stood about 8 px under the bead at 1080p, 200 px wide, and hid everything standing on the bead from the hips down (`shotgun-sight/before/`).
- Pattern copied: aimed pump guns in well-loved shooters show the rib from a little above, running up to the bead, with the receiver low in the picture, not end on under the bead.
- `KitRig.frontSight` (new, optional): with it, aiming tips the gun nose up until the line from `rearSight` through the front sight runs down the camera's axis (`aimPose` in `kit.ts`, pure, tested). The shotgun's rear point is now 22 mm over the bead's line (0.071), its bead top at (0, 0.0456, -0.658) measured from `shotgun.py`; the gun tips 2.1 degrees aimed and the receiver's top front edge drops to about 3.4 degrees under the bead (~50 px at 1080p, was ~8). The bead itself now sits exactly on the aim point (it was 0.2 degrees under it). Optics on the shotgun keep no tip. No other gun has a front sight set.
- Decision (overridable): 22 mm. 12 mm moved the receiver only ~25 px; more tips the gun visibly. The barrel now runs as a narrow strip under the bead, so a target at 25 m (as narrow as the barrel) still has its legs behind it, as under any iron post; at shotgun range a body is about twice the strip's width and shows beside it.
- Checked: `aim-pose.test.ts` (the bead and rear point on the axis; the receiver's edge over 2.5 degrees under the bead, which the old eye line fails at ~1), the viewmodel's related tests, typecheck; `shotgun-sight/look.mjs` in the Practice Range at the 10 m and 25 m dummies, desktop and phone, with the Reflex unchanged (`shotgun-sight/sheet.jpg`).
- Second opinion (read-only): no bugs (sign and order against the pivot's YXZ, the gun turns about its origin, optics untouched, shots leave from the muzzle's position only); two stale comments fixed.
