# An open balustrade round the deck

Status: resolved

Release: v2.187.33

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), Picture (04, upper left): "the balcony balustrade is still a solid slab, now ruled with vertical boards."

## Comments

- **What it is.** Each house's back deck had a 1 m wall of boards round its three open edges, 8 cm thick. It was painted as a fence. From the yard it read as a pale slab on top of the deck's underside, closing off the upper floor. In 04 it covers the whole top of the house's back.
- **The call.** A deck's railing is open: rails and spindles, so the house wall and window behind show through. That makes the deck more exposed than the board wall did. That is the honest result: a deck is a lookout, not a bunker, and the porch, the upper rooms and the stairwell are the house's cover.
- **What changed** (`survival-town.ts`): `balustrade(side, along, at, from, to)` builds each run.
  - Posts sit at the ends and at most 1.6 m apart. A top rail and a bottom rail run between the posts, and square spindles 4 cm wide stand about 15 cm apart in each bay, all in the house's trim.
  - The posts and rails stop players and shots. The spindles stop shots only, so roughly three shots in four go through between them, and so does a bot's look.
  - A hidden player clip over the whole run holds the deck's edge, so nobody walks between the spindles or off the deck, as with the board wall. Its height is the same 1 m.
  - The back run has its corner post. The east run ends at it rather than doubling it. The rails stop inside the end posts, so no two faces share a plane.
- **A second-opinion review** checked collision and found none lost:
  - The hidden clips cover exactly what the three board walls did, the corner is closed, and the stair opening is 1 cm narrower. The route up the yard stairs and across the deck still passes.
  - The north house mirrors correctly, and grenades still stop at the clip.
  - It found the spindles spaced along the whole run, so some sat inside posts and some stood half-buried against one or doubled one. They are now spaced within each bay between posts.
- **Cost.** The town has 222 more solids (2,210 to 2,432). 20,000 random shots through the town took 60 to 70 ms after and 62 to 76 ms before, within noise (`../balustrade/rays.test.ts`).
- **Seen in the page** (`../balustrade/look.mjs`, `sheet.jpg`): Survival Town walked alone, the north house's deck from three spots, before and after.
  - From the far corner of the yard, as in 04: a white railing on the deck where a slab was.
  - From the middle of the yard: the upstairs window and wall show between the spindles.
  - From under the deck's edge, looking up: posts, rails and sky through the spindles.
  - No page errors.

Verified:
- The `range` typecheck passes.
- `survival-town` and `survival-town-nav` tests pass (98/98). The z-fighting test caught rail ends flush with the posts and a doubled corner post, both fixed.
- Deck frames before and after from three spots, again after the spacing fix (`after-close.jpg`), and the shot timing before and after.
