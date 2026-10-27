After each change commit, tag, push to github. with version number vX.X.X

## Working alone on main

The owner isn't around to review or click anything, so work runs unattended and straight on main:

- Commit directly on `main` in this checkout. Don't create branches, worktrees or pull requests, and don't give subagents worktree isolation. Tell every subagent the same.
- If a push is rejected, run `git pull --rebase origin main`, fix any conflicts, run the tests again and push.
- Don't stop to ask for approval or a choice. Make the call that the spec and the glossary support best, write it in the ticket's `## Comments`, and keep going.
- When a ticket is done, set its `Status:` to `resolved`, add a `Release:` line, then commit, tag, push and start the next unblocked ticket. Keep going until every ticket in the arc is resolved.
- Stop early only when something outside the repo blocks you, such as the home server being unreachable or Tailscale asking for an approval link. Write the blocker in the ticket, carry on with any other unblocked tickets, and report it at the end.

## Agent skills

### Issue tracker

Issues are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string the same as its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
