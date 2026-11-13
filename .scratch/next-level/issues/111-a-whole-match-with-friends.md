# A whole match with friends

Status: resolved
Release: v2.199.0

Spec: `../spec.md` (objective 1, multiplayer with friends); Aleix's request 5 (2026-11-13): "Multiplayer quality of life: a whole match with friends plays well."

Acceptance: a private lobby with the host in a browser and two friends who joined by its link plays a Team deathmatch to its end and back to the lobby, and on into a second match, with everyone still in; a friend whose connection drops mid-match is told in the feed ("Marta left") and so is her return ("Marta is back"), her team's score doesn't drop while she's away, and the lobby's Last match names the final score.

## Comments

- How well-loved shooters handle friends coming and going (standing direction: the patterns, not the content). CoD and Halo put "X left the game" / "X joined" in the feed; Valorant and CS2 say a player disconnected and reconnected; every team mode keeps a leaver's kills on the team's score (CoD's team score never goes down), and the post-match lobby shows the final result the scoreboard showed.
- Played it first (`../friends/look.mjs`, frames in `../friends/before/`): the host, two friends by the link, a 60 s match to its end, the scoreboard, back to the lobby, a second match. Two defects a group meets: the lobby said "Blue won 0 to 0" after a 5 to 4 match, because a Team deathmatch team's score was the sum of the kills of those still in it, so the bots leaving at the lobby took every kill with them; and the same sum meant a friend dropping mid-match took their kills off the team (back when they returned), which could swing a time-limit win. And nothing told anyone a friend had left or come back.
- Fix: the team roster banks a leaver's kills with their team for the rest of the match and hands them back when the seat is resumed; the next match starts from nothing. The client tells the feed "<name> joined / left / is back" during an online match, from the scoreboard's rows: bots say nothing, a Battle Royale tells only your own Squad, and a seat a stand-in bot holds for a person is still theirs (the second-opinion review found a stand-in would otherwise read as "left" then "is back").
- After (`../friends/after/`): Marta's socket closes 20 s in: "▲ Marta left" in the feed (12-marta-left); she resumes 10 s later: "▲ Marta is back" (13-marta-back); the match ends 7 to 8 and the lobby says "Orange won 8 to 7"; both friends are still in the lobby and the second match.
- Left for later: the friends here are sockets, so their rows show no ping; the feed line reuses the objective feed row, so it has no phone frame of its own.
