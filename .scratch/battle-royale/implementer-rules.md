# Rules for a ticket implementer

Read `AGENTS.md`, `docs/agents/codebase.md`, `GLOSSARY.md`, `../spec.md`-level context (`.scratch/battle-royale/spec.md`), your ticket, the Comments of the tickets it's blocked by, and any ADR in your area.

- Work directly on `main` in this checkout. No branches, worktrees or PRs. Never spawn subagents.
- Set the ticket `Status: claimed` first. Use the tdd skill (`mattpocock-skills:tdd`) for code.
- UI work: read `DESIGN.md`, use the design skills named in the global instructions, and check real screenshots at desktop and phone width. Finish with `design-audit`.
- Any 3D model is built in Blender with the `blender` skill from a generator script. Look at the preview renders, then check it in the game. Every texture or material uses the `game-textures` skill (owner's explicit instruction, Claude-only sources): call it before making or shading one, and check the result in the game from near, far and grazing.

## Commits

- Other sessions share this checkout and have uncommitted work in many files. A commit must contain only your hunks. A past commit shipped another session's lines and broke the build.
- At the start, run `git status -s` and note every file already dirty. Prefer new modules.
- For a file that was already dirty, stage only your own hunks (`git apply --cached` of your own patch).
- Before every commit, read `git diff --cached`: every line must be yours and every import must resolve to a committed file.
- Never stage `tools/map/crash-level.blend`, `apps/range/src/map/crash.ts` or `apps/range/test/crash.test.ts`.
- Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and gets the next tag above `git tag --sort=-v:refname | head -1` (minor for features, patch for fixes). Push with the tag at once.
- If a push is rejected: `git pull --rebase --autostash origin main`, re-test, push.
- After pushing, confirm with `gh run list` that the builds for your commit pass.

## Tests

- `remote-test` for Node suites, `remote-test --local` for anything driving Chrome. Exit 200-202 means `remote-test` itself failed: use `--local`.
- Run `npm run typecheck` through `remote-test` too.
- Run everything in the FOREGROUND with a timeout up to 600000 ms. Never use `run_in_background`: ending your turn to wait loses the work. End your turn only when the ticket is finished or truly blocked.
- Never touch the live container.

## Done

- You ran the real thing and saw it work, not only tests. Script a browser through `launchChrome()` (headless, muted).
- The final code is what was tested. If you change anything after a check, re-run the check.
- Set `Status: resolved`, add `Release: vX.Y.Z`, add new terms to `GLOSSARY.md`, write decisions and calls the spec doesn't cover in `## Comments`, commit, tag, push.

## Report

Under 200 words: what shipped, tag, measured numbers, test counts, what you saw, anything unfinished. Be honest about failures.
