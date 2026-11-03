# Smarter bots for Battle Royale

Status: open
Blocked by: 63
Labels: enhancement

Owner: "make the bots smarter for the battle royale gamemode, research how the best battle royale games make good bots and implement that into this game."

Step 1, research (`.scratch/battle-royale/research/bots.md`): how Fortnite, PUBG, Apex, Warzone and others build BR bots and AI squads, from primary sources (GDC talks, dev blogs, postmortems), plus what makes bots read as human. Step 2: compare with our bots (`packages/fps-core/src/bots/`, ticket 40's notes) and pick what fits a 60-seat, one-life, Ring, Squads, Downed/Revive game on our server budget. Step 3: implement test-first.

Constraints: the spec's balance target stays (a good player wins about 1 match in 4, no difficulty setting), the 60-seat server load gate passes, the Local bots worker stays smooth. Measure before/after over seeds: match length, placement spread, revive share, Ring deaths, and behaviour the research names.

## Comments
