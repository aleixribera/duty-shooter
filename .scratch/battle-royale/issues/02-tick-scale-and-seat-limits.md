# Make the tick scale to 60 seats

Status: resolved
Release: v2.93.0
Blocked by: 01

Spec: `../spec.md`

Spec: World engine (broad phase), Bots at scale (brains). Remove what makes the tick quadratic: spatial index for players, bullets and frags, no per-bot player scans, unchanged-state stringify removed. Per-mode seat and bot limits, with 32 and 12 kept for the team modes. Bots far from humans think less often. Lag compensation stays correct.

## Comments

### Decisions

- **Index.** `PointGrid` (`grid.ts`, 16 m cells, built on first ask and thrown away with its tick) holds players; `Simulation` keeps hitboxes per rewind per tick, so bullets, melee and frags ask a grid instead of walking everyone. `SeatIndex` (`seats.ts`) is the same for bots and clients: lookup by id, who's near, living counts by team. Queries return ascending seat order, so the result is what the walk gave.
- **Left as a walk:** `#pickGoal` and the planners. They run when a bot needs somewhere new or once a second, not per tick. Ticket 06 owns the rest of the bot brain.
- **Sticky fields** are packed only when marked stale: names and scores on a seat change, scores on a kill or mode event (every tick in an objective mode, whose points have no event), popped on a prop, pings at their interval, match on any tick not of plain play. Checked by running the whole suite with an assert that compared every field to a fresh pack.
- **Far bots.** `WIDE_SCALE.farBots` is 150 m, every 4th tick. Between thoughts a bot repeats its last usercmd; on the next thought it hears what it missed and turns by the time gone by. Ladders, ledges and precise nav nodes run at full rate. Team modes have `farBots: null`. A semi-auto far bot fires slower, since its trigger is held across a thought; nobody is near to see it.
- **Limits.** `MATCH_SCALES` per mode, all 32 seats and 6 bots a side today; `WIDE_SCALE` 60 and 30. `scale` on the server replaces them as `net` does, and `NET=wide` sets both. The join message's `bots` limit went from 16 to `WIDE_SCALE.botsPerTeam`; the server still caps it to the match's limit, so no protocol bump. Battle Royale's own entry comes with its mode.
- **Team modes play the same.** A hash of every player, event, grenade and client frame over 90 s, 12 seats, was identical before and after in tdm, charge and outposts on both maps, and ffa and gungame on Switchyard. Gun game needed a seeded ladder; it deals at random. The comparison test was throwaway.

### Measured (home server, 2 people and 58 bots, 20 s, ms a tick)

| Case | Mean before | after | p99 before | after |
|---|---|---|---|---|
| In memory, 60 spread over 600 m | 2.82 | 1.94 | 27.9 | 6.7 |
| In memory, 60 on Survival Town | 8.04 | 7.29 | 17.2 | 16.8 |
| In memory, 60 on Switchyard | 3.86 | 3.22 | 7.9 | 7.4 |
| In memory, 12 on Survival Town tdm | 1.22 | 0.91 | 3.4 | 3.2 |
| In memory, 12 on Switchyard tdm | 1.17 | 0.89 | 4.0 | 3.7 |
| Real server, 60 on Survival Town (`NET=wide MODE=ffa BOTS=30`) | 7.7 | 7.3 | | |
| Real server, 12 on Survival Town | 1.9 | 1.4-1.9 | | |

"Before" on the real server at 60 seats is the previous commit with only its seat caps lifted. `load-test` has no spread map, so the real-server number is the crowded case, where every bot is near a person and the far tier does nothing.

What's left in a crowded tick is no longer player scans. A profile of it puts the time in world queries (bots' sight rays) and frag arcs, which is real work per pair in sight rather than a walk over seats. Lone ticks up to about 60 ms remain, from JIT warm-up and respawn scoring; ticket 06 owns those.
