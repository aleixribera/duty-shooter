# 60-seat load test on the home server

Status: resolved
Release: v2.94.0
Blocked by: 02

Spec: `../spec.md`

Spec: Delivery step 1, Testing seam 4. Extend `load-test.mjs` to 60 seats with a load-test socket allowance. Pass bar: p99 tick under 12 ms, worst under 16.7 ms, Play Online unaffected. Save results here. Failing the bar means optimise; if still failing, report the numbers to the owner.

## Comments

### Result

The bar passes in play for 60 seats with bots, measured from the home server. Two things are not proven, below: 60 people with compression, and the match's opening ticks.

All runs: real built server on its own port (3991 to 3997), `NET=wide`, 20 snapshots a second, warmed, scripted clients on the same box through `remote-test`, loopback. Ticks are whole 10 s windows after the first, 3,000 to 4,800 ticks a run. Raw output is in `../results/`; `gate.sh` reruns it. The bar is p99 under 12 ms and worst under 16.7 ms.

| Run | Tick p50 | p99 | Worst | Late | Server CPU | RSS | Upload | Bar |
|---|---|---|---|---|---|---|---|---|
| a. 2 people, 58 bots, Survival Town | 5.0 | 9.5 | 15.9 | 0 | 42% | 186 MB | 0.36 Mbit/s | pass |
| b. 12 people, 48 bots, Survival Town | 5.25 | 8.75 | 14.4 | 1 | 54% | 190 MB | 2.03 Mbit/s | pass |
| c. 30 people, 30 bots, Survival Town | 4.5 | 6.75 | 8.2 | 0 | 63% | 176 MB | 4.53 Mbit/s | pass |
| d. 60 people, compressed | 5.25 | 22.25 | 43.8 | 33 | 97% | 196 MB | 18.0 Mbit/s | not proven |
| e. 60 people, `DEFLATE=0` | 6.0 | 11.0 | 12.6 | 0 | 55% | 170 MB | 42.1 Mbit/s | pass |
| f. 2 people, 58 bots, Switchyard | 3.75 | 6.75 | 11.5 | 0 | 36% | 186 MB | 0.32 Mbit/s | pass |

Before this ticket, run a measured p99 14.75 and worst 21.7. The memory limit (512 MB) has room. Bots cost no upload.

**Run d is not proven either way.** The server and the clients together need more than `remote-test`'s cap of 1.5 CPUs, and the cap stalled them for 7.9 s of the 62 s; the 22 to 44 ms ticks are those stalls. Run e is the same 60 sockets without compression, 0.8 s of stalls, and passes; compression runs off the game thread. A clean number for d needs the load target outside the slice, which the test rules don't allow, so it wasn't taken. Sixty real people is past the spec's own warning line of 20.

**The opening isn't in the table.** The first ticks of a match cost 22 to 30 ms with bots, then 14 to 18 ms, with at most a couple of ticks late: free-for-all's spawn scoring runs for 58 seats in one tick (8 to 20 ms of it), during the countdown, when nobody moves. Battle Royale's random spawns don't run that code. So this is a literal miss of the worst-tick bar that belongs to the stand-in mode, not fixed here. Ticket 07 has to rerun the gate on its own opening.

**Play Online stand-in** (12 people, tdm, 60 Hz, a server of its own): alone p99 3.75, worst 4.5. Beside a 60-seat match, p99 3.5, worst 7.0, a steady 60 snapshots a second, usercmd ack p99 52.8 ms against 50.2. That run stalled on the same cap (4.4 s), harsher than production, where the live container sits outside the slice with eight times the CPU shares; the 60-seat server beside it showed p99 14.75 and worst 61.6 from those stalls, so its own numbers in that run mean nothing. The live container was not touched. Team modes keep 32 seats, 12 sockets and two arcs a tick.

Upload is measured on loopback: the home line's real upload speed is still undocumented, so 2 Mbit/s for 12 people is what it must carry, not proof that it does. Only 20 snapshots a second was tried, so `WIDE_MAP` stays at `snapshotEvery: 3`.

### What failed the bar, and what fixed it

Profiled on the server, a crowded tick was 30% frag arcs, 18% sight rays and 6% GC.

- **World queries.** `SolidIndex.firstHit` skips a solid whose bounds the segment's bounds miss, and no longer allocates per call. This was the largest gain: p99 14 to 10.5. A frag's flight is thousands of short segments, each testing every solid in its cell.
- **Frag arcs.** The rising part of a flight skips the ground probe. `WIDE_SCALE.throwArcs` is 1 a tick, against 2 for team modes, so an aim takes a little longer on a wide map. This took the mean from 5.8 to 5.0.
- **`nearestNode`** keeps the eight nearest instead of sorting every node. The hunk is in `nav.ts`, the rest of nav is ticket 06's.
- **Snapshots spread.** Below one a tick, clients take a share each tick instead of all landing on one: run e went from p99 15.5, worst 19.2 to p99 12.25, worst 14.0. The self field is packed without a deep copy, which gave the last of it.
- **Warm-up.** A cold server's first ticks run to 60 ms with up to 20 late. A wide server now plays a private 10 s bot match before it listens, which takes a few seconds at start. Ticket 13's process needs the same call.

Tried and dropped: `--max-semi-space-size=64` gave no better ticks and 54 MB more memory.

The remaining cost isn't large-world nav. `#pickGoal` and the planners show in single slow ticks, and no run needed ticket 06 to pass. Crowded Survival Town is the worst case, as ticket 02 says; the spread case still has no real-server map until ticket 05.

### Decisions

- **Allowance.** `LOAD_TEST_SOCKETS` applies only to loopback connections with no forwarded address, so a Funnel visitor stays at 12 even on a server that sets it. Nothing in deployment sets it.
- **Numbers.** Tick costs are a 0.25 ms histogram, `TickCosts`, printed in the `LOG_STATS` line, so the load test can add windows into a true p99.
- **An early run measured a lobby.** Free-for-all's kill limit of 30 ended a match partway through, and the mean fell to 1.1 ms. `NET=wide` now has no kill limit, and the load test exits 1 if the match leaves play while measuring.
- **Lighter clients.** Only the host decodes every snapshot, the rest read the header, to leave the cap to the server.
- **Team modes play the same.** A fingerprint of every player, event, grenade and binary frame over 90 s, 12 seats, was identical before and after the arc, grid and `nearestNode` changes: tdm, charge and outposts on both maps, and ffa on Switchyard, seeded. The test was throwaway. It ran before the snapshot spread and the view of self: the first does nothing at a snapshot a tick, and the second packs the same fields.

Tests: 101 files passed, 1 skipped, typecheck clean, on the server.
