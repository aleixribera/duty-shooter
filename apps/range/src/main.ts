import {
  BotMatchDriver,
  Game,
  Menu,
  OfflineDriver,
  OnlineDriver,
  buildM4A1,
  createRenderer,
  createSoundSystem,
  isFirefox,
  loadBake,
  loadSettings,
  padName,
  saveSettings,
  type GameDriver,
  type Lobby,
  type LobbyInfo,
  type Settings,
} from '@duty-shooter/fps-client';
import type { BakeFile } from '@duty-shooter/fps-client/surfaces';
import { createWorld, type ModeId, type Solid, type SpawnPoint } from '@duty-shooter/fps-core';
import type { WebGPURenderer } from 'three/webgpu';
import { Benchmark, CameraPath, type BenchPreset, type BenchReport } from './bench';
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
  // The release this page belongs to (`git describe`, set by the build), shown on the main menu.
  const version = import.meta.env.VITE_VERSION ?? 'dev';

  /** A map's definition and collision, built once each, and how far its baked lighting has downloaded. */
  const loaded = new Map<MapId, { map: MapDefinition; solids: Solid[]; bake: Promise<BakeFile | null>; progress: number | null; ready: boolean }>();
  const load = (id: MapId) => {
    let entry = loaded.get(id);
    if (!entry) {
      const map = buildMapById(id);
      const e: { map: MapDefinition; solids: Solid[]; bake: Promise<BakeFile | null>; progress: number | null; ready: boolean } = { map, solids: mapSolids(map), bake: Promise.resolve(null), progress: null, ready: false };
      e.bake = loadBake(`bake/${id}.bin`, (f) => (e.progress = f));
      // For the screenshot scripts: whether this map's lighting is in.
      void e.bake.then((file) => {
        e.ready = true;
        document.body.dataset['bake'] = file ? 'ready' : 'none';
      });
      entry = e;
      loaded.set(id, entry);
    }
    return entry;
  };
  /** Shows the loading screen until the map's lighting is in (at once if it already is). */
  const whenLoaded = async (id: MapId) => {
    const entry = load(id);
    if (entry.ready) return;
    const title = `Loading ${entry.map.name}`;
    menu.loading(title, entry.progress);
    const timer = setInterval(() => menu.loading(title, entry.progress), 100);
    await entry.bake;
    clearInterval(timer);
  };
  /** A game on one map; switching maps builds a new one. */
  const createGame = (id: MapId) => {
    const { map, solids, bake } = load(id);
    const g = new Game({
      canvas,
      renderer,
      backend,
      content: map,
      bake,
      world: createWorld(solids),
      settings,
      sound,
      overview: map.overview,
      thirdPersonWeapon: () => buildM4A1({ detail: 'low' }).root,
      loadoutStation: map.loadoutStation,
    });
    // `?nolock` (dev only): play without pointer lock, for automated playtesting.
    if (import.meta.env.DEV && params.has('nolock')) g.input.lockFree = true;
    g.input.onPadMenu = (nav) => menu.navigate(nav);
    // Use while dead, or at the range's station: the loadout screen, back into the game when done.
    g.onLoadout = () => {
      if (game.paused) return;
      game.paused = true;
      game.input.unlock();
      menu.loadout('game');
    };
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
  // Survival Town is the main menu's backdrop; `?map=range` starts on the range instead.
  const initial: MapId = params.get('map') === 'range' ? 'range' : 'survival-town';
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
    menu.loadoutNote = next.online ? 'Applies from your next spawn.' : 'Applies at once.';
    if (isFirefox() && !settings.firefoxTipShown) menu.tip(() => void enter());
    else void enter();
  };

  /** An offline session on `id`, once its lighting is in. */
  const playOffline = async (id: MapId) => {
    await whenLoaded(id);
    useMap(id);
    const { map, solids } = load(id);
    play(new OfflineDriver({ solids, spawn: offlineSpawn(map), dummies: map.dummies, loadout: settings.loadout }));
  };
  /** An offline match against bots on Survival Town, once its lighting is in. */
  const playBots = async (mode: ModeId, botsPerTeam: number) => {
    menu.loading('Bot Match', null);
    await whenLoaded('survival-town');
    useMap('survival-town');
    const { map, solids } = load('survival-town');
    if (!map.nav) return;
    // Let the loading screen paint before the bots' nav graph is built (a moment of work on the main thread).
    await new Promise((done) => setTimeout(done, 50));
    play(new BotMatchDriver({ solids, spawns: map.spawns, nav: map.nav, mode, botsPerTeam, name: settings.name.trim() || 'You', loadout: settings.loadout }));
  };
  /** Bumped by Cancel, so a join still in flight is dropped. */
  let joinAttempt = 0;
  const menu = new Menu(
    settings,
    {
      practiceRange: () => void playOffline('range'),
      exploreTown: () => void playOffline('survival-town'),
      botMatch: (mode: ModeId, botsPerTeam: number) => void playBots(mode, botsPerTeam),
      playOnline: (name: string, passphrase: string, mode: ModeId | null, bots: number | null) => {
        const attempt = ++joinAttempt;
        menu.connecting(0);
        // The lobby status first: a server that is down or full is reported without opening a socket.
        void lobbyStatus().then(async (status) => {
          if (attempt !== joinAttempt) return;
          menu.updateLobby(status);
          if (!status) return menu.failed(null);
          if (status.players >= status.capacity) return menu.failed('The server is full.');
          // The server's map, for prediction and drawing.
          const id = MAP_IDS.find((m) => m === status.map) ?? 'survival-town';
          // The map's lighting first: joined, the player is in the match (and can be shot) at once.
          menu.connecting(1);
          await load(id).bake;
          if (attempt !== joinAttempt) return;
          menu.connecting(2);
          const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
          // The game ticks the client, which is what reads the server's answer; the frame loop reports a refusal or a drop.
          const next = new OnlineDriver({ server: `${scheme}://${location.host}/ws`, solids: load(id).solids, name, passphrase, seatKey: 'duty-shooter.seat', loadout: settings.loadout, ...(mode ? { mode } : {}), ...(bots === null ? {} : { bots }) });
          useMap(id);
          play(next);
        });
      },
      refreshLobby: async () => {
        const status = await lobbyStatus();
        if (lobby?.kind === 'server') lobby.status = status;
        return status;
      },
      cancelJoin: () => {
        joinAttempt++;
        menu.show('main');
      },
      resume: () => void enter(),
      leave: () => {
        game.setDriver(null);
        game.paused = true;
        game.input.unlock();
        menu.show('main');
      },
      changeSettings: (next) => {
        if (next.loadout !== settings.loadout) game.driver?.setLoadout(next.loadout);
        settings = next;
        saveSettings(next);
        game.applySettings(next);
        menu.settings = next;
      },
      captureKey: () => game.input.captureNext(),
    },
    { lobby, version, padName: () => game.input.padName },
  );
  game = createGame(initial);
  // `?spot=<name>`: the camera at one of the map's reference spots, menu and HUD hidden, for repeatable screenshots.
  const spotName = params.get('spot');
  let fixedCamera = false;
  if (spotName !== null) {
    const spot = load(mapId).map.referenceSpots.find((s) => s.name === spotName);
    if (spot) {
      game.overview = spot;
      fixedCamera = true;
      menu.hide();
    }
  }
  // The Play Online tile keeps up with the server while the main menu is open.
  if (lobby?.kind === 'server') {
    setInterval(() => {
      if (menu.open && menu.screen === 'main' && !game.driver) void lobbyStatus().then((s) => menu.updateLobby(s));
    }, 10_000);
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

  if (benching) {
    fixedCamera = true;
    menu.hide();
    // Measure the finished look: wait for the baked lighting.
    await load(mapId).bake;
  }
  const bench = benching ? startBenchmarkOn(game, renderer, load(mapId).map, backend, settings) : null;
  let watched: GameDriver | null = null;
  let lastStatus = '';
  await renderer.setAnimationLoop((time) => {
    if (bench) {
      bench(time);
      return;
    }
    // Behind the menus, with no game running, the camera flies the map's menu path.
    if (!game.driver && !fixedCamera) {
      const path = flyPath(load(mapId).map);
      if (path) game.overview = path.pose(((time / 1000) * FLY_SPEED) % path.length);
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
        menu.failed(driver.status);
      }
    }
  });
}

/** The main menu's camera: metres per second along the map's fly-through. */
const FLY_SPEED = 4;
const flyPaths = new Map<MapDefinition, CameraPath | null>();
function flyPath(map: MapDefinition): CameraPath | null {
  if (!flyPaths.has(map)) flyPaths.set(map, map.flyThrough.length >= 2 ? new CameraPath(map.flyThrough) : null);
  return flyPaths.get(map)!;
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
    // A slow page (a busy main thread) still gets its answer; a server that is down fails fast anyway.
    const res = await fetch('/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
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
