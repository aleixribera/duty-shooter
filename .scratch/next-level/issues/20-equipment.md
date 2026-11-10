# Tacticals and perks

Status: resolved
Release: v2.162.0

Spec: `../spec.md`

A tactical slot (smoke, flash) and one perk slot. Bots use and respect them.

## Comments

What shipped:

- **Tacticals:** Smoke and Flash in a new loadout slot.
  - Held on their own button (E, and d-pad down on a pad), thrown on release.
  - The fuse is lit at the release, so a tactical is never cooked and never goes off in the hand.
  - One a life. A Battle Royale gives two, not refilled; a Reboot brings one back (`royale.reboot.tacticals`).
  - The Smoke: a cloud 7 m across and 3.4 m high that stands 15 s. Nobody sees through it, people or bots; bullets still pass.
  - The Flash: a white-out of up to 3.6 s for whoever looks at it. It falls off with distance and does nothing from 20 m. Turning away cuts it short; a wall or a Smoke stops it. It never blinds teammates, but it does blind the thrower.
- **Perks:**
  - Fast Hands: reload, swap and throw 35 % faster.
  - Soft Soles: footsteps carry half as far, to players and to bots.
  - Blast Vest: −40 % frag damage, and a Flash blinds for 45 % as long.
- **Models:** both canisters are real Blender models (`tools/weapon/canister.py`), seen in the hand, in flight and where they land.
- **Bots:**
  - Each bot style carries a tactical by profile: anchors, roamers and support carry a Smoke; rushers and flankers a Flash. One bot in four takes the other one.
  - A bot breaking off to heal throws its Smoke between itself and the threat. A test checks this: without the glance back, the cloud landed 22 m behind the bot.
  - A blinded bot sees nobody until the flash wears off.
  - Bots run from a frag but not from a tactical.
- **Protocol:** v28.

Decisions made without the owner:

- **Names:** "Smoke", "Flash", "Fast Hands", "Soft Soles" and "Blast Vest" are placeholders that read plainly. Renaming them is the owner's call.
- **Pad binding:** the pad's tactical is on d-pad down. D-pad left and right vote for the next mode in play, and Options opens the menu, so `PAD_KEPT_IN_PLAY` keeps all three free. A test makes sure no pad layout binds an action to them or binds two actions to one button.
- **Reboot:** a Reboot brings back one tactical, as it does one frag, not the match's two.
- **Old saves:** a loadout saved before tacticals existed gets the Smoke and no perk. A loadout that explicitly chose none keeps none.
- **Known lag:** a bot blinded mid-think may fire for up to `thinkEvery − 1` ticks before it notices. That is at most a few ticks, and a fix would need a re-think on the `flashed` event. Accepted.
- **Smoke particles:** the cloud pool holds 12 clouds at once before the oldest thins (`CLOUD_PUFFS * 12`).
- **Name clash:** the pad preset called "Tactical" shares a word with the Tactical slot. The two never appear on the same screen, so it is left as is.
- **Touch layout:** the tactical button sits above Use, in the right thumb's arc. It was checked at 844×390 and 667×375 with Use shown: every button is at least 44 px, on screen and 8 px apart, and a tap throws the Smoke (`.scratch/next-level/tacticals/touch.mjs`, `SHOWUSE=1`). At 667 px, the invisible tap zone over the screen's Use prompt grazes the grenade button by 2 px; that predates this ticket.
