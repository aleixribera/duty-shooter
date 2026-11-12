# Loop state

## Now

Pass 3 (2026-11-12) shipped ticket 87, enemy markers apart (v2.187.40). Next: ticket 88, bot skill in view (review g). The loop runs from an anchor session that starts every pass. A pass should wait for its review subagent in the foreground (run it without background, or block on it) so the hand-over runs in the turn the pass began in.

## Where things stand

- Arc "next level" (`spec.md`): tickets 01-84; every one filed from reviews up to (f) is resolved (73-84 on 2026-11-12, v2.187.22 to v2.187.33).
- Long-running, open: 19 attachments (phase 1 and the gunsmith shipped v2.165.0; models and sight pictures left), 29 refactors (claimed), 33 the Ring's final tuning (waits on 35), 35 one picture fast on weak PCs (phases 1-2 shipped), 36 the whole match is the countdown (parts 1-2 shipped).
- Latest scores (review g, `reviews/2026-11-12g.md`): all ten unchanged from f (picture 6, feel 6, sound 7, depth 7, content 7, UI 7, performance 6, stability 7, identity 6, onboarding 7). Goal: all 9+. Open from it: 88-89 (85-87 resolved).
- CI: green through v2.187.38; check v2.187.39-40.

## Broken

Nothing known.

## wip/ branches

None.

## Queued runs

None.

## Ideas for the loop

- The review's scripted player walks into walls and never kills, so game feel can't be judged from its frames (hit marker, kill confirm, score popup). Turning `capture.mjs` toward the nearest bot before the firing frame would show the kill loop.
