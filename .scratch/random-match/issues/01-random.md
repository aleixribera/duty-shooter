# Random map and mode

Status: resolved
Release: v2.82.0

Add a random map and mode choice to online and Bot Match lobbies while preserving the chosen sides setting.

## Comments

Use one button to immediately select and display a concrete map and mode. The host sends both together; Humans vs bots restricts the draw to team modes so the setting remains effective. Mixed teams allows every mode. Existing bot fill and lobby permissions remain in force.

Checked both sides choices in muted browser sessions on Bot Match and an isolated multiplayer server. A real two-player server test verifies a friend receives both picks and the unchanged Humans vs bots setting before starting Crash. The full local suite passed 908 tests with 8 skipped, as did typecheck and the production build. The home-server diagnostic transfer was rejected by automatic approval review, so checks ran locally at low concurrency.
