// Copied into apps/range/test/ to run: `npx vitest run --project soak apps/range/test/zz-bots-smarter.soak.test.ts`.
// Plays bot-only team deathmatch on three maps and counts what request 7 asks of bots, per weapon:
// flanks begun, reloads begun in an enemy's sight, deaths while reloading, time spent in cover, kills and deaths.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createWorld, sightBlocked, type ModeId, type PlayerOutput } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { botMap, type BotMap } from './support/bots';
import { BOUNDARY as YARD, buildSwitchyard } from '../src/map/switchyard';
import { BOUNDARY as TOWN, buildSurvivalTown } from '../src/map/survival-town';
import { BOUNDARY as NINE, buildStationNine } from '../src/map/station-nine';

const SECONDS = Number(process.env.MEASURE_SECONDS ?? 240);
type Row = { flanks: number; reloads: number; exposedReloads: number; reloadDeaths: number; reloadDamage: number; coverTicks: number; standTicks: number; ticks: number; kills: number; deaths: number };
const row = (): Row => ({ flanks: 0, reloads: 0, exposedReloads: 0, reloadDeaths: 0, reloadDamage: 0, coverTicks: 0, standTicks: 0, ticks: 0, kills: 0, deaths: 0 });
const eye = (p: PlayerOutput) => [p.position[0], p.position[1] + p.eyeHeight, p.position[2]] as [number, number, number];
const chest = (p: PlayerOutput) => [p.position[0], p.position[1] + 1.1, p.position[2]] as [number, number, number];

function play(b: BotMap, mode: ModeId, perTeam: number, rows: Map<string, Row>) {
  const m = createNetworkedMatch({
    solids: b.solids, ladders: b.map.ladders ?? [], spawns: b.map.spawns.ffa, teamSpawns: b.map.spawns.teams!, zones: b.map.zones, sites: b.map.sites, mode,
    modes: { tdm: { killLimit: null, timeLimit: null }, ffa: { killLimit: null, timeLimit: null } },
    maxPlayers: perTeam * 2, bots: { nav: b.nav, perTeam, maxPerTeam: perTeam, alwaysOn: true },
  });
  const world = createWorld(b.solids, { ladders: b.map.ladders ?? [] });
  const last = new Map<string, string>();
  const reloading = new Map<string, boolean>();
  for (let i = 0; i < SECONDS * 60; i++) {
    const out = m.step();
    const by = new Map(out.players.map((p) => [p.id, p]));
    const gun = (id: string) => by.get(id)?.weapon.id ?? '?';
    const r = (id: string) => { const k = gun(id); if (!rows.has(k)) rows.set(k, row()); return rows.get(k)!; };
    for (const e of out.events) {
      if (e.type === 'reload' && e.phase === 'start') {
        const p = by.get(e.player)!;
        const x = r(e.player); x.reloads += 1;
        if (out.players.some((q) => q.alive && q.team !== p.team && Math.hypot(q.position[0] - p.position[0], q.position[2] - p.position[2]) < 60 && !sightBlocked(world, eye(q), chest(p)))) x.exposedReloads += 1;
      }
      if (e.type === 'hit' && reloading.get(e.victim)) r(e.victim).reloadDamage += e.damage;
      if (e.type === 'kill') {
        if (e.killer && e.killer !== e.victim) r(e.killer).kills += 1;
        const v = r(e.victim); v.deaths += 1;
        if (reloading.get(e.victim)) v.reloadDeaths += 1;
      }
    }
    for (const p of out.players) {
      const bot = m.server.bots.get(p.id)?.bot;
      reloading.set(p.id, p.alive && p.weapon.action === 'reload');
      if (!bot || !p.alive) continue;
      const x = r(p.id);
      x.ticks += 1;
      const a = bot.activity;
      if (a === 'flank' && last.get(p.id) !== 'flank') x.flanks += 1;
      if (a === 'cover') x.coverTicks += 1;
      last.set(p.id, a);
    }
  }
}

it('bots-smarter measure', () => {
  const rows = new Map<string, Row>();
  for (const [b] of [[botMap(buildSwitchyard(), YARD)], [botMap(buildSurvivalTown(), TOWN)], [botMap(buildStationNine(), NINE)]] as const) play(b, 'tdm', 6, rows);
  const total = row();
  const lines = [...rows.entries()].sort().map(([k, x]) => {
    for (const key of Object.keys(total) as (keyof Row)[]) total[key] += x[key];
    return `${k.padEnd(9)} kills ${String(x.kills).padStart(4)} deaths ${String(x.deaths).padStart(4)} flanks/min ${(x.flanks / (x.ticks / 3600)).toFixed(2).padStart(5)} reloads ${String(x.reloads).padStart(4)} exposed ${((100 * x.exposedReloads) / Math.max(1, x.reloads)).toFixed(0).padStart(3)}% diedReloading ${String(x.reloadDeaths).padStart(3)} dmg/reload ${(x.reloadDamage / Math.max(1, x.reloads)).toFixed(1).padStart(5)} cover ${((100 * x.coverTicks) / Math.max(1, x.ticks)).toFixed(1)}%`;
  });
  lines.push(`ALL       kills ${total.kills} deaths ${total.deaths} flanks/min ${(total.flanks / (total.ticks / 3600)).toFixed(2)} reloads ${total.reloads} exposed ${((100 * total.exposedReloads) / total.reloads).toFixed(0)}% diedReloading ${total.reloadDeaths} (${((100 * total.reloadDeaths) / total.deaths).toFixed(1)}% of deaths) dmg/reload ${(total.reloadDamage / total.reloads).toFixed(1)} cover ${((100 * total.coverTicks) / total.ticks).toFixed(1)}%`);
  const text = lines.join('\n');
  console.log(text);
  if (process.env.OUT) writeFileSync(process.env.OUT, text + '\n');
}, 1_800_000);
