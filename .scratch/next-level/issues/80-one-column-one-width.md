# One column, one width

Status: resolved

Release: v2.187.29

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), UI and UX (02): "on the phone (02) the name field and Rank line stop at x 570 while the destination subtitles run to 690 and the divider to 748, two widths in one column."

## Comments

- **What it is.** In the one-column layout (windows up to 900 px wide or 600 px tall), the name field and the Rank row kept the desktop's 270 px. The destination list and its divider run to the gutter, capped at 720 px. On a 390 px phone the name ended 88 px short of the list, and on a portrait tablet 450 px short.
- **What changed** (`menu.ts`, the small-window block): the name field takes the list's own width, `min(720px, 100%)`. The Rank row and its bar follow it.
- **Left alone.** On a desktop and on a phone on its side, the name stands in its own column right of the list, so its width there is its own.
- **Seen in the page** (`../phone-widths/look.mjs`, `sheet.jpg`). Right edges in css px, read from the page:
  - 390 px phone: the name and Rank went from 286 to 374, the same as the list and divider.
  - 360 px phone: from 286 to 344, the same as the list.
  - 768 px tablet: from 286 to 736, the same as the list.
  - Phone on its side (844×390) and desktop (1600×900): unchanged.
  - No sideways scroll at any size.

No second-opinion review: one CSS value, with no logic.

Verified:
- Frames and measured edges before and after at 390, 360, 768, 844×390 and 1600×900, with no page errors.
- No typecheck: the change is inside a CSS string.
