import { FramePacer, LobbyPage, Menu, ProfileStore, RoyalePage, GRAPHICS_LOST, connectionError, loadSettings, loadoutNote, padName, placement, royaleOpens, royaleServer, saveSettings, useColourVision, type VideoStatus, type Lobby, type LobbyView, type RoyaleSession, type RoyaleView, type Settings } from '@duty-shooter/fps-client/ui';
import type { Game, GameDriver, OnlineDriver, SoundSystem } from '@duty-shooter/fps-client';
import type { BakeFile } from '@duty-shooter/fps-client/surfaces';
import type { FromLocalRoyale } from './local-royale';
import { createWorld, teamMode, type LobbyPick, type ModeId, type SpawnPoint } from '@duty-shooter/fps-core';
import type { WebGPURenderer } from 'three/webgpu';
import { CameraPath } from './bench';
import { openBenchmarkPage, startBenchmarkOn, type BenchFrame } from './benchmark-run';
import { BotSetup } from './bot-setup';
import { ROYALE_STATUS, SEAT_KEY, findLobby, hasSeat, lobbyStatus } from './lobby-status';
import { startLocalBots } from './local-bots';
import { MapStore } from './map-store';
import { PreparationFlow } from './preparation-flow';
import { asMapId, mapEntry, mapConcealment, type MapDefinition, type MapId } from './map/maps';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const status = document.querySelector<HTMLElement>('#status');
if (!canvas || !status) throw new Error('index.html is missing #view or #status');

const params = new URLSearchParams(location.search);
async function startGame(canvas: HTMLCanvasElement, status: HTMLElement, forceWebGL: boolean): Promise<void> {
  let settings: Settings = loadSettings();
  // The menus draw the team colours too, before the engine is there to set them.
  useColourVision(settings.colourVision);
  // This browser's Profile: the game banks a finished match in it, the menu shows it.
  const profile = new ProfileStore();
  // `?bench`: fly the map's benchmark path and report frame times, GPU time, draw calls and triangles.
  const benching = params.has('bench');
  // `?benchmark`: the benchmark page a player opens from Settings > Video (ticket 27).
  const benchmarkPage = params.has('benchmark') && !benching;
  // The frame-rate cap; there once the renderer is. A benchmark draws uncapped.
  let pacer: FramePacer | null = null;
  let backendName = '';
  let adapterName = '';
  const videoStatus = (): VideoStatus | null => (pacer ? { backend: backendName, adapter: adapterName, refreshHz: pacer.refreshHz } : null);
  // `?stats`: each second, this frame's draw calls, triangles, GPU time and the renderer's live geometries and textures, on `document.body.dataset.render`, for scripted measurements of a production build.
  const renderStats = params.has('stats');
  // The menus go up first, and take clicks while three.js and the map arrive behind them.
  const engineLoading = import('./engine');
  let engine: Awaited<typeof engineLoading> | null = null;
  let renderer!: WebGPURenderer;
  let sound!: SoundSystem;
  let engineUp!: () => void;
  const engineReady = new Promise<void>((done) => (engineUp = done));
  let up = false;
  /** Runs `act` once the engine and the first game are up: now, if they are. */
  const whenUp = (act: () => void) => {
    if (up) act();
    else void engineReady.then(act);
  };
  // The release this page belongs to (`git describe`, set by the build), shown on the main menu.
  const version = import.meta.env.VITE_VERSION ?? 'dev';

  /** The page's maps, each built once, and their bot routes. */
  const mapStore = new MapStore((url, progress) => engine!.loadBake(url, progress));
  const load = (id: MapId) => mapStore.load(id);
  const routesOf = (id: MapId) => mapStore.routes(id);
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
  /** Wires a game to the page's menus, which only the game on show may answer to. */
  const wire = (g: Game) => {
    g.input.onPadMenu = (nav) =>
      menu.open ? menu.navigate(nav) : lobbyPage.open ? lobbyPage.navigate(nav) : royalePage.open ? royalePage.navigate(nav) : preparation.page.open ? preparation.page.navigate(nav) : menu.navigate(nav);
    g.input.onUnlock = () => {
      if (!game.paused && game.driver) {
        game.paused = true;
        menu.show('pause');
      }
    };
  };
  const createGame = (id: MapId) => {
    const { map, solids, bake } = load(id);
    const g = new engine!.Game({
      canvas,
      renderer,
      // `?plants=off`: the map without its plants drawn (they still hide bots), to measure what they cost.
      content: params.get('plants') === 'off' ? { ...map, plants: null } : map,
      bake,
      world: createWorld(solids, { ladders: map.ladders ?? [], terrain: map.terrain, concealment: mapConcealment(map), traps: map.soundTraps ?? [] }),
      settings,
      sound,
      overview: map.overview,
      thirdPersonWeapon: () => engine!.buildM4A1({ detail: 'low' }).root,
      loadoutStation: map.loadoutStation,
      rangeLanesWestOf: map.rangeLanesWestOf,
      course: map.course ?? null,
      profile,
    });
    // `?nolock` (dev only): play without pointer lock, for automated playtesting.
    if (import.meta.env.DEV && params.has('nolock')) g.input.lockFree = true;
    // Use while dead, or at the range's station: the loadout screen, back into the game when done.
    g.onLoadout = () => {
      if (game.paused) return;
      game.paused = true;
      game.input.unlock();
      menu.loadout('game');
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
  let lastInput = 0;
  let lastPress = 0;
  addEventListener('pointermove', () => (lastInput = performance.now()), { capture: true, passive: true });
  for (const type of ['pointerdown', 'keydown', 'click'])
    addEventListener(type, () => (lastInput = lastPress = performance.now()), { capture: true, passive: true });
  /** The player wants to play: background work stops waiting for quiet. */
  let hurried = false;
  const quietFor = (ms: number, last: () => number) =>
    new Promise<void>((done) => {
      const look = () => {
        if (hurried || performance.now() - last() > ms) done();
        else setTimeout(look, 50);
      };
      look();
    });
  /** Settles once the player has rested a moment, or wants to play: when a stall nobody can feel may happen. */
  const restMoment = () => quietFor(REST_MS, () => lastInput);
  /** Lets the screen a press opened paint before the next piece of background work. Moving the mouse counts for nothing: it would hold back the world behind the menu. */
  const breath = () => quietFor(BREATH_MS, () => lastPress);
  /** The game on show ready to play, with nothing held back for a quieter moment. */
  const ready = () => {
    hurried = true;
    return game.prepare();
  };
  /** Practice Range, kept ready behind the menus (see `keepRangeReady`). */
  let spare: Game | null = null;
  /** `fresh` builds the map again even where it is the one on show: the benchmark's, so every map is flown from the same cold start. */
  const useMap = (id: MapId, fresh = false) => {
    if (id === mapId && !fresh) return;
    hurried = true;
    const old = game;
    old.input.onUnlock = null;
    old.input.onPadMenu = null;
    old.paused = true;
    old.hud.visible = false;
    mapId = id;
    game = id === 'range' && spare && !fresh ? spare : createGame(id);
    if (game === spare) {
      spare = null;
      game.applySettings(settings);
    }
    wire(game);
    // A notice raised at the menu (a pad's first press) still waits for its moment in the new game.
    const waiting = old.hud.pendingNotice;
    if (waiting) game.hud.notice(waiting.text, waiting.seconds);
    // The old game goes once the new one is ready: its shaders, most of them the new one's too, stay compiled meanwhile.
    void game.prepare().finally(() => old.dispose());
  };
  /**
   * Practice Range has no lobby to get ready behind, so its game is built once
   * the menu's own is ready and waits off screen for the click. Skipped on
   * machines short of memory, which only pay for it on the way in.
   */
  const keepRangeReady = async () => {
    const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    if (memory < 4) return;
    await restMoment();
    if (spare || mapId === 'range' || game.driver || !menu.open) return;
    hurried = false;
    spare = createGame('range');
    void spare.prepare(restMoment, breath);
  };
  let lobby: Lobby | null = null;
  const lobbyDiscovery = findLobby(!import.meta.env.DEV || params.has('online'));
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
  const retrySound = () =>
    whenUp(() => {
      if (!sound.unlocked) void sound.unlock();
    });
  document.addEventListener('pointerdown', retrySound, true);
  // A finger's press only counts for the browser once it lifts.
  document.addEventListener('pointerup', retrySound, true);
  document.addEventListener('keydown', retrySound, true);
  /** First entry shows the one-time Firefox tip about raw mouse input. */
  let driver: GameDriver | null = null;
  const play = (next: GameDriver) => {
    driver = next;
    game.setDriver(next);
    if (engine!.isFirefox() && !settings.firefoxTipShown) menu.tip(() => void enter());
    else void enter();
  };

  /** An offline session on `id`, once its lighting is in. */
  const playOffline = async (id: MapId) => {
    await whenLoaded(id);
    useMap(id);
    menu.loading(`Loading ${load(id).map.name}`, null);
    await ready();
    const { map, solids } = load(id);
    play(new engine!.OfflineDriver({ solids, ladders: map.ladders ?? [], terrain: map.terrain, spawn: offlineSpawn(map), dummies: map.dummies, loadout: settings.loadout }));
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
    const [navGraph] = await Promise.all([routesOf(id), ready()]);
    // Let the loading screen paint before the match builds its own routes (most of a second on the main thread).
    if (!navGraph) await new Promise((done) => setTimeout(done, 50));
    play(new engine!.BotMatchDriver({ map: map.id, solids, ladders: map.ladders ?? [], terrain: map.terrain, spawns: map.spawns, zones: map.zones, sites: map.sites, nav: map.nav, navGraph, mode, botsPerTeam, hvb, name: settings.name.trim() || 'You', loadout: settings.loadout, ...(matchTime ? { timeLimit: matchTime } : {}) }));
  };
  /** Bumped by Cancel, so a join still in flight is dropped. */
  let joinAttempt = 0;
  const menu = new Menu(
    settings,
    {
      practiceRange: () => {
        menu.loading('Practice Range', null);
        whenUp(() => void playOffline('range'));
      },
      battleRoyale: () => openRoyale(),
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
          // A seat held for this page counts among the players, and is still its to take back.
          if (status.players >= status.capacity && !hasSeat()) return menu.failed('The server is full.');
          await engineReady;
          if (attempt !== joinAttempt) return;
          // The server's map, for prediction and drawing.
          const id = asMapId(status.map) ?? 'survival-town';
          // The map's lighting first: joined, the player is in the match (and can be shot) at once.
          menu.connecting(1);
          await load(id).bake;
          if (attempt !== joinAttempt) return;
          // The weapons and soldiers ready to draw before the socket opens: once joined, the player is in play.
          useMap(id);
          await ready();
          if (attempt !== joinAttempt) return;
          menu.connecting(2);
          const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
          // The game ticks the client, which is what reads the server's answer; the frame loop reports a refusal or a drop.
          lobbyPage.invite = inviteLink(lobby?.kind === 'server' && lobby.public ? '' : passphrase);
          const next = new engine!.OnlineDriver({ server: `${scheme}://${location.host}/ws`, solids: load(id).solids, ladders: load(id).map.ladders ?? [], terrain: load(id).map.terrain, name, passphrase, seatKey: SEAT_KEY, loadout: settings.loadout, ...(mode ? { mode } : {}), ...(bots === null ? {} : { bots }) });
          useMap(id);
          play(next);
        });
      },
      refreshLobby: async () => {
        // A server that was down when the page opened is looked for again (Play Online, Check again).
        if (lobby === null) {
          const found = await findLobby(!import.meta.env.DEV || params.has('online'));
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
        if (next.loadout !== settings.loadout) game?.driver?.setLoadout(next.loadout);
        settings = next;
        saveSettings(next);
        useColourVision(next.colourVision);
        if (pacer && !benchmarkPage) pacer.fpsCap = next.fpsCap;
        game?.applySettings(next);
        menu.settings = next;
      },
      captureKey: () => engineReady.then(() => game.input.captureNext()),
    },
    { lobby, version, mapName, padName: () => game?.input.padName ?? null, profile, video: videoStatus, changelog: () => import('virtual:changelog').then((m) => m.default) },
  );
  /** Back to the main menu from a game (or its lobby). */
  const leaveGame = () => {
    botLobbyOpen = false;
    royalePre = false;
    royalePage.hide();
    game?.setDriver(null);
    if (game) game.paused = true;
    game?.input.unlock();
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
          menu.loading('Bot Match', null);
          lobbyPage.hide();
          botLobbyOpen = false;
          whenUp(() => {
            // The match just played (if any) goes, so it isn't taken for over again while the next one loads.
            if (game.driver) game.setDriver(null);
            leaveLobby();
            void playBots(botSetup.mapId, botSetup.state.mode, botSetup.state.bots, botSetup.state.hvb && teamMode(botSetup.state.mode));
          });
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
    { map: (id) => ({ id, name: mapStore.peek(id as MapId)?.map.name ?? mapName(id), image: mapEntry(id)?.picture ? `maps/${id}.jpg` : null }) },
  );
  /**
   * The Battle Royale screen: before joining, the server's state and the
   * Squad size to open its lobby with; joined, the server's Battle Royale
   * lobby (updateLobby feeds it each frame). It plays in the server's Battle
   * Royale process, behind `/royale/` on the same address (ADR 0009), or on
   * Local bots: the same server in a worker on this page (ticket 15, ADR 0010).
   */
  let royale: Omit<RoyaleView, 'session'> = { source: 'server', status: undefined, name: '', passphrase: false, joining: null, error: null, squads: 1 };
  /** The screen is up before (or while) joining, with no lobby yet. */
  let royalePre = false;
  /** The screen shows the server's Battle Royale lobby. */
  let royaleSession = false;
  /**
   * Your place in the Battle Royale match under way or just ended, as its HUD showed it: back in the
   * lobby the bots are gone from the scores, so the number of Squads can't be read there (ticket 39).
   */
  let royalePlace: { readonly place: number; readonly of: number } | null = null;
  let royaleMatchOn = false;
  /** The Squad size picked before joining an empty server, sent once its lobby makes this player host. */
  let pendingSquads: RoyaleView['squads'] | null = null;
  const showRoyale = () => {
    if (royalePre) royalePage.show({ ...royale, session: null });
  };
  const askRoyale = () => {
    if (royale.source === 'local') return showRoyale();
    royale = { ...royale, status: undefined };
    showRoyale();
    // Asking starts the Battle Royale process if it isn't running, so it's warm by the time this player joins.
    void lobbyStatus(ROYALE_STATUS).then((status) => {
      royale = { ...royale, status };
      showRoyale();
    });
  };
  const openRoyale = () => {
    menu.hide();
    royalePre = true;
    royale = { ...royale, name: settings.name.trim(), passphrase: lobby?.kind === 'server' && !lobby.public, joining: null, error: null };
    askRoyale();
  };
  /** Local bots' worker's last word on its ticks, for the scripts that measure it. */
  let localStats: FromLocalRoyale | null = null;
  // `?seed=<n>`: every Local bots match on the same spawns and circles, for measurements that compare.
  const seed = Number(params.get('seed'));
  const startLocal = () =>
    startLocalBots(
      (m) => {
        localStats = m;
        // For the scripts that measure a production build, which has no `duty` hooks.
        document.body.dataset['localBots'] = JSON.stringify(m);
      },
      params.has('seed') && Number.isFinite(seed) ? seed : undefined,
    );
  /** Local bots: the worker starts while the island builds here, then this page joins its lobby as its host. */
  const joinLocalRoyale = async (attempt: number, name: string) => {
    const bots = startLocal();
    const abandon = () => void bots.then((link) => link.stop(), () => undefined);
    await engineReady;
    if (attempt !== joinAttempt) return abandon();
    royale = { ...royale, joining: 1 };
    showRoyale();
    await nextPaint();
    const id = ROYALE_MAP;
    await load(id).bake;
    if (attempt !== joinAttempt) return abandon();
    useMap(id);
    await ready();
    if (attempt !== joinAttempt) return abandon();
    royale = { ...royale, joining: 2 };
    showRoyale();
    let link: Awaited<typeof bots>;
    try {
      link = await bots;
    } catch (error) {
      if (attempt !== joinAttempt) return;
      royale = { ...royale, joining: null, error: `The bots couldn’t start on this machine (${(error as Error).message}). Try again, or play on the server.` };
      return showRoyale();
    }
    if (attempt !== joinAttempt) return link.stop();
    pendingSquads = royale.squads;
    lobbyPage.invite = null;
    const next = new engine!.LocalRoyaleDriver({ server: link.connection, stop: link.stop, solids: load(id).solids, ladders: load(id).map.ladders ?? [], terrain: load(id).map.terrain, name, loadout: settings.loadout });
    driver = next;
    game.setDriver(next);
    game.paused = true;
  };
  const joinRoyale = (name: string, passphrase: string) => {
    const attempt = ++joinAttempt;
    onlineName = name;
    if (name !== settings.name) {
      settings = { ...settings, name };
      saveSettings(settings);
      menu.settings = settings;
    }
    royale = { ...royale, name, joining: 0, error: null };
    showRoyale();
    if (royale.source === 'local') return void joinLocalRoyale(attempt, name);
    void lobbyStatus(ROYALE_STATUS).then(async (status) => {
      if (attempt !== joinAttempt) return;
      if (!status || !royaleServer(status).join) {
        royale = { ...royale, status, joining: null };
        return showRoyale();
      }
      await engineReady;
      if (attempt !== joinAttempt) return;
      // The island is built on this thread: its step shows (and paints) first.
      royale = { ...royale, joining: 1 };
      showRoyale();
      await nextPaint();
      const id = ROYALE_MAP;
      await load(id).bake;
      if (attempt !== joinAttempt) return;
      useMap(id);
      await ready();
      if (attempt !== joinAttempt) return;
      royale = { ...royale, joining: 2 };
      showRoyale();
      // A Battle Royale process still warming up takes its players once it's ready: no sooner, so the socket never waits on it.
      for (let tries = 0; status?.starting === true && tries < 60; tries++) {
        await new Promise((done) => setTimeout(done, 500));
        if (attempt !== joinAttempt) return;
        status = (await lobbyStatus(ROYALE_STATUS)) ?? status;
      }
      pendingSquads = royaleOpens(status) ? royale.squads : null;
      lobbyPage.invite = null;
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const next = new engine!.OnlineDriver({ server: `${scheme}://${location.host}/royale/ws`, solids: load(id).solids, ladders: load(id).map.ladders ?? [], terrain: load(id).map.terrain, name, passphrase, seatKey: SEAT_KEY, loadout: settings.loadout, mode: 'battle-royale' });
      // No pointer lock yet: the lobby comes first, and the match takes the pointer when it starts.
      driver = next;
      game.setDriver(next);
      game.paused = true;
    });
  };
  const royalePage = new RoyalePage(
    document.body,
    {
      source: (source) => {
        if (royaleSession || royale.joining !== null || source === royale.source) return;
        royale = { ...royale, source, error: null };
        askRoyale();
      },
      join: (name, passphrase) => joinRoyale(name, passphrase),
      squads: (size) => {
        if (royaleSession) game.driver?.setLobby({ squads: size });
        else {
          royale = { ...royale, squads: size };
          showRoyale();
        }
      },
      squad: (squad) => game.driver?.setSquad(squad),
      start: () => {
        lobbyJoin = true;
        game.driver?.startMatch();
      },
      enter: () => void joinMatch(),
      refresh: () => askRoyale(),
      loadout: () => menu.loadout('lobby'),
      settings: () => menu.lobbySettings(),
      leave: () => {
        if (game?.driver) return leaveGame();
        joinAttempt++;
        royalePre = false;
        royalePage.hide();
        menu.show('main');
      },
    },
    { image: 'maps/zero-island.jpg' },
  );
  /** The renderer lost its device: the frame loop stops and the error screen stays up. */
  let graphicsLost = false;
  const preparation = new PreparationFlow({
    game: () => game,
    menu,
    sound: () => sound,
    settings: () => settings,
    setLoadout: (loadout) => {
      settings = { ...settings, loadout };
      saveSettings(settings);
      game?.driver?.setLoadout(loadout);
      game?.applySettings(settings);
      menu.settings = settings;
    },
    name: () => onlineName,
    takeOver: () => {
      leaveLobby();
      // Back in a seat held through the Preparation, straight from the screen's join: the Preparation takes over from it.
      if (royalePre) {
        royalePre = false;
        royalePage.hide();
      }
      lobbyJoin = false;
    },
  });
  /** Each frame: what the menu's loadout screen says about the match under way. */
  const updateMenuNotes = () => {
    const driver = game?.driver;
    const match = driver?.online ? driver.match : null;
    menu.loadoutNote = loadoutNote({ online: driver?.online ?? false, mode: match?.mode ?? null, phase: match?.phase ?? null, preparing: (match?.preparation ?? null) !== null });
    menu.matchMode = driver?.match?.mode ?? null;
  };
  /** Bot Match's setup (`BotSetup`). Opening it starts the picked map's lighting downloading, so Start rarely waits. */
  const botSetup = new BotSetup();
  let botLobbyOpen = false;
  const botView = () => botSetup.view(settings.name);
  let settling: ReturnType<typeof setTimeout> | undefined;
  /** The picked map gets ready behind the page once the picks settle, so that Start has nothing left to wait for. */
  const followPick = () => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      whenUp(() => {
        const id = botSetup.mapId;
        void load(id).bake.then(() => {
          if (botLobbyOpen && !game.driver && id === asMapId(botSetup.state.map)) useMap(id);
        });
      });
    }, 350);
  };
  const openBotLobby = () => {
    botSetup.last = null;
    botLobbyOpen = true;
    menu.hide();
    lobbyPage.invite = null;
    lobbyPage.show(botView());
    followPick();
    void routesOf(botSetup.mapId);
  };
  const pickBots = (picks: LobbyPick) => {
    botSetup.pick(picks);
    if (picks.map) {
      followPick();
      void routesOf(botSetup.mapId);
    }
    lobbyPage.show(botView());
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
    if (royaleSession) {
      royaleSession = false;
      royalePage.hide();
    }
    if (!game) return;
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
    driver.setMap(load(id).solids, load(id).map.ladders ?? [], load(id).map.terrain);
    game.setDriver(driver);
    game.paused = paused;
    game.overviewOnly = overviewOnly;
    game.hud.visible = hud;
  };
  /** Each frame: the lobby page up while the server is in its lobby, and until this player is back in the match after it. */
  const updateLobby = () => {
    const driver = game.driver;
    // A Bot Match over: back to its setup as the online lobby comes back after a match, the map flying by behind.
    const { BotMatchDriver, OnlineDriver } = engine!;
    if (driver instanceof BotMatchDriver && driver.over && !botLobbyOpen) {
      const match = driver.match!;
      botSetup.last = { mode: match.mode, result: match.result, teamScores: match.teamScores };
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
    // A Battle Royale's place, kept from its match (a new match clears the last one's).
    if (driver && match && match.phase !== 'lobby' && match.mode === 'battle-royale') {
      if (!royaleMatchOn) royalePlace = null;
      royaleMatchOn = true;
      royalePlace = placement(driver.scores, driver.selfId) ?? royalePlace;
    } else if (match?.phase === 'lobby') royaleMatchOn = false;
    const pageUp = lobbyPage.open || royaleSession;
    // A join from the Battle Royale screen lands in its lobby, or (a late arrival) in a match under way: the screen stays up for either.
    const keep = pageUp || (royalePre && match !== null);
    if (!driver || !match?.lobby || (match.phase !== 'lobby' && !keep)) {
      if (pageUp) leaveLobby();
      return;
    }
    if (!pageUp) {
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
    const loadingName = entry.ready ? null : entry.map.name;
    // The lobby as last heard while the connection comes back: the page says so and holds Start (ticket 38).
    const reconnecting = driver.status === 'reconnecting';
    // A Battle Royale lobby (or its match, before this player is in it) is the Battle Royale screen's; every other lobby is the lobby page's.
    if ((match.phase === 'lobby' ? match.lobby.mode : match.mode) === 'battle-royale') {
      if (lobbyPage.open) lobbyPage.hide();
      royalePre = false;
      royaleSession = true;
      if (pendingSquads !== null && match.phase === 'lobby' && match.lobby.host === driver.selfId) {
        if (match.lobby.squadSize !== pendingSquads) driver.setLobby({ squads: pendingSquads });
        pendingSquads = null;
      }
      const mine = driver.scores.find((s) => s.id === driver.selfId);
      const seated = mine !== undefined;
      // One life: a seat that has died, or whose Squad has a place, is out of this match.
      const out = mine !== undefined && (mine.deaths > 0 || mine.place !== undefined);
      const session: RoyaleSession = { lobby: match.lobby, phase: match.phase, selfId: driver.selfId, names, mode: match.mode, result: match.result, teamScores: match.teamScores, loading: loadingName, seated, out, reconnecting, place: royalePlace };
      royalePage.show({ ...royale, joining: null, error: null, session });
    } else {
      if (royalePage.open) royalePage.hide();
      royalePre = royaleSession = false;
      const view: LobbyView = { lobby: match.lobby, phase: match.phase, selfId: driver.selfId, names, pings: driver.pings, mode: match.mode, result: match.result, teamScores: match.teamScores, loading: loadingName, reconnecting };
      lobbyPage.show(view);
    }
    if (match.phase !== 'lobby' && lobbyJoin && entry.ready) {
      lobbyJoin = false;
      void joinMatch();
    }
  };
  void lobbyDiscovery.then((found) => {
    lobby = found;
    menu.setLobby(found);
    if (invited !== null && found?.kind === 'server' && menu.open && menu.screen === 'main') menu.openOnline();
  });
  // `?explore=<map>`: walk that map alone, offline, as the main menu once offered (for testing and screenshots).
  const explore = asMapId(params.get('explore'));
  const spotName = params.get('spot');
  if (explore || spotName !== null || benching || benchmarkPage) menu.hide();
  // The Play Online tile keeps up with the server while the main menu is open.
  setInterval(() => {
    if (lobby?.kind === 'server' && menu.open && menu.screen === 'main' && !game?.driver) void lobbyStatus().then((s) => menu.updateLobby(s));
  }, 10_000);
  // It waits for the round card to go: at a match's start the card has the screen.
  addEventListener('gamepadconnected', (e) => game?.hud.notice(`Controller connected: ${padName(e.gamepad.id)}`, 4));

  // The engine, a piece at a time: the menus stay live between the pieces.
  await nextPaint();
  engine = await engineLoading;
  // `?soldiers=near|mid|far`: every soldier at one level, to look at it up close.
  const soldiers = params.get('soldiers');
  if (soldiers === 'near' || soldiers === 'mid' || soldiers === 'far') engine.showSoldiersAt(soldiers);
  // `?lod=off`: a large map drawn without its distance detail, to measure what it saves.
  if (params.get('lod') === 'off') engine.useDistanceDetail(false);
  await nextPaint();
  const created = await engine.createRenderer(canvas, { forceWebGL, trackTimestamp: benching || benchmarkPage || renderStats });
  renderer = created.renderer;
  // The GPU device (or the WebGL context) gone: nothing more can be drawn, so the page says so and offers a reload, which takes an online seat back (ticket 61).
  const loseGraphics = renderer.onDeviceLost.bind(renderer);
  renderer.onDeviceLost = (info) => {
    loseGraphics(info);
    graphicsLost = true;
    preparation.page.hide();
    lobbyPage.hide();
    royalePage.hide();
    // Paused first, or giving up the pointer would put the pause menu over the notice.
    if (game) {
      game.paused = true;
      game.input.unlock();
    }
    menu.failed(GRAPHICS_LOST);
  };
  const { backend } = created;
  document.body.dataset['backend'] = backend;
  backendName = backend === 'webgpu' ? 'WebGPU' : 'WebGL 2';
  adapterName = created.hints.adapter;
  // `?hz=<n>`: the display's refresh rate, stated for a scripted browser, whose frames are not paced by one.
  const statedHz = Number(params.get('hz'));
  // A benchmark draws every frame it can: a cap would measure the cap.
  const pacing = (pacer = new FramePacer(benching || benchmarkPage ? 0 : settings.fpsCap, statedHz > 0 ? statedHz : null));
  menu.videoChanged();
  // The line that said "Starting renderer" has done its job. Which backend drew the frame is no news to a player; scripts read it from `body.dataset.backend`.
  status.hidden = true;
  sound = engine.createSoundSystem();
  // For scripted browsers: the last sounds played (the sound system's own log), as `duty.sounds()`.
  Object.assign(globalThis, { duty: { ...((globalThis as { duty?: object }).duty ?? {}), sounds: () => sound.log } });
  await nextPaint();
  engine.reflections(renderer);
  await nextPaint();
  game = createGame(initial);
  wire(game);
  up = true;
  engineUp();
  if (explore) void playOffline(explore);
  // `?spot=<name>`: the camera at one of the map's reference spots, menu and HUD hidden, for repeatable screenshots.
  let fixedCamera = false;
  if (spotName !== null) {
    const spot = load(mapId).map.referenceSpots.find((s) => s.name === spotName);
    if (spot) {
      game.overview = spot;
      fixedCamera = true;
    } else if (menu.screen === 'main') menu.show('main');
  }

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
        /** The frame pacer: the cap, and the display's rate as measured. */
        pacer: pacing,
        get driver() {
          return driver;
        },
        /** Local bots' worker: ticks run and their cost on its thread, every 2 s. */
        get localBots() {
          return localStats;
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
  let bench: BenchFrame | null = benching ? startBenchmarkOn(game, renderer, load(mapId).map, { backend: backendName, adapter: adapterName }) : null;
  let watched: GameDriver | null = null;
  let lastStatus = '';
  let lastMenuFrame = -Infinity;
  // The first moments of a match get ready behind the menu from the start, so that Play has little left to do.
  if (!bench) {
    void routesOf(botSetup.mapId);
    void game
      .prepare(restMoment, breath)
      .then(keepRangeReady)
      .then(() => spare?.prepare());
  }
  if (benchmarkPage) {
    // `&maps=a,b`: only those maps; every map otherwise, the small ones first.
    const asked = (params.get('maps') ?? '').split(',').map((m) => asMapId(m)).filter((m): m is MapId => m !== undefined);
    openBenchmarkPage({
      maps: asked.length ? asked : ['range', 'survival-town', 'switchyard', 'station-nine', 'zero-island'],
      version,
      renderer,
      backend: backendName,
      adapter: adapterName,
      map: (id) => load(id).map,
      nameOf: (id) => (asMapId(id) ? load(asMapId(id)!).map.name : id),
      // The finished look: the map ready, its baked lighting in.
      show: async (id) => {
        useMap(id, true);
        await ready();
        await load(id).bake;
        return game;
      },
      fly: (frame) => (bench = frame),
      // `&run` starts it without the click.
      runNow: params.has('run'),
    });
  }
  if (renderStats) renderer.info.autoReset = false;
  /** Where the window sat on the last frame drawn, and the width of its screen. */
  let atX: number | null = null;
  let atY = 0;
  let screenW = 0;
  await renderer.setAnimationLoop((time) => {
    if (graphicsLost) return;
    if (bench) {
      pacing.tick(time);
      bench(time);
      return;
    }
    // The frame-rate cap: a tick it passes over draws nothing and steps nothing, as on a slower display.
    if (!pacing.tick(time)) return;
    // A window moved, or put on another screen: the display's rate is read again, in case it is a slower one.
    if (screenLeft !== atX || screenTop !== atY || screen.width !== screenW) {
      if (atX !== null) pacing.displayMoved();
      atX = screenLeft;
      atY = screenTop;
      screenW = screen.width;
    }
    updateMenuNotes();
    if (!preparation.update()) updateLobby();
    // The map is only a backdrop while the main menu is open. Limit its GPU
    // work, but keep polling controllers and immediately resume on play.
    const backdrop = (menu.open || lobbyPage.open || royalePage.open) && !fixedCamera;
    const drawBackdrop = !backdrop || time - lastMenuFrame >= 50;
    if (backdrop && drawBackdrop) lastMenuFrame = time;
    // The score: with no game running the menus have their theme; a match's scenes are the game's own.
    if (!game.driver) sound.music.setScene(backdrop ? 'menu' : 'silence');
    // No session needs ticking behind the main menu; with an online session,
    // keep simulation and input running even between backdrop renders.
    if (backdrop && !game.driver && !drawBackdrop) return;
    // Behind the menus (and the lobby), with no game running, the camera flies the map's menu path.
    if ((!game.driver || game.overviewOnly) && !fixedCamera) {
      const path = flyPath(load(mapId).map);
      if (path) game.overview = path.pose(((time / 1000) * FLY_SPEED) % path.length);
    }
    // Drawn first, so the frame on show covers it.
    if (spare?.warming && drawBackdrop && !game.driver) spare.frame(time);
    if (renderStats) renderer.info.reset();
    game.frame(time, drawBackdrop);
    if (renderStats) countFrame(renderer, time);
    // An online session that ended (rejected, kicked, a server gone for good) returns to the join screen.
    const driver = game.driver;
    if (driver !== watched) {
      watched = driver;
      lastStatus = '';
    }
    if (driver?.online && driver.status !== lastStatus) {
      lastStatus = driver.status;
      if (driver.status !== 'playing' && driver.status !== 'connecting' && driver.status !== 'reconnecting') {
        // A Battle Royale join that failed (or its lobby dropping) says so on its own screen, ready to try again.
        const royaleFailed = royalePre || royaleSession;
        leaveLobby();
        game.setDriver(null);
        game.paused = true;
        game.input.unlock();
        if (royaleFailed) {
          menu.hide();
          royalePre = true;
          royale = { ...royale, joining: null, error: connectionError(driver.status).body };
          askRoyale();
        } else menu.failed(driver.status);
      }
    }
  });
}

const counted = { since: 0, frames: 0, draws: 0, triangles: 0, maxDraws: 0, gpuMs: 0, gpuFrames: 0, gpuPending: false };
/**
 * `?stats`: adds up the frame just drawn and, each second, writes the mean draw
 * calls, triangles and GPU time (ms a frame, where the browser measures it) and
 * the renderer's memory to the page.
 */
function countFrame(renderer: WebGPURenderer, time: number): void {
  const { drawCalls, triangles } = renderer.info.render;
  if (drawCalls === 0) return;
  counted.frames++;
  counted.draws += drawCalls;
  counted.triangles += triangles;
  counted.maxDraws = Math.max(counted.maxDraws, drawCalls);
  // Three.js keeps the latest frame's queries per pass, so each resolve reads one frame.
  if (!counted.gpuPending) {
    counted.gpuPending = true;
    void renderer
      .resolveTimestampsAsync('render')
      .then((ms) => {
        if (typeof ms !== 'number' || ms <= 0) return;
        counted.gpuMs += ms;
        counted.gpuFrames++;
      })
      .finally(() => (counted.gpuPending = false));
  }
  if (time - counted.since < 1000) return;
  const { geometries, textures } = renderer.info.memory;
  const gpu = counted.gpuFrames > 0 ? Math.round((counted.gpuMs / counted.gpuFrames) * 1000) / 1000 : null;
  document.body.dataset['render'] = JSON.stringify({ frames: counted.frames, draws: Math.round(counted.draws / counted.frames), maxDraws: counted.maxDraws, triangles: Math.round(counted.triangles / counted.frames), gpu, geometries, textures });
  Object.assign(counted, { since: time, frames: 0, draws: 0, triangles: 0, maxDraws: 0, gpuMs: 0, gpuFrames: 0 });
}

/** How long (ms) without input counts as the player resting. */
const REST_MS = 1200;
/** How long (ms) after a press background work holds off. */
const BREATH_MS = 300;

/** After the next paint, or in a moment on a hidden tab, which paints nothing. */
function nextPaint(): Promise<void> {
  return new Promise((done) => {
    requestAnimationFrame(() => setTimeout(done));
    setTimeout(done, 100);
  });
}

/** A map's name from its id; an id the app doesn't ship (a newer server's) shows as itself. */
function mapName(id: string): string {
  return mapEntry(id)?.name ?? id;
}
/** The map a Battle Royale plays on. */
const ROYALE_MAP: MapId = 'zero-island';

/** The main menu's camera: metres per second along the map's fly-through. */
const FLY_SPEED = 4;
const flyPaths = new Map<MapDefinition, CameraPath | null>();
function flyPath(map: MapDefinition): CameraPath | null {
  if (!flyPaths.has(map)) flyPaths.set(map, map.flyThrough.length >= 2 ? new CameraPath(map.flyThrough) : null);
  return flyPaths.get(map)!;
}

// Last, so the constants above are set before the menus can take a click.
if (params.has('viewer')) {
  // The dev viewmodel viewer: every animation on a loop.
  const { startViewer } = await import('./viewer');
  await startViewer(canvas, status, params.has('webgl'));
} else {
  await startGame(canvas, status, params.has('webgl'));
}
