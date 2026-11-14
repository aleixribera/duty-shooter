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

**2026-11-14, loop pass 62 (review 2026-11-14b, "close behind": the Prism tunnel).** Aimed through the Prism 2x, the eyecup filled x 360-1560 at 1080p and the world showed only in a 480 px circle down a dark tube: the reticle, and the sight window just past it, stood in the block's middle, 70 mm from the eye, behind 35 mm of tube.
- Pattern copied: low-power prisms and 2x sights in well-loved shooters show a large clear picture filling the eyepiece, the housing a ring round it and the world visible past it; never a small hole at the end of a tube.
- `tools/weapon/optics.py`: the three reticles now stand in the eyepiece just in front of the eyecup (y -0.0285), each scaled by its new distance from the eye (x0.65) so it looks the same size aimed, its post still running to the bore; the eyecup's rim is thinner (15.8 mm, was 17.2). Rebaked `prism.glb` (the Reflex is unchanged and not rebuilt).
- `optics.ts`: the Prism's sight window moves with the reticle (gun z 0.0279), and the eye sits 38 mm behind the cup (was 35) so the cup's rim stays inside the screen's height.
- Checked: `optics.test.ts` (new: the clear picture is over 0.7 of the eyecup's width seen from the eye, which the old model fails at 0.40, and over two thirds of the aimed view's height; the window still meets every ray down the bore before anything of the gun, the reticle nearer the eye); typecheck; `prism-tunnel/look.mjs` in the Practice Range at the 25 m dummy (`prism-tunnel/sheet.jpg`): the clear picture is ~760 px across (was 480), the housing x 455-1470 (was 360-1560), the ring the same size on the dummy's chest, 4/4 M4A1, 6/6 Wasp 9, 3/3 shotgun hits; on a phone (844x390) the same picture.

### Pass 68 (2026-11-14): the kill you can see

Review 2026-11-14c's defect 2: no match kill frame showed the victim (11-kill-1..4b): the front post, your own flash, and in two pairs a smoke wall. Two causes, neither the flash this time:
- The review's scripted player saw through smoke: its "in sight" test checked walls only, so it fired into bots retreating behind their own smoke grenades (the match heard 17 smoke pops in its first minute), and kills 3 and 4 were taken through a cloud no person could see through. `Game.sees(from, to)` (new, for scripts) answers as a bot's eye does (`botSees`: walls, soft cover) plus the smoke clouds standing now (`smokeHides` on the driver's grenades at `serverTime`, the clock the page draws them on); the trailer's `steer`, which the review plays with, targets only foes it passes.
- The hit marker's ticks started 6.5 px from the aim point, so the X lay over a target 30-40 m off (~30 px tall) at the very moment of the kill. Well-loved shooters' markers frame the aim point rather than fill it; the ticks now start 11.5 px out (centre 17 px, was 12), leaving a ~23 px clear middle that frames a distant torso.
- Not changed: down the irons the falling body drops behind the front sight base (every "b" frame). That is the M4A1's real sight picture (its ears ~2.1 degrees across at the 1.1x iron zoom, under a real A2 base) and how sights read in the shooters it copies; a slimmer folding front sight would be a model change (BACKLOG).
- Checked: client typecheck; `vitest related hud.ts` (36 pass); a probe (`kill-seen/probe.mjs`) showed `sees` agreeing with the walls-only test in the open and the steer running without errors; the review's match part on Station Nine FFA (`MAIN=station-nine:ffa ONLY=match`, `kill-seen/after/`): 4 kills, none into smoke; the victim stands framed by the X between the post's ears in kills 1 and 3 (`kill-seen/sheet.jpg`, 14c above, this pass below). A first run while other sessions held the CPU at 100% (`kill-seen/loaded/`, 17.8 fps) scored 0 kills.
- Freezes (defect 1) re-measured in the same match part with the PC at ~47%: worst frame 146 ms, workP99 17.6 ms opening and 23.1 ms last minute (14c: 732 ms and 68.6 ms; the loaded run: 2,708 ms and 159 ms). They track the PC's load, not the game.
- Second opinion (read-only): no problems; `serverTime` is the clock grenades' `popped` is stamped on, offline and online; the page's own world never has its smoke set, so the separate cloud check is what counts.
- Pass 74 (review 2026-11-14c close-behind: the Practice Range panel's Wasp "Shots / hits 4 / 3" after 23 rounds, M4A1 "1 / 1" after 5 presses). Not an undercount bug but a confusing readout: the count was the current target's since your first hit on it, so a kill, then the respawned dummy's first hits, replaced the kill's numbers and its time to kill went back to "–". As a player reads "Shots / hits", it is now the gun's tally since it was drawn, updated on every shot (misses included); Time to kill keeps the last kill with its hits ("506 ms · 4 hits") until the next kill or a gun change. A new game clears the panel too (the second opinion's catch: `setDriver` cleared the stats, not the HUD).
  - Not changed: the shotgun's "14.2 m" for the 10 m dummy is right. The capture stands off that lane, and the server's own hit distance reads 14 m too ("33.8 HP · arm · 14 m").
  - Second opinion (read-only): there were no real bugs besides the HUD clear above, which is fixed. Left as they are: a bullet still in flight when you swap guns can still kill after the swap, and its time to kill now stays up (that was possible before); and the cap of no more hits than shots is per gun, not per shot.
  - Checked: `range-stats.test.ts` (6, with the tally through a kill and the respawn, and the cap), `vitest related` on the changed files (6 files, 42 tests), typecheck; `range-tally/look.mjs` in the capture's order: the tally matches the rounds spent on every gun (M4A1 13 / 4 for 13 spent, Reflex 11, shotgun 2 / 2, Wasp 13 / 6, held "683 ms · 6 hits"), blank after the switch to the pistol; frames in `range-tally/after/` and `after-844/` (phone height).

### Pass 84 (2026-11-14): rifle kills seen landing

Review 2026-11-14e's fix-first: the body showed in 1 of 6 rifle "b" frames, hidden by your own flash and a burst's haze at the front sight, because the scripted player fired on past every kill.
- The review's scripted player lets go of the trigger on the kill-feed line, as a player does; the second kill of each part holds it down through its frames (`held` in killFrames), the check that a body still shows through your own fire.
- Game: your own flash and the haze near your eye part further round the aim point, and 1.7 times further below it (`SIGHT_CLEAR` 0.04-0.085 of the view's height, was 0.035-0.075; `SIGHT_CLEAR_BELOW`): a body killed at 15-40 m lands 30-60 px under the aim point, beside the front sight, where the flash's heart and tongues stood. Aimed, the flash now plays as tongues out to the sides of the front sight, its heart at the base cleared (`kill-flash/sheet-spawn.jpg`, HEAD above, this pass below).
- Checked: client typecheck; `vitest related effects.ts` (7 files, 19 tests); `kill-flash/look.mjs` (aimed, trigger held, frames back to back); the review's match part twice on Switchyard TDM (`kill-flash/sheet-match.jpg`, `sheet-match2.jpg`): run 1 shows the body in 4 of 4 "b" frames, the held kill too (the magazine was down to 2, so no flash caught); run 2 in 1 of 4, none hidden by flash or smoke: an ally (Briar) stepped in front, the held kill came on an empty magazine and the reload swung the gun, and one body fell straight behind the front sight base (pass 68's limit of the irons). 5 of 8 over both, against 1 of 6.
- Second opinion (read-only): no bugs; `screenUV` runs top to bottom on WebGPU and WebGL2 alike (three flips WebGL's), so "below" is right; a comment's pixel figures were wrong and are fixed.
- Left: allies walking into the view (review defect 4) and the front sight base at 30-40 m.

### Pass 89 (2026-11-14): bodies killed straight on turn aside as they fall

Review 2026-11-14g's fix-first: the body lands behind the front sight post in 6 of 10 kill "b" frames. The cause behind most of them: a body shot from the front was thrown straight back along the shot's line (`fallBack`), so from the shooter it dropped straight down behind the post and the front sight base, and lay there (`kill-turn/sheet-before.jpg`: kills 1 and 2 gone behind the post by 500 ms). Well-loved shooters' canned deaths twist the body as it drops (a default, not researched further); here a body thrown onto its back or chest now turns 0.75 rad about its feet over 0.5 s (eased), landing back and to one side: the side the shot pushed it, either when straight on, the other side or straight where a wall is in the way, and a crumple as before with no room straight back (`soldier.ts`, `DEATH_TURN`).
- Measured (a throwaway probe: 40 deaths straight on, joints projected from a shooter at 15 and 30 m against the M4A1's sight shadow, the ears' +-1.3 degrees from their tops down): at 15 m, joints clear of the sight 27% at 250 ms / 27% at 500 / 27% at 800 / 20% lying before, 20% / 47% / 70% / 70% now; at 30 m 0% throughout before, 0% / 20% / 27% / 27% now. The 250 ms frame barely changes (the body has not left its pose yet); the fall from 0.4 s on is what shows.
- The review now takes a "c" kill frame at 500 ms too (`capture.mjs`, `KILL_B` default `250,500`).
- Checked: `soldier.test.ts` (new: straight on, the neck is 0.4 m+ off the line at 0.5 s and the head 0.6 m+ to a side lying; a push from the side sends it that way, front and behind; a wall on that side sends it the other), `vitest related soldier.ts` (4 files, 42 tests), client typecheck; the review's match part on Survival Town TDM before (turn off) and after, and Switchyard TDM after (`kill-turn/sheet-*.jpg`, frames in `before/`, `after/`, `after-switchyard/`): after, the body shows turned out beside the post in Survival Town 2b and 4c and Switchyard 1b; still hidden where it fell behind cover or the gun's own tower at 30 m+ (Switchyard 2, 3).
- Second opinion (read-only): no bugs; signs and `lies` agree for both falls at several yaws. Fixed from it: a body joining the clip part-way down turns in what is left of the clip, so it lies where `die` said.
- Left: at 30 m+ the feet stay on the aim line under the front sight base; a slimmer folding front sight (BACKLOG) is the next lever.

**Pass 90 (2026-11-14), review 14g defect 5: damage numbers stacked over the target in the sights.**
- In the Practice Range a dummy's damage number was drawn centred on the hit, so aimed down any sight it sat on the reticle and the target ("28" twice in the Prism, "40" twice in the DMR, "18" over the Wasp's aperture).
- Now it stands to the right of the hit (96 px at 1080p, 48 px minimum; to the left near the right edge), clear of the Prism ring and the irons' ears, with a black halo so it reads on the white range walls. Hits on one dummy within 900 ms add into one number ("112 / 4 hits · 25 m"), as Apex Legends' stacking damage numbers do; the killing hit closes it, so the dummy's next life starts fresh. A head hit in the total turns it red.
- Checked: `dmgnum/look.mjs` (irons, Reflex, Prism, DMR, SMG, sniper at 25 m, desktop and 844 x 390): every number at x 1052-1058 at 1080p (470 on the phone), off the reticle, one per dummy; `dmgnum/sheet.jpg` against 14g's frames. Client typecheck, `hud-*` tests.
- Second opinion (read-only) found three: a stacked restart blinked from the 0% keyframe under auto fire (now restarts at the faded-in 10%), the detail line wrapped when flipped (nowrap, and `right` instead of a translate), and a hidden HUD measured 0 (now the window). Fixed and rechecked with the look.
