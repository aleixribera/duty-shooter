import type { PlayerId, Vec3 } from '@duty-shooter/fps-core';

/**
 * The death recap and the match card (ticket 73): who put you Downed or out
 * and how that fight went, and at the end of a Battle Royale your own match
 * on one card. Everything comes from the events the server already sends a
 * seat (its own hits both ways, its Downs, outs, Revives and Reboots, and the
 * shots it hears), kept in the page for one match and dropped at the next.
 */

/** What happened to you, as the recap's headline says it. */
export type RecapWhat = 'downed' | 'finished' | 'eliminated' | 'bledOut' | 'squadOut' | 'ring' | 'fall';

export interface Recap {
  readonly what: RecapWhat;
  /** What did it ("bullet", "ring", "fall", "bleedOut"...). */
  readonly cause: string;
  /** Who did it (for a Bleed-out or a Squad out, whoever put you Downed); null for the Ring or a fall with nobody behind it. */
  readonly attacker: PlayerId | null;
  readonly name: string | null;
  readonly bot: boolean;
  /** The weapon, by name ("Frag", "Melee"), or null when nobody's weapon did it. */
  readonly weapon: string | null;
  /** How far they were (m) when their last hit on you landed, or null without one. */
  readonly distance: number | null;
  /** Damage you dealt them and they dealt you this match. */
  readonly dealt: number;
  readonly taken: number;
  /** Their health when it happened, or null when they were too far to be sent. */
  readonly health: number | null;
  /** Where they stood (their last shot heard, or where they were seen), or null. */
  readonly at: readonly [number, number] | null;
}

/** A place on the card's map. */
export interface CardMark {
  readonly x: number;
  readonly z: number;
}

/** Your match on one card. */
export interface MatchCard {
  readonly place: number | null;
  readonly of: number | null;
  readonly eliminations: number;
  readonly downs: number;
  readonly revives: number;
  readonly reboots: number;
  readonly damage: number;
  /** Seconds on your feet or Downed, from the drop. */
  readonly alive: number;
  /** Where you went, sampled every {@link ROUTE_EVERY} s while in the fight; a null starts a new leg (a Reboot's flight back). */
  readonly route: readonly (CardMark | null)[];
  /** Where you fought: one mark a fight. */
  readonly fights: readonly CardMark[];
  /** Where you went Downed or out. */
  readonly fell: readonly (CardMark & { readonly out: boolean })[];
}

/** Seconds between the route's points. */
export const ROUTE_EVERY = 2;
/** Hits within this far (m) and this long (s) of a fight's last are the same fight. */
export const FIGHT_SPAN = { metres: 35, seconds: 20 } as const;
/** A route point no nearer than this to the last (m) is kept; standing still adds nothing. */
const ROUTE_STEP = 3;
/** The route never holds more points than this: a match is about 10 minutes. */
const ROUTE_MAX = 600;

interface Exchange {
  dealt: number;
  taken: number;
  /** How far they were at their last hit on you. */
  distance: number | null;
}

/** The names and states the log looks up while it records. */
export interface RecapLookup {
  readonly nameOf: (id: PlayerId) => string;
  readonly isBot: (id: PlayerId) => boolean;
  /** A seat as this client last had it (health and feet), or null when it isn't sent. */
  readonly seat: (id: PlayerId) => { readonly health: number; readonly position: Vec3 } | null;
  /** A weapon's display name. */
  readonly weaponName: (cause: string, weapon: string | null) => string | null;
}

export class MatchLog {
  #self: PlayerId | null = null;
  readonly #exchanges = new Map<PlayerId, Exchange>();
  /** Each attacker's last known place: the eye of its last shot heard. */
  readonly #heardAt = new Map<PlayerId, readonly [number, number]>();
  #recap: Recap | null = null;
  #downs = 0;
  #revives = 0;
  #reboots = 0;
  #damage = 0;
  #alive = 0;
  #route: (CardMark | null)[] = [];
  #sinceRoute = Infinity;
  #fights: { x: number; z: number; t: number }[] = [];
  #fell: (CardMark & { out: boolean })[] = [];
  #gap = false;

  /** A new match: everything from the last one goes. */
  reset(self: PlayerId | null): void {
    this.#self = self;
    this.#exchanges.clear();
    this.#heardAt.clear();
    this.#recap = null;
    this.#downs = this.#revives = this.#reboots = this.#damage = 0;
    this.#alive = 0;
    this.#route = [];
    this.#sinceRoute = Infinity;
    this.#fights = [];
    this.#fell = [];
    this.#gap = false;
  }

  set self(id: PlayerId | null) {
    this.#self = id;
  }

  /** The recap of what last put you Downed or out, or null while nothing has. */
  get recap(): Recap | null {
    return this.#recap;
  }

  /** Back on your feet (a Revive or a Reboot): the recap goes. */
  clearRecap(): void {
    this.#recap = null;
  }

  /** A shot heard: where its shooter stands. */
  shot(shooter: PlayerId, origin: Vec3): void {
    if (shooter !== this.#self) this.#heardAt.set(shooter, [origin[0], origin[2]]);
  }

  /** A hit on or by you: the tally both ways, your damage, and a fight where you stand. */
  hit(e: { readonly shooter: PlayerId; readonly victim: PlayerId; readonly damage: number; readonly distance: number }, time: number, here: Vec3 | null): void {
    const self = this.#self;
    if (self === null || e.shooter === e.victim) return;
    if (e.shooter === self) {
      this.#damage += e.damage;
      this.#exchange(e.victim).dealt += e.damage;
    } else if (e.victim === self) {
      const x = this.#exchange(e.shooter);
      x.taken += e.damage;
      x.distance = e.distance;
    } else return;
    if (here) this.#fight(here[0], here[2], time);
  }

  /** A seat went Downed: one of your Downs, or you, Downed. */
  down(e: { readonly attacker: PlayerId | null; readonly victim: PlayerId; readonly cause: string; readonly weapon: string | null }, lookup: RecapLookup, here: Vec3 | null): void {
    if (e.attacker === this.#self && e.victim !== this.#self) this.#downs += 1;
    if (e.victim !== this.#self) return;
    if (here) this.#fell.push({ x: here[0], z: here[2], out: false });
    this.#recap = this.#make('downed', e.attacker, e.cause, e.weapon, lookup);
  }

  /** A seat went out: you, put out (Finished, Bled out, the Ring...). */
  kill(e: { readonly killer: PlayerId | null; readonly victim: PlayerId; readonly cause: string; readonly weapon: string | null }, lookup: RecapLookup, here: Vec3 | null): void {
    if (e.victim !== this.#self) return;
    if (here) this.#fell.push({ x: here[0], z: here[2], out: true });
    const before = this.#recap;
    if (e.cause === 'bleedOut' || e.cause === 'wipe') {
      // Out while Downed with nobody finishing: the one who put you Downed did it.
      const what = e.cause === 'bleedOut' ? 'bledOut' : 'squadOut';
      this.#recap = before ? { ...before, what } : this.#make(what, e.killer, e.cause, e.weapon, lookup);
      return;
    }
    if (e.killer === null || e.killer === this.#self) {
      this.#recap = { ...this.#make(e.cause === 'ring' ? 'ring' : 'fall', null, e.cause, null, lookup) };
      return;
    }
    this.#recap = this.#make(before?.what === 'downed' ? 'finished' : 'eliminated', e.killer, e.cause, e.weapon, lookup);
  }

  /** A Revive finished: one of yours, or you back up. */
  revive(e: { readonly reviver: PlayerId; readonly target: PlayerId }): void {
    if (e.reviver === this.#self && e.target !== this.#self) this.#revives += 1;
    if (e.target === this.#self) this.#recap = null;
  }

  /** A Reboot finished: your squadmates back, or you. */
  reboot(e: { readonly player: PlayerId; readonly seats: readonly PlayerId[] }): void {
    if (e.player === this.#self) this.#reboots += e.seats.length;
    if (this.#self !== null && e.seats.includes(this.#self)) {
      this.#recap = null;
      this.#gap = true;
    }
  }

  /** A frame in the fight: time alive, and the route. */
  sample(dt: number, here: Vec3 | null): void {
    if (!here) return;
    this.#alive += dt;
    this.#sinceRoute += dt;
    if (this.#sinceRoute < ROUTE_EVERY) return;
    this.#sinceRoute = 0;
    const last = this.#lastPoint();
    if (last && !this.#gap && Math.hypot(last.x - here[0], last.z - here[2]) < ROUTE_STEP) return;
    if (this.#route.length >= ROUTE_MAX) return;
    if (this.#gap && this.#route.length > 0) this.#route.push(null);
    this.#gap = false;
    this.#route.push({ x: here[0], z: here[2] });
  }

  /** The card, with your place and eliminations from the scoreboard. */
  card(place: { readonly place: number; readonly of: number } | null, eliminations: number): MatchCard {
    return {
      place: place?.place ?? null,
      of: place?.of ?? null,
      eliminations,
      downs: this.#downs,
      revives: this.#revives,
      reboots: this.#reboots,
      damage: Math.round(this.#damage),
      alive: this.#alive,
      route: [...this.#route],
      fights: this.#fights.map(({ x, z }) => ({ x, z })),
      fell: [...this.#fell],
    };
  }

  #lastPoint(): CardMark | null {
    for (let i = this.#route.length - 1; i >= 0; i--) {
      const p = this.#route[i];
      if (p) return p;
    }
    return null;
  }

  #exchange(id: PlayerId): Exchange {
    let x = this.#exchanges.get(id);
    if (!x) this.#exchanges.set(id, (x = { dealt: 0, taken: 0, distance: null }));
    return x;
  }

  #fight(x: number, z: number, t: number): void {
    const last = this.#fights[this.#fights.length - 1];
    if (last && t - last.t <= FIGHT_SPAN.seconds && Math.hypot(last.x - x, last.z - z) <= FIGHT_SPAN.metres) {
      last.t = t;
      return;
    }
    this.#fights.push({ x, z, t });
  }

  #make(what: RecapWhat, attacker: PlayerId | null, cause: string, weapon: string | null, lookup: RecapLookup): Recap {
    const x = attacker === null || attacker === this.#self ? null : (this.#exchanges.get(attacker) ?? null);
    const seat = attacker === null || attacker === this.#self ? null : lookup.seat(attacker);
    const heard = attacker === null ? undefined : this.#heardAt.get(attacker);
    const someone = attacker !== null && attacker !== this.#self;
    return {
      what,
      cause,
      attacker: someone ? attacker : null,
      name: someone ? lookup.nameOf(attacker) : null,
      bot: someone ? lookup.isBot(attacker) : false,
      weapon: someone ? lookup.weaponName(cause, weapon) : null,
      distance: x?.distance ?? null,
      dealt: Math.round(x?.dealt ?? 0),
      taken: Math.round(x?.taken ?? 0),
      health: seat ? Math.max(0, Math.round(seat.health)) : null,
      at: seat ? [seat.position[0], seat.position[2]] : (heard ?? null),
    };
  }
}

/** The recap's headline. */
export function recapHeadline(r: Recap): string {
  switch (r.what) {
    case 'downed':
      return r.name ? 'Downed by' : r.cause === 'ring' ? 'Downed by the Ring' : r.cause === 'fall' ? 'Downed in a fall' : 'Downed';
    case 'finished':
      return 'Finished by';
    case 'eliminated':
      return 'Eliminated by';
    case 'bledOut':
      return r.name ? 'Bled out · Downed by' : 'Bled out';
    case 'squadOut':
      return r.name ? 'Squad out · Downed by' : 'Squad out';
    case 'ring':
      return 'Out to the Ring';
    case 'fall':
      return 'Out in a fall';
  }
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The recap as HTML (its CSS is {@link RECAP_CSS}): who, with what and from how far, the damage both ways, and their health. */
export function recapHtml(r: Recap): string {
  const head = `<div class="h">${recapHeadline(r)}</div>`;
  if (!r.name) return `<div class="ds-recap-in">${head}</div>`;
  const facts = [r.weapon, r.distance === null ? null : `${Math.round(r.distance)} m`].filter(Boolean).join(' · ');
  const cell = (label: string, value: string, cls = '') => `<div class="${cls}"><span>${label}</span><b>${value}</b></div>`;
  return (
    `<div class="ds-recap-in">${head}` +
    `<div class="who"><b>${esc(r.name)}</b>${r.bot ? '<em>Bot</em>' : ''}</div>` +
    (facts ? `<div class="fact">${esc(facts)}</div>` : '') +
    `<div class="nums">${cell('You dealt', String(r.dealt))}${cell('They dealt', String(r.taken))}${cell('Their health', r.health === null ? '–' : String(r.health), r.health !== null && r.health <= 30 ? 'low' : '')}</div>` +
    `</div>`
  );
}

export const RECAP_CSS = `
.ds-recap-in { display: flex; flex-direction: column; gap: 4px; font-variant-numeric: tabular-nums; }
.ds-recap-in .h { font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ds-alert); }
.ds-recap-in .who { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.ds-recap-in .who b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.ds-recap-in .who em { flex: none; font-style: normal; font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; padding: 2px 5px 1px; border: 1px solid var(--ds-line-2); color: var(--ds-text-2); }
.ds-recap-in .fact { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-recap-in .nums { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; margin-top: 4px; }
.ds-recap-in .nums > div { display: flex; flex-direction: column; padding: 0 14px; border-left: 1px solid var(--ds-line-2); }
.ds-recap-in .nums > div:first-child { padding-left: 0; border-left: 0; }
.ds-recap-in .nums span { font-size: 11px; color: var(--ds-text-2); white-space: nowrap; }
.ds-recap-in .nums b { font-size: 20px; line-height: 1.1; }
.ds-recap-in .nums .low b { color: var(--ds-alert); }
`;

/** Seconds as "m:ss". */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
