# The pause menu's buttons are light grey with near-white text

Status: resolved
Release: v2.114.5
Severity: S2
Found by: 35 (pass 2)

## Repro
In any match, Esc. Resume, Loadout, Settings and Leave are browser-default buttons, light grey (`rgb(240 240 240)`) under the menu's near-white text (`rgb(243 241 234)`): the words can't be read. Same with the pad's Options button and on a lost pointer lock.

## Evidence
- `shots/bugs/t56/before-pause.jpg`; pass 2 also `p2-pad-04-pause.jpg`, `p2-lock-02.jpg`.
- Ticket 12 (6f8f453) removed the base `.ds-item` rules with the old main menu; the pause still builds its buttons with that class, and only its size overrides stayed.

## Comments
- Fix: the old rules are back, scoped to `.ds-pause .ds-item` (the only place left that uses the class): the dark panel, no browser border, the menu's text colour, the signal-green left edge on Resume, and the slide and highlight on hover, focus and pad focus. The stylesheet is exported as `MENU_CSS`.
- Seen at 1600x900 and at phone width: `shots/bugs/t56/after-pause-focus.jpg`, `after-pause-phone.jpg`.
- Test: `packages/fps-client/test/menu-css.test.ts`.
