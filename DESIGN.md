# Duty Shooter design language

The menu, lobby, settings and HUD are one system. Its tokens already live in `packages/fps-client/src/ui/theme.ts`: use those variables, and add a variable there before a colour or size appears anywhere else.

The composition rules below borrow from the `bmw-m` entry in the `design-md` library: near-black floor, uppercase engineered type, square silhouettes. Only the language is borrowed, not its colours, fonts or brand. Readability in play (`design-audit` rules) comes before everything here.

## Character

A machined instrument laid over a live map: dark ink, one signal colour, tight uppercase labels, no decoration that doesn't carry information. The 3D world is the picture, and UI chrome backs off from it.

## Colour

| Role | Variable | Value |
| --- | --- | --- |
| Page floor | `--ds-ink` | `#0b0e13` |
| Panel | `--ds-panel` | `#12161d` |
| Raised | `--ds-raised`, `--ds-raised-2` | `#1c222c`, `#252c38` |
| Text | `--ds-text`, `--ds-text-2`, `--ds-text-3` | `#f3f1ea`, `#b4bac5`, `#8e96a3` |
| Signal (the one accent) | `--ds-signal`, `--ds-signal-hi` | `#8fe3c8`, `#b4f0dc` |
| On signal | `--ds-signal-ink` | `#062118` |
| Danger | `--ds-alert` | `#ff6159` |
| Teams | `--ds-blue`, `--ds-orange` | `#3d8bff`, `#ff9a3c` |
| Connection quality | `--ds-good`, `--ds-fair`, `--ds-poor` | `#7fdc6a`, `#f2c230`, `#ff5d52` |
| Lines | `--ds-line`, `--ds-line-2` | 12% and 22% of the text colour |

- Signal marks what can be acted on or what is selected. It is never decoration.
- Team colours always come with a mark, never colour alone.
- `--ds-text-3` is for labels on solid panels only. Over the map, use `--ds-text` on a scrim.

## Type

- `--ds-font`: Bahnschrift, then DIN Alternate, Roboto Condensed, Arial Narrow. System fonts only, so the first screen never waits for a download.
- Numbers use tabular figures, so scores and timers don't jitter.
- Titles: bold, uppercase, condensed, 0.03–0.04em tracking.
- Labels and buttons: uppercase, 0.14–0.2em tracking. The tracking is what makes them feel machined.
- Body and descriptions stay regular weight and sentence case.

## Shape and depth

- Square corners by default. Round only circular icon controls.
- Separate with 1px lines and flat surface steps, not shadows.
- No backdrop blur, glow or gradient text. Everything has to stay cheap to draw over the live map. The only gradient is the page shell's horizontal scrim, which keeps text readable over the world.

## Layout

- Every menu page uses the `.ds-page` shell: header with breadcrumb and title, a body that scrolls on its own, a footer that always shows the action.
- Content aligns to the left edge, with the world visible to the right.
- Pickers are `.ds-seg` segmented controls with one choice lit.
- The footer's primary action is `.ds-btn.primary.big`. One per screen.

## Motion

- Transform, opacity and colour only, 120 ms with `--ds-ease`.
- No screen fades. A press answers within the frame, and navigation must feel instant.

## HUD

- Keep the centre clear. Information sits at the corners and edges, inside the safe area.
- Show what a player acts on: ammo, health, objective, score, timer.
- Critical states (low ammo, low health, connection lost) change shape or text as well as colour.

## Do

- Reuse `.ds-btn`, `.ds-seg`, `.ds-chip`, `.ds-label`, `.ds-title` and `.ds-page` before writing new styles.
- Check every UI change at desktop and phone width, then run `design-audit`.

## Don't

- Don't add a second accent colour.
- Don't use a centred hero, icon cards, pill badges or gradient buttons.
- Don't put hex values in components.
- Don't use `--ds-signal` for status text that can't be acted on.
