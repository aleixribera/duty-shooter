# Duty Shooter design language

The menus, the lobby, the Battle Royale screen, settings and the HUD are one system. Its tokens live in `packages/fps-client/src/ui/theme.ts`: use those variables, and add a variable there before a colour, size or duration appears anywhere else.

The style is **Backlit**, chosen by Aleix on 2026-11-13 from two rounds of mockups. The reference is in `.scratch/next-level/ui/backlit/`. Its five frames (`menu`, `hud`, `kill`, `loadout`, `results`) are the look. `mockup.html` holds the CSS that draws it: the `.d-backlit` rules and the shared base above them. Only the language is borrowed: the angled plates of Apex Legends and Titanfall, and keyboard backlighting, where light comes through a shape rather than sitting on it. Readability in play (`design-audit`'s rules) comes before everything here.

## Character

A dark room with the lights down. Every screen sits in low light: graphite plates with cut corners, grey labels, white numbers. Light means something: the one thing chosen, the one action to take now, a number that just changed, a kill. Whatever is lit is lit from behind: its edge glows warm white, and the light leaks out around its cut corners. Nothing else glows.

The default answer for a modern shooter menu is frosted glass, rounded corners, a cyan accent and gradient badges. This system departs from it in four ways:
- opaque graphite with no blur, which is cheap on the toaster;
- cut corners instead of round ones;
- one warm light instead of a coloured accent;
- light used as the reward, never as decoration.

The 1955 test-site theme lives in the world, the sound and the countdown, never in the UI.

## Light

- **Lit means a backlit plate:**
  - a 2 px edge in `--ds-light-edge`;
  - a halo in `--ds-light-halo` (`filter: drop-shadow(0 0 14px …)`) that follows the cut shape;
  - a fill lit from below (`--ds-plate-lit`).

  Text on a lit plate is `--ds-text`. No surface is ever filled with the light itself.
- **One lit plate per group:** the selected row of a list, the chosen tile of a slot, the chosen loadout. Each screen also has one lit action (the footer's primary), plus at most one reward it is about (the unlock card after a match). If two things are lit in one group, one of them is wrong.
- **Hover and focus** light the edge at half (`--ds-light-half`) with no halo. Selection lights it fully.
- **Lit text** has no plate. It is used for:
  - the match clock;
  - the score popup;
  - the result ("Victory");
  - the next Rank;
  - a figure that just changed.

  It is `--ds-light` with a 22 px text glow. A figure at rest is `--ds-text` with no glow.
- **The menu darkens the world behind it.** A radial scrim, darkest at the edges, makes the lit row the brightest thing on screen. In play the world can't be darkened. So the HUD rests unlit, and only the clock, your own lines in the feed and the kill moment give off light.
- **Light comes on in one move:** opacity, plus `filter: brightness` falling from about 2.4 to 1 over 300 to 500 ms. Never animate a blur radius, a halo's size or a shadow's spread.

## Colour

| Role | Variable | Value |
| --- | --- | --- |
| Page floor | `--ds-ink` | `#0b0c0e` |
| Plate | `--ds-plate` | 90% of `#111315` |
| Plate edge, unlit | `--ds-plate-edge` | `#34373b` |
| Raised | `--ds-raised`, `--ds-raised-2` | `#1b1d20`, `#24272b` |
| Text | `--ds-text`, `--ds-text-2`, `--ds-text-3` | `#fbf6ec`, `#b3b5b8`, `#8b8e92` |
| Light (the one accent) | `--ds-light`, `--ds-light-edge`, `--ds-light-half` | `#ffe2b0`, `#ffe7c2`, `#8c7a5c` |
| Halo | `--ds-light-halo` | 45% of `#ffce8c` |
| Lit fill | `--ds-plate-lit` | `#3b3226` at the bottom edge to `#141516`, radial |
| Danger, the kill marker | `--ds-alert` | `#ff4a3d` |
| Ring hazard (Battle Royale only) | `--ds-hazard`, `--ds-hazard-dim` | `#a68cff` (7.2:1 on ink), 16% of it |
| Teams | `--ds-blue`, `--ds-orange` | `#4d94ff`, `#ff8a2a` |
| Connection quality | `--ds-good`, `--ds-fair`, `--ds-poor` | `#7fdc6a`, `#f2c230`, `#ff5d52` |
| Lines | `--ds-line`, `--ds-line-2` | 12% and 22% of the text colour |
| Scrims | `--ds-scrim`, `--ds-scrim-soft` | 90% and 72% of `#060708` |

- `--ds-signal*` becomes `--ds-light*`. Rename it in one step and leave no alias behind. The old mint signal is gone.
- The light marks what is chosen, what to do now, and the reward moments listed under Light. It is never decoration and never status text.
- Team colours always come with a mark, never colour alone. The light never stands for a team.
- Hazard is the Ring's colour and nothing else's: its wall in the world, the outside warning, the Ring on the island map and its countdown while it closes. It is a warning, not a second accent, so it is never on something to press. (It is violet on purpose: nothing else in the game is.)
- `--ds-text-3` is for labels on plates only. Over the map, use `--ds-text-2` or `--ds-text` on a scrim or a plate.
- Running text is `--ds-text` or `--ds-text-2`, never `--ds-text-3`.

## Type

Two self-hosted families replace the system stack:
- **Display** is Chakra Petch, 600 and 700 (`--ds-font-display`). It sets destinations, titles, figures (scores, the clock, ammo, health, Rank) and controls.
- **Text** is IBM Plex Sans Condensed, 400 and 600 (`--ds-font`). It sets readouts, descriptions, labels, the feed and notes.

Rules for loading them:
- Both are under the SIL Open Font License.
- Ship them as woff2, Latin subset only, from the game's own files: no font request to another site at runtime.
- Use `font-display: swap` with the old system stack as the fallback (Bahnschrift, DIN Alternate, Roboto Condensed, Arial Narrow), so the first screen never waits for a download.
- Keep the four files under 100 KB together. Preload only Chakra Petch 700.

Five sizes do the work. Big things are very big and small things small; nothing sits in between.

| Step | Variable | Size | Use |
| --- | --- | --- | --- |
| Display | `--ds-type-display` | 30-60 px, fluid | Main menu destinations, a screen's one figure |
| Title | `--ds-type-title` | 32-52 px, fluid | Page titles (`h1`) |
| Heading | `--ds-type-heading` | 22 px | A block's name, a slot's name |
| Body | `--ds-type-body` | 16 px | Descriptions, readouts, fields |
| Small | `--ds-type-small` | 13 px | Labels, key hints, meta |

- **Display and title:** Chakra Petch 700, uppercase, 0.02-0.06em tracking, leading 0.9-1.
- **Buttons, segmented choices, chips and key hints:** Chakra Petch 600, uppercase, 0.08-0.12em tracking. The tracking stays on controls and nowhere else.
- **Descriptions, readouts and labels over values:** Plex, sentence case, regular weight. No tracked caps on running text; small labels over values may be uppercase at 0.1em.
- **Figures that change in place must not shift.** Use `tabular-nums`. If Chakra Petch's digits turn out proportional, give each changing figure a fixed `ch` width instead.
- One colour per headline: no accent word, no gradient text.

## Shape and depth

- **Cut corners.** A plate is cut at the top left and the bottom right:
  - 14 px (`--ds-cut`) by default;
  - 10 px on rows and tiles under 72 px tall;
  - 8 px under 40 px.

  Draw it with `clip-path` on two pseudo-element layers: the edge, then the fill inset by the edge width. The halo is a `filter: drop-shadow` on the element itself, so it follows the cut. `mockup.html`'s `.d-backlit` rules are the reference implementation.
- Keep the edge and fill variables local to the plate. A lit card must not light the plates inside it; the mockup resets `.r-card .r-btn` for this.
- **Round shapes** are only for circular icon controls, status dots and touch controls.
- **Plates:**
  - Unlit: a 1 px edge in `--ds-plate-edge` on `--ds-plate`.
  - Lit: as described under Light.
  - Over the menu's scrim, a list's unlit rows have no plate at all; only the lit row is a plate.
- **No backdrop blur, ever.**
  - The only gradients are the scrims and the lit fill.
  - The only glows are the lit plate's halo and lit text.
- **Cost on the toaster.** A halo is a filter on a small, still element, painted once. Never put a filter on something that redraws every frame (the crosshair, a moving marker), or on a plate wider than half the screen.
- An empty slot is a 1 px dashed frame with the same cut corners: the only dashed line.

## Layout

- One pair of outer margins per width (`--ds-gutter`): 56 px on desktop, 16 px on a phone.
- **Safe areas.** Every outer edge adds the device's inset (`--ds-safe-t`, `--ds-safe-r`, `--ds-safe-b`, `--ds-safe-l`):
  - pages through the `.ds-ui` root's padding;
  - the HUD and the touch controls through each corner's own offset.

  Nothing reads the `env()` values directly.
- Content holds the left edge; the world stays visible to the right. Asymmetry lives inside that frame: a block on the left is answered on the right by the picture or the readouts, never by nothing.
- Every page uses the `.ds-page` shell: a header with the title, a body that scrolls on its own, and a footer that always shows the action.
- **A phone held sideways** has width and no height (under 520 px tall):
  - the header is one line: the title at heading size, with the tabs beside it scrolling sideways;
  - the footer is one row, so the body keeps the screen;
  - the main menu puts the name and the Rank to the right of the list;
  - Pause puts its controls beside its actions.

  That way the way to play, and what each button does, show without a scroll.
- **An upright phone** has height and no width: tabs wrap onto more rows instead of scrolling out of sight, so every section's name shows.
- **On touch:**
  - every control is 44 px or more on its short side, with 8 px or more to its neighbour;
  - a text field never takes the focus by itself, which would raise the keyboard over the page.
- Pickers are `.ds-seg` segmented controls with one choice lit.
- **The footer's primary action** is `.ds-btn.primary.big`, one per screen, and is the screen's lit action.
  - It is named for what it does now ("Join server", "Start match", "Waiting for host").
  - When it can't be pressed, it is unlit and its label says why.

## Components

- **Destination list** (main menu):
  - Each destination is one row of display type, with its readout under it in body type. No icons.
  - The lit row is a backlit plate; the other rows have no plate.
  - Hover and focus light a row's edge at half and slide its title 10 px.
  - Below the list, a small row holds Loadouts, Profile and Settings at heading size, as they are not places to play. A lit dot follows Loadouts when something unlocked is waiting there.
- **Profile corner** (main menu, top right): an unlit plate.
  - The Rank in a small square cut-corner badge, its number in the light.
  - The name, then the Rank and XP in small type.
  - A thin Rank bar in the light, then the next unlock in one line ("Next: Marshal .357 at Rank 8").
- **Readout:** a small label over a value at heading or display size, tabular. A row of readouts is one strip split by 1 px lines, never cards.
- **Squad slot:** one tile per seat of a Squad.
  - A person's slot shows their name at heading size and their role under it ("You", "Host", "Friend").
  - A seat bots will fill is a dashed frame in `--ds-text-2`: "Bot" offline, "Open seat" online, where a friend may still take it.
  - A slot never shows a placeholder person.
- **Lobby seat:** one plate row per seat.
  - It shows the seat number, the name at heading size, its role under it ("You · Host") in small type, and ping in ms coloured by quality.
  - Your own seat is a raised plate with its edge in `--ds-text-2`: the light is kept for what you pick.
  - An open seat is the dashed frame. Offline there are none, as nobody can take them.
- **Settings section:**
  - The section's name at heading size, with a live state under it where there is one (such as the controller connected).
  - Then its rows, as one list split by 1 px lines.
  - A row's note is a few small words, only where the label and the control can't say it ("The crosshair keeps its own size").
  - A row lights at half on hover or focus.
- **Dialog** (loading, connecting, errors, tips): a plate at the lower left over the world, not a centred box.
  - Its title at title size, one body paragraph, then the buttons in a row, with the way on lit.
  - A loading dialog shows its percent at display size.
  - An error's edge is `--ds-alert` instead of the light.
- **Pause:** the destination list again, over a scrim. Resume is lit, and the one under the pointer or pad is lit at half. The controls sit on a plate at the right. The HUD fades out under it.
- **Scoreboard:** one plate.
  - Each team's name is at heading size, with a 4 px bar in its colour and its mark. Column heads are in sentence case.
  - Your row is a raised plate with its edge in `--ds-text-2`.
  - On a phone the teams stack in one column.
  - The feed, toasts and round banner hide while it is up.
  - Its header names the mode and, beside it, the match's goal in one line: the scoreboard is where a player looks to ask "what are we doing".
  - On touch it is opaque and has the screen: the match bar, captions, hints, ally tags and pings hide under it.
- **Match end panel:**
  - The result heads the panel in lit text ("Victory", "Defeat", "Draw", who wins), on a plate or the results scrim, never on the sky.
  - Then the MVP, your match as readouts, and the Rank bar.
  - On a phone held sideways the panel takes the whole screen. The scoreboard comes only while its button is held, in the panel's place, and the kill feed goes.
- **HUD plates and toasts:** unlit plates.
  - A toast is one body-size line. On a phone it runs full width above the readouts.
  - The one lit toast is an unlock landing mid-match.
  - On touch that slot has one speaker at a time, at body size: a caption or toast first, the hint line when it is quiet.
- **Bots in the HUD:** a bot is marked by the word "bot" in small text after its name, not by a boxed tag. The kill feed leaves that word out when everyone but you is a bot (a Bot Match), where it would only repeat down the feed.
- **Kill feed:** small plates stacked at the top right. Your own lines are lit plates.
- **Kill moment:** see Motion. The marker is drawn in `--ds-alert` with a small glow. The +score and the medal's name are lit text, and the medal sits on a lit plate.
- **Changelog:** at the main menu's foot, the word Changelog and the version running.
  - It opens a page of releases, newest first, under each day's name at heading size.
  - Each change is in body type with its version beside it in small type, as one list split by 1 px lines.
  - Up and down scroll it.
- **Connection line:** a status dot (good for up, alert for down, fair for busy), then one sentence on what the state means for the player and what happens next.
- **Key hints:** keyboard caps, the controller's glyphs once a pad drives the screen, or the touch control's own glyph once a finger does. Which one shows follows the last input used, never the browser's name.
- **Touch controls** (`.ds-tc`, in play, only while touch drives the game):
  - Circles in `--ds-touch-line` on `--ds-touch-fill`: the only round controls besides icon buttons.
  - Fire is the largest (76 px), under the right thumb. Aim, Reload, Jump and Crouch are within a roll of it, and the rest a reach further.
  - The stick is a ring that appears where the left thumb lands, with its sprint lock marked over the top of its travel.
  - Pause, the scoreboard and the map stand in a column at the top left; Ping is at the top right.
  - A lit control (light edge and halo) is one that is on (aiming, crouched, the run locked) or the one thing to press now (Use). The Use prompt in the middle of the screen is a button too: a tap on it presses Use.
  - Held upright, the game shows a plain "Turn your phone" notice on ink with a Menu button, not a squeezed layout: menus work upright, the fight does not.
- **Hint line** (`.ds-hintline`): one body-size line on a plate above the readouts.
  - The control comes first, as a cap or glyph, then what it does ("Move", "Reload").
  - One at a time, at the moment it matters, gone once the player has done it.
  - On touch, the glyph-only buttons are named this way as they come up, Fire first ("Aim at an enemy and the gun fires. Or hold this").
- **Goal line:** under the opening countdown's number, the match's goal in one body-size line ("First team to 75 kills, or ahead when the clock runs out"). The mode's name, the number and the goal share one plate. On touch it stands right under the match bar, off the crosshair.

## Motion

- Transform, opacity and colour only. The one exception is `filter: brightness` on a small element as its light comes on.
- `--ds-fast` (120 ms) is for feedback and `--ds-slow` (240 ms) for entrances, both on `--ds-ease`.
- A press answers within the frame. Nothing a player clicks waits for an animation, and moving between screens is instant: no screen fades.
- **The kill is a short sequence,** then the screen goes back to low light:
  - **0 ms:** the hit marker, with a dry tick.
  - **90 ms:** the marker turns the kill colour and pops, with a heavier thunk.
  - **120 ms:** +score lights up by the crosshair.
  - **300 ms:** the name, and the reason ("Headshot +50").
  - **750 ms:** a medal lights, only when earned. Medals queue, one at a time.
  - **1.8 s:** all gone.
- **The Rank bar after a match sweeps:** it fills, flashes in the light as it rolls over a Rank, then keeps going while the XP counts up.
- **Choreography is allowed where it says something.** The main menu's destinations rise in, 50 ms apart, the first time the menu shows; a slot that a friend just took fills in. Each plays once, and never again on a redraw of the same screen.
- Everything has a `prefers-reduced-motion` version that keeps the content and drops the travel and the flashes.
- Preparation's camera dive (Battle Royale) is the one deliberate exception to "no screen fades".

## HUD

- **At rest the HUD sits in low light:** unlit plates, grey labels, white figures. Light is for the clock, your lines in the feed and the kill.
- Keep the centre clear. Information sits at the corners and edges, inside the safe area.
- Show what a player acts on: ammo, health, objective, score, timer.
- Critical states (low ammo, low health, connection lost) change shape or text as well as colour.
- **On touch, nothing readable sits under a thumb:**
  - the health and the ammo move to two plates at the bottom middle, between the stick's ground and the fire cluster;
  - the score lines stand to the right of the crosshair;
  - edge markers keep off the controls' ground (`TOUCH_GROUND` in `hud/markers.ts`).
- A count's glyph is the thing counted: the grenade count wears a grenade, not a dot.
- **Ally tags** (`allyTags` in `hud/ally-tags.ts`):
  - A tag carries the ally's name up to 40 m, through walls too, where it is dimmer. Past 40 m only the chevron shows.
  - Only in a Battle Royale squad does an ally off screen or behind you hold the screen's edge. A teammate in the team modes has no tag until they come into view, since five teammates pinned around the edges sat on the health, the kill feed and the gun.
  - A tag held to the edge always carries the name: a bare chevron there says nothing about who it points at.
  - Tags never lie on each other. Of two names that would overlap, the nearer ally keeps theirs, and edge tags that meet step along the edge.
- Figures that change in place (ammo, health, scores, the clock) are tabular, so a digit changing never shifts the line.

## Words

- A title stands alone: no eyebrow or breadcrumb above it, no explanatory line under it. The layout and the Back button say where you are.
- **Say a fact once per screen:**
  - a state shown in a chip isn't repeated in a sentence;
  - a picker's lit choice isn't repeated in a readout;
  - a button never sits beside a key hint naming the same action (no "Esc Back" next to Back).
- Add a line only when it tells the player something they need that the screen doesn't show: why a control is shut, what a choice means when its name doesn't say, what to do when something failed. Then one short sentence.
- Labels are one to three words. Notes under a row are a few words, never a paragraph.

## Do

- Reuse `.ds-btn`, `.ds-seg`, `.ds-chip`, `.ds-readouts`, `.ds-label`, `.ds-title` and `.ds-page` before writing new styles. The plate and its lit state belong in `theme.ts` as one class (`.ds-plate`, `.is-lit`, `.is-half`) that every component uses.
- Say what a disabled control is waiting for, in its own label or the line beside it ("Coming soon: local bots need their own thread").
- Check every UI change at desktop and phone width against the reference frames, then run `design-audit`.

## Don't

- Don't add a second accent colour. The Ring hazard colour belongs to one thing and is not an accent.
- Don't light more than one thing per group, and don't make anything glow that isn't lit.
- Don't use a centred hero, icon cards, a column of icon-topped tiles, pill badges, eyebrows over headings, gradient buttons, rounded panels or frosted glass.
- Don't put hex values in components.
- Don't use the light for status text that can't be acted on.
- Don't show a number that isn't real: no sample players, no invented counts.
