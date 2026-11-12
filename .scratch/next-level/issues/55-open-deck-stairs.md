# Open timber deck stairs

Status: resolved

Release: v2.186.7

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, defect 5): in `../reviews/2026-11-12d/04-play-start.jpg` "the back-deck stairs read as a huge dark brown sawtooth slab blocking the yard". Ticket 47 had boarded the stair's sides, but each step was still a solid box down to the ground. From the Bot Match spawn that read as a cut-out. Ticket 47 left open stringers as its own ticket.

## Comments

**v2.186.7.** The deck stairs on both Survival Town houses are now an open timber flight in the deck's boards:
- treads 4.5 cm thick;
- two sloping stringers under them, each running under the treads' back edges, so every tread sits on them with its nosing overhanging;
- a handrail each side, in the deck's trim paint, on a post at the foot. At the head, the rail's top is level with the deck's railing (1 m over the deck), so the two meet.

You see the yard through the flight, and its shadow falls as a ladder of treads.

How it's built: a new `Builder.openStairs` (`builder.ts`). It walks exactly as `stairs` does: the same steps, now as hidden player clip. So climbing, collision and the bots' nav graph are unchanged. Treads, stringers and rails are drawn and stop bullets. The space under the flight lets bullets through but not players: walking under the high end, you meet the stair's outline. The handrails stop bullets but not players. The old flight had no rail and you could step off its side, and you still can. Clipping the rails would narrow the flight and change the nav graph; that is for a later ticket, if play asks for it.

A second-opinion review checked the stringer and rail geometry against `slope`'s conventions for both axes and both directions. Every tread's back edge sits on the stringers, and the foot posts stand clear of the climb. It found that the rail's head stood 5 cm above the deck's rail; that is fixed.

Verified:
- Typecheck passes.
- `survival-town.test.ts`, `survival-town-nav.test.ts` and `map.test.ts` pass (125/125), including the route up the yard stairs, across the deck and down through the house, on both sides.
- Survival Town rebaked in the dev server (21 s). `../stairs/look.mjs` shoots the north house's stairs square-on and at an angle from the back yard:
  - before (`../deck-stairs/before/`, ticket 47's after): a boarded stepped wall down to the grass;
  - after (`../deck-stairs/after/`): an open flight on stringers with handrails, the yard showing through.
  - No page errors.

The Outposts soak (`survival-town-bots-outposts.soak.test.ts`) failed on the push: in its one match, team 2 took two zones in the first 28 s and held them for the rest of the six minutes. With the old map put back it passed, so the change had tipped it. To tell a broken map from a different roll, I played the match on three more spawn draws on both maps:
- On the new map, both teams took zones and zones changed hands every time (4 to 7 captures).
- The old map had holds as long as this one (team 2 held from 105 s to the end on one draw).
- Kills were even on both maps.

So nothing is broken. The soak was judging one deterministic match, and any change to the map's sight lines can tip it. It now plays two matches, on the first and the middle spawn draw, and asks the same questions of both together. It passes. A map where one team can never take a zone still fails it.
