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
- Buttons, segmented choices, crumbs and key hints: uppercase, 0.12-0.18em tracking. The tracking is what makes them feel machined, so it stays on controls and nowhere else.
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
- Content holds the left edge; the world stays visible to the right. Asymmetry lives inside that frame: a block on the left is answered on the right by the picture or the readouts, never by nothing.
- Every page uses the `.ds-page` shell: header with crumb and title, a body that scrolls on its own, and a footer that always shows the action.
- Pickers are `.ds-seg` segmented controls with one choice lit.
- The footer's primary action is `.ds-btn.primary.big`, one per screen, named for what it does now ("Join server", "Start match", "Waiting for host"). When it can't be pressed, its label says why.

## Components

- **Destination list** (main menu): each destination is one row of display type with its readout under it in body type. No icons, no card box: the scrim carries legibility. The lit row has a 4 px signal bar at its left edge; hover and focus grow the bar and slide the title 10 px. Settings sits below the destinations at heading size, as it is not a place to play.
- **Readout**: a small label over a value in heading or display size, tabular. A row of readouts is one strip split by 1px lines, never cards.
- **Squad slot**: one tile per seat of a Squad. A person's slot shows their name at heading size and their role under it ("You", "Host", "Friend"). A seat bots will fill is a dashed frame reading "Bot fills this seat" in `--ds-text-2`. A slot never shows a placeholder person.
- **Connection line**: a status dot (signal for up, alert for down, fair for busy) followed by one sentence that says what the state means for the player and what happens next.
- Key hints: keyboard caps, or the controller's glyphs once a pad drives the screen.

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
