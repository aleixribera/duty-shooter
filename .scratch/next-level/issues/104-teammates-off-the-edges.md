# Teammates' tags off the screen's edges

Status: resolved

Release: v2.193.1

Spec: `../spec.md`

Broken (a rule of `DESIGN.md`), the most visible defect of review 2026-11-13a: in the team modes every teammate off screen or behind you held the screen's edge with a named chevron, so five tags sat over the health (20-switchyard-tdm-a), over the gun and the hint line from behind (20-switchyard-tdm-kill-2b) and against the kill feed (20-switchyard-tdm-kill-3b).

Acceptance: a Switchyard TDM Bot Match, looking round from the spawn at desktop and phone width, shows no ally tag on an edge while allies in view keep their names; a Battle Royale squad keeps its edge tags (test).

## Comments

**2026-11-13, loop pass 13.** Default answer: keep edge tags off the HUD's corners. Departed from it: in a team fight five edge tags say nothing a player needs (CoD, Valorant and Apex show no off-screen teammate tags; edge markers there are for threats, pings and objectives), so only a Battle Royale squad keeps them, the case they were made for (ticket 26, F15). `allyTags(..., edges)` filters to allies in view when `edges` is off; `Game.#allyTags` passes `mode === 'battle-royale'`. A Downed ally would still hold the edge, but only Battle Royale downs anyone today. `DESIGN.md` updated. Overridable: if Aleix wants teammates' edge tags back in the team modes, they need a place off the readouts instead.

Checked with `ally-edges/look.mjs` (Switchyard TDM, seed 5, four headings at 1920x1080 and 844x390): before, up to 5 of 5 tags on an edge (`before/desktop-yaw-1.jpg`: a stack of four at the bottom right over the ammo); after, 0 edge tags in all eight views, names over heads in view (`after/desktop-yaw-2.jpg`, `after/phone-yaw-2.jpg`). `test/ally-tags.test.ts` holds both cases. Second opinion found no bug; it pointed out the "Downed in any mode" wording described a case that can't happen today, reworded.
