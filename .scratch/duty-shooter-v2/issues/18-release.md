# 18 The release: v2.0.0

Status: resolved
Release: v2.0.0
Blocked by: 17

Full browser runs of every mode on both maps + HvB, renders reviewed, code review, final report with screenshots and a short video, v2.0.0 tag, live lobby unpinned.

## Comments
- 2026-10-27: browser runs, review and report. The report is in `../report/README.md`, with screenshots, a 30 s clip and the Switchyard models sheet. Decisions:
  - **Browser runs last 90 s, not whole matches.** Every mode on both maps plus humans vs bots runs in headless Chrome, with 0 stalls and 0 console errors. Whole matches are covered by the headless bot soaks in the suite. A browser match runs 10 minutes or more, multiplied by 11 runs, and those minutes would add little.
  - **Humans vs bots runs script the player's movement (`MOVE=1`).** Bots ignore a player who stands still in humans vs bots, and in Charge they escort a carrier who doesn't move, so a still player reads as "no kills".
  - **The runs found a bug, fixed in v1.14.0.** The Practice Range's time-to-kill panel showed on Switchyard. Maps now declare `rangeLanesWestOf`, and the reruns show the panel gone.
  - **The renders were reviewed** in the EEVEE sheet of all 11 Switchyard models and in game, in the screenshots.
  - **Review dispositions.** The fixes went out in v1.12.3. The loading player standing at spawn is deferred in ADR 0005, because fixing it needs a protocol bump. The bot cap of 6 is kept. `status().hvb` describes the current match, like `mode`. Switchyard's low-preset p99 of 7.0 ms is accepted: it is one run's tail, far under 16.7 ms, and its p95 is the lower of the two maps.
  - **Tags.** v1.12.2 and v1.12.3 were tagged after another session's v1.13.0, so they sort out of order. Every tag since has followed the highest-tag rule in `AGENTS.md`.
  - **Live lobby.** It is unpinned after the v2.0.0 image is published: `DUTY_IMAGE` goes back to `:latest`, `MAX_PLAYERS` goes to 12, and the stack gets the current `compose.yaml`.
