# Allies are easy to confuse with enemies

Status: resolved
Release: v2.110.0
Blocked by: 35

Owner report: "I want to see my allies with a tag or name or something, I confuse them with enemies."

Applies to every mode with allies: Battle Royale Squads and the team modes. Decision (owner's taste, set by the lead; the owner can change it): every ally gets a name tag over their head in the signal colour with a small chevron. The name shows up to a mid range. Beyond it, and through walls, only the chevron stays, clamped to the screen edge when off screen, so you always know where your squad is. Downed allies get a distinct Downed mark with the Revive prompt range. Enemies get nothing new: no tags, no outlines. The tags must not cover the crosshair's target, must stay readable over bright snow and sky, and cost little with 60 seats.

First check what nameplates exist today and why the owner didn't see them in Battle Royale (they may be team-only or relevance may drop squadmates far away). Verify in a real Duos/Trios match with a human and bot squadmates, near, far, behind walls and off screen, desktop and phone width, and in TDM. Screenshots under `shots/bugs/allies/`.

## Comments

Root cause: the only nameplates were 3D sprites in `players-view.ts`, drawn only when `teamMode(mode)` was true, and `teamMode('battle-royale')` is false, so a Squad never had any. They were also depth-tested, so a wall hid them, and nothing showed allies off screen.

Done (v2.110.0): the sprites are replaced by HUD ally tags (`packages/fps-client/src/hud/ally-tags.ts`), for teammates in the team modes and Squadmates in a Battle Royale, never enemies.
- Name in `--ds-signal` on `--ds-scrim-soft` (13 px bold) with a signal chevron under it, both outlined in `--ds-ink`, so they read on snow and sky as well as grass. The signal colour here is the lead's decision for the owner, against DESIGN.md's "signal for actionable only" rule; noted in case the owner wants another colour.
- Name up to 40 m and only with a clear line from the eye (re-checked 10 times a second with `sightBlocked`, not every frame). Beyond it or through walls: the chevron only.
- Off screen or behind: the chevron pins to the edge (same pin as the other edge markers) and turns toward the ally.
- Downed: a cross in `--ds-alert` with the distance under it at any range; in Revive reach the label turns to "Revive" in signal, matching the "Hold F Revive" prompt.
- A tag whose box covers the crosshair fades to 30 %, so it never hides the target.
- Cost: one DOM element per ally, rewritten only when its text, class or position changes. Frame time with the tags on was about 2.8 ms in the headless run.

Seen in real matches (headless Chrome, real server, `.scratch/battle-royale/t52/play.mjs`), screenshots in `shots/bugs/allies/`:
- BR Trios, Ada with Bea and Cole on scripted sockets: tag near; chevron only at 70 m and behind a wall; edge chevrons right and behind; Downed at 25 m "25 m"; Downed in reach "Bea / + / Revive" with the prompt "Hold F Revive Bea"; faded over the crosshair. At 1920x1080 and 390x844.
- TDM: tags on teammates Bea (person), Rook and Briar (bots); none on Cole, who was on the other team.
- Not verified: a tag over Frostbite Peaks snow specifically (relies on the ink outline and scrim).

Tests: `packages/fps-client/test/ally-tags.test.ts` (10). Client 263 passed; range 347 passed, 12 skipped; typecheck clean.
