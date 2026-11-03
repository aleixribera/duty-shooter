# Sight lines to allies are kept from one match to the next

Status: resolved
Release: v2.114.3
Severity: S3
Found by: 35 (pass 2, coordinator review)

## Repro
Play a Battle Royale with an ally, then another. `Game.#allySight` (ticket 52's cache of whether each ally is in sight, refreshed ten times a second) is never cleared at matchStart.

The first tenth of a second of the next match uses the last match's answer for a seat id that may now be someone else, and the map keeps every id it has seen for as long as the page is open.

## Comments
- Fix: the cache is `AllySight` in `packages/fps-client/src/hud/ally-tags.ts` (a check at most every 100 ms per ally), and `Game` clears it at matchStart beside the killer and the spectate notice.
- Test: `packages/fps-client/test/ally-tags.test.ts` (looks again only after 100 ms; forgets every ally on clear).
