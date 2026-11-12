# The Bot Match setup shows the map

Status: resolved

Release: v2.187.30

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), UI and UX (03): "in 03 the left two-thirds below the player rows (y 430 to the footer) is empty dark map while 'Mode' and 'Sides' are tiny."

## Comments

- **What it is.** The two sides stood side by side under Players, four short rows each, across two-thirds of the screen. Below them was the map behind the page, under the page's dark scrim. The map was already the one picked and swaps when another is picked, but it read as an empty dark area. "Mode" and "Sides" were 13 px grey labels, under map names at heading size.
- **The call.** The default would be to fill the space with more panels. Instead the map is made the picture: it is the real map the match will play, live, so it is the best preview there is. The empty part was the problem, not the lack of a box.
- **What changed** (`lobby.ts`):
  - From 1360 px wide, a Bot Match page (`.solo`) has three columns. The sides stack in one 400 px column at the left, and the picks keep their 520 px at the right. Between them the scrim thins to 30%, so the picked map shows clearly.
  - The scrim's stops are tied to the columns' edges, so they stay in order at any width.
  - Below 1360 px the middle would be a slit (126 px at 1280), so the two columns stay. Phones keep their one column, picks first.
  - The online lobby is unchanged: its seats and invite need the width.
  - Each pick's name ("Mode", "Sides") is now at body size, bold and in text colour, as a settings section names its rows. It is no longer a small grey note.
- **Seen in the page** (`../setup-map/look.mjs`, `sheet.jpg`). Sizes checked: 1920×1080, 1366×768, 1280×720, 1100×800, 844×390 and 390×844, plus Free-for-all and Switchyard at 1920.
  - 1920: the sides run to x 456, the picks from 1344, and Survival Town shows clear between them.
  - Switchyard picked: the yard swaps in behind.
  - 1366: the same three columns, with the yard and the town clear in a 324 px middle.
  - The smaller sizes are as before.
  - No sideways scroll and no page errors.

No second-opinion review: CSS and one class name, with no logic.

Verified:
- The `fps-client` typecheck passes. No test covers the lobby page's markup.
- Frames before and after at every size above, with the column edges and label size read from the page.
