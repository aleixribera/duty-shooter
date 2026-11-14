# Reset all progression once the new system is built

Status: resolved
Release: v2.210.0

Spec: `../spec.md`; Aleix's request 9 (2026-11-14): "could you also reset all progression to 0 for all accounts once the system is built?" The last step of PLAN item 7, not before.

How: profiles live in each player's browser (localStorage `duty-shooter.profile.v1`, `packages/fps-client/src/profile/model.ts`), so the reset is a one-time wipe that ships with the new system: bump the profile key or add a progression epoch, so every browser starts at Rank 0 with no XP, unlocks, Mastery or Challenges on its next load. Settings and the player name stay. Check that no server-side copy exists; if one does, reset it too.

Acceptance: a browser holding an old Rank 10 profile loads at Rank 0, with its settings and name kept.

## Comments

- Pass 44 (2026-11-14): built as a progression epoch, not a format change.
  - No server copy exists (the server keeps no Profile or XP; checked `apps/server`), so the reset is per browser on its next load.
  - The Profile key moved to `duty-shooter.profile.v2` (`PROFILE_KEY`); `ProfileStore` removes what `RETIRED_PROFILE_KEYS` (`.v1`) hold on load and says so in `wiped`. The Profile's JSON format is unchanged (still `version: 1`), so seeds only need the new key; the tracked scratch scripts that seed one were moved to `.v2`.
  - Save codes now start `DS2-`; a `DS1-` code is refused, and the Profile screen says why ("made before every Profile went back to Rank 1, on 14 November 2026") instead of "not a save code".
  - Settings and the name are another key and stay. Camos picked in settings are cleared when the load wiped an old Profile (ticket 117 asked for it). Gunsmith builds and reticles stay as choices: builds are kept to what Mastery has opened.
  - "Rank 0" in the acceptance is the game's Rank 1 with 0 XP: Ranks start at 1.
  - Review (one subagent): a loadout saved before the reset kept its Mastery attachments in a match, since `matchLoadout` only re-gated a swapped gun. Fixed: `earnedLoadout` keeps only earned attachments on every match loadout. Noted, not fixed: a tab left open on the old build writes `.v1` again, and the next load wipes it and clears camos once more; only that stale tab's own progress is lost.
  - Proof: `profile.test.ts` (an old Rank 10 Profile loads at Rank 1 with the sniper locked, the old key gone, settings untouched, the wipe happens once; `DS1-` codes refused and told apart; earned attachments only), typecheck; the real page (`reset/look.mjs`, frames in `reset/after/`): a browser with a Rank 10 Profile under `.v1`, name "Kept Name", FOV 97 and the M4A1 in Sand loads at Rank 1 with 5 guns shut, name and FOV kept, camos empty, `.v1` gone; an old code pasted shows the refusal, desktop and phone.
