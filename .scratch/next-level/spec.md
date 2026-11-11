# Next level: the owner's direction

Written 2026-11-09 after playing the game (recorded Bot Matches, every reference spot of every map, the menus) and three code audits (feel, rendering, project health).

## What the game is

The default answer for this project was "Call of Duty in a browser": MW2019's numbers, Nuketown and Crash rebuilt. A clone is forgotten the moment the tab closes, however good its netcode.

The game already owns something no other shooter has, and it was treated as a garnish: **every match is a weapons test, and the test ends the match.** Survival Town is a 1955 test-site town and it ends in a nuke. Zero Island is a test range and it ends in a nuke at Ground Zero. Switchyard ends under a freight train. So the direction is:

> **You fight on ground that is about to stop existing.** The match clock is the countdown. Everything on screen (the sky, the siren, the announcer, the HUD, the music) knows how long the place has left.

That gives the look (atomic-age test site: bleached paint, desert haze, hazard stencils, instrument-panel UI, which DESIGN.md already is), the sound (sirens, Geiger ticks, tape-machine voice, a score that tightens with the clock) and the structure (a match is three acts: arrive, fight, the last minute).

What would prove this wrong: if the last minute of a match doesn't feel different from the first when played, the idea is only a coat of paint, and the work goes to pure gunfeel instead.

The name stays Duty Shooter: the owner decided on 2026-11-11 (ticket 30).

## What holds it back today, in order

1. **It can't ship.** Main was red for three days on a bot stuck on a ladder; the fix sat uncommitted. (Fixed first, v2.142.1.)
2. **The picture.** Posterised clouds, neon grass, gravel that is television static, saturation pushed 16% on top, soldiers of flat-coloured boxes with orange skin, particles that are plain discs, an island with no baked light. The engine underneath (TAA, GTAO, bake, shafts) is good; the art direction never happened.
3. **A kill feels like nothing.** White X, red X. No score, no medal, no sound worth hearing again, no recoil that returns, no low-health state, a viewmodel that doesn't react to the body.
4. **It is nearly silent as a product.** One gunshot rate-shifted for five guns. No music anywhere. A browser's speech synth as announcer. One volume slider.
5. **Nothing remembers you.** No score, no rank, no unlocks, no lifetime stats, five weapons, one grenade, no attachments. A match ends and nothing has changed.
6. **Rough edges a player meets:** no graphics settings at all, no touch controls on a phone, the goal never stated, open design-audit failures, a "still being refined" map in the lobby.
7. **Friction for whoever works on it:** a 1,000-line `startGame`, a 1,850-line `Game`, tests that pin UI sentences and blocked releases, docs that describe a game two versions old, two M4A1s.

## Decisions

- **Clone numbers are no longer law.** MW2019's stats were a good bootstrap. From here weapons are tuned for this game; tests that pin "about 170 ms" go, tests that hold invariants (determinism, purity, netcode, hitboxes) stay.
- **Recoil returns.** The view recentres after a burst (most of the way), with a visual kick on top that never moves the aim. "Recoil never wears off" was faithful to nothing a player enjoys.
- **Score replaces raw kills as the personal number.** Kills still win TDM. Score (kill 100, headshot +50, assist, objective, streak, revenge, long shot) feeds the popups, the scoreboard and XP.
- **Progression lives in the page** (localStorage), not on the server: the server has no database and costs nothing a month, and that stays true. Rank, weapon mastery, lifetime stats, challenges. Honest numbers only.
- **Sound stays synthesised**, but each gun gets its own voice, and the game gets a score: synthesised too, so it can follow the countdown.
- **One look, with tiers under it.** A quality setting (and dynamic resolution) arrives, so the picture can be pushed without losing weak laptops.
- **Tests serve the game.** A test that fails because a sentence or a colour changed is deleted or rewritten to check behaviour.
- **Maps keep their layouts and lose their borrowed names over time.** Survival Town already has its own name. Crash becomes this game's own place when its art pass comes (ticket 31).

## Arcs (tickets in `issues/`)

- **A. Picture:** 01 sky, 02 grade and sharpen, 03 palette, 04 atmosphere on everything, 05 particles and muzzle, 06 soldier, 07 island light, 08 the Ring.
- **B. Feel:** 09 recoil, 10 viewmodel and camera motion, 11 kill confirmation and score, 12 low health and danger, 13 pad aim assist and rumble.
- **C. Sound:** 14 a voice per gun, 15 the score (music) and mix buses, 16 announcer and voices.
- **D. Depth:** 17 profile, rank and stats, 18 arsenal growth, 19 attachments, 20 tacticals and perks, 21 movement momentum.
- **E. Product:** 22 settings and quality tiers, 23 touch controls, 24 the countdown (the last minute), 25 match end and MVP, 26 onboarding and open audit failures, 27 benchmark link.
- **F. Engineering:** 28 test triage, 29 refactors, 30 docs and name, 31 Crash's own identity.

## The review

When the arcs are done a reviewer subagent plays the build (scripts, screenshots, clips, the code) and rates out of 10: picture, game feel, sound, gameplay depth, content, UI and UX, performance, stability, identity, onboarding and accessibility. The work continues until every one is 9 or more. Reviews are kept in `reviews/`.
