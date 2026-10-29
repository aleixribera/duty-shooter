import {
  BOT_MAPS,
  BotMatchDriver,
  Game,
  LobbyPage,
  Menu,
  OfflineDriver,
  OnlineDriver,
  buildM4A1,
  createRenderer,
  createSoundSystem,
  isFirefox,
  loadBake,
  lobbyMapName,
  loadSettings,
  padName,
  saveSettings,
  type GameDriver,
  type Lobby,
  type LobbyInfo,
  type LobbyView,
  type Settings,
} from '@duty-shooter/fps-client';
import type { BakeFile } from '@duty-shooter/fps-client/surfaces';
import { DEFAULT_MAX_PLAYERS, MAX_BOTS_PER_TEAM, createWorld, teamMode, type LobbyPick, type LobbyState, type ModeId, type Solid, type SpawnPoint } from '@duty-shooter/fps-core';
import type { WebGPURenderer } from 'three/webgpu';
import { Benchmark, CameraPath, type BenchPreset, type BenchReport } from './bench';
import { MAP_IDS, TEAM_SIZES, asMapId, buildMapById, mapSolids, type MapDefinition, type MapId } from './map/maps';

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
      world: createWorld(solids, { ladders: map.ladders ?? [] }),
      settings,
      sound,
      overview: map.overview,
      thirdPersonWeapon: () => buildM4A1({ detail: 'low' }).root,
      loadoutStation: map.loadoutStation,
      rangeLanesWestOf: map.rangeLanesWestOf,
    });
    // `?nolock` (dev only): play without pointer lock, for automated playtesting.
    if (import.meta.env.DEV && params.has('nolock')) g.input.lockFree = true;
    g.input.onPadMenu = (nav) => (lobbyPage.open && !menu.open ? lobbyPage.navigate(nav) : menu.navigate(nav));
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
  // Survival Town is the main menu's backdrop; `?map=<id>` (`range`, `switchyard`) starts on another map instead.
  const initial: MapId = asMapId(params.get('map')) ?? 'survival-town';
  let mapId: MapId = initial;
  // Assigned below, once the menu exists (the game's input reports to it).
  let game!: Game;
  const useMap = (id: MapId) => {
    if (id === mapId) return;
    game.dispose();
    mapId = id;
    game = createGame(id);
  };
  status.textContent = backend === 'webgpu' ? 'WebGPU' : 'WebGL2 (preset capped at Medium)';
  setTimeout(() => (status.hidden = true), 4000);
  let lobby: Lobby | null = null;
  const lobbyDiscovery = findLobby();
  // An invite link (`#join=<passphrase>`): the passphrase into the join form, and out of the address bar.
  const invited = new URLSearchParams(location.hash.slice(1)).get('join');
  if (invited !== null) {
    settings = { ...settings, passphrase: invited };
    saveSettings(settings);
    history.replaceState(null, '', location.pathname + location.search);
  }
  /** The link that brings a friend to this server: the page, carrying the passphrase where there is one. */
  const inviteLink = (passphrase: string) => `${location.origin}${location.pathname}${passphrase ? `#join=${encodeURIComponent(passphrase)}` : ''}`;

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
    menu.loading(`Loading ${load(id).map.name}`, null);
    await game.prepare();
    const { map, solids } = load(id);
    play(new OfflineDriver({ solids, ladders: map.ladders ?? [], spawn: offlineSpawn(map), dummies: map.dummies, loadout: settings.loadout }));
  };
  // `?matchtime=<s>` (dev only): Bot Matches that last that long, for testing their end without the 10 minutes.
  const matchTime = import.meta.env.DEV ? Number(params.get('matchtime')) || undefined : undefined;
  /** An offline match against bots on `id`, once its lighting is in. */
  const playBots = async (id: MapId, mode: ModeId, botsPerTeam: number, hvb: boolean) => {
    menu.loading('Bot Match', null);
    await whenLoaded(id);
    useMap(id);
    const { map, solids } = load(id);
    if (!map.nav) return;
    await game.prepare();
    // Let the loading screen paint before the bots' nav graph is built (a moment of work on the main thread).
    await new Promise((done) => setTimeout(done, 50));
    play(new BotMatchDriver({ map: map.id, solids, ladders: map.ladders ?? [], spawns: map.spawns, zones: map.zones, sites: map.sites, nav: map.nav, mode, botsPerTeam, hvb, name: settings.name.trim() || 'You', loadout: settings.loadout, ...(matchTime ? { timeLimit: matchTime } : {}) }));
  };
  /** Bumped by Cancel, so a join still in flight is dropped. */
  let joinAttempt = 0;
  const menu = new Menu(
    settings,
    {
      practiceRange: () => void playOffline('range'),
      botMatch: () => openBotLobby(),
      playOnline: (name: string, passphrase: string, mode: ModeId | null, bots: number | null) => {
        const attempt = ++joinAttempt;
        onlineName = name.trim() || 'You';
        menu.connecting(0);
        // The lobby status first: a server that is down or full is reported without opening a socket.
        void lobbyStatus().then(async (status) => {
          if (attempt !== joinAttempt) return;
          menu.updateLobby(status);
          if (!status) return menu.failed(null);
          if (status.players >= status.capacity) return menu.failed('The server is full.');
          // The server's map, for prediction and drawing.
          const id = asMapId(status.map) ?? 'survival-town';
          // The map's lighting first: joined, the player is in the match (and can be shot) at once.
          menu.connecting(1);
          await load(id).bake;
          if (attempt !== joinAttempt) return;
          // The weapons and soldiers ready to draw before the socket opens: once joined, the player is in play.
          useMap(id);
          await game.prepare();
          if (attempt !== joinAttempt) return;
          menu.connecting(2);
          const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
          // The game ticks the client, which is what reads the server's answer; the frame loop reports a refusal or a drop.
          lobbyPage.invite = inviteLink(lobby?.kind === 'server' && lobby.public ? '' : passphrase);
          const next = new OnlineDriver({ server: `${scheme}://${location.host}/ws`, solids: load(id).solids, ladders: load(id).map.ladders ?? [], name, passphrase, seatKey: 'duty-shooter.seat', loadout: settings.loadout, ...(mode ? { mode } : {}), ...(bots === null ? {} : { bots }) });
          useMap(id);
          play(next);
        });
      },
      refreshLobby: async () => {
        // A server that was down when the page opened is looked for again (Play Online, Check again).
        if (lobby === null) {
          const found = await findLobby();
          if (found) {
            lobby = found;
            menu.setLobby(found);
          }
        }
        const status = await lobbyStatus();
        if (lobby?.kind === 'server') lobby.status = status;
        return status;
      },
      cancelJoin: () => {
        joinAttempt++;
        menu.show('main');
      },
      resume: () => void enter(),
      leave: () => leaveGame(),
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
  /** Back to the main menu from a game (or its lobby). */
  const leaveGame = () => {
    botLobbyOpen = false;
    game.setDriver(null);
    game.paused = true;
    game.input.unlock();
    leaveLobby();
    menu.show('main');
  };
  // The lobby page, between matches on a server that has one.
  const lobbyPage = new LobbyPage(
    document.body,
    {
      pick: (picks) => (botLobbyOpen ? pickBots(picks) : game.driver?.setLobby(picks)),
      start: () => {
        if (botLobbyOpen) {
          // The match just played (if any) goes, so it isn't taken for over again while the next one loads.
          if (game.driver) game.setDriver(null);
          closeBotLobby();
          void playBots(asMapId(botSetup.map) ?? 'survival-town', botSetup.mode, botSetup.bots, botSetup.hvb && teamMode(botSetup.mode));
          return;
        }
        // The click that starts the match also takes the pointer for it.
        lobbyJoin = true;
        game.driver?.startMatch();
      },
      join: () => void joinMatch(),
      loadout: () => menu.loadout('lobby'),
      settings: () => menu.lobbySettings(),
      leave: () => leaveGame(),
    },
    { map: (id) => ({ id, name: loaded.get(id as MapId)?.map.name ?? lobbyMapName(id), image: MAP_IMAGES.has(id) ? `maps/${id}.jpg` : null }) },
  );
  /**
   * Bot Match's setup is the lobby page offline: you alone, the bots the
   * match brings, and your picks, kept between visits. Opening it starts the
   * picked map's lighting downloading, so Start rarely waits. The bots fill
   * to the map's team size for the mode, or a size of your own (the hidden
   * + and - keys) until the map or mode changes.
   */
  const teamSize = (map: string, mode: ModeId) => Math.min(MAX_BOTS_PER_TEAM, TEAM_SIZES[asMapId(map) ?? 'survival-town'][mode] ?? 3);
  // Keep the original development link selecting Crash for existing testers.
  const devBotCrash = import.meta.env.DEV && params.get('botmap') === 'crash';
  const initialBotMap = devBotCrash ? 'crash' : BOT_MAPS[0]!;
  let botSetup: LobbyState = { host: 'you', players: ['you'], capacity: DEFAULT_MAX_PLAYERS, mode: 'tdm', bots: teamSize(initialBotMap, 'tdm'), custom: false, maxBots: MAX_BOTS_PER_TEAM, hvb: false, maps: BOT_MAPS, map: initialBotMap };
  let botLobbyOpen = false;
  /** The Bot Match just played, shown on the setup page as the online lobby shows its last match. */
  let botLast: Pick<LobbyView, 'mode' | 'result' | 'teamScores'> | null = null;
  const botView = (): LobbyView => ({
    lobby: botSetup,
    phase: 'lobby',
    selfId: 'you',
    names: { you: settings.name.trim() || 'You' },
    pings: {},
    mode: botLast?.mode ?? botSetup.mode,
    result: botLast?.result ?? null,
    teamScores: botLast?.teamScores ?? null,
    loading: null,
    offline: true,
  });
  const openBotLobby = () => {
    botLast = null;
    botLobbyOpen = true;
    menu.hide();
    lobbyPage.invite = null;
    lobbyPage.show(botView());
    load(asMapId(botSetup.map) ?? 'survival-town');
    // The weapons' models too (the browser keeps them for the match's game, on whichever map).
    void game.preload();
  };
  const pickBots = (picks: LobbyPick) => {
    const { fill: _fill, bots, ...rest } = picks;
    const next = { ...botSetup, ...rest };
    // A size of your own lasts until the map or mode changes (or Bots is switched); offline there is always at least one a side.
    const custom = bots !== undefined || (botSetup.custom && picks.fill === undefined && next.map === botSetup.map && next.mode === botSetup.mode);
    botSetup = { ...next, custom, bots: custom ? Math.max(1, Math.min(MAX_BOTS_PER_TEAM, bots ?? botSetup.bots)) : teamSize(next.map, next.mode) };
    if (picks.map) load(asMapId(picks.map) ?? 'survival-town');
    lobbyPage.show(botView());
  };
  const closeBotLobby = () => {
    botLobbyOpen = false;
    leaveLobby();
  };
  // Esc leaves Bot Match's setup (the menu, open over it, handles its own Esc first).
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.defaultPrevented || !botLobbyOpen || menu.open) return;
    e.preventDefault();
    leaveGame();
  });
  /** Whether the next match's start should take the pointer at once (the host's own Start click). */
  let lobbyJoin = false;
  /** The name this player joined under, for their own seat (the driver calls them "You"). */
  let onlineName = 'You';
  const leaveLobby = () => {
    lobbyPage.hide();
    game.overviewOnly = false;
    game.hud.visible = game.driver !== null;
  };
  /** From the lobby into the match under way: takes the pointer (or the controller), then hides the lobby. */
  const joinMatch = async () => {
    void sound.unlock();
    if (!game.input.padMode) await game.input.lock();
    if (!game.input.locked) return;
    leaveLobby();
    menu.hide();
    game.paused = false;
  };
  /**
   * Onto the map the server plays next (the host's pick, in the lobby) or now,
   * keeping the online session: a new game on that map takes the driver over,
   * predicting on its collision, its lighting streaming in meanwhile.
   */
  const followMap = (driver: OnlineDriver, id: MapId) => {
    if (id === mapId) return;
    const { paused, overviewOnly } = game;
    const hud = game.hud.visible;
    game.releaseDriver();
    useMap(id);
    driver.setMap(load(id).solids, load(id).map.ladders ?? []);
    game.setDriver(driver);
    game.paused = paused;
    game.overviewOnly = overviewOnly;
    game.hud.visible = hud;
  };
  /** Each frame: the lobby page up while the server is in its lobby, and until this player is back in the match after it. */
  const updateLobby = () => {
    const driver = game.driver;
    // A Bot Match over: back to its setup as the online lobby comes back after a match, the map flying by behind.
    if (driver instanceof BotMatchDriver && driver.over && !botLobbyOpen) {
      const match = driver.match!;
      botLast = { mode: match.mode, result: match.result, teamScores: match.teamScores };
      botLobbyOpen = true;
      game.paused = true;
      game.input.unlock();
      if (menu.open && menu.screen === 'pause') menu.hide();
      game.overviewOnly = true;
      game.hud.visible = false;
      lobbyPage.invite = null;
    }
    if (botLobbyOpen) {
      lobbyPage.show(botView());
      return;
    }
    // A Bot Match's own lobby (before its Start goes through) is never shown.
    if (driver instanceof BotMatchDriver) {
      if (lobbyPage.open) leaveLobby();
      return;
    }
    const match = driver?.online ? driver.match : null;
    // Servers from before map switching name no map in their status.
    const next = match ? asMapId(match.phase === 'lobby' && match.lobby ? match.lobby.map : match.map) : undefined;
    if (next && driver instanceof OnlineDriver) followMap(driver, next);
    if (!driver || !match?.lobby || (match.phase !== 'lobby' && !lobbyPage.open)) {
      if (lobbyPage.open) leaveLobby();
      return;
    }
    if (!lobbyPage.open) {
      // Back from a match (or just joined): out of play, the map flying by behind the page.
      game.paused = true;
      game.input.unlock();
      if (menu.open && menu.screen === 'pause') menu.hide();
      game.overviewOnly = true;
      game.hud.visible = false;
    }
    const names: Record<string, string> = {};
    for (const id of match.lobby.players) names[id] = id === driver.selfId ? onlineName : driver.nameOf(id);
    // Into the match only once its map is lit: the player stays on the page (out of the fight's way) until then.
    const entry = load(mapId);
    const view: LobbyView = { lobby: match.lobby, phase: match.phase, selfId: driver.selfId, names, pings: driver.pings, mode: match.mode, result: match.result, teamScores: match.teamScores, loading: entry.ready ? null : entry.map.name };
    lobbyPage.show(view);
    if (match.phase !== 'lobby' && lobbyJoin && entry.ready) {
      lobbyJoin = false;
      void joinMatch();
    }
  };
  game = createGame(initial);
  void lobbyDiscovery.then((found) => {
    lobby = found;
    menu.setLobby(found);
    if (invited !== null && found?.kind === 'server' && menu.open && menu.screen === 'main') menu.openOnline();
  });
  // `?explore=<map>`: walk that map alone, offline, as the main menu once offered (for testing and screenshots).
  const explore = asMapId(params.get('explore'));
  if (explore) void playOffline(explore);
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
  setInterval(() => {
    if (lobby?.kind === 'server' && menu.open && menu.screen === 'main' && !game.driver) void lobbyStatus().then((s) => menu.updateLobby(s));
  }, 10_000);
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
  let lastMenuFrame = -Infinity;
  await renderer.setAnimationLoop((time) => {
    if (bench) {
      bench(time);
      return;
    }
    updateLobby();
    // The map is only a backdrop while the main menu is open. Limit its GPU
    // work, but keep polling controllers and immediately resume on play.
    const backdrop = (menu.open || lobbyPage.open) && !fixedCamera;
    const drawBackdrop = !backdrop || time - lastMenuFrame >= 50;
    if (backdrop && drawBackdrop) lastMenuFrame = time;
    // No session needs ticking behind the main menu; with an online session,
    // keep simulation and input running even between backdrop renders.
    if (backdrop && !game.driver && !drawBackdrop) return;
    // Behind the menus (and the lobby), with no game running, the camera flies the map's menu path.
    if ((!game.driver || game.overviewOnly) && !fixedCamera) {
      const path = flyPath(load(mapId).map);
      if (path) game.overview = path.pose(((time / 1000) * FLY_SPEED) % path.length);
    }
    game.frame(time, !backdrop, drawBackdrop);
    // An online session that ended (rejected, kicked, server gone) returns to the join screen.
    const driver = game.driver;
    if (driver !== watched) {
      watched = driver;
      lastStatus = '';
    }
    if (driver?.online && driver.status !== lastStatus) {
      lastStatus = driver.status;
      if (driver.status !== 'playing' && driver.status !== 'connecting') {
        leaveLobby();
        game.setDriver(null);
        game.paused = true;
        game.input.unlock();
        menu.failed(driver.status);
      }
    }
  });
}

/** Maps with a picture for the lobby (apps/range/public/maps/<id>.jpg). */
const MAP_IMAGES: ReadonlySet<string> = new Set(['survival-town', 'switchyard', 'crash']);

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
