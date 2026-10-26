# 04 Intermission sequence, mode voting and lobby status

Status: ready-for-agent
Milestone: 1 (core, headless)
Blocked by: 03

## What to build

The loop between matches, and how the lobby picks its mode. See the spec sections "Modes, intermission and voting (shared core)" and "Server and lobby (the app)".

- **The intermission** is one server-timed sequence:

  | Time from `matchEnd` | Phase |
  |---|---|
  | 0–6 s | Nuke |
  | 6–20 s | Scoreboard and vote |
  | 20 s | `matchStart` |

  The phase and its deadline are broadcast. Usercmds are ignored for the whole intermission, so nothing moves, fires, scores or dies. The existing 10 s restart delay is replaced.
- **Mode voting:**
  - Each connected player has one vote (TDM or FFA), which they can change until the window closes.
  - The plurality wins; a tie or no votes keeps the current mode.
  - The server broadcasts the live tally and the result.
  - The mode only ever changes at `matchStart`.
- **Mode for an empty server:** a join request may carry a preferred mode. It's honoured only when no other player is connected. Otherwise the joiner gets the current mode.
- **The server** can switch between the TDM and FFA mode objects at `matchStart`. It starts in TDM unless a joiner picks otherwise.
- **The protocol version is bumped.** Messages carry the current mode, intermission phase and deadline, vote tally and match clock, alongside what ticket 02 adds for popped props and ticket 03 adds for teams.
- **A lobby status endpoint** next to `/healthz` reports map, mode, player count, capacity and phase. The client fetches it before joining.
- **A minimal client UI** in the current style shows the phase, a countdown, and two vote buttons on the end-of-match screen. Ticket 14 restyles it.

## Acceptance criteria

- [ ] Networked tests:
  - phase timing at 6 s and 20 s
  - input frozen during the intermission
  - no kills or scores after `matchEnd`
  - the next match starts on fresh spawns
- [ ] Voting tests:
  - the plurality wins
  - a tie or no votes keeps the mode
  - a changed vote counts once
  - votes after the window closes are ignored
  - the mode never changes mid-match
- [ ] Join tests:
  - the first joiner's mode is honoured on an empty server and ignored on a busy one
  - an old protocol version is rejected
- [ ] A server test calls the status endpoint and checks its fields.

## Comments
