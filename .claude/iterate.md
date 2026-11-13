# Iterate: duty-shooter

The project-specific half of the iterate skill. Where this file and the skill differ, this file wins; `AGENTS.md` wins over both.

## Vision

`.scratch/next-level/spec.md` plays the role of `VISION.md` (the owner's direction: "you fight on ground that is about to stop existing"). UI follows `DESIGN.md`; words follow `GLOSSARY.md`. Decisions recorded in tickets' `## Comments` and in `docs/adr/` bind like the spec.

## Plan

`PLAN.md` at the repo root, written by the director chat: the order of work and each stage's acceptance check.

**Review.** `node .scratch/next-level/reviews/capture.mjs .scratch/next-level/reviews/<date><letter>` against the dev server, in the background (about 15 minutes; `ISLAND=0` skips Zero Island and the GBs it takes; `ONLY=<part>,…` reruns parts into an existing capture). It plays one Bot Match to its end (map and mode rotate through all fifteen pairs, one per review) with a scripted player who turns to the nearest enemy and fires, so its frames hold kills (hit marker, score popup), the scoreboard, the last minute and the end screen; records the game's sound (`audio-*.webm`, with a spectrum `.png`, levels and every sound asked for, opening and last minute); tours every other map and mode; aims and fires each sight in the Practice Range (irons, Reflex, Prism 2x, the Vantage's and the sniper's scopes, shotgun, SMG); plays a local Battle Royale on Zero Island (its nav is asked of the dev server after the match, which keeps it until a source changes); and online, the host makes a private lobby, two friends join by its link, the host moves one and kicks the other, then plays the match 45 s. `summary.json` holds each part's kills, deaths, frame times (under the 30 fps cap; `workP50Ms`/`workP99Ms` is the main thread's work per frame) and page errors. Then one reviewer subagent with no browser judges the frames, `summary.json`, the spectra, `PLAN.md`'s five objectives and `DESIGN.md`: each objective pass or fail with its evidence (a frame or a number) and its biggest gap, the five most visible defects with frame and position, and what became of the previous review's five. Saved as `reviews/<date><letter>.md`.

## Notes

- `.scratch/next-level/STATE.md`: the loop's state (cap 8,000 characters). "Now" is its first section.
- Tickets carry their own history under `## Comments`; the review files are the scorecard.
- Research: in the ticket that needed it.

## Build and test

- Typecheck: `npm run typecheck` (all packages) or `npm run typecheck -w <package>`.
- While working: `npx vitest related --run <changed files>` or `npx vitest run <file>`.
- Soaks only for bots, a mode, a map's layout or nav, or the match flow: `npx vitest run --project soak <files>`.
- The full suite runs in CI on every push to `main` (`gh run list --workflow container.yaml`); don't also run it locally. The pre-push hook runs the typecheck and the soak tier (about 90 s).

## See it working

- Dev server: `preview_start` with `range` (port 5173). Stop it when the pass no longer needs it.
- Scripted browser only through `launchChrome()` in `apps/range/scripts/chrome.mjs` (headless, muted, idle priority, 30 fps cap). Stub Vite's hot reload in scripted pages (`HMR_SHIELD` in `reviews/capture.mjs`). One browser at a time.
- Walk a map alone: `?explore=<map>&nolock`. Dev URL parameters are in `README.md`.
- Each ticket keeps its frames in `.scratch/next-level/<topic>/before|after/` with the `look.mjs` that took them, and a `sheet.jpg` when it compares.

## Ship and release

- Straight on `main` (`AGENTS.md`): stage only this pass's files by path, commit, tag the next `vX.Y.Z` above `git tag --sort=-v:refname | head -1` (patch for fixes, minor for features), push with the tag. A rejected push: `git pull --rebase origin main`, re-test what the incoming change touches, push.
- Commit message: what changed for a player before the first colon; it is the in-game changelog. Then why, what a second-opinion review found, and how it was checked, ending with `(ticket NN)`.
- Ticket done: `Status: resolved`, a `Release:` line, comments on what was done.
- Every tagged commit is a release; CI publishes it. A red CI run comes before anything else.

## Feedback

The owner's reports land in chat or as new files in `.scratch/next-level/feedback/` (one per report). Each becomes a ticket (bug or complaint: next in line; idea: placed in the order of work) and the feedback file is deleted in the same commit.

## Machine rules

This PC is shared with the owner, who plays and works on it, and with other sessions in this checkout. One headless browser at a time, closed right after; game paused unless it must run; the dev server stopped at the end of the pass. Anything over two minutes runs in the background. Never use the home server for tests unless the owner asks.
