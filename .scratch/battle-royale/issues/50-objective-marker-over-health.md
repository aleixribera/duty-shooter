# Objective edge marker overlaps the Health number

Status: resolved
Release: v2.108.12
Severity: S3
Found by: 35

## Repro
Bot Match, Charge on Survival Town; turn so objective A is behind and to the left.

The edge marker "A 40 m" is clamped into the bottom-left corner, on top of the HEALTH "100".

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/bot-runs/survival-town-charge-hvb.jpg`.

## Suspected area
The objective edge-marker clamp in the HUD: keep it out of the Bottom bars' area.

## Comments
- Fix: the edge-marker clamp moves out of `game.ts` into a pure `pinMarker` (`packages/fps-client/src/hud/markers.ts`), used by Charge markers and Outposts zones alike. A marker that would sit low and within the Bottom bars' corners (340 px, or half a phone's width) is lifted to just over them: 124 px from the bottom, 148 on narrow screens, where the ping sits over the health.
- Tests in `hud-corners.test.ts`: behind-left and behind-right lift over the bars, behind-centre stays on the bottom edge, in-view markers don't move, on a phone nothing goes under the ping.
- Seen in Bot Match Charge, turning until both sites are behind: at 1920 the markers sit at y915..956, over the health (top 974) and over the ammo (top 968); at 390x844 at y655..696, clear of the ping (706). Shots `shots/bugs/t50/before-charge-marker-1920.jpg`, `after-charge-marker-left-1920.jpg`, `after-charge-marker-1920.jpg` (right), `after-charge-marker-phone.jpg`.
- Left as is: when A and B both pin to the same corner they stack on each other. That was so before and is not this ticket.
