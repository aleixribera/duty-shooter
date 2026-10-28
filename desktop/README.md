# Duty Shooter for Windows

The game in its own window: an Electron shell that opens the live lobby (or the Pages copy, or a retry page when nothing answers). See "Desktop app" in the repository's `README.md` for installing and using it, and "The desktop app" in `docs/agents/codebase.md` for working on it.

- `main.mjs`: the shell (window, keys, link policy, permissions).
- `config.mjs`: which address to open and which links stay in the window; tested by `test/`.
- `offline.html`: shown when neither the lobby nor the Pages copy answers.
- `scripts/bake-url.mjs`: writes the lobby address into `config.json` before `start` and `dist`.
- `scripts/dist.mjs`: builds `dist/Duty-Shooter-Setup.exe`, versioned after the latest tag.
- `scripts/smoke.mjs`: drives the app against a local server.
