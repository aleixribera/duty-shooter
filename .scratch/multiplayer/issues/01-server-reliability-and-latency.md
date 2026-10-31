# Multiplayer audit: reliability, speed and smoothness

Status: resolved
Release: v2.91.0
Labels: enhancement

## What to build

Audit the multiplayer side, the server especially, and make it 10x more reliable and 10x faster and smoother. Report real before and after numbers, including targets not reached.

## Results

v2.89.4 against this build, same scripts, same machine (the home server), scripted clients at exactly 60 Hz. Load is 12 clients for 40 s. Bad-link runs are 4 clients for 20 s, with the numbers taken from the one client on the bad link.

| Measure | Before | After | Change |
| --- | --- | --- | --- |
| Input round trip, 12 clients, p50 | 51.2 ms | 13.7 ms | 3.7x |
| Same, p99 | 69.2 ms | 46.8 ms | 1.5x |
| Same, worst | 170.8 ms | 65.0 ms | 2.6x |
| 120 kbit link, snapshot age p50 | 1795 ms | 11 ms | 163x |
| Same, p99 | 6916 ms | 445 ms | 15x |
| Same, input round trip p50 | 1895 ms | 127 ms | 15x |
| Stalling link (2.5 s every 8 s) | kicked as a flood | stays connected | fixed |
| Hostile inputs that kill the server | 1 of 9 (`GET //` upgrade) | 0 of 9 | fixed |
| Sockets that never join | open forever | closed after 10 s | fixed |
| Connection cuts and stalls survived in a real browser | 12 of 12 | 12 of 12, back in 128 ms (p50), 3.1 s worst | same |
| Snapshot gap p99, worst | 25.1, 48.0 ms | 22.0, 33.0 ms | small |
| Wire per client | 41.6 KB/s | 34.3 KB/s | 18% less |
| Server upload, 12 players | 3.90 Mbit/s | 3.21 Mbit/s | 18% less |
| Server CPU, one core | 47–51% | 41–47% | about 12% less |
| Memory | 157 MB | 158 MB | same |
| Tick cost | not measured | about 3 ms of 16.7, worst 7.6 ms, none late | |

Targets not reached:

- 10x on input round trip. The median improved 3.7x and the tail much less: a usercmd waits for the next tick, so anything up to 16.7 ms stays, and whether a client lands just before or just after a tick decides where it falls.
- 10x on bandwidth and CPU. A moving player costs about 33 compressed bytes per snapshot, and that is real game state. Going further means sending other players at 30 Hz, which I left out because it trades smoothness for upload the server has.
- Ping through Funnel. Tailscale's relay adds 50 to 150 ms and TCP stays, because Funnel carries nothing else. No code here changes that floor.
- Not measured with real people or on the live lobby: the numbers are scripted clients on the home server.

## Comments

- The first baseline was wrong twice. Precompress walked the whole repo with `STATIC_DIR=.`, which showed 150% CPU and 540 MB, over the container's 512 MB limit, and neither is real: a settled full lobby is about 50% and 157 MB. And `setInterval` rounds 16.67 ms down to 16, so the scripted clients ran at 62.5 Hz, which kept the server's queue full and hid the delay fix. The scripts now point at a folder with nothing to precompress and keep exact time. The table comes from those fixed scripts on both builds.
- Protocol 12. Sticky fields travel only when they change, and only on a connection that promises order and delivery. Skipping is now the game server's decision (`connection.congested`), not the socket's, so a skipped snapshot can't lose a change.
- A client's pace is judged from how old its newest snapshot is, because the kernel's and Funnel's buffers hide a queue from the server's own socket. It drops as low as one snapshot in six and climbs back after two seconds clear, longer after each failed try.
- Other players' interpolation delay grows with the snapshots' spacing, capped so a shot never needs more rewind than the server allows. Otherwise a bad link would miss shots that looked like hits.
- Pings update once a second. They fill a scoreboard column, and at 60 Hz they kept the whole field resending.
- The idle timeout went from 60 to 20 s. A hidden tab drops sooner, and its seat is held as for any other drop.
- Leaving on purpose now gives the seat up; only a drop holds it.
- `chaos.mjs` failed at random before any cut: with no name, the Play Online tile only focuses the field, and the script clicked it before naming itself, so it passed only when it beat the lobby status. That also explains the unexplained `cuts 0` in the perf ticket. It now sets the name first.
- The worst way back, 3.1 s, is a stall: the client gives a silent connection 3 s before trying again.
- No `SIGTERM` work: `terminate` already sends clients straight to reconnecting, so a close frame would change nothing a player sees.
