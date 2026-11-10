# Match end and MVP

Status: resolved

Release: v2.151.0

Spec: `../spec.md`

After the ending shot: the winners, an MVP with their numbers, your XP and what it unlocked, then the lobby.

## Comments

Released in v2.151.0. Decisions:

- The end panel, top to bottom: how it ended and the headline (as before), the MVP as one line on its own plate, then "Your match" on the plate under it, then the countdown to the scoreboard, the vote or the lobby. The scoreboard sits under the panel and takes the room the panel leaves.
- MVP is the highest Score of the match, person or bot (ties by kills, then fewer deaths), with their Score, their kills and their best Medal. A match nobody scored in has none. It is said in words, without a portrait: there is nothing honest to draw there yet.
- "Your match" is one strip of readouts: Score, Kills, Deaths, Assists, Place, then, once the match is banked, Win bonus (only after a win) and Challenges (only when one was completed) as figures of their own, and XP earned, which is their sum with the Score. Under it the Rank bar fills from where it stood to where it stands; when a Rank is crossed the bar runs to its end and starts again, and "Rank up" and its sound come in as it crosses. Under that, each Challenge the match moved, with "Done" and what it paid.
- The panel is three elements (head, your match, what comes next), so the clock redrawing each second does not restart the bar's fill.
- The strip is one row with a column for each figure; at 960 px and narrower it is three to a row and the last figure takes what is left of its row, so there is never an empty cell.
- In a free-for-all the place in the strip is your place by Score, while the headline keeps the Mode's own result: a match level on kills is a Draw even with you first on Score. Left so on purpose: Score never decides a match (ticket 11).
- Battle Royale: its Match card carries the same strip under its facts (Score and the XP figures, the Rank bar, the Challenges), from the moment your Squad has its place. The victory beat is unchanged.
- Sounds: `challengeDone` half a second after the strip shows, `rankUp` when the bar crosses.
- The toast under the panel said "You wins the match." when the player won a free-for-all. It now says "You win the match."; every other winner reads as before.

**Seen working**: `.scratch/next-level/score/shots/end-early-1920.png`, `end-vote-1920.png` and `end-390.png` are the end panel after a scripted free-for-all Bot Match (a win at 1920: Score 2,300, Win bonus +575, XP earned +2,875, Rank 3 with "Rank up", one Challenge moved; a Draw at 390). `royale-card-1920.png` and `royale-card-390.png` are the Match card of a Local bots Battle Royale the script's player lost without a kill (`royale.mjs`): the strip honestly reads Score 0, XP earned +0, Rank 1, and the stored Profile took the match (`modes: {"battle-royale": 1}`, `royaleBest`). Not seen: a Battle Royale card with points on it (the script's player never got a kill), a match on a real server, and the two sounds, which nobody listened to.

**Integration (the owning session)**

- The line that counts down to the next match stands on its own scrim under the panel (it was bare text over the frozen world), and inside the vote it is a plain line, since the vote is already a panel.
- A Battle Royale's Match card hides the kill feed, as a held scoreboard does: on a phone the two overlapped.
- The centre toast that said who won is gone: the end panel says it, and the two said it twice, one over the other.

**After a review (in this release)**

- The end panel is measured only when what it shows changed (it was read back from the layout every frame of the ending), and the board under it keeps at least 120 px on a short window instead of collapsing to nothing.
- Seen again after these: a Team Deathmatch Bot Match played to its end at 1920 and 390, the panel, the countdown line and the board laid out as before, the match banked once (Matches 1 after 75 s).
