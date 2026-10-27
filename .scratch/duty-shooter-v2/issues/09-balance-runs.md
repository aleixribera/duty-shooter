# 09 Weapon balance runs and TTK tables

Status: resolved
Release: v1.4.9
Blocked by: 08

TTK table test vs targets; bot-vs-bot duels every pair of primaries at 5/15/30/60 m; overall pair win rate 40-60 %, each weapon wins its own band. Tune until they pass. Print the tables into a balance report.

## Comments

- Harness: `botDuel` and `balanceRuns` in `harness/duel.ts`. Two moderate bots (primary, pistol, frag) start in sight of each other, weapons drawn, in one of four seeded 150 x 60 m yards with 180 crates and wall sections, so a rusher has cover to close in behind and a long gun still finds lanes. A bare field would only measure who shoots first. Each cell is 240 duels: 120 seeded spots and bot pairs, each fought twice with spots and personalities swapped, so neither weapon gets the better bot or the better spot.
- The rule "overall pair win rate 40-60 %" read per pair (one weapon against one other, over all four distances) contradicts the rest of the spec. The shotgun must win 5 m, but the SMG must win 15 m, and the TTK table gives the shotgun "no reliable kill past 18 m". So shotgun against SMG over 5/15/30/60 gets about one band of four plus whatever its rushes win at 30 and 60 m. Reaching 40 % would need it to win a third of its 30 and 60 m fights against an SMG, which breaks "useless at range". The same goes for the sniper against the SMG at 5 m. Decision: the test asserts each weapon wins its own band against every other primary (more than 50 %), and that each weapon's share of all its duels (every opponent, every distance) is 40-60 %. Per-pair rates are printed in `docs/balance.md`. They range from 32 % (shotgun against SMG) to 68 %.
- Result (`docs/balance.md`): shotgun 41 %, SMG 59 %, M4A1 60 %, sniper 40 % overall. The worst cells in each weapon's own band are shotgun 65 % (against the SMG at 5 m), SMG 51 % (M4A1 at 15 m), M4A1 51 % (SMG at 30 m) and sniper 58 % (shotgun at 60 m). The overall shares sit on the edges of 40-60 %, so a change to bot fighting or to a weapon row can tip the test. Rerun the report when that happens. The SMG and M4A1 margins against each other are thin, and they would be with any small tweak: the two guns trade evenly from 15 to 30 m.
- Tuning, with every stat note saying why:
  - SMG: close band to 15 m, ADS 0.15 s, hip spread 1.2/2.2°, vertical kick 0.36°, long-band damage 12, move speed 1.01.
  - Shotgun: one-shot band to 7 m at 30 per pellet, sprint-to-fire 0.2/0.3 s, move speed 1.15.
  - Sniper: ADS 0.35 s, which keeps it slower to aim and kill up close than the SMG; sway 0.4°.
  - Pistol: move speed 1.2, still the fastest gun to carry now that the shotgun is at 1.15.
  - The M4A1 row is unchanged.
- Bot tactics found by the runs (`bots/bot.ts`):
  - A shotgun rushes a visible target past 8 m, sprinting and weaving without firing, and routes through cover (nodes the target can see cost 6 m extra).
  - The SMG holds 9-13 m, pushes in with the target in view past 22 m, and jukes twice as often near its range.
  - Scope magnification divides the aim wobble.
  - Bots pull against scope sway and lead by the round's flight time.
  - Bolt and long pump shots wait until the aim is lined up and the target is moving steadily.
  - Iron-sight weapons open fire once 70 % aimed in.
  - The M4A1 and pistol hold their ground with a target in view until it is past 35 m and 16 m.
- TTK test: `balance.test.ts` checks every row of the spec's table (M4A1 4/5/6 shots; SMG within 20 % of 170 ms at 12 m and 330 ms at 25 m, slower than the M4A1 past 25 m; shotgun one shot to 5 m, two to 12 m with half the pellets, more than two past 18 m; sniper one-shot zones and two-shot zones at any range; pistol within 20 % of 450 ms). The table goes into `docs/balance.md` with the duels: `BALANCE_REPORT=docs/balance.md npx vitest run packages/fps-core/test/balance.test.ts`. The balance runs take about 35 s here.
- Test changes: the sniper sway test now waits for a moment when the sway is well off the mark (over 0.004 rad) instead of a fixed 0.8 s. Also fixed: the loadout card showed "8 � 30" because `ui/model.ts` held a Latin-1 multiplication sign (v1.4.7). Two test files from v1.4.8 didn't typecheck (`UserCmd` import, nav node fields).
