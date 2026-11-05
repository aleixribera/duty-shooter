# Redesign HUD, scoreboard and pause

Status: resolved
Release: v2.141.0
Blocked by: 12

Spec: `../spec.md`

Spec: UI redesign. All modes. Screenshots at desktop and phone width, `design-audit`.

## Comments

- 2026-11-05: Done in v2.141.0. The HUD plates are flat; the ammo and health corners use a scrim from the bottom edge, and their labels are in text colour. Labels are in sentence case, and only controls keep tracked caps. Corners are square, and bots are marked with the word "bot" instead of a boxed tag (feed, board, recap, spectator). The scoreboard has no outer line and no signal; your row is a raised step with a text-colour bar. On a phone it is one full-width column. The feed, toasts and round banner hide under the board. The pause is the main menu's destination list (no icons or gradient rows), and the HUD fades out under it. Toasts are one body-size line with a bar; on a phone they run full width, and the recap sits above them. DESIGN.md gains the Pause, Scoreboard and HUD plate entries.
- Checked in a real Local bots Duos Battle Royale at 1920x1080 and 390x844 (.scratch/battle-royale/t24/br.mjs, shots a4 and a5). Checked together with nothing overlapping: a ping, the Kill Leader and Squad wiped feed lines, the Supply Drop and Reboot toasts, the Downed recap (injected and real), the spectator, the board, the pause and the match card.
- design-audit docs/design-audit/2026-11-05b: 26 findings (6 high, 16 medium, 4 low). After the fixes, 17 PASS and 9 FAIL. Measured contrast fails went from 20 to 0, and size fails from 67 to 0. Left open by choice or as out of scope: touch controls (F01), a key named in the loadout banner (F08), phone safe-area insets (F13), squad-mate edge markers (F15), more than five type sizes on the board (F16), the 32 px HUD margin (F23), a goal line (F24) and the grenade glyph (F25).
