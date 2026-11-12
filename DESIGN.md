# Duty Shooter design language

The menus, the lobby, the Battle Royale screen, settings and the HUD are one system. Its tokens live in `packages/fps-client/src/ui/theme.ts`: use those variables, and add a variable there before a colour, size or duration appears anywhere else.

Sources, language only (no brand, colours or fonts taken): the `bmw-m` entry in the `design-md` library for the near-black floor, square silhouettes and uppercase engineered type, and the `spacex` entry for the film-title-card scale and telemetry set beside full-bleed imagery. Readability in play (`design-audit`'s rules) comes before everything here.

## Character

A machined instrument laid over a live map. The 3D world is the picture; the UI is set like a title card over it: a few words in very large condensed capitals, and beside each the live readout that matters (who is online, how many seats, what the Ring will do). Nothing is decoration. If an element carries no information and no action, it goes.

The default answer for a modern game menu is glass panels, gradients, glow and a row of icon cards. This system departs from it: flat ink, one signal colour, type scale doing the hierarchy, and the game's own numbers as the ornament.

## Colour

| Role | Variable | Value |
| --- | --- | --- |
| Page floor | `--ds-ink` | `#0b0e13` |
| Panel | `--ds-panel` | `#12161d` |
| Raised | `--ds-raised`, `--ds-raised-2` | `#1c222c`, `#252c38` |
| Text | `--ds-text`, `--ds-text-2`, `--ds-text-3` | `#f3f1ea`, `#b4bac5`, `#8e96a3` |
| Signal (the one accent) | `--ds-signal`, `--ds-signal-hi`, `--ds-signal-dim` | `#8fe3c8`, `#b4f0dc`, 14% of it |
| On signal | `--ds-signal-ink` | `#062118` |
| Danger | `--ds-alert` | `#ff6159` |
| Ring hazard (Battle Royale only) | `--ds-hazard`, `--ds-hazard-dim` | `#a68cff` (7.2:1 on ink), 16% of it |
| Teams | `--ds-blue`, `--ds-orange` | `#3d8bff`, `#ff9a3c` |
| Connection quality | `--ds-good`, `--ds-fair`, `--ds-poor` | `#7fdc6a`, `#f2c230`, `#ff5d52` |
| Lines | `--ds-line`, `--ds-line-2` | 12% and 22% of the text colour |
| Scrims | `--ds-scrim`, `--ds-scrim-soft` | 90% and 72% of `#07090d` |

- Signal marks what can be acted on, or the one choice that is selected. It is never decoration and never status text.
- Team colours always come with a mark, never colour alone.
- Hazard is the Ring's colour and nothing else's: its wall in the world, the outside warning, the Ring on the island map and its countdown while it closes. It is a warning, not a second accent: never on something to press. (It is violet on purpose: nothing else in the game is.)
- `--ds-text-3` is for labels on solid panels only. Over the map, use `--ds-text-2` or `--ds-text` on a scrim.
- Running text is `--ds-text` or `--ds-text-2`, never `--ds-text-3`.

## Type

One family, `--ds-font`: Bahnschrift, then DIN Alternate, Roboto Condensed, Arial Narrow. System fonts only, so the first screen never waits for a download. A single self-hosted display face is allowed later if its subset stays under 40 KB and the system font still paints first.

Five sizes do the work. Big things are very big and small things small; nothing sits in between.

| Step | Variable | Size | Use |
| --- | --- | --- | --- |
| Display | `--ds-type-display` | 30-60 px, fluid | Main menu destinations, a screen's one figure |
| Title | `--ds-type-title` | 32-52 px, fluid | Page titles (`h1`) |
| Heading | `--ds-type-heading` | 22 px | A block's name, a slot's name |
| Body | `--ds-type-body` | 16 px | Descriptions, readouts, fields |
| Small | `--ds-type-small` | 13 px | Labels, key hints, meta |

- Display and title: bold, uppercase, condensed, 0.01-0.03em tracking, leading 0.9-0.95.
- Buttons, segmented choices, chips and key hints: uppercase, 0.12-0.18em tracking. The tracking is what makes them feel machined, so it stays on controls and nowhere else.
- Descriptions, readouts and labels over values: sentence case, regular weight. No tracked caps on running text.
- Numbers use tabular figures (`font-variant-numeric: tabular-nums`), so scores, timers and counts don't jitter.
- One colour per headline: no accent word, no gradient text.

## Shape and depth

- Square corners. Round only circular icon controls and status dots.
- Separate with a 1px line or a flat surface step, never both, and never a shadow on something at rest. A dialog that floats may have one.
- No backdrop blur, glow or gradient on surfaces, buttons or text. Everything stays cheap to draw over the live map. The one gradient is the scrim behind text over the world, horizontal or from the bottom edge.
- An empty slot is a 1px dashed frame: the only dashed line.

## Layout

- One pair of outer margins per width (`--ds-gutter`: 56 px on desktop, 16 px on a phone).
- Every outer edge adds the device's inset (`--ds-safe-t`, `--ds-safe-r`, `--ds-safe-b`, `--ds-safe-l`): pages through the `.ds-ui` root's padding, the HUD and the touch controls in each corner's own offset. Nothing reads the `env()` values directly.
- Content holds the left edge; the world stays visible to the right. Asymmetry lives inside that frame: a block on the left is answered on the right by the picture or the readouts, never by nothing.
- Every page uses the `.ds-page` shell: header with the title, a body that scrolls on its own, and a footer that always shows the action.
- A phone held sideways has width and no height (under 520 px tall): the header is one line (the title at heading size, the tabs beside it scrolling sideways) and the footer one row, so the body keeps the screen. The main menu puts the name and the Rank right of the list, and Pause its controls beside its actions, so the way to play and what each button does show without a scroll.
- An upright phone has height and no width: tabs wrap onto more rows instead of scrolling out of sight, so every section's name shows.
- On touch every control is 44 px or more on its short side with 8 px or more to its neighbour, and a text field never takes the focus by itself (that would raise the keyboard over the page).
- Pickers are `.ds-seg` segmented controls with one choice lit.
- The footer's primary action is `.ds-btn.primary.big`, one per screen, named for what it does now ("Join server", "Start match", "Waiting for host"). When it can't be pressed, its label says why.

## Components

- **Destination list** (main menu): each destination is one row of display type with its readout under it in body type. No icons, no card box: the scrim carries legibility. The lit row has a 4 px signal bar at its left edge; hover and focus grow the bar and slide the title 10 px. Settings sits below the destinations at heading size, as it is not a place to play.
- **Readout**: a small label over a value in heading or display size, tabular. A row of readouts is one strip split by 1px lines, never cards.
- **Squad slot**: one tile per seat of a Squad. A person's slot shows their name at heading size and their role under it ("You", "Host", "Friend"). A seat bots will fill is a dashed frame in `--ds-text-2`: "Bot" offline, "Open seat" online, where a friend may still take it. A slot never shows a placeholder person.
- **Lobby seat**: one panel row per seat, its number, the name at heading size and its role under it ("You · Host") in small type, ping in ms coloured by quality. Your own seat is a raised step with a 4 px bar in text colour: signal is kept for what you pick. An open seat is the dashed frame; offline there are none, as nobody can take them.
- **Settings section**: the section's name at heading size (a live state under it where there is one, such as the controller connected), then its rows as one list split by 1px lines. A row's note is a few small words, only where the label and the control can't say it ("The crosshair keeps its own size"). A row lights on hover or focus with a raised step and the 4 px signal bar.
- **Dialog** (loading, connecting, errors, tips): a title card at the lower left over the world, not a centred box. Its title at title size, one body paragraph, the buttons in a row with the way on focused. A loading dialog shows its percent at display size. An error carries a 4 px alert bar at its left edge.
- **Pause**: the destination list again, over a scrim: the actions at display size with the 4 px bar (signal on Resume and on the one under the pointer or pad), the controls on a flat surface at the right. The HUD fades out under it.
- **Scoreboard**: one flat panel, no outer line. Each team's name at heading size with a 4 px bar in its colour and its mark. Column heads in sentence case. Your row is a raised step with a 4 px bar in text colour. On a phone the teams stack in one column. The feed, toasts and round banner hide while it is up. Its header names the mode and, beside it, the match's goal in one line: the scoreboard is where a player looks to ask "what are we doing". On touch it is opaque and has the screen: the match bar, captions, hints, ally tags and pings hide under it.
- **Match end panel**: the result in one line ("Victory", "Defeat", "Draw", who wins) heads the panel on its plate, never on the sky; then the MVP, your match as readouts, and the Rank bar. On a phone held sideways the panel is the whole screen's worth: the scoreboard comes only when its button is held on, in the panel's place, and the kill feed goes.
- **HUD plates and toasts**: a flat ink surface or a scrim from the bottom edge, never both a line and a surface. A toast is one body-size line with a 4 px bar in text colour; on a phone it runs full width above the readouts. On touch that slot has one speaker at a time, at body size: a caption or toast first, the hint line when it is quiet. A bot is marked by the word "bot" in small text after the name, not by a boxed tag. The kill feed leaves it out when everyone but you is a bot (a Bot Match), where it would only repeat down the feed.
- **Changelog**: at the main menu's foot, the word Changelog and the version running; it opens a page of releases, newest first, under each day's name at heading size: what changed in body type and its version beside it in small, as one list split by 1px lines. Up and down scroll it.
- **Connection line**: a status dot (signal for up, alert for down, fair for busy) followed by one sentence that says what the state means for the player and what happens next.
- Key hints: keyboard caps, the controller's glyphs once a pad drives the screen, or the touch control's own glyph once a finger does. Which one shows follows the last input used, never the browser's name.
- **Touch controls** (`.ds-tc`, in play, only while touch drives the game): circles in `--ds-touch-line` on `--ds-touch-fill`, the only round controls besides icon buttons. Fire is the largest (76 px) under the right thumb, Aim, Reload, Jump and Crouch within a roll of it, the rest a reach further; the stick is a ring that appears where the left thumb lands, with its sprint lock marked over the top of its travel. Pause, the scoreboard and the map stand in a column at the top left, Ping at the top right. A control lit in signal is one that is on (aiming, crouched, the run locked) or the one thing to press now (Use). The Use prompt in the middle of the screen is a button too: a tap on it presses Use. Held upright, the game shows a plain "Turn your phone" notice on ink with a Menu button instead of a squeezed layout: menus work upright, the fight does not.
- **Hint line** (`.ds-hintline`): one body-size line on a plate above the readouts, the control first as a cap or glyph and then what it does ("Move", "Reload"). One at a time, at the moment it matters, gone once the player has done it. On touch the glyph-only buttons are named this way as they come up, Fire first ("Aim at an enemy and the gun fires. Or hold this").
- **Goal line**: under the opening countdown's number, the match's goal in one body-size line ("First team to 75 kills, or ahead when the clock runs out"). The mode's name, the number and the goal share one plate; on touch it stands right under the match bar, off the crosshair.

## Motion

- Transform, opacity and colour only. `--ds-fast` (120 ms) for feedback, `--ds-slow` (240 ms) for entrances, both on `--ds-ease`.
- A press answers within the frame. Nothing a player clicks waits for an animation, and navigation between screens is instant: no screen fades.
- Choreography is allowed where it says something: the main menu's destinations rise in, 50 ms apart, the first time the menu shows; a slot that a friend just took fills in. Each plays once and never again on a redraw of the same screen.
- Everything has a `prefers-reduced-motion` version that keeps the content and drops the travel.
- Preparation's camera dive (Battle Royale) is the one deliberate exception to "no screen fades".

## HUD

- Keep the centre clear. Information sits at the corners and edges, inside the safe area.
- Show what a player acts on: ammo, health, objective, score, timer.
- Critical states (low ammo, low health, connection lost) change shape or text as well as colour.
- On touch nothing readable sits under a thumb: the health and the ammo move to two plates at the bottom middle, between the stick's ground and the fire cluster, the score lines stand to the right of the crosshair, and edge markers keep off the controls' ground (`TOUCH_GROUND` in `hud/markers.ts`).
- A count's glyph is the thing counted: the grenade count wears a grenade, not a dot.
- An ally's tag carries their name up to 40 m, through walls too, where the tag is dimmer; past that only the chevron shows. A tag held to the screen's edge always carries the name: a bare chevron there says nothing of who it points at. Tags never lie on each other: of two names that would overlap the nearer ally keeps theirs, and edge tags that meet step along the edge (`allyTags` in `hud/ally-tags.ts`).
- Figures that change in place (ammo, health, scores, the clock) are tabular, so a digit changing never shifts the line.

## Words

- A title stands alone: no eyebrow or breadcrumb above it, no explanatory line under it. The layout and the Back button say where you are.
- Say a fact once per screen. A state shown in a chip isn't repeated in a sentence; a picker's lit choice isn't repeated in a readout; a button never sits beside a key hint naming the same action (no "Esc Back" next to Back).
- Add a line only when it tells the player something they need that the screen doesn't show: why a control is shut, what a choice means when its name doesn't say, what to do when something failed. Then one short sentence.
- Labels are one to three words. Notes under a row are a few words, never a paragraph.

## Do

- Reuse `.ds-btn`, `.ds-seg`, `.ds-chip`, `.ds-readouts`, `.ds-label`, `.ds-title` and `.ds-page` before writing new styles.
- Say what a disabled control is waiting for, in its own label or the line beside it ("Coming soon: local bots need their own thread").
- Check every UI change at desktop and phone width, then run `design-audit`.

## Don't

- Don't add a second accent colour. The Ring hazard colour belongs to one thing and is not an accent.
- Don't use a centred hero, icon cards, a column of icon-topped tiles, pill badges, eyebrows over headings or gradient buttons.
- Don't put hex values in components.
- Don't use `--ds-signal` for status text that can't be acted on.
- Don't show a number that isn't real: no sample players, no invented counts.
