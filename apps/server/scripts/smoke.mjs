// Smoke test for a running server or container: the page, the health check,
// a join with the right passphrase, a rejected wrong one and a refused
// cross-site socket. With --lockout it also checks that repeated wrong
// passphrases lock the address out; that locks out the machine running it for
// ten minutes, so CI passes it and a check against the live server should not.
// Without a passphrase it checks a public lobby instead: any join is welcome.
// Usage: node scripts/smoke.mjs <base-url> [<passphrase>] [--lockout]
import { WebSocket } from 'ws';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3000');
const passphrase = (process.argv[3]?.startsWith('--') ? undefined : process.argv[3]) ?? process.env.PASSPHRASE ?? '';
const lockout = process.argv.includes('--lockout');
const wsUrl = `${base.protocol === 'https:' ? 'wss' : 'ws'}://${base.host}/ws`;
let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed = true;
};

function join(pass, headers = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, { headers });
    let first = null;
    const done = (closed) => {
      resolve({ first, closed });
      ws.terminate();
    };
    const timer = setTimeout(() => done('timeout'), 5000);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'smoke', passphrase: pass, protocol: 3 })));
    ws.on('message', (data) => {
      first ??= JSON.parse(data.toString());
      if (first.t === 'welcome') {
        clearTimeout(timer);
        done(null);
      }
    });
    ws.on('close', (_c, reason) => {
      clearTimeout(timer);
      done(reason.toString());
    });
    ws.on('unexpected-response', (_q, res) => {
      clearTimeout(timer);
      done(`http ${res.statusCode}`);
    });
    ws.on('error', () => {});
  });
}

const health = await fetch(new URL('/healthz', base)).then((r) => r.json()).catch((e) => ({ error: String(e) }));
check('health check', health.status === 'ok' && health.public === !passphrase && typeof health.version === 'string', JSON.stringify(health));
const lobby = await fetch(new URL('/status', base)).then((r) => r.json()).catch((e) => ({ error: String(e) }));
check('lobby status', typeof lobby.map === 'string' && ['tdm', 'ffa'].includes(lobby.mode) && Number.isInteger(lobby.players) && Number.isInteger(lobby.capacity) && typeof lobby.phase === 'string', JSON.stringify(lobby));
const page = await fetch(base).catch(() => null);
const html = page ? await page.text() : '';
check('serves the game page', page?.status === 200 && html.includes('<canvas'), `status ${page?.status}`);
const escape = await fetch(new URL('/..%2f..%2fpackage.json', base)).catch(() => null);
check('no files outside the client', escape !== null && escape.status >= 400, `status ${escape?.status}`);
if (passphrase) {
  const ok = await join(passphrase);
  check('join with the passphrase', ok.first?.t === 'welcome', JSON.stringify(ok));
  const wrong = await join(`${passphrase}-wrong`);
  check('wrong passphrase rejected', wrong.first?.t === 'reject' && wrong.closed === 'rejected: passphrase', JSON.stringify(wrong));
} else {
  const ok = await join('');
  check('join the public lobby', ok.first?.t === 'welcome', JSON.stringify(ok));
}
const foreign = await join(passphrase, { origin: 'https://elsewhere.example' });
check('cross-site socket refused', foreign.closed === 'http 403', JSON.stringify(foreign));
if (lockout && passphrase) {
  // One wrong guess above; the server allows ten before locking the address out.
  const guesses = [];
  for (let i = 0; i < 10; i++) guesses.push((await join(`${passphrase}-guess-${i}`)).closed);
  check('passphrase guessing locked out', guesses.slice(0, 9).every((c) => c === 'rejected: passphrase') && guesses[9] === 'http 429', JSON.stringify(guesses));
}
process.exit(failed ? 1 : 0);
