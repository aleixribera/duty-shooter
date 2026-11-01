# Make the tick scale to 60 seats

Status: open
Blocked by: 01

Spec: `../spec.md`

Spec: World engine (broad phase), Bots at scale (brains). Remove what makes the tick quadratic: spatial index for players, bullets and frags, no per-bot player scans, unchanged-state stringify removed. Per-mode seat and bot limits, with 32 and 12 kept for the team modes. Bots far from humans think less often. Lag compensation stays correct.

## Comments
