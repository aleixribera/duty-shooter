# The pistol friends hate

Status: resolved
Release: v2.196.0

Spec: `../spec.md` (objective 4, every weapon feels good)

Aleix's request 2 (2026-11-13): "Pistol: why friends all hate it, compared with well-loved shooters (sourced), fixed."

Acceptance: the reasons named with sources; in the Practice Range, the Warden 9 clicked at a quick human pace fires every click and kills the 10 m dummy in fewer hits and less time than before; tests hold the new numbers.

## Comments

**2026-11-13, loop pass 24 (pass 1).**

Why it was hated, against well-liked sidearms:
- **It ignored clicks.** A semi-automatic press that came before the 150 ms between shots was over was thrown away. Clicking as fast as a player does (a press every 130-150 ms, give or take 25), 28-39 % of clicks did nothing, so three shots took 448 ms and four 665-676 ms, a third longer than the stats said (`pistol/clicks.txt`, from `pistol/clicks.probe.test.ts`). Players of other games report the same: a press just before the gun is ready does nothing (Deadlock forum thread "Semi-automatic weapon input mishandling"); the usual cure is a short input buffer, about 120 ms (bugnet.io).
- **It killed too slowly, and did not pay for aim.** Four torso hits within 10 m (450 ms on paper, about 665 ms in real clicking), five past 10 m, three to the head: twice the M4A1's 222 ms, and no head bonus worth the aim. Well-liked sidearms are either near their rifles (Modern Warfare's X16, about 388 ms against rifles at 200-250, esportstales.com) or slow to the body but deadly to the head (Valorant's Classic, 26 body and 78 head at 6.75 a second; CS2's Glock-18, 30 at 400 rpm and four times that to the head, csdb.gg). Ours was slow to the body and weak to the head.

What changed:
- **A click a little early is kept.** A semi-automatic gun (the pistol, the revolver, the Vantage) keeps one click that comes at most 0.1 s (`pressBuffer`) before it can fire again, and fires it the moment it can; earlier clicks are still lost, so a double click doesn't fire a shot long after. The kept click is the weapon state's `pressAt` (its clock time; protocol 32). Real clicking now fires 89-100 % of clicks; three shots take 303-342 ms.
- **The pistol:** three torso hits within 12 m (34; 300 ms, 1.35 times the M4A1), four to 30 m (26), five past it (20); head x1.6, so two to the head kill up close.
- **The revolver** fires at 210 rpm (was 150), so its two hits (286 ms) still beat the pistol's three when both land, as ticket 18 decided; its recoil comes back in 0.12 s (was 0.16) to keep up. Request 6 redesigns it properly.
- **Bots** press a semi-automatic only when it can fire, so a kept click never goes off past their aim and sight checks.

Checked:
- `arsenal.test.ts`: "keeps a click that came a little before the gun was ready" failed before the change (one shot) and passes (two, 150 ms apart); "drops a click that came long before" passes. Typecheck and 48 related test files (767 tests) pass; `docs/balance.md` regenerated.
- `pistol/look.mjs` in the Practice Range at 8 m, eight clicks every 130 ms: all eight fired, the dummy went down in 3 hits, 323-339 ms (`pistol/after/pistol-chest-1920.jpg`, `-844.jpg`, `result-*.json`). A head run kills with a 54.4 HP head hit.
- **Second opinion** (read-only review) found three, all fixed: a click during a mantle was kept for the whole mantle (the kept click now keeps its own time, so its age counts); bots' presses would have queued and fired past their sight check; the stat's text claimed draws and sprint-to-fire were covered (they aren't: the click is only kept while the gun is up). Also: a kept click is dropped when its owner is downed or starts a revive.
