# Progression woven into the game

Status: open (rough sweep in progress)

Spec: `../spec.md`, objective 6; `PLAN.md` item 7 (Aleix, 2026-11-13). Builds on the Profile, Rank, Mastery and Challenges (tickets 17-20) and the gunsmith (ticket 19).

Rough first, in PLAN's order: unlocks; the loadout editor on the main menu (3D gun, gunsmith rows, 3 named loadouts picked at spawn); the results screen (XP bar, Mastery, Challenges, unlocks, "equip it", "play again"); a profile screen and a save code; customizing (four attachment slots on the model, Mastery camos, optic reticles); Battle Royale on loadouts (ground loot removed only after Aleix has played loadouts in Bot Match). Ticket 116 (the progression reset) is its last step.

Acceptance (PLAN item 7): a fresh Profile shows 4 guns open; a Profile at Rank 12 shows 9; the editor opens from the menu in under a second on this PC and holds 60 fps on the toaster, with frames at desktop and phone width; a Bot Match ends on a results screen with the bar filling and an unlock to equip; the save code carries a Profile into a fresh browser; a local Battle Royale starts every player with their loadout, shows no loot on the ground, and a Supply Drop opened without a sniper inside.

## Comments
- Pass 39 (2026-11-14), rough sweep part 1: unlocks, the save code, Loadout on the main menu.
  - Unlocks (`GUN_RANKS` in `fps-client/src/profile/model.ts`): M4A1, Wasp 9, Harrow 12 and Warden 9 open at Rank 1; Trident 4, Marshal 6, Vantage 8, Bulwark 10, Ridgeline 12 (one every two Ranks; the order runs from the guns closest to the starting four to the most specialised, the sniper last). The XP curve was left as it is (Rank 12 at 36,800 XP); whether that is 3-4 hours is for the review's numbers.
  - The Loadout screen shows locked guns with their Rank (switched off, like the gunsmith's shut slots) and their card says what opens them; in the Practice Range (`menu.practice`) every gun can be carried. Every other match goes through `openLoadout` (`matchLoadout` in `main.ts`): a locked gun picked in the range is carried as the M4A1 or Warden 9 with its own build. The BR picker lists only open guns.
  - Match end: the "Your match" strip names each gun the match opened, lit, with "Equip it" (a click, a tap or E) that writes it into the loadout. No pad route yet.
  - Profile screen: locked guns after open ones, each with its Rank; "Save code" opens a panel with the code (`DS1-` + URL-safe base64 of the Profile's JSON), Copy, a paste box and Load (replaces this browser's Profile; a bad code changes nothing).
  - Review (one subagent): the swapped-in starting gun lost its build, and the BR Preparation showed/fitted the wrong gun; Equip it unreachable with the pointer locked; its Equipped marks outlived the match. All fixed (`matchLoadout` re-applies builds, the host's `matchLoadout()`, E key, `Hud.clearScore` clears them). Also the Loadout screen now lights the gun actually carried.
  - Proof: `profile.test.ts` (unlock ranks, `openLoadout`, `gunsOpened`, save code round trip and refusals), `score-ui.test.ts` (unlock line and Equip it, Profile's locked guns); frames in `unlocks/after/` (`look.mjs`: fresh Profile 4 open + 5 locked, Rank 12 all 9, desktop and phone) and `unlocks/save/` (`save-look.mjs`: a Rank 8 Profile's code loaded into a wiped browser, a bad code refused).
