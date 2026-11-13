# A Battle Royale lobby you bring friends into

Status: resolved
Release: v2.195.0

Spec: `../spec.md`, `../../battle-royale/spec.md`

Aleix's request 1 (2026-11-13): the private lobby of ticket 97 (invite link, the host moving and kicking people, even teams, a seat back after a drop) was built for Play Online only; the Battle Royale lobby "still works like before". Give it the same, with Squads friends join. And: "I can't choose an attachment in a battle royale lobby".

Acceptance: a friend opening the host's invite link lands in the host's Squad; the host moves a friend into and out of their Squad and kicks another; a friend whose connection drops keeps their seat in the Squad and takes it back; attachments are picked in the Battle Royale's own loadout picker.

## Comments

**2026-11-13, loop pass 23 (pass 1).**

- **One Battle Royale on the server, not a private one each.** A Battle Royale holds Zero Island and 60 seats in a process of its own (ADR 0009, about 415 MB in a match), and the Battle Royale spec keeps one at a time on the server. So there is no private code: the invite link (`?royale=<seat>`) opens the Battle Royale screen and, once in the lobby, puts the friend into the inviter's Squad when it has room. The seat leaves the address bar at once. Overridable (STATE "Needs Aleix"): private Battle Royales would need a second island process per lobby.
- **The host's hand on the Squads.** The `squad` message takes an `id` from the host (protocol 31): on a friend in the host's Squad, Move puts them in a Squad of their own; on someone in another Squad, Move brings them into the host's while it has room; Kick on anyone else. The server ignores a move of anyone else from anyone but the host. No "Even squads": a Squad is filled to its size by bots, so there is nothing to even; the host's Move does the arranging.
- **A seat back after a drop.** A seat held for a dropped connection keeps its Squad in the lobby (it was re-placed, often beside a stranger, and a newcomer could take it), and the lobby shows it as "Coming back" (`LobbyState.held`). `royale-lobby.test.ts` "coming back to a Squad" failed before (the seat's Squad was gone) and passes after.
- **Attachments.** The Battle Royale spec (2026-11-02) has no loot and no items, and listed attachments as out of scope; the gunsmith came later (ticket 19) and travels in the loadout in every mode, Battle Royale included (`royaleLoadout` keeps it). So attachments come from the loadout, not from loot: the lobby's Loadout button already opened the gunsmith, but the Preparation's own picker, where a Battle Royale's loadout is chosen, had no attachments, and a gun picked there dropped its gunsmith build. Now each gun in the Preparation shows its open slots to fit (Stock and the two choices) and the next shut one with the kills it waits for, and a gun picked there carries its build.
- **Checked.** `royale-lobby/look.mjs` runs the host page, an invited page and three scripted friends on one server: the invited page lands in the inviter's Squad 5 (not with a stranger in Squad 1); the host moves Carol out to Squad 3 and Dave in; Bob is kicked; Dave's socket drops, he shows "Coming back" in Squad 1 and takes the same seat back; in the Preparation the M4A1's Optic and Muzzle rows are open (80 kills) and fitting Reflex lands in the loadout. Frames at desktop and phone width in `royale-lobby/after/`. Typecheck and the related tests (2310) pass.
- **Second opinion** (read-only review of the diff) found four, all fixed: the Preparation showed the M4A1's attachments over a saved sniper pick; the invite also fired in Solos and while reconnecting; the passphrase in the invite link was never filled in; the bot count ignored held seats.
