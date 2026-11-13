# Reset all progression once the new system is built

Status: open (waits on PLAN item 7 working end to end)

Spec: `../spec.md`; Aleix's request 9 (2026-11-14): "could you also reset all progression to 0 for all accounts once the system is built?" The last step of PLAN item 7, not before.

How: profiles live in each player's browser (localStorage `duty-shooter.profile.v1`, `packages/fps-client/src/profile/model.ts`), so the reset is a one-time wipe that ships with the new system: bump the profile key or add a progression epoch, so every browser starts at Rank 0 with no XP, unlocks, Mastery or Challenges on its next load. Settings and the player name stay. Check that no server-side copy exists; if one does, reset it too.

Acceptance: a browser holding an old Rank 10 profile loads at Rank 0, with its settings and name kept.

## Comments
