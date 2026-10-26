import {
  Game,
  Menu,
  OfflineDriver,
  OnlineDriver,
  buildM4A1,
  createRenderer,
  createSoundSystem,
  isFirefox,
  loadSettings,
  saveSettings,
  type GameDriver,
  type Settings,
} from '@duty-shooter/fps-client';
import { createWorld } from '@duty-shooter/fps-core';
import { buildMap, collisionBoxes } from './map/map';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const status = document.querySelector<HTMLElement>('#status');
if (!canvas || !status) throw new Error('index.html is missing #view or #status');

const params = new URLSearchParams(location.search);
if (params.has('viewer')) {
  // The dev viewmodel viewer: every animation on a loop.
  const { startViewer } = await import('./viewer');
  await startViewer(canvas, status, params.has('webgl'));
} else {
  await startGame(canvas, status, params.has('webgl'));
}

async function startGame(canvas: HTMLCanvasElement, status: HTMLElement, forceWebGL: boolean): Promise<void> {
  let settings: Settings = loadSettings();
  const { renderer, backend } = await createRenderer(canvas, { forceWebGL });
  document.body.dataset['backend'] = backend;
  const map = buildMap();
  const boxes = collisionBoxes(map);
  const sound = createSoundSystem();
  const game = new Game({
    canvas,
    renderer,
    backend,
    content: map,
    world: createWorld(boxes),
    settings,
    sound,
    overview: { position: [-42, 7, 14], yaw: 0.25, pitch: -0.28 },
    thirdPersonWeapon: () => buildM4A1({ detail: 'low' }).root,
  });
  status.textContent = backend === 'webgpu' ? 'WebGPU' : 'WebGL2 (preset capped at Normal)';
  setTimeout(() => (status.hidden = true), 4000);
  // `?nolock` (dev only): play without pointer lock, for automated playtesting.
  if (import.meta.env.DEV && params.has('nolock')) game.input.lockFree = true;
  // The built page is only ever served by the game server; in dev, `?online` assumes one behind Vite's proxy.
  const online = !import.meta.env.DEV || params.has('online');

  /** Takes the pointer and starts input; shows the pause menu if the browser refuses. */
  const enter = async () => {
    await sound.unlock();
    await game.input.lock();
    if (game.input.locked) {
      menu.hide();
      game.paused = false;
    } else {
      menu.show('pause', 'The browser refused the mouse lock. Click Resume again.');
    }
  };
  /** First entry shows the one-time Firefox tip about raw mouse input. */
  let driver: GameDriver | null = null;
  const play = (next: GameDriver) => {
    driver = next;
    game.setDriver(next);
    if (isFirefox() && !settings.firefoxTipShown) menu.tip(() => void enter());
    else void enter();
  };

  const menu = new Menu(
    settings,
    {
      playOffline: () => play(new OfflineDriver({ boxes, spawn: map.rangeSpawn, dummies: map.dummies })),
      playOnline: (name, passphrase) => {
        const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
        play(new OnlineDriver({ url: `${scheme}://${location.host}/ws`, boxes, name, passphrase }));
      },
      resume: () => void enter(),
      leave: () => {
        game.setDriver(null);
        game.paused = true;
        menu.show('main');
      },
      changeSettings: (next) => {
        settings = next;
        saveSettings(next);
        game.applySettings(next);
        menu.settings = next;
      },
      captureKey: () => game.input.captureNext(),
    },
    { online },
  );
  game.input.onUnlock = () => {
    if (!game.paused && game.driver) {
      game.paused = true;
      menu.show('pause');
    }
  };

  // Dev builds expose the game for debugging and playtesting from the console.
  if (import.meta.env.DEV) {
    Object.assign(globalThis, {
      duty: {
        game,
        renderer,
        sound,
        menu,
        get driver() {
          return driver;
        },
      },
    });
  }

  let watched: GameDriver | null = null;
  let lastStatus = '';
  await renderer.setAnimationLoop((time) => {
    game.frame(time);
    // An online session that ended (rejected, kicked, server gone) returns to the join screen.
    const driver = game.driver;
    if (driver !== watched) {
      watched = driver;
      lastStatus = '';
    }
    if (driver?.online && driver.status !== lastStatus) {
      lastStatus = driver.status;
      if (driver.status !== 'playing' && driver.status !== 'connecting') {
        game.setDriver(null);
        game.paused = true;
        game.input.unlock();
        menu.show('join', driver.status);
      }
    }
  });
}
