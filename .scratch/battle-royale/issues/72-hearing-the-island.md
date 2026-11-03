# Hearing the island

Status: open
Blocked by: none
Labels: enhancement

From `../research/mode-elements.md` (A list, new) and `../research/bots.md` change 2.

**Ticket: hearing the island.** Make distant fights readable by ear, and give bots the same ears. (1) Gunfire beyond about 60 m has its own distant voice for each weapon: a dull thump with a long echo for a far rifle, a sharp crack overhead for a supersonic round going past. Its level follows the 400 m hearing range clients already have, so a player can judge "fight to the north-east, about 200 m". (2) Add two or three cheap **sound traps** per Region, using the island's foliage and props: birds flushing out of Jungle canopy and Peaks pines when someone sprints within about 8 m, rattling sheet metal in the Dustlands shacks, loose gravel in the crater. Each one plays at the spot and is sent as a world event, so people and bots (via `#hear`) both learn someone passed by. (3) Spoken announcer lines on Ring events and squads left: "Ring closing", "5 squads left". Keep each trap to one pooled sound with no physics. Check it at dusk in a full 59-bot match, with the frame time and the server tick from before and after. It is independent of ticket 64's bot hearing change but should land alongside it.

## Comments
