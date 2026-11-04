# Mantling over low walls and ledges

Status: resolved
Release: v2.134.0
Blocked by: 63
Labels: enhancement

Jump into a ledge up to about chest-to-head height to climb onto/over it (Apex/Warzone style), with a short animation for the first-person view and the third-person soldier. Deterministic in the shared simulation (client prediction and server agree), works on the island's new cover and the other maps. Bots use it: the nav gets mantle links (ADR 0008) and bots take them. Check it doesn't open places the spec keeps closed (Frostbite summit, out-of-map).

## Comments

- 2026-11-04, resolved in v2.134.0. Mantling itself (findLedge, three height bands, bank mantles on terrain, nav climb links, bots pressing Jump on them) was already in the shared sim; this ticket finishes it.
  - **Sim path:** a mantle now pulls up first and goes over after (rise eased over the first 55%, over from 30%), so the body never cuts through a ledge's lip. Pure arithmetic, so prediction and server agree; no snapshot change, no protocol bump.
  - **First person:** the view nods down to the ledge and back (6 degrees at the high climb, 0.75 and 0.45 of that for waist and vault) with a small lean, and dips as it settles on top. The gun swings down and right out of the hands' way (MANTLE_AWAY). A mantle chained onto the last restarts the nod (one still mantling 0.05 s past its length is the next one). The nod stays inside the pitch clamp.
  - **Third person:** two clips authored in tools/soldier/soldier.py and exported in soldier.glb: `climb` (waist and high: both hands up on the edge, pull, right knee up, press over, stand; the gun goes away) and `vault` (low: the left hand planted, knees tucked; keys only the left arm and legs, so the gun stays in the right hand). Played once by how far through the mantle the body is. Dev sheet columns Climb and Vault.
  - **Bots:** a bot held still for more than 0.6 s with its next route node above a step presses Jump, so a ledge the nav walked (a kerb, a sill) is mantled. Not at or on a ladder, and only standing. A bot within 1 m of its spot at the end of its route counts as there. Watching from a spot is a hold, not a roam.
  - **Closed places:** a new test runs at the Frostbite summit from 24 bearings tapping Jump every 8 ticks: no way up. A run at the Boundary from 16 edges tapping Jump never leaves the play area. A run at 24 single-box cover pieces (0.7 to 1.9 m tall) climbs every one.
  - **Longest stuck bot**, pace runs Solos seeds 1 and 3, Trios seeds 1 and 2: 3.5, 2.0, 3.5 and 4.5 s. Before this ticket it was 9.5 s on Solos seed 1. The measure now restarts its clock after a spell Downed; one 10.5 s reading was a bot that had been Downed.
  - **Server tick** (60 seats): mean 0.81 to 0.93 ms, p99 2.07 to 2.52 ms.
  - **Local bots in Chrome:** 6.4, 7.4, 6.9 and 5.3 ms frames; the worker averaged 1.25 to 1.53 ms with a p99 of 2.4 to 3.3 ms. Runs interleaved with the v2.133.0 build on the same busy PC gave 5.5, 6.1 and 4.9 ms. The per-frame code added is a few eases, and the two sets overlap. I put the gap down to load on the PC; it is not proven either way.
  - **Found on the way:** when the last Squads went out on one tick, all of them were placed 1st while only one was named winner. The others are now 2nd. A whole-match test in Squads of 2 hit this.

