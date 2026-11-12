# Bot skill in view

Status: resolved

Release: v2.187.41

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12g.md`), its fourth defect (03, x 1318-1838, y 818-842): "the new Bot skill row is cut by the footer: only the top half of EASY, NORMAL and HARD shows ... At 1904x929 the setup's last pick needs a scroll and reads as a layout fault."

## Comments

- 2026-11-12, pass 4: the setup's column was 53 px taller than the body at 1904x929. Rather than undo review d's one-mode-per-row list, the picks tighten on desktop screens under 1000 px tall (`lobby.ts`, `min-width: 961px and max-height: 1000px`): map pictures 96 px (the phone's height), 12 px between rows instead of 18, 6 px under each pick's name, and 40 px choices with a mouse (touch keeps 44 px, per DESIGN.md). At 1904x929 the body no longer scrolls and Bot skill ends at y 754, 88 px above the footer at 842; 1920x1080 is unchanged.
- Left as is: a 1366x657 laptop viewport still scrolls (205 px), as it did before; fitting that would need a different layout of the picks, not a tightening.
- Checked: frames from `setup-fit/look.mjs` at 1904x929, 1920x1080, 1366x657 and 390x844 (`setup-fit/after/`, before in `setup-fit/before/`, the review's 03), and the lobby tests.
