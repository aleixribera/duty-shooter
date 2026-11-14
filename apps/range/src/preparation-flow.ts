import { PreparationPage, gunOpen, gunsmithRows, preparationChampion, type Menu, type PreparationView, type Settings } from '@duty-shooter/fps-client/ui';
import { WEAPON_IDS, royaleLoadout, type AttachmentId, type AttachmentSlot, type WeaponId } from '@duty-shooter/fps-core';
import type { Game, SoundSystem } from '@duty-shooter/fps-client';
import { LoadReport } from './load-report';

/** What the Preparation needs from the page around it. */
export interface PreparationHost {
  /** The game on show. */
  game(): Game;
  readonly menu: Menu;
  sound(): SoundSystem;
  settings(): Settings;
  /** The player picked a loadout on the Preparation's page. */
  setLoadout(loadout: Settings['loadout']): void;
  /** The player fitted an attachment (null: stock) to a gun on the Preparation's page. */
  setBuild(gun: WeaponId, slot: AttachmentSlot, choice: AttachmentId | null): void;
  /** Kills made with a gun, which open its attachment slots. */
  kills(gun: WeaponId): number;
  /** This Profile's XP, which opens guns (PLAN item 7). */
  xp(): number;
  /** The loadout the match takes: a gun not yet opened swapped for a starting one, with its build. */
  matchLoadout(): Settings['loadout'];
  /** The name this player joined under, for their own seat. */
  name(): string;
  /** The Preparation takes the screen: the lobby and Battle Royale pages go, and a Start click's wait for the match is over. */
  takeOver(): void;
}

/**
 * A Battle Royale's Preparation, in the game over the live island: the page
 * for the start it was opened for, whether this player pressed Ready, and
 * the last view shown (kept for the Play card once the drop is over). It
 * also tells the server once this page has the island up (the load gate).
 */
export class PreparationFlow {
  readonly page: PreparationPage;
  readonly #host: PreparationHost;
  readonly #loadReport = new LoadReport();
  #up = false;
  #for: number | null = null;
  #ready = false;
  #view: PreparationView | null = null;

  constructor(host: PreparationHost) {
    this.#host = host;
    this.page = new PreparationPage(document.body, {
      loadout: (loadout) => host.setLoadout(loadout),
      build: (gun, slot, choice) => host.setBuild(gun, slot, choice),
      // Ready is a press, so it can take the pointer (or the controller) for the drop.
      ready: () => {
        const game = host.game();
        this.#ready = true;
        game.driver?.ready();
        void host.sound().unlock();
        if (!game.input.padMode && !game.input.locked) void game.input.lock();
      },
      play: () => {
        const game = host.game();
        void host.sound().unlock();
        if (!game.input.padMode) void game.input.lock();
      },
    });
    // Esc in the Preparation opens the menu (where Leave is); its Resume takes the pointer like Ready's press.
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.defaultPrevented || !this.page.open || host.menu.open) return;
      e.preventDefault();
      host.menu.show('pause');
    });
  }

  /** The gunsmith rows of the two guns the Preparation shows picked. */
  #smith(): NonNullable<PreparationView['smith']> {
    const { builds } = this.#host.settings();
    const loadout = this.#host.matchLoadout();
    const picked = royaleLoadout(loadout);
    const rows = (id: WeaponId, own: boolean) => gunsmithRows(id, own ? builds[id] : undefined, this.#host.kills(id));
    // A saved sniper plays as a stock M4A1 here, until something is fitted to it.
    return { primary: rows(picked.primary, picked.primary === loadout.primary), secondary: rows(picked.secondary, true) };
  }

  /** Each frame: the Preparation up while this seated player's Battle Royale opens, and until they take control. True while it is up. */
  update(): boolean {
    const { menu } = this.#host;
    const game = this.#host.game();
    const driver = game.driver;
    const match = driver?.online ? driver.match : null;
    const mine = driver?.scores.find((s) => s.id === driver.selfId);
    const seated = mine !== undefined && mine.deaths === 0 && mine.place === undefined;
    const playing = match?.phase === 'playing' && match.mode === 'battle-royale' && seated;
    const time = playing ? game.preparation : null;
    const prep = match?.preparation ?? null;
    // This page has the island up: the load gate counts it in, or hands its seat back if the Preparation ended without it.
    if (driver && this.#loadReport.due({ seated: playing, preparation: prep?.start ?? null })) driver.loaded();
    if (driver && match && mine && time && prep) {
      if (this.#for !== prep.start) {
        this.#for = prep.start;
        this.#ready = false;
      }
      if (!this.#up) {
        this.#up = true;
        this.#host.takeOver();
        if (menu.open && menu.screen === 'pause') menu.hide();
        game.paused = true;
        game.overviewOnly = false;
      }
      game.hud.visible = false;
      const team = mine.team;
      const squad = driver.scores
        .filter((s) => s.team === team)
        .map((s) => ({ name: s.id === driver.selfId ? this.#host.name() : s.name, you: s.id === driver.selfId, bot: s.bot === true, ready: prep.ready.includes(s.id) }));
      const state = match.objective?.kind === 'battle-royale' ? match.objective : null;
      this.#view = {
        ...time,
        alive: state?.alive ?? driver.scores.length,
        squads: state?.squads ?? 0,
        squad,
        loadout: this.#host.matchLoadout(),
        open: WEAPON_IDS.filter((id) => gunOpen(id, this.#host.xp())),
        smith: this.#smith(),
        ready: this.#ready || prep.ready.includes(driver.selfId ?? ''),
        readyCount: prep.ready.length,
        people: prep.people,
        loading: prep.loading,
        play: false,
        champion: preparationChampion(state?.champion, team ?? null),
      };
      this.page.show(this.#view);
      return true;
    }
    if (this.#up && playing && this.#view && !game.input.locked) {
      // The drop is over and the pointer isn't this page's yet: one click takes it.
      game.hud.visible = false;
      this.page.show({ ...this.#view, stage: 'dive', left: 0, play: true });
      return true;
    }
    if (this.#up) {
      this.#up = false;
      this.#view = null;
      this.page.hide();
      if (playing) {
        if (menu.open && menu.screen === 'pause') menu.hide();
        game.paused = false;
        game.hud.visible = true;
      }
    }
    return false;
  }
}
