# Viewmodel and camera motion

Status: resolved
Release: v2.155.0

Spec: `../spec.md`

Strafe tilt, jump/fall/land poses, slide and crouch poses, camera strafe roll and a light bob, all on springs and all scaled by a camera-motion setting.

## Comments

### 2026-11-10, implementation agent

Built:

- `packages/fps-client/src/motion.ts` (no three.js): the `Stride` that the camera bob and the weapon bob both walk to. It advances with the ground covered, and the player's own footstep sound pulls its phase onto the beat, so what you see and hear land together. Also how hard a landing was (`fallSpeed` from the fall height) and the sideways speed relative to the view.
- `packages/fps-client/src/viewmodel/motion.ts`: `WeaponMotion`, every layer on a `Spring`. Strafe tilt (4.5° roll and a little lag), sway that lags the look (clamped), hanging back while rising and falling with the muzzle tipping, a landing dip and nod kicked by fall speed, crouch tuck, prone, and a slide pose (canted hard and pushed out ahead), a sprint carry spring, a bob to the stride (down at each footfall, to the side the weight is on), and breath. A heavier gun (longer ADS time than the M4A1) swings on proportionally slower springs.
- `camera.ts`: a strafe roll of 1° at 5 m/s, a 16 mm vertical bob tied to the same stride, and a landing dip now driven by fall speed (it was driven by height). The camera-motion setting scales the bob, every roll (strafe, slide, Downed, mantle) and the dip. The FOV-effects setting scales the sprint/slide FOV kick and the shot, hit and blast shake.

Decisions:

- **The aim point never moves.** The camera's feel is vertical translation (bob and dip) and roll about the line of sight. Neither turns where the crosshair points. The weapon motion is an offset on the viewmodel's pivot, which is drawn in its own scene, so it can't touch the simulation's aim either. Recoil and flinch stay the simulation's.
- **ADS is still.** Aimed, the gun keeps only breath (0.2 mm). The camera bob and strafe roll fade out with the eased ADS amount, and the landing dip drops to 40 %.
- **At 0 % camera motion nothing moves the view but you.** No bob, roll, dip, sway or pose. The sprint carry stays whole, because it tells you the gun isn't ready, which is information rather than decoration.
- **The slide pose** is a fast, stiff spring (150/17), so the owner's slide kick (entering from a sprint, or a landing slide with Crouch held) snaps straight into the cant. The slide target replaces the crouch tuck rather than adding to it.
- **How new guns take part:** the motion is applied in `viewmodel.ts` on `#pivot`, which every gun (the M4A1 and every `kit.ts` gun) hangs from, so a new viewmodel gets all of it for free. A new gun only needs a correct `handling.adsTime` in core stats, because that sets its weight (its sway lag). Nothing in `viewmodel/` was restructured.

Verified: `test/motion.test.ts` (stride phase and footfall pull, fall speed, strafe sign, the weapon's offsets: none while aimed except breath, none at 0 %, landing dip scaled by fall, heavier gun lags longer). The frame strip is listed below.
