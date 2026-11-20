import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidates, firstReachable, normalize, opensExternally, resolveGame, staysInApp, urlFlag } from '../config.mjs';

const LIVE = 'https://lobby.example.ts.net/';
const SPARE = 'https://spare.example.ts.net/';

test('the --url flag is read from the command line', () => {
  assert.equal(urlFlag(['electron', '.', '--url=http://localhost:3000']), 'http://localhost:3000');
  assert.equal(urlFlag(['electron', '.']), null);
});

test('addresses are tried as flag, then live lobby', () => {
  assert.deepEqual(candidates({ flag: 'http://localhost:3000', baked: LIVE }), ['http://localhost:3000/', LIVE]);
  assert.deepEqual(candidates({ flag: null, baked: LIVE }), [LIVE]);
  assert.deepEqual(candidates({ flag: null, baked: null }), [], 'nothing to try: the offline page');
});

test('repeated and malformed addresses are dropped', () => {
  assert.deepEqual(candidates({ flag: LIVE, baked: 'https://lobby.example.ts.net' }), [LIVE]);
  assert.deepEqual(candidates({ flag: 'not a url', baked: 'file:///C:/game/index.html' }), []);
  assert.equal(normalize('https://arcade.example.ts.net/duty'), 'https://arcade.example.ts.net/duty/');
});

test('pages on a game origin stay in the window, others open in the browser', () => {
  const urls = candidates({ flag: SPARE, baked: LIVE });
  assert.ok(staysInApp(`${LIVE}#join=secret`, urls));
  assert.ok(staysInApp(`${SPARE}?map=range`, urls));
  assert.ok(!staysInApp('https://github.com/aleixribera/duty-shooter', urls));
  assert.ok(!staysInApp('http://lobby.example.ts.net/', urls), 'another scheme is another origin');
  assert.ok(!staysInApp('nonsense', urls));
});

test('only http(s) links go to the default browser', () => {
  assert.ok(opensExternally('https://github.com/'));
  assert.ok(!opensExternally('file:///C:/Windows/system32/calc.exe'));
  assert.ok(!opensExternally('ms-settings:'));
});

test('the first address that answers is chosen', async () => {
  const up = new Set([SPARE]);
  const fetch = async (url) => {
    if (!up.has(url)) throw new TypeError('fetch failed');
    return { ok: true };
  };
  assert.equal(await firstReachable([LIVE, SPARE], { fetch }), SPARE);
  up.add(LIVE);
  assert.equal(await firstReachable([LIVE, SPARE], { fetch }), LIVE);
  up.clear();
  assert.equal(await firstReachable([LIVE, SPARE], { fetch }), null);
  assert.equal(await firstReachable([], { fetch }), null);
});

test('the arcade portal hands over the game\'s own address', async () => {
  const portal = 'https://arcade.example.ts.net/';
  const live = { projects: [{ id: 'souls', play_url: 'https://arcade.example.ts.net:8443/' }, { id: 'duty-shooter', play_url: 'https://arcade.example.ts.net:10000' }] };
  const fetch = async (url) => (String(url) === `${portal}api/live` ? { ok: true, json: async () => live } : { ok: false });
  assert.equal(await resolveGame(portal, { fetch }), 'https://arcade.example.ts.net:10000/');
  assert.equal(await resolveGame(LIVE, { fetch }), LIVE, 'the game itself has no /api/live');
  const missing = async () => ({ ok: true, json: async () => ({ projects: [] }) });
  assert.equal(await resolveGame(portal, { fetch: missing }), portal);
  const down = async () => { throw new TypeError('fetch failed'); };
  assert.equal(await resolveGame(portal, { fetch: down }), portal);
});

test('an error page counts as down', async () => {
  const fetch = async (url) => ({ ok: url === SPARE });
  assert.equal(await firstReachable([LIVE, SPARE], { fetch }), SPARE);
});
