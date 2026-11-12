# Loop state

## Now

Paused by Aleix, 2026-11-12.

Pass 5 (2026-11-12) shipped ticket 89, a bunker not a box (v2.187.42). Every review-g ticket (85-89) is resolved, so the next pass runs review h (`.claude/iterate.md`, "Review") and files its tickets. The loop runs from an anchor session that starts every pass. A pass should wait for its review subagent in the foreground so the hand-over runs in the turn the pass began in.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Latest scores (review g, `reviews/2026-11-12g.md`): all ten unchanged from f (picture 6, feel 6, sound 7, depth 7, content 7, UI 7, performance 6, stability 7, identity 6, onboarding 7). Goal: all 9+. All of its tickets (85-89) resolved.
- CI: green through v2.187.41; check v2.187.42.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The shared headless Blender on port 9876 was reset under pass 5 twice (another session's `bkit.reset()` or a crash). Model rebuilds run reliably in their own process: `tools/.blender/blender-5.2.2-windows-x64/blender.exe --background --factory-startup --python <runner>` with a runner that calls `bkit.reset(); bkit.run(script, export=True)`.

- The review's scripted player walks into walls and never kills, so game feel can't be judged from its frames (hit marker, kill confirm, score popup). Turning `capture.mjs` toward the nearest bot before the firing frame would show the kill loop.
