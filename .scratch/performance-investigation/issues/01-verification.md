# Performance and sniper verification

Status: resolved
Release: v2.17.0

## Comments

The repository requires Node tests on the home server using `remote-test` and browser scripts through `remote-test --local`. That command is unavailable in this environment. A direct muted browser benchmark also failed to produce a report. Typechecking passed, but the full suite, balance report, and before/after browser measurements remain unverified. Do not release these changes until the required checks can run.

Normal and High remain at full resolution. The pending changes also skip repeated static-map material scans and empty particle/casing buffer updates; their performance impact and visual correctness still need browser verification.

The configured runner was found through Git Bash. The home server is reachable; sniper, hitbox, combat and balance checks pass. A complete suite and browser verification are in progress. Initial WebGPU measurements at 1080p on the RTX 5060: Practice Range Medium p50 2.9 ms and p95 4.5 ms; Survival Town Medium p50 5.0 ms and p95 8.5 ms. Both runs had large outliers and do not prove smoothness on integrated graphics. A moving bot-match profile points mainly to rendering submission/GPU synchronization and some procedural audio warm-up.


Full home-server check passed (792 tests; 8 benchmark-only skips); the subsequent leg-exposure regression test also passed. A 45-second moving and firing Survival Town match passed with no reported stalls or browser errors and a minimum sampled 100 FPS on the RTX 5060. The script can still run into a wall, so this does not prove worst-case combat or integrated-GPU performance. Further work: investigate long frame outliers and audio warm-up, measure under varied combat and on integrated graphics, and compare changes against a controlled baseline.

Train-horn warm-up was identified in a gameplay profile. A sample-by-sample comparison against the previous synthesis at 22,050 and 48,000 Hz showed a maximum difference of 4.1e-11; median server generation time fell from about 87 to 43 ms at 22,050 Hz and from 186 to 85 ms at 48,000 Hz. The full suite passed again (793 tests; 8 benchmark-only skips).

Audit (2026-10-28, Claude). Server: a 12-player lobby run from the home server itself holds 60 snapshots/s (gap p99 22 ms) with usercmd acks at p99 59 ms and about 4 Mbit/s out, so the server has headroom; the high "node" CPU seen on it was agent sessions (a handoff service running Vite and a software-WebGL Chrome), not the lobby. High in-game ping is partly a starved client, since ping is counted in client frames, plus the Funnel relay. Released in v2.10.0: precompressed static files, 304s for files the browser already has, and the load-test notes in docs/deploy.md.

Client (v2.17.0): presets retuned around Medium. Each preset now has a pixel budget (Low 1080p at one pixel per CSS pixel with FXAA and 30 Hz shadow redraws, Medium up to 1440p's worth on high-DPI screens with 60 Hz shadows, High supersampled 1.5x up to 4K's worth), and the loading screen compiles every viewmodel weapon, the frag, and every soldier look before the match starts. Pipeline probe: 279 pipelines compile on the menu and loading screen, 16 are left in play (a few shadow variants, the muzzle flash, frag and grenade pieces). A fair A/B of Medium at 1080p (same content, alternating builds) is a wash: p50 8–9 ms both. Both builds still have multi-second frames in queue submit and writeBuffer mid-match on this PC, which was saturated by other sessions' headless Chromes during the runs. Follow-up: warm the last 16 pipelines and re-measure the stalls on an idle PC.

