// A long-lived driver for exploratory hunting: holds headless Chromes and takes
// commands over HTTP on 127.0.0.1:7361, so each step is one curl.
//   node .scratch/battle-royale/bugs/driver.mjs &
//   curl -s localhost:7361/open -d '{"name":"host","url":"http://localhost:5181/?online&nolock"}'
//   curl -s localhost:7361/eval -d '{"name":"host","js":"duty.menu.screen"}'
//   curl -s localhost:7361/click -d '{"name":"host","text":"Battle Royale"}'
//   curl -s localhost:7361/shoot -d '{"name":"host","file":"x"}'
//   curl -s localhost:7361/key -d '{"name":"host","code":"Escape"}'
//   curl -s localhost:7361/play -d '{"name":"host","ms":20000}'
//   curl -s localhost:7361/state -d '{"name":"host"}'
//   curl -s localhost:7361/report -d '{"name":"host"}'   (watcher, errors, warnings)
import { createServer } from 'node:http';
import * as L from '../bugs/lib.mjs';

const pages = new Map();
const routes = {
  async open({ name, url, phone, width, height }) {
    if (pages.has(name)) await pages.get(name).close();
    const c = await L.open(name, { url, phone, width, height });
    pages.set(name, c);
    return 'ok';
  },
  async close({ name }) {
    await pages.get(name)?.close();
    pages.delete(name);
    return 'closed';
  },
  async goto({ name, url }) {
    const c = pages.get(name);
    await c.navigate(url);
    await c.must(`location.href.startsWith(${JSON.stringify(url.slice(0, 20))}) && performance.now() > 0`, 60000, 200);
    return 'ok';
  },
  eval: ({ name, js }) => pages.get(name).evaluate(js),
  click: async ({ name, text }) => (await L.click(pages.get(name), text), 'ok'),
  buttons: ({ name }) => L.buttons(pages.get(name)),
  shoot: ({ name, file }) => L.shoot(pages.get(name), file),
  key: async ({ name, code, ms }) => (await L.tap(pages.get(name), code, ms ?? 60), 'ok'),
  keydown: async ({ name, code }) => (await L.keyDown(pages.get(name), code), 'ok'),
  keyup: async ({ name, code }) => (await L.keyUp(pages.get(name), code), 'ok'),
  look: async ({ name, dx, dy }) => (await L.look(pages.get(name), dx, dy), 'ok'),
  mouse: async ({ name, type, button }) => (await L.mouse(pages.get(name), type, button), 'ok'),
  play: async ({ name, ms }) => (await L.play(pages.get(name), ms), 'ok'),
  watch: async ({ name }) => (await L.hookWarnings(pages.get(name)), await L.watch(pages.get(name)), 'ok'),
  state: ({ name }) => L.state(pages.get(name)),
  text: ({ name, sel }) => L.text(pages.get(name), sel),
  send: async ({ name, method, params }) => JSON.stringify((await pages.get(name).send(method, params)).result ?? null).slice(0, 2000),
  async report({ name }) {
    const c = pages.get(name);
    return JSON.stringify({ watch: await L.report(c), errors: c.errors.slice(-20), errorCount: c.errors.length, warnings: (await L.warnings(c)).slice(-10), warnCount: (await L.warnings(c)).length });
  },
  list: () => [...pages.keys()].join(','),
  async quit() {
    for (const c of pages.values()) await c.close();
    setTimeout(() => process.exit(0), 100);
    return 'bye';
  },
};
createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', async () => {
    const route = routes[req.url.slice(1)];
    try {
      if (!route) throw new Error('no route ' + req.url);
      const out = await route(body ? JSON.parse(body) : {});
      res.end(typeof out === 'string' ? out : JSON.stringify(out));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e?.stack ?? e));
    }
  });
}).listen(7361, '127.0.0.1', () => L.log('driver on 7361'));
