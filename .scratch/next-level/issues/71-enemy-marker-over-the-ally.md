# The enemy marker over the ally

Status: resolved

Release: v2.187.20

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12e.md`), its fourth defect (05, centre right): "the red ENEMY 53 m marker and its triangle sit directly on Rook's ally chevron, so the two markers merge and the triangle hides the chevron."

## Comments

- **Why they met.** An ally usually pings the enemy they are facing, so on your screen that enemy stands just past them. The enemy's marker sits on the point over the enemy's head, and the ally's tag on the point over the ally's head: a few pixels apart. The ally tags already part from each other (design audit 2026-11-10); nothing parted a ping from them.
- **What changed.** `clearOfAllies` (`hud/ping-marks.ts`) runs on the pings before the HUD draws them. A marker that would cover an ally's tag goes straight up until its foot is 4 px over that tag, then over the next tag up if it meets one. It stays in the column over its point, and the tag under it shows whole.
  - The boxes follow the CSS:
    - A marker reaches about 62 px over its point.
    - A tag is 22 px of name, 17 px of chevron (22 px for a Downed ally's cross) and 18 px of label, from its foot, and up to 64 px each side for a long name. At the screen's edge it is centred on its pin.
  - A lifted marker stops at the screen's top. One already up there that touches no tag is never moved.
  - A marker lifted last frame stays lifted 12 px past the tag's border, so one at the border doesn't jump up and down as the ally moves.
- **Seen in the page** (`../ping-clear/marks.mjs`): the HUD's own `PingMarks` and `AllyTagsView` draw the review's layout over Survival Town, an enemy ping 60 px under Rook's tag. `marks.jpg` shows both at full size and `crop.png` the two side by side.
  - As it was, the red triangle lands on Rook's chevron, as in the review.
  - Lifted, "ENEMY 53 m" sits whole over "Rook" and the chevron.

A second-opinion review checked the box sizes against the CSS (13 px small type, a marker 61 to 64 px tall), that the tags and pings come from the same frame in the same CSS pixels, and that the loop always ends. It raised three points, all fixed:
- The screen-top clamp ran on every marker, so a ping near the top would drop 14 px whenever an ally came into view. It now applies only to a lifted marker; I caught it too, and a test holds it.
- At a tag's border a marker could flip between its point and the lifted place frame to frame. It now holds for 12 px past the border once lifted.
- Some boxes ran small: a Downed ally's cross, a Downed edge tag's label, long names, and "Defend here". They are widened.

Verified:
- The `fps-client` typecheck passes.
- `ping-marks-clear` (new: the lift, a marker left alone, a stack of tags, the screen's top both ways, the hold), `pings` and `ally-tags` tests pass.
- `../ping-clear/marks.mjs` drew in the page, where the HUD's new code also runs every frame, with no page errors.
