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
  padName,
  saveSettings,
  type GameDriver,
  type Lobby,
  type LobbyInfo,
  type Settings,
} from '@duty-shooter/fps-client';
import { createWorld, type Solid, type SpawnPoint } from '@duty-shooter/fps-core';
import type { WebGPURenderer } from 'three/webgpu';
import { Benchmark, type BenchPreset, type BenchReport } from './bench';
import { MAP_IDS, buildMapById, mapSolids, type MapDefinition, type MapId } from './map/maps';

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
  // `?bench`: fly the map's benchmark path once per preset and report frame times, GPU time, draw calls and triangles.
  const benching = params.has('bench');
  const { renderer, backend } = await createRenderer(canvas, { forceWebGL, trackTimestamp: benching });
  document.body.dataset['backend'] = backend;
  const sound = createSoundSystem();
  // `?town` (until the release): adds "Explore Survival Town" to the main menu.
  const townFlag = params.has('town');

  /** A map's definition and collision, built once each. */
  const loaded = new Map<MapId, { map: MapDefinition; solids: Solid[] }>();
  const load = (id: MapId) => {
    let entry = loaded.get(id);
    if (!entry) {
      const map = buildMapById(id);
      entry = { map, solids: mapSolids(map) };
      loaded.set(id, entry);
    }
    return entry;
  };
  /** A game on one map; switching maps builds a new one. */
  const createGame = (id: MapId) => {
    const { map, solids } = load(id);
    const g = new Game({
      canvas,
      renderer,
      backend,
      content: map,
      world: createWorld(solids),
      settings,
      sound,
      overview: map.overview,
      thirdPersonWeapon: () => buildM4A1({ detail: 'low' }).root,
    });
    // `?nolock` (dev only): play without pointer lock, for automated playtesting.
    if (import.meta.env.DEV && params.has('nolock')) g.input.lockFree = true;
    g.input.onPadMenu = (nav) => menu.navigate(nav);
    g.input.onUnlock = () => {
      if (!game.paused && game.driver) {
        game.paused = true;
        menu.show('pause');
      }
    };
    return g;
  };
  // `?at=x,z,yaw` (dev only): the offline spawn, for playtesting one spot without walking to it.
  const at = import.meta.env.DEV ? params.get('at')?.split(',').map(Number) : undefined;
  const offlineSpawn = (map: MapDefinition): SpawnPoint =>
    at && at.length >= 2 && at.every(Number.isFinite) ? { position: [at[0]!, 0, at[1]!], yaw: at[2] ?? 0 } : map.offlineSpawn;
  const initial: MapId = params.get('map') === 'survival-town' ? 'survival-town' : 'range';
  let mapId: MapId = initial;
  // Assigned below, once the menu exists (the game's input reports to it).
  let game!: Game;
  const useMap = (id: MapId) => {
    if (id === mapId) return;
    game.dispose();
    mapId = id;
    game = createGame(id);
  };
  status.textContent = backend === 'webgpu' ? 'WebGPU' : 'WebGL2 (preset capped at Normal)';
  setTimeout(() => (status.hidden = true), 4000);
  const lobby = await findLobby();

  /**
   * Takes the pointer and starts input; shows the pause menu if the browser
   * refuses. On a controller there is no pointer to take.
   */
  const enter = async () => {
    // Not awaited: without a click or key press (a controller press does not
    // count) the browser holds audio back until the next one.
    void sound.unlock();
    if (!game.input.padMode) await game.input.lock();
    if (game.input.locked) {
      menu.hide();
      game.paused = false;
      if (!sound.unlocked && game.input.padMode) game.hud.toast('Sound starts after a click or a key press: the browser does not count controller buttons.', 6);
    } else {
      menu.show('pause', 'The browser refused the mouse lock. Click Resume again.');
    }
  };
  // Sound the browser held back starts on the first click or key press.
  const retrySound = () => {
    if (!sound.unlocked) void sound.unlock();
  };
  document.addEventListener('pointerdown', retrySound, true);
  document.addEventListener('keydown', retrySound, true);
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
      playOffline: () => {
        useMap('range');
        const { map, solids } = load('range');
        play(new OfflineDriver({ solids, spawn: offlineSpawn(map), dummies: map.dummies }));
      },
      ...(townFlag
        ? {
            exploreTown: () => {
              useMap('survival-town');
              const { map, solids } = load('survival-town');
              play(new OfflineDriver({ solids, spawn: offlineSpawn(map), dummies: map.dummies }));
            },
          }
        : {}),
      playOnline: (name, passphrase) => {
        // The lobby status first: a full server is reported without opening a socket.
        void lobbyStatus().then((status) => {
          if (lobby?.kind === 'server') lobby.status = status;
          if (status && status.players >= status.capacity) {
            menu.show('join', 'The server is full.');
            return;
          }
          // The server's map, for prediction and drawing; an older server without /status runs the range.
          const id = MAP_IDS.find((m) => m === status?.map) ?? 'range';
          useMap(id);
          const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
          play(new OnlineDriver({ url: `${scheme}://${location.host}/ws`, solids: load(id).solids, name, passphrase }));
        });
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
    { lobby, padName: () => game.input.padName },
  );
  game = createGame(initial);
  // `?spot=<name>`: the camera at one of the map's reference spots, menu and HUD hidden, for repeatable screenshots.
  const spotName = params.get('spot');
  if (spotName !== null) {
    const spot = load(mapId).map.referenceSpots.find((s) => s.name === spotName);
    if (spot) {
      game.overview = spot;
      menu.hide();
    }
  }
  addEventListener('gamepadconnected', (e) => game.hud.toast(`Controller connected: ${padName(e.gamepad.id)}`, 4));

  // Dev builds expose the game for debugging and playtesting from the console.
  if (import.meta.env.DEV) {
    Object.assign(globalThis, {
      duty: {
        get game() {
          return game;
        },
        get map() {
          return load(mapId).map;
        },
        renderer,
        sound,
        menu,
        get driver() {
          return driver;
        },
      },
    });
  }

  if (benching) menu.hide();
  const bench = benching ? startBenchmarkOn(game, renderer, load(mapId).map, backend, settings) : null;
  let watched: GameDriver | null = null;
  let lastStatus = '';
  await renderer.setAnimationLoop((time) => {
    if (bench) {
      bench(time);
      return;
    }
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

/**
 * Runs the benchmark on the game's map: the menu hidden, the camera on the
 * benchmark path, each preset in turn. The report goes to an on-screen panel,
 * to the console as JSON and to `window.duty.benchmark`.
 */
function startBenchmarkOn(game: Game, renderer: WebGPURenderer, map: MapDefinition, backend: string, settings: Settings): (time: number) => void {
  const bench = new Benchmark(map.benchmarkPath);
  const loadMs = Math.round(performance.now());
  const panel = document.createElement('pre');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;margin:0;padding:10px 12px;background:rgb(10 12 14 / 0.8);color:#e8e6e1;font:12px/1.4 ui-monospace,monospace;z-index:10;white-space:pre;';
  document.body.append(panel);
  renderer.info.autoReset = false;
  let pendingGpu = false;
  let finished = false;
  return (time) => {
    if (finished) {
      game.frame(time);
      return;
    }
    const f = bench.frame(time);
    if (!f) {
      finished = true;
      renderer.info.autoReset = true;
      const report: BenchReport = {
        map: map.id,
        backend,
        resolution: [renderer.domElement.width, renderer.domElement.height],
        loadMs,
        presets: bench.reports,
      };
      panel.textContent = `BENCHMARK ${map.name}
${JSON.stringify(report, null, 1)}`;
      console.log(`BENCHMARK ${JSON.stringify(report)}`);
      Object.assign(globalThis, { duty: { ...((globalThis as { duty?: object }).duty ?? {}), benchmark: report } });
      document.body.dataset['benchmark'] = 'done';
      return;
    }
    if (f.presetStarted) game.applySettings({ ...settings, preset: bench.preset as BenchPreset });
    game.overview = f.pose;
    renderer.info.reset();
    game.frame(time);
    bench.rendered(time, { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles });
    panel.textContent = `BENCHMARK ${map.name} · ${bench.preset} · ${game.fps.toFixed(0)} fps`;
    // GPU time: Three.js keeps the latest frame's queries per pass, so each resolve reads one frame.
    if (!pendingGpu) {
      pendingGpu = true;
      void renderer
        .resolveTimestampsAsync('render')
        .then((ms) => {
          if (typeof ms === 'number') bench.gpu(ms);
        })
        .finally(() => (pendingGpu = false));
    }
  };
}

/** The lobby status endpoint (map, mode, players, capacity, phase), or null if it does not answer. */
async function lobbyStatus(): Promise<LobbyInfo | null> {
  try {
    const res = await fetch('/status', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    return res.ok ? ((await res.json()) as LobbyInfo) : null;
  } catch {
    return null;
  }
}

/**
 * Where online play is: the game server that served this page (it answers
 * /healthz), else the server's address baked into a copy built without one
 * (GitHub Pages), else nowhere. In dev, `?online` looks for a server behind
 * Vite's proxy.
 */
async function findLobby(): Promise<Lobby | null> {
  if (!import.meta.env.DEV || params.has('online')) {
    try {
      const res = await fetch('/healthz', { cache: 'no-store', signal: AbortSignal.timeout(3000) });
      const health = res.ok && res.headers.get('content-type')?.includes('application/json') ? ((await res.json()) as { status?: unknown; public?: unknown }) : null;
      if (health?.status === 'ok') return { kind: 'server', public: health.public === true, status: await lobbyStatus() };
    } catch {
      // No game server behind this page.
    }
  }
  const url = import.meta.env.VITE_LOBBY_URL;
  return url ? { kind: 'link', url } : null;
}
