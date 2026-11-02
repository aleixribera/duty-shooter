# Battle Royale runs in its own server process

Status: claimed
Blocked by: 07

Spec: `../spec.md`

Spec: Server and Local bots. Own OS process behind the one public address, started on demand, memory limit set from measurement, Play Online unaffected. New ADR. Deployed and checked on the home server.

## Comments

From ticket 03: this process needs `warmUp` (`apps/server/src/warm-up.ts`) before it takes players, or the first ticks run to 60 ms. Play Online beside 60 seats was only measured under the test slice's CPU cap: measure it again once they share the container.
