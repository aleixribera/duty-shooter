# 0006 Snapshots are binary, and a mode says who hears about whom

Status: accepted (2026-11-01, Battle Royale spec, ticket 01)

## Context

A snapshot was a JSON string with every seat in it, sent at 60 Hz. At 12 seats that came to about 7 KB before compression; at Battle Royale's 100 seats it would be the largest cost on the server and on the client's main thread. Compression hid the bytes from the link but not from either CPU, and most of 100 seats on a kilometre-wide map are of no interest to any one player.

## Decision

- **Binary snapshots, one path.** Snapshots are binary frames for every mode (`net/codec.ts`); protocol 13. Welcome, reject and lobby messages stay JSON text, and clients only ever send text, so a page from before the bump joins, gets the JSON `reject` it already understands, and asks the player to reload.
- **The codec.** Seats are fixed records. Positions and aim are 32-bit floats, enough to draw and to rewind a hit. The client's own state stays exact, because reconciling against a rounded state would show a correction on every snapshot. Everything else is a self-describing packed value with a one-byte dictionary of the protocol's words, so a new field still travels without a codec change and just costs a few bytes until its name joins `WORDS`. The order of `WORDS` is protocol.
- **Rate.** The simulation stays at 60 Hz. `NET_PROFILES` gives each mode a `snapshotEvery`, and a slow link's pace still goes above it. Every mode today is `FULL_RATE`: every seat in every snapshot, 60 Hz.
- **Relevance tiers.** A profile may carry a `Relevance`. A near seat comes in every snapshot. A mid seat comes every `midEvery` ticks, and is named in `held` between, so the client's picture stays whole. Past the mid range a seat isn't sent. A seat in view keeps a 10% margin past the mid line, so one on the line doesn't blink.
- **Exceptions to distance.** Teammates are always in view. A seat that fired within hearing stays in view for `heardTicks`, so a shot has someone to come from. Events go to the seats in them, loud ones (shots, explosions) to anyone in hearing, quiet ones to the mid range, and kills and mode events to everyone.
- **Distance only, no line of sight.** A line-of-sight test per pair costs more than the bytes it saves, and a seat popping in round a corner is the miss a player would notice.
- **Everyone is drawn at one moment.** Lag compensation rewinds to one tick for a shooter, so a client can't draw mid seats further back than near ones. The client keeps a track per seat, and the widest gap between one seat's updates feeds the same interpolation delay that snapshot spacing does. While a mid seat is in view, everyone is drawn `midEvery` ticks or so behind.

`WIDE_MAP` holds provisional numbers. Nothing uses it yet but `NET=wide` on the server, for the load test; Battle Royale's load test settles them and its mode row.

## Consequences

- Team modes play as before, for fewer bytes. Their numbers are in ticket 01.
- Scripts that read snapshots use `decodeServer`, or `codec.ts` directly: it has type imports only, so Node runs it without a build.
- A mid seat in view adds to the delay of everyone drawn. The server rewinds 0.3 s at most (18 ticks), which has to cover that delay and the shooter's ping, so `midEvery` has to stay well inside it.
- There's no far tier yet. The spec's map HUD will need one; it can come as its own low-rate message.
- A client outside the match sees everything until spectating asks otherwise.
- `self` is the most expensive thing per client that isn't shared, which is the first place to look if the bytes need to fall further.
