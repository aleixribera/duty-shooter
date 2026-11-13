# Brass at its size on the screen

Status: resolved

Release: v2.193.3

Spec: `../spec.md`

Review 2026-11-13b's fix first: the ejected cases were drawn at their real 4.5 cm a hand's width from the eye, so one spanned 100-275 px of a 1080-line frame and covered the "+100 Eliminated" popup in nearly every kill frame.

Acceptance: in the capture's `*-kill-*` frames no casing is longer than 40 px.

## Comments

**2026-11-13, loop pass 15 (pass 1).** `Effects.#updateCasings` now scales each case so it is drawn at most 40/1080 of the screen's height: from the camera's vertical FOV and zoom, and its depth along the line of sight (distance / depth², the most perspective stretches it off the centre); one beside or behind the eye shrinks to nothing. Cases further out than about a metre keep their real size. A first try that used plain distance still drew a case off the centre at ~48 px; the depth term fixed that. Test: `packages/fps-client/test/casings-near-camera.test.ts` (fails before: 0.25 of the screen against 0.037). Frames: `.scratch/next-level/brass/after/` (MAIN=switchyard:outposts ONLY=match capture), `brass/sheet.jpg` against review 13b's kill frames: cases now 20-40 px. Second opinion (Sonnet): math and matrices sound; hoisted the per-frame Vector3; noted a near case's shadow shrinks with it, left as is.
