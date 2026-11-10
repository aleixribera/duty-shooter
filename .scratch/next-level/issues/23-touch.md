# Touch controls

Status: resolved
Release: v2.153.0

Spec: `../spec.md`

A phone reaches a match with no controls (design audit F01, high). Twin sticks, fire, aim, jump, crouch, reload, swap, with auto-fire as an option, and safe-area insets.

## Comments

Built by the touch sub-agent on top of v2.151.0 (uncommitted; the owning session integrates). Decisions, each taken without asking, as the brief says:

- **Touch mode follows the last input, never the browser's name.** `touch/mode.ts` keeps one flag: a `pointerdown` with `pointerType: 'touch'` (or a `touchstart`) turns it on, a key, a mouse move with buttons or a pad turns it off. It puts `ds-touch` on `<html>`; the HUD, the menus and the controls read that class. A laptop with a touch screen gets the controls when it is touched and loses them at the next key.
- **Where the code lives.** `touch/logic.ts` is the pure part (stick maths, sprint and its lock, the look's rate and acceleration, pointer bookkeeping, the aim read, aim slowdown, auto-fire's rule); `touch/controls.ts` is the DOM layer with its CSS; `touch/mode.ts` the flag. `input.ts` only gained wiring: the `Touch:<action>` and `Auto:fire` codes, `touchSink`, `touchContext`, `touchAssist` and `touchMode`.
- **Layout (landscape).** Floating stick: it stands where the left thumb lands, anywhere in the lower left 36% x 70%. Fire (76 px) under the right thumb at the lower right; Aim (60), Reload, Jump and Crouch (52) a thumb's roll from it; swap, grenade and melee (48) a reach further; Use (60, signal) shows only while there is something to use. Pause, scoreboard and map in a column at the top left, Ping at the top right. Every target is 44 px or more with 8 px or more to its neighbour, and every offset counts from `--ds-safe-*`.
- **Look.** A drag anywhere that is not a control turns the view: 0.034 degrees per px at sensitivity 10, the vertical at 0.72 of the horizontal, a mild acceleration on fast swipes, its own sensitivity (`touchSensitivity`) and its own aim-down-sights multiplier (`touchAdsMultiplier`, added because a thumb's ADS wants a different ratio from a mouse's). The fire button is also a look surface: a thumb that lands on Fire and drags aims while it fires.
- **Sprint.** Full forward deflection sprints. Dragging past 1.7 radii and letting go locks the run (a mark over the stick's travel shows where); the next touch on the stick ends it. Chosen over a separate sprint button: one thumb less.
- **Aim and Crouch are toggles on touch**, whatever the hold/toggle settings say for keys: a thumb cannot hold Aim and drag the view with the same finger. Holding Crouch goes prone. Slide is Crouch while sprinting, as on keys.
- **Scoreboard is a toggle** that hides the fight controls and the zones while it is up, so a finger scrolls the board. Only its own button and Pause stay.
- **Portrait: a plain "Turn your phone" notice, not a second layout.** The fight needs both thumbs at the sides and a wide view; a portrait layout would put the sticks over the picture's lower half and halve the horizontal field. So: turned upright in play, the game pauses itself (the pause menu is usable upright); resumed upright, an opaque notice says to turn the phone and has a Menu button. Every menu, the lobby, Settings, the loadout and the Profile work upright.
- **Auto-fire** (on by default, `touchAutoFire`): the trigger pulls itself once the crosshair has rested on an enemy for 170 ms and lets go 110 ms after it leaves. Only inside 1.5x the weapon's last falloff band; a scoped rifle only through the scope; never at a Downed seat, never through a wall (the sight line to the chest decides), never while throwing, reviving, mantling or on a ladder. It presses the same fire button a finger does: the simulation gets nothing a mouse player could not send, and its fire rate limit applies as to anyone.
- **Aim slowdown** (on by default, `touchAimAssist`): the player's own drag turns less (down to 0.55) while the crosshair is on or beside an enemy. It scales the drag; it never turns the view by itself, so nothing is sent that a slower hand could not send. Off for mouse and pad: the code path only runs in touch mode.
- **Multi-touch.** Pointer Events with capture, one pointer id per control; a finger that lands on nothing is ignored, a third and a fourth break nothing; `touch-action: none`, no selection, no callout, no tap highlight, `overscroll-behavior: none`; the audio unlocks on the first touch (the existing unlock listens to `pointerdown`).
- **Fullscreen and landscape lock** are asked for from the player's own press on a play button or Resume, and only where `(pointer: coarse)` matches; a refusal (iOS Safari has neither) is swallowed and the game plays on as it is.
- **HUD on touch.** Health and ammo move to two plates at the bottom middle, between the stick's ground and the fire cluster; the score lines stand right of the crosshair on short screens; the range overlay is compact beside Pause; edge markers (allies, pings, zones) keep off the controls' ground (`TOUCH_GROUND` in `hud/markers.ts`). Prompts say "Use", the pause menu's Controls list shows the touch glyphs (and hides "Rebind in Settings"), the spectator keys are glyphs, the vote reads "Tap to vote".
- **Settings.** A `touch` section (`SECTION_SETTINGS.touch`): Touch sensitivity, Touch aim-down-sights sensitivity, Auto-fire, Aim slowdown over enemies. For the settings agent: the four fields are new with defaults; the section is listed with the others and I left its place in the tab order to you.
- **Menus on a phone.** Under 520 px of height the page shell uses a one-line header (title, no crumb, tabs scrolling sideways) and a one-row footer; every `.ds-btn` is 44 px or more on touch; Play Online no longer gives its name field the focus on touch (the keyboard covered the page).

Verified (scripts and pictures in `.scratch/next-level/touch/`, all through `launchChrome()` with real `Input.dispatchTouchEvent` touches, several fingers at once):

- `range.mjs` (Practice Range, 844x390): 47/47.
- `match.mjs` (Bot Match, 844x390): 15/15, with kills made by touch.
- `tour.mjs` (every screen at 844x390, 390x844 and 1920x1080).
- Unit tests: `test/touch-logic.test.ts`, `test/touch-input.test.ts`, `test/hud-corners.test.ts`.

Not verified: no real phone was used. Chrome's touch emulation stands in for one, so iOS Safari's behaviour (fullscreen refusal, the rubber band, the home bar's gesture area) is reasoned, not seen.
- 2026-11-10, owner: shipped in v2.153.0 (checked in that tag). Verified with Chrome's touch emulation only; a real phone, iOS Safari above all, is still to be tried by a person.
