# Better spectating in every mode

Status: resolved
Release: v2.112.0
Blocked by: 11

Spec: `../spec.md`, story 89

Owner request: improve spectating. Applies to Battle Royale, Charge and late joiners. Next and previous player keys that work with keyboard and gamepad, a clear panel with the watched player's name, health, weapon and Squad, smooth following, first-person view through their eyes with their aim shown, automatic switch when the watched player dies, and who killed them. Bots can be watched too. Relevance has to send the watched player's surroundings, not the dead spectator's. UI rules apply.

## Comments

- Keys follow the player's own bindings rather than new ones: Fire steps to the next player, Aim to the previous, Jump changes the view (on a pad RT, LT, A). They mean nothing else while you spectate, so nothing is taken from play, and a rebind carries over.
- The order holds still while you step: your Squad (or team) first, then the rest by seat. Charge steps only through living teammates (they're the only ones who matter until the round ends); Battle Royale and late arrivals step through everyone left.
- Relevance: the client sends a new `watch` message (protocol 18). The server measures what to send from the watched seat only while the client's own seat is out, the watched one is alive, and, in a team mode, on the same side, so a living player or an enemy spectator can't use it to see past their own surroundings.
- In Battle Royale a far seat isn't sent at all, so stepping goes through the whole match from the scoreboard (no deaths is still in). Stepping to one not yet sent holds the shot for the few frames until the server sends them.
- Following glides to someone within 40 m and cuts to anyone farther; through their eyes the camera sits exactly at their eye with their aim, and their weapon fires and flashes in your hands.
- The notice of who put out the one watched comes from the kill feed and stays 4 s. The bottom bar no longer repeats the name ("Spectating" only while there's nobody to watch).
- On narrow screens the panel stands above the menu-and-map bar and the ping readout steps aside.
- Play-through: `.scratch/battle-royale/spectate/play.mjs` against the real server and its 57 bots (shots in `.scratch/battle-royale/shots/spectate/`). The harness's scripted Mate page can't be hit by the harness's Enemy after its first kill, so the automatic switch is seen on a watched bot that the match puts out (e.g. "Tango was eliminated by Quill2", moving on to Mate).
