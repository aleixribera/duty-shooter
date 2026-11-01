# Binary snapshots and per-client relevance

Status: resolved
Release: v2.92.0

Spec: `../spec.md`

Spec: Netcode. A binary snapshot codec for all modes with a protocol bump, per-client relevance tiers, and a per-mode snapshot rate (team modes stay at 60 Hz). Done when: team modes behave the same, the bytes per snapshot are measured against JSON, and net tests plus `chaos.mjs` pass.

## Comments

Measured on the home server with the load test, 30 s, scripted clients at 60 Hz. JSON figures are from the same runs before the change. Raw means after decoding the frame, before WebSocket compression.

| Run | JSON wire | Binary wire | JSON raw | Binary raw | Tick | Server CPU |
| --- | --- | --- | --- | --- | --- | --- |
| 12 clients | 558 B | 320 B | 6,981 B | 924 B | 3.1-3.5 ms, then 2.3-3.2 ms | 39-46%, then 42-45% |
| 12 clients, no compression | 7,190 B | 942 B | same | same | about 3.3 ms, then 2.6-3.6 ms | 26%, then 28% |
| 6 clients and 6 bots | 335 B | 177 B | 3,956 B | 602 B | 1.6 ms, then 2.0 ms | 23%, then 25% |
| 12 clients, `NET=wide` (20 Hz) | | 417 B | | 1,054 B | 1.4-2.7 ms | 30-34% |

All-clients outbound at 12 clients fell from 3.06 to 1.76 Mbit/s, and without compression from 39.49 to 5.17 Mbit/s. CPU is about flat, because the codec packs what JSON.stringify packed. The load test's clients bunch up on a small map, so `NET=wide` shows the rate, not the tiers. The tiers' saving can only be measured on a kilometre-wide map.

Calls the spec left open, also in `docs/adr/0006`:

- Relevance is distance only, with no line-of-sight test.
- Past the mid range a seat is not sent. Two exceptions: teammates, and a seat that fired within hearing, for `heardTicks`.
- Kills and mode events go to everyone, loud events to hearing range, quiet events to the mid range, and any event to the seats in it.
- There is no far tier yet: nothing draws one until the map HUD exists.
- A client outside the match sees everything until the spectator ticket says otherwise.
- `WIDE_MAP` numbers are provisional, and no mode uses them. `NET=wide` on the server is there for load tests until Battle Royale exists.
- While a mid seat is in view, the interpolation delay rises to about `midEvery`, for everyone drawn: one render tick per shooter keeps lag compensation correct. A test confirms the same hits and zones as full rate.
- Sticky fields are packed too. Other seats' sway isn't sent, and yaw on the wire is wrapped to a heading.

Verified: online matches in Chrome (dev page against the real server) of TDM, FFA and Charge, plus TDM on `NET=wide`, with no console errors, no stalls, kills scored and the largest frame-to-frame step of a drawn seat under 0.7 m. Bot Matches with `MOVE=1`: five of six passed at 30 s. Humans vs bots on Survival Town had no kills in 30 s, then passed with 5 kills in a 75 s rerun, and on Switchyard with 3. `chaos.mjs`: 12 of 12 survived, 0 lost, no errors. `hostile.mjs` passes all 12 cases, the binary frame among them. A join with protocol 12 gets the JSON `reject`. `bad-link.mjs` ran all six links and kept 60 snapshots a second on each with every connection open, the 120 kbit link included.
