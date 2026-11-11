# Docs and the name

Status: resolved
Release: v2.170.2

Spec: `../spec.md`

README, deploy.md, GLOSSARY, DESIGN and AGENTS describe an older game. Rewrite them for this one. Recommendation on the name for the owner: keep Duty Shooter as the address and adopt a title that carries the idea; listed with the cost of each rename.

## Comments

- 2026-11-11, the docs. Most of them had kept up release by release; what described an older game:
  - **README:** opened as "a browser FPS built to feel like Modern Warfare (2019)". It now opens on the spec's idea (every match is a weapons test that ends the ground you fight on, and the last minute is an act of its own), with MW2019 as where the controls and feel started. It gains Attachments, Zero Island, Battle Royale (Squads, the Ring, Supply Drops, Reboot) and Progress (Score, XP, Rank, Mastery, Challenges, in the browser). The graphics paragraph still described the 1440p pixel cap ticket 35 removed; it now says one picture at the window's own pixels. "Changes from MW2019" is "Where the defaults differ from MW2019" and says recoil returns; the stale "Eliminated" callout line is gone.
  - **GLOSSARY:** Survival Town was "the recreation of the original 2010 Nuketown"; it is now described as this game's map, its layout borrowed and its name, look and ending its own, as the spec's "maps lose their borrowed names" asks. New entries: Attachment and Gunsmith (checked against `slotsOf` in `weapon/attachments.ts`).
  - **DESIGN.md** (Words section added yesterday), **AGENTS.md** and **docs/deploy.md** describe the game as it is; unchanged. `deploy.md`'s `remote-test` load runs are the server-side measurements it should use.

**The name: a recommendation for the owner.** The default is to keep Duty Shooter: the address, the installer, the image and every save carry it. Its weakness is that it says "a Call of Duty copy", the thing the spec moves away from, and says nothing of the idea. Recommendation: keep `duty-shooter` as the address, repository, image and save keys, and change only the title players see to **Test Shot**. A test shot is what a nuclear test is called, and every match here is one; a shot is also what the game is made of; and it fits the 1950s test-site look and Station Nine's tower shot. Runner-up: **T-Minus**, the word the last minute's clock reads, which is stronger as a moment than as a name and is a common word for other products. What would prove this wrong: if the owner reads the game as a shooter first and a doomsday clock second, the title should say shooter, and Duty Shooter stays.

What each rename costs:

| Change | Touches | Cost to players |
| --- | --- | --- |
| Title only (recommended) | `<title>` in `apps/range/index.html`, the menu brand (`ui/menu.ts`), the phone's turn screen (`touch/controls.ts`), the desktop app's `productName` and installer name, README and DESIGN.md | None: same address, same saves. The installed desktop app keeps its old Start menu name until reinstalled. |
| Repository and image | GitHub repo, GHCR image (`compose.yaml`'s `DUTY_IMAGE`), the home server's autoupdate, the Pages copy's address, the desktop app's release download link | None for players if the old Pages address redirects; one ops session. |
| Address (the Funnel host or a domain) | The live origin | Every browser's Profile, settings and seat live in that origin's local storage (`duty-shooter.profile.v1`, settings, `duty-shooter.seat`): moving the address loses them unless the old page hands them over first. The desktop app's built-in `LOBBY_URL` needs a new release. |
| Save keys (`duty-shooter.*`) | `profile/model.ts`, `settings.ts`, `audio/prerender.ts`, `main.ts` | Nothing gained; a migration for no visible change. Leave them. |

Not done here: the name is the owner's to pick. The ticket is resolved with the docs rewritten and this recommendation recorded.

