// Ticket 23's look: the lobby (Bot Match and online), settings (every tab), Play Online, and the
// load and connection dialogs, at 1920x1080 and 390x844, in headless, muted Chrome.
//   remote-test --local "node .scratch/battle-royale/t23/menus.mjs <label>"
// Starts the t23 server build (server-dist) and the frozen dev server itself.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const label = process.argv[2] ?? 'shot';
const PORT = 3231;
const VPORT = 5231;
const out = `.scratch/battle-royale/t23/shots/${label}`;
mkdirSync(out, { recursive: true });
const kids = [];
const start = (args, env) => {
  const c = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
  kids.push(c);
};
start(['.scratch/battle-royale/t23/server-dist/main.js'], { PORT: String(PORT), HOST: '127.0.0.1', BOTS_PER_TEAM: '2', STATIC_DIR: `${process.cwd()}/apps/range/dist` });
start(['node_modules/vite/bin/vite.js', '-c', '.scratch/battle-royale/t23/vite.frozen.mjs'], { VPORT: String(VPORT), DUTY_SERVER: `http://127.0.0.1:${PORT}` });
const base = `http://localhost:${VPORT}/?online&nolock`;
const until = async (test, ms) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await test().catch(() => false)) return true;
    if (Date.now() > end) return false;
    await sleep(300);
  }
};
const find = (text) => `[...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(text.toLowerCase())}))`;
const SIZES = [
  { name: 'desktop', width: 1920, height: 1080, mobile: false, scale: 1 },
  { name: 'phone', width: 390, height: 844, mobile: true, scale: 2 },
];
try {
  await until(() => fetch(`http://127.0.0.1:${PORT}/healthz`).then((r) => r.ok), 60000);
  await until(() => fetch(`http://localhost:${VPORT}/`).then((r) => r.ok), 60000);
  for (const size of SIZES) {
    const chrome = await launchChrome();
    try {
      await chrome.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: size.scale, mobile: size.mobile });
      await chrome.navigate(base);
      await chrome.waitFor(`location.href.startsWith('http') && !!${find('Settings')}`, 90_000, 200);
      await chrome.waitFor(`document.body.dataset.backend`, 90_000, 500);
      await sleep(3000);
      const shoot = async (name) => {
        const { data } = (await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 })).result;
        const file = `${out}/${name}-${size.name}.jpg`;
        writeFileSync(file, Buffer.from(data, 'base64'));
        console.log(file);
      };
      const click = async (text) => {
        const ok = await chrome.evaluate(`(() => { const b = ${find(text)}; if (!b) return false; b.click(); return true; })()`);
        if (!ok) console.log(`no button "${text}"`);
        await sleep(900);
      };
      const ev = (js) => chrome.evaluate(js);
      // Settings, every tab.
      await click('Settings');
      await shoot('settings-controls');
      for (const tab of ['Keys', 'Video', 'Interface']) {
        await click(tab);
        await shoot(`settings-${tab.toLowerCase()}`);
      }
      await click('Back');
      // The dialogs, as the page shows them.
      await ev(`duty.menu.loading('Survival Town', 0.42)`);
      await sleep(400);
      await shoot('loading');
      await ev(`duty.menu.connecting(1)`);
      await sleep(400);
      await shoot('connecting');
      await ev(`duty.menu.failed(null)`);
      await sleep(400);
      await shoot('error-down');
      await ev(`duty.menu.failed('Server full')`);
      await sleep(400);
      await shoot('error-full');
      await ev(`duty.menu.tip(() => {})`);
      await sleep(400);
      await shoot('tip');
      await ev(`duty.menu.show('main')`);
      await sleep(600);
      // Bot Match's lobby.
      await click('Bot Match');
      await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 30_000, 200);
      await sleep(1500);
      await shoot('botmatch');
      await ev(`document.querySelector('.ds-lobby .body')?.scrollTo(0, 99999)`);
      await sleep(300);
      if (size.mobile) await shoot('botmatch-foot');
      await click('Settings');
      await shoot('botmatch-settings');
      await click('Back');
      await click('Back');
      await sleep(800);
      // Online: Play Online goes straight into the public lobby with the saved name.
      await ev(`(() => { const i = document.querySelector('.ds-menu input'); i.value = 'Ada'; i.dispatchEvent(new Event('change')); })()`);
      await click('Play Online');
      const joined = await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden]) [data-act="start"], .ds-lobby:not([hidden]) [data-act="join"]') || !!${find('Join')}`, 120_000, 300);
      if (await chrome.evaluate(`!!${find('Join')} && !document.querySelector('.ds-lobby:not([hidden])')`)) {
        await shoot('online-form');
        await click('Join');
        await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden]) [data-act="start"], .ds-lobby:not([hidden]) [data-act="join"]')`, 120_000, 300);
      }
      console.log('joined', !!joined);
      await sleep(2500);
      await shoot('lobby-online');
      await ev(`document.querySelector('.ds-lobby .body')?.scrollTo(0, 99999)`);
      await sleep(300);
      if (size.mobile) await shoot('lobby-online-foot');
      await click('Leave');
      await sleep(1000);
      if (chrome.errors.length) console.log('errors:', chrome.errors.slice(0, 5));
    } finally {
      await chrome.close();
    }
  }
} finally {
  for (const k of kids) k.kill();
}
process.exit(0);
