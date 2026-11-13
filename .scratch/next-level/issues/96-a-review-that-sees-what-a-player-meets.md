# A review that sees what a player meets

Status: resolved
Release: v2.187.49

Spec: `../spec.md`

`PLAN.md` item 1. Rebuild `reviews/capture.mjs` (and the review method in `.claude/iterate.md`) so the scripted player turns toward the nearest enemy and gets kills, a match is run on to its last minute, sound is recorded, every map and mode is visited in turn, two clients share an online lobby, and frame times are logged. The reviewer gives each objective pass or fail with evidence and its biggest gap.

Acceptance: one capture holds a hit marker and score popup on a kill, a frame and audio from the last minute, a lobby with two clients, and a frame-time summary.

## Comments

**2026-11-13, loop pass 4.** `reviews/capture.mjs` rewritten; the method in `.claude/iterate.md` now has the reviewer judge the five objectives pass or fail.

- **The player** is the trailer's first-person `steer` (`apps/range/scripts/trailer/shots.mjs`, now exported with `loadNav`): it follows the front by the bots' routes, turns on a damped aim to the nearest enemy in sight, aims down sights and fires. A frame is taken on each of the first four kills and 250 ms after.
- **The match** runs to its end with `?matchtime` (Charge, which has no clock, plays its rounds out, capped at 10 min). Map and mode rotate through all fifteen pairs, one per saved review (`MAIN=map:mode` picks one). Frames at 30/60/90 s, the scoreboard, 55/30/10/3 s left, the end screen and after.
- **Sound**: `AudioNode.connect` is patched so every node the game wires to its speakers also feeds a `MediaStreamDestination`. A `MediaRecorder` saves the opening and the last minute as `.webm`; ffmpeg turns each into a spectrum `.png` and an EBU R128 loudness and true peak. Every `duty.sound.play` is logged (`sounds-match.json`), with counts by event in `summary.json`. The page's context ran (`audioContext: running`): the clicks go through CDP as user gestures.
- **The tour**: every map and every mode at least once (25 s each, same player), and the Practice Range. Zero Island is opt-in (`ISLAND=1`): in this run the dev server's first build of the island's nav kept "Building Zero Island" past 3 minutes (`2026-11-13a/31-island-failed.jpg`), and the island costs GBs on this PC.
- **Online**: the capture starts a local public server if none answers `/healthz` through Vite's proxy, joins with the page, and a Node socket named Friend joins the same lobby; the host starts the match. A private server needs `PASSPHRASE`.
- **Frame times**: each part's frame times (under the 30 fps cap they show hitches) and the main thread's work per frame (`workP50Ms`/`workP99Ms`, every animation-frame callback timed), with draw calls and GPU time from `?stats`. Screenshots are kept out of the frame times.
- `ONLY=<part>,…` reruns parts into an existing capture.

A second-opinion review found: the Friend socket had no error handler (a refused connection would have crashed the run and left Chrome and the server up), no deadline on a part (a crashed renderer hangs CDP forever), Charge never reaching its end, screenshots counted as hitches, the 250 ms meter missing short peaks (now ffmpeg's true peak), and `ONLY=` restoring stale settings and possibly a different match pair. All fixed and re-run.

Check, `reviews/2026-11-13a/` (Survival Town FFA, 150 s, plus the tour and online):
- Kill: `11-match-kill-1.jpg` shows the hit marker and "+30: +100 Eliminated Comet, +50 Headshot"; 5 kills in the match, 4/3/0/0/1 on the tour.
- Last minute: `14-match-last-30s.jpg`, `audio-last-minute.webm` and `.png` (about -18 LUFS, true peak -0.7 dBFS).
- Lobby with two clients: `41-online-lobby.jpg` (Reviewer as host, Friend, 6 bots), `42-online-lobby-phone.jpg`, `43-online-play.jpg`.
- Frame-time summary: `summary.json` (match: 28.8 fps at the cap, main-thread work p50 5 ms / p99 10 ms; Practice Range: a 4.8 s stall a few seconds after entering, the first finding for the review).
