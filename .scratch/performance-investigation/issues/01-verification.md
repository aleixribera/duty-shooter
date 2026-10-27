# Performance and sniper verification

Status: claimed

## Comments

The repository requires Node tests on the home server using `remote-test` and browser scripts through `remote-test --local`. That command is unavailable in this environment. A direct muted browser benchmark also failed to produce a report. Typechecking passed, but the full suite, balance report, and before/after browser measurements remain unverified. Do not release these changes until the required checks can run.

Normal and High remain at full resolution. The pending changes also skip repeated static-map material scans and empty particle/casing buffer updates; their performance impact and visual correctness still need browser verification.

The configured runner was found through Git Bash. The home server is reachable; sniper, hitbox, combat and balance checks pass. A complete suite and browser verification are in progress. Initial WebGPU measurements at 1080p on the RTX 5060: Practice Range Medium p50 2.9 ms and p95 4.5 ms; Survival Town Medium p50 5.0 ms and p95 8.5 ms. Both runs had large outliers and do not prove smoothness on integrated graphics. A moving bot-match profile points mainly to rendering submission/GPU synchronization and some procedural audio warm-up.


Full home-server check passed (792 tests; 8 benchmark-only skips); the subsequent leg-exposure regression test also passed. A 45-second moving and firing Survival Town match passed with no reported stalls or browser errors and a minimum sampled 100 FPS on the RTX 5060. The script can still run into a wall, so this does not prove worst-case combat or integrated-GPU performance. Further work: investigate long frame outliers and audio warm-up, measure under varied combat and on integrated graphics, and compare changes against a controlled baseline.
