// What a scripted browser costs this PC: Survival Town walked alone for 10 s, the page's frame rate, and the
// CPU share of this run's Chrome processes (of all 12 cores), with their priority class. UNCAPPED=1 for the old way.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const base = process.env.BASE ?? 'http://localhost:5191/';
const profile = mkdtempSync(join(tmpdir(), 'duty-measure-'));
const tag = profile.split(/[\/]/).pop();
const chrome = await launchChrome({ profile, uncapped: !!process.env.UNCAPPED });
const ps = (script) => execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
const sample = () =>
  JSON.parse(
    ps(
      "$ids = (Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*" + tag + "*' }).ProcessId; " +
        '@(Get-Process -Id $ids -ErrorAction SilentlyContinue | ForEach-Object { @{ id = $_.Id; cpu = $_.CPU; pri = "$($_.PriorityClass)"; mb = [int]($_.WorkingSet64/1MB) } }) | ConvertTo-Json -Compress',
    ) || '[]',
  );
try {
  await chrome.navigate(`${base}?explore=survival-town&nolock`);
  await chrome.waitFor('globalThis.duty?.game', 90_000);
  await sleep(5000);
  await chrome.evaluate('(() => { globalThis.__n = 0; const f = () => { globalThis.__n++; requestAnimationFrame(f); }; requestAnimationFrame(f); })()');
  const a = [].concat(sample());
  const t0 = Date.now();
  await sleep(10_000);
  const b = [].concat(sample());
  const secs = (Date.now() - t0) / 1000;
  const frames = await chrome.evaluate('globalThis.__n');
  let cpu = 0;
  for (const p of b) cpu += p.cpu - (a.find((q) => q.id === p.id)?.cpu ?? p.cpu);
  console.log(JSON.stringify({ uncapped: !!process.env.UNCAPPED, fps: Math.round((frames / secs) * 10) / 10, cpuPctOfPC: Math.round((cpu / secs / 12) * 1000) / 10, processes: b.length, priorities: [...new Set(b.map((p) => p.pri))], mb: b.reduce((s, p) => s + p.mb, 0), errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
