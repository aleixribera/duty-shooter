## Working alone on main

The owner isn't around to review or click anything, so work runs unattended and straight on main:

- After each change, commit and push directly on `main` in this checkout. Every commit gets the next version tag, `vX.Y.Z` above the highest existing one (`git tag --sort=-v:refname | head -1`), and is pushed with its tag right away; never leave commits unpushed. Don't create branches, worktrees or pull requests, and don't give subagents worktree isolation. Tell every subagent the same.
- Other sessions may share this checkout: stage only your own files, by path.
- If a push is rejected, run `git pull --rebase origin main`, fix any conflicts, run the tests again and push.
- Don't stop to ask for approval or a choice. Make the call that the spec and the glossary support best, write it in the ticket's `## Comments`, and keep going.
- When a ticket is done, set its `Status:` to `resolved`, add a `Release:` line, then commit, tag, push and start the next unblocked ticket. Keep going until every ticket in the arc is resolved.
- Stop early only when something outside the repo blocks you, such as the home server being unreachable or Tailscale asking for an approval link. Write the blocker in the ticket, carry on with any other unblocked tickets, and report it at the end.

## Working in the code

Before adding a map, mode or weapon, writing a test, or crossing a package boundary, read `docs/agents/codebase.md`: import rules and the tests that hold them, what each addition touches, where tests are slow, and releases.

## Test time budget

- Budgets: CI from push to `:latest` under 4 min (eight test shards beside the image build, under 2 min each when warm). A whole tier at a third of the cores (this PC, the test laptop): `npm test` under 600 s, `npm run test:soak` under 330 s.
- Guards: `vitest.budget.ts` prints a yellow `TEST BUDGET` warning when a whole tier runs over its budget or any fast-tier test takes over 10 s; CI's `timeout-minutes` fail a shard past 5 min and the image job past 12. Don't raise them to get green: make the test cheaper, split a long file (vitest runs files in parallel, not tests), or move a whole match to a soak.
- While working, run only what your change covers: one file (`npx vitest run apps/range/test/foo.test.ts`), a name (`-t "<name>"`), or the tests importing what you changed (`npx vitest related --run <files>`). The full suite runs on CI.
- The soak tier (`*.soak.test.ts`, whole matches) runs in the pre-push hook and on every CI run, never in `npm test`.
- Output is dots, failures and the summary; passing tests' logs are hidden (`--silent=false` shows them).

## UI

UI follows `DESIGN.md`; read it before any UI change.

## Trying the game in a browser

Walking a map alone, scripting a browser, screenshots and benchmarks run on the page's URL parameters, listed under "Dev URL parameters" in `README.md`. Walking a map alone lives only there: `?explore=<map>` (`survival-town`, `switchyard`, `range`), with `?nolock` for a scripted browser. The main menu keeps to Play Online, Battle Royale, Bot Match, Practice Range and Settings; walking Zero Island alone is `?explore=zero-island`.

Script a browser through `launchChrome()` in `apps/range/scripts/chrome.mjs`: it runs headless and muted (`SOUND=1` to hear it), at idle priority and at most 30 frames a second (`FRAME_CAP=<n>`), so a game the owner plays beside it keeps its frames; only frame-time measurements pass `uncapped: true`. Vitest likewise runs at idle priority on a third of the cores here (`vitest.config.ts`), and the pre-push hook at `nice -n 19`. The owner works at this PC while scripted matches run, so a browser launched any other way also gets `--mute-audio`. `docs/agents/codebase.md` lists the ready-made scripts and their pitfalls.

## Agent skills

### Issue tracker

Issues are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string the same as its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
