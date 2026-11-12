# Ally names through walls

Status: resolved

Release: v2.186.5

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, defect 4): in `../reviews/2026-11-12d/08-play-late.jpg` "three teal ally chevrons with no names float over the wall". At a glance they read as hit markers, and they didn't say who was behind the wall.

## Comments

**v2.186.5.** An ally's name now shows up to 40 m whether or not a wall is between you. With a wall between you, the whole tag is drawn dimmer (65 %). Past 40 m only the chevron shows, as before.

This changes a call from the Battle Royale arc (`../../battle-royale/issues/52-ally-markers.md`, "through walls, only the chevron"). That call was the lead's, recorded as one the owner can change. What changed it: the commonest place to see teammates is inside your own house, from outside it, and there the rule left a row of bare chevrons over the siding.
- Tried first: names within 15 m behind a wall. In a real match the team in the house was farther than that, and the view still showed three bare chevrons.
- The sight check stays and now picks the dimmer tag.
- The rest is unchanged:
  - the crosshair fade;
  - of two overlapping names, the nearer ally keeps theirs;
  - edge tags;
  - Downed tags;
  - enemies get nothing.

`DESIGN.md` and `GLOSSARY.md` (Ally tag) now state the new rule.

Verified:
- `ally-tags.test.ts` passes (17/17):
  - behind a wall within 40 m, the name shows with `hidden`;
  - in sight, the tag is not dimmed;
  - past 40 m, the chevron alone.
- Typecheck passes.
- `../ally-names/look.mjs` starts a Survival Town team Bot Match and looks round from the spawn nine seconds in.
  - Looking at the house the team ran into, all three allies (Rook, Briar, Ember) show their names on dimmed tags over the wall (`../ally-names/after/yaw-4.jpg`).
  - Before the change, the same view showed three bare chevrons.
  - No page errors.

Also from the same review: the "strip of sky at the stairwell's edge" (05, top left) was looked for from five spots under and beside the stairwell in both houses (`../stairwell/look.mjs`, `../stairwell/before/`). No gap showed. Most likely it was the upstairs front window seen through the opening, which is open to the sky by design. Left as not a defect.
