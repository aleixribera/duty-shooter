// Drives the desktop app against a local server: the window opens the game,
// Practice Range loads a map, the offline page's Retry reopens the game,
// foreign links leave the window for the browser, and an unreachable address
// falls back. The window stays hidden and muted and pointer lock is stubbed,
// so it runs alongside other work on this PC.
// Needs the built client and server (npm run build in the repo root).
// Run it with `remote-test --local npm run smoke --prefix desktop`.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { _electron } from 'playwright-core';

const desktop = join(import.meta.dirname, '..');
const repo = join(desktop, '..');
const shots = join(repo, '.scratch', 'desktop');
const port = 3400 + Math.floor(Math.random() * 400);
const local = `http://127.0.0.1:${port}/`;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let failures = 0;

function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

async function waitFor(predicate, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate().catch(() => false)) return true;
    await sleep(250);
  }
  return false;
}

/** Launches the app hidden and muted, with pointer lock and the default browser stubbed out. */
async function launch(url) {
  const app = await _electron.launch({
    args: ['--mute-audio', desktop, `--url=${url}`],
    cwd: desktop,
    env: { ...process.env, DUTY_BACKGROUND: '1' },
  });
  await app.evaluate(({ shell }) => {
    globalThis.opened = [];
    shell.openExternal = async (target) => void globalThis.opened.push(target);
  });
  // Pointer lock would take the mouse from whoever is at this PC: count the requests instead.
  const stubLock = () => {
    globalThis.pointerLockRequests = 0;
    Element.prototype.requestPointerLock = function () {
      globalThis.pointerLockRequests++;
      return Promise.resolve();
    };
  };
  await app.context().addInitScript(stubLock);
  const page = await app.firstWindow();
  // The first page may have loaded before the init script was in place.
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(stubLock);
  return { app, page };
}

const server = spawn(process.execPath, [join(repo, 'apps/server/dist/main.js')], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: '' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
try {
  check(await waitFor(async () => (await fetch(`${local}healthz`)).ok), `local server on ${local}`);
  mkdirSync(shots, { recursive: true });

  const { app, page } = await launch(local);
  try {
    await page.waitForLoadState('domcontentloaded');
    check(page.url() === local, `opens the local server (${page.url()})`);
    const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());
    check(title === 'Duty Shooter', `window title "${title}"`);
    check(await waitFor(() => page.getByText('Practice Range', { exact: true }).first().isVisible()), 'main menu shows');
    check(await page.evaluate(() => 'gpu' in navigator), 'WebGPU is available');
    check(await waitFor(async () => (await page.locator('.ds-dot.up').count()) > 0), 'Play Online shows the server as online');
    await page.screenshot({ path: join(shots, 'menu.png') });

    // Practice Range loads a map and asks for pointer lock.
    await page.getByText('Practice Range', { exact: true }).first().click();
    check(await waitFor(() => page.evaluate(() => globalThis.pointerLockRequests > 0), 60000), 'Practice Range starts and asks for pointer lock');
    await sleep(2000);
    await page.screenshot({ path: join(shots, 'range.png') });

    // The offline page's Retry reopens the game.
    await app.evaluate(({ BrowserWindow }, file) => BrowserWindow.getAllWindows()[0].loadFile(file), join(desktop, 'offline.html'));
    check(await waitFor(async () => (await page.textContent('body')).includes("Can't reach the game")), 'offline page shows');
    await page.screenshot({ path: join(shots, 'offline.png') });
    await page.getByText('Retry').click();
    check(await waitFor(async () => page.url() === local), 'Retry reopens the game');

    // A foreign link goes to the default browser; the window stays on the game.
    await page.evaluate(() => { location.href = 'https://github.com/aleixribera/duty-shooter'; });
    await sleep(500);
    const opened = await app.evaluate(() => globalThis.opened);
    check(page.url() === local && opened.includes('https://github.com/aleixribera/duty-shooter'), 'a foreign link opens in the browser');
    await page.evaluate(() => window.open('https://example.com/'));
    await sleep(300);
    check((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1, 'window.open makes no second window');
  } finally {
    await app.close();
  }

  // An address that doesn't answer falls back to the next one (the live lobby or the Pages copy).
  const fallback = await launch('http://127.0.0.1:9/');
  try {
    check(await waitFor(async () => fallback.page.url().startsWith('https://')), `unreachable address falls back (${fallback.page.url()})`);
  } finally {
    await fallback.app.close();
  }
} finally {
  server.kill();
}

console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
