# Find and remove the worst-tick spikes

Status: open
Blocked by: 28

Spec: `../spec.md`, Testing seam 4

Ticket 28 left the worst tick at 15.5 to 49 ms across 60-person runs and one 209 ms tick in a soak, against a 16.7 ms bar. The CPU cap on `remote-test` is suspected, but that's unproven. Measure with no cap on the real machine or a run that records stalls separately, capture what each spike was doing, and fix what's in the game. The bar is the reliability the owner asked for, so an unexplained spike doesn't count as passed.

## Comments
