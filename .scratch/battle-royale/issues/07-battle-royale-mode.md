# Battle Royale mode rules

Status: resolved
Blocked by: 02,05
Release: v2.101.0

Spec: `../spec.md`

Spec: Match rules. Mode class, 60 seats, Squads (Solos, Duos, Trios), spawn rules, one life, 3 frags, the Ring with Stages and a seed, regen pause, Winning with tie-break, early end, reconnect with a bot holding the seat, late joiners spectate.

## Comments

From ticket 03: rerun the 60-seat gate (`results/gate.sh`) on this mode's own opening. Free-for-all's opening ticks cost 22 to 30 ms with bots, over the worst-tick bar, and that number was left out of the gate because this mode doesn't use that spawn scoring. All bots starting at once needs checking too.

## Decisions

- Ring damage is a blow like any other: it restarts the regen delay. It ignores spawn protection, and there is no countdown exposure since the Ring holds until Stage 1 ends.
- Script seats aren't people for Early end, so a load test or a script client still plays to a winner.
- A stand-in shows under the player's name with the BOT tag, goes when its match ends, and hands the seat back on reconnect.
- Bots fill to 60 at a new match even if held seats would have counted: holds end with the match that made them.
- Place is the number of Squads still standing plus one, shared on a tie.
- A BR server defaults to Solos (`SQUADS`), and to Zero Island; `MODE=battle-royale` on any other map is refused. A fresh lobby's first script joiner opens the lobby rather than starting, so a script's other clients don't arrive to spectate.
- Battle Royale isn't on the between-matches vote: `votes` and the vote message keep to `LOBBY_MODES`.
- The Stage table in `STATS.royale` runs out at 9:30, inside the spec's 10:00 limit.
- The stale `.nav` check was cheap: `Terrain.fingerprint()` and the solids go into a hash in the file (format 2), and `decodeLargeNav(data, world)` throws rather than walking bots through walls. An old file fails the same way, so a server built before this needs its app rebuilt.

## Opening, measured on the home server

`SETTLE=25` (`.scratch/battle-royale/br-gate.sh`), worst tick of the window holding the start, of the windows after it, and the bar is 16.7 ms:

| Run | Before | After |
| --- | --- | --- |
| 2 people, 58 bots | 18.8, 37.2 | 12.4, 5.2 |
| 12 people, 48 bots | 19.6, 34.2 | 12.9, 12.1 |
| 60 people | 10.5, 7.6 | 9.0, 25.2 (see below) |

- Countdown's end (37 ms): all 58 bots thought for the first time in one tick. `WAKE_TICKS` wakes them over half a second.
- Match start (18 ms): 58 `botName` calls scanned every taken name several times, and each entrant deep-copied a player to read a team. Both are now cheap. The event log was a suspect, and batching it didn't change the tick, so that went back out.
- p99 stays 3.25 to 5.25 across the three runs.
- 60 people's 22 to 46 ms ticks after the opening come from the `remote-test` CPU cap, not the tick: it stalled that run for 22 s (cap shared with the 60 clients). With `DEFLATE=0` the clients cost less, stalls halve, and the whole run's worst is 9.3 ms. That is a conclusion from this one comparison, and a run from another machine would settle it.
- A server's first ~10 s has V8 Mark-Compact bursts (pauses up to 45 ms, worst tick 75 ms). Real matches start later than that; `--initial-old-space-size` didn't help, so no flags were adopted. `SETTLE` is why the gate waits.

## Whole matches

- Real server over a socket, 150 s limit: Solos winner at 116 s, Duos 104 s, Trios 105 s, all `lastSquad`, 60 on the scoreboard. A person who stood still died at 21 s and the match ended `noHumans`.
- Headless, full 600 s: Solos 279 s (59 deaths, 12 to the Ring), Duos 250 s, Trios 352 s.
