# Redesign lobby, settings and load screens

Status: resolved
Release: v2.140.0
Blocked by: 12

Spec: `../spec.md`

Spec: UI redesign. Screenshots at desktop and phone width, `design-audit`.

## Comments

- Lobby (online and Bot Match), settings and the load, connect, error and tip dialogs are redone in DESIGN.md's language. Seats are panel rows with the name over its role ("You · Host") and ping in ms; the "YOU"/"HOST" pills and chips are gone. The header aside is the connection line (dot + one sentence). The match column is a readout strip (Mode, Map, Seats), map pictures with a bottom scrim, Random, then the picks. Settings sections are a heading-size name with a body line on what each covers, then a 1px-split list. Dialogs are a lower-left title card over the world, not a centred box: loading shows its percent at display size, and errors carry an alert bar.
- Decision: your own seat is marked with a raised step and a text-colour bar, not signal. DESIGN.md keeps signal for what you pick, and the audit flagged the mint seat. Offline Bot Match lists no open seats, since nobody can take them, and its readout counts Players instead of Seats. On a phone the match's picks come before the seats.
- Decision: the lit segment keeps DESIGN.md's light fill (audit F19 left as FAIL on purpose). Labels and field labels are sentence case at small size; tracked caps stay on controls only.
- Server down: the error dialog offers Bot Match as a button and focuses the way on. ADS is spelled out in settings.
- design-audit (docs/design-audit/2026-11-05.md): 29 findings (4 high, 17 medium, 8 low). After the fixes, 13 were judged: 11 PASS, 2 FAIL (F19 on purpose; F11, keyboard focus on opening Settings and the lobby, left open). The main menu findings (F01, F05-F09, F23-F25) are outside this ticket.
- Screens looked at, 1920x1080 and 390x844: .scratch/battle-royale/t23/shots/{before,a2,a3}/ (settings x4 tabs, loading, connecting, error-down, error-full, tip, Bot Match lobby and its settings, online lobby) and docs/design-audit/2026-11-05/{captures,after}/.
- Tests: typecheck clean; `remote-test npm run test:client` 46 files, 390 tests passed.
