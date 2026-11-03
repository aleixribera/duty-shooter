# Visible bullets, and smoke trails for snipers

Status: open
Blocked by: none
Labels: enhancement

Owner: "add small but visible bullets being shot, so the player kind of sees where they are shooting, and make the sniper bullets also have a smoke trail."

Every shot (yours, allies', enemies', bots') draws a small, bright, short tracer streak travelling from the muzzle along the real shot path to the hit point; it must match where the hit lands. Sniper rifles also leave a thin smoke trail that lingers about a second and drifts. In every mode, not only Battle Royale. Cheap: pooled/instanced, no per-shot allocations, no extra network data if the shot is already known to the client (check what the snapshot carries for remote shots). Verify in game at dusk on Zero Island and on the other maps; frame time with 60 seats firing.

## Comments
