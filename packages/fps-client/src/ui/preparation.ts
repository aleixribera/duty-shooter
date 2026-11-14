import { DROP_WEAPON, royaleLoadout, STATS, type AttachmentId, type DropHolds, type AttachmentSlot, type GrenadeId, type Loadout, type RoyaleChampion, type TeamId, type WeaponId } from '@duty-shooter/fps-core';
import { nameList } from '@duty-shooter/fps-core/modes';
import type { PadNav } from '../gamepad';
import type { PreparationStage } from '../preparation-shot';
import type { GunsmithSlot } from './gunsmith';
import { loadoutOptions } from './model';
import { escapeHtml, hint, installTheme, patchHtml } from './theme';

/**
 * A Battle Royale's Preparation over the live island: the clock to the drop,
 * the count alive, your Squad, the loadout picker and Ready. The 3D world is
 * the picture (the game moves the camera); this is the title card laid over
 * it, heavy on the left where the controls are and clear on the right, where
 * the island, then your Squad, then the dive are.
 */

export interface PreparationMate {
  readonly name: string;
  readonly you: boolean;
  readonly bot: boolean;
  readonly ready: boolean;
}

export interface PreparationView {
  readonly stage: PreparationStage;
  /** Seconds since it began and until the drop (the match's start). */
  readonly elapsed: number;
  readonly left: number;
  readonly alive: number;
  readonly squads: number;
  readonly squad: readonly PreparationMate[];
  readonly loadout: Loadout;
  /** You pressed Ready; how many people are, of how many; pages still loading. */
  readonly ready: boolean;
  readonly readyCount: number;
  readonly people: number;
  readonly loading: number;
  /** The drop is over and the match waits on this page to take control (a click, for the pointer). */
  readonly play: boolean;
  /** The champion Squad, introduced at the dive (ticket 69); absent or null when there is none. */
  readonly champion?: PreparationChampion | null;
  /** The gunsmith of the two guns picked (Aleix, 2026-11-13: attachments in a Battle Royale come from the loadout, not loot). */
  readonly smith?: { readonly primary: readonly GunsmithSlot[]; readonly secondary: readonly GunsmithSlot[] };
  /** The guns this Profile has opened (PLAN item 7); absent, all of them. */
  readonly open?: readonly WeaponId[];
  /** What the match's Supply Drops hold; absent, the sniper (the loot rules). */
  readonly holds?: DropHolds;
}

/** The champion Squad as the dive introduces it. */
export interface PreparationChampion {
  readonly title: string;
  readonly names: string;
  readonly why: string;
}

/** How the dive introduces `champion` to a seat of Squad `team`; null with none. */
export function preparationChampion(champion: RoyaleChampion | undefined, team: TeamId | null): PreparationChampion | null {
  if (!champion) return null;
  return {
    title: champion.team === team ? 'Your Squad: champions' : 'Champion Squad',
    names: nameList(champion.names),
    why: champion.why === 'won' ? 'Won the last match' : `Last match's Kill Leader, ${champion.kills ?? 0} eliminations`,
  };
}

export interface PreparationCallbacks {
  loadout(loadout: Loadout): void;
  /** An attachment (null: stock) into `slot` of gun `gun`, as the loadout screen's gunsmith fits it. */
  build(gun: WeaponId, slot: AttachmentSlot, choice: AttachmentId | null): void;
  ready(): void;
  play(): void;
}

/** The one action, named for what it does now, whether it can be pressed, and the line under it. */
export function preparationAction(v: PreparationView): { readonly label: string; readonly enabled: boolean; readonly note: string } {
  if (v.play) return { label: 'Play', enabled: true, note: 'Click to take control' };
  if (v.stage === 'dive') return { label: 'Dropping', enabled: false, note: 'Loadout locked' };
  const waiting = v.people - v.readyCount;
  if (v.ready && v.loading > 0) return { label: 'Ready', enabled: false, note: `Waiting for ${v.loading} ${v.loading === 1 ? 'player' : 'players'} to load` };
  if (v.ready) return { label: 'Ready', enabled: false, note: waiting > 0 ? `Waiting for ${waiting} more, or the clock` : 'Everyone is ready' };
  return { label: 'Ready', enabled: true, note: v.people > 1 ? `${v.readyCount} of ${v.people} ready. At 0 you drop with what is picked.` : 'At 0 you drop with what is picked.' };
}

/** The clock as it reads: whole seconds, counting down. */
export const preparationClock = (left: number): string => String(Math.max(0, Math.ceil(left - 1e-6)));

const CSS = `
.ds-prep { position: fixed; inset: 0; z-index: 17; font: 400 var(--ds-type-body)/1.4 var(--ds-font); color: var(--ds-text); }
.ds-prep[hidden] { display: none; }
.ds-menu:not([hidden]) ~ .ds-prep { visibility: hidden; }
/* Dark first: the island comes up out of black (the one screen fade the design allows). */
.ds-prep .veil { position: absolute; inset: 0; background: #000; pointer-events: none; animation: ds-prep-veil 1400ms var(--ds-ease) both; }
@keyframes ds-prep-veil { from { opacity: 1; } to { opacity: 0; } }
.ds-prep .card { position: absolute; left: 0; top: 0; bottom: 0; width: min(640px, 52vw); display: flex; flex-direction: column; gap: 22px; padding: 40px var(--ds-gutter) 32px;
  background: linear-gradient(90deg, rgb(7 9 13 / 0.94) 0%, rgb(7 9 13 / 0.84) 68%, rgb(7 9 13 / 0) 100%); overflow-y: auto; scrollbar-width: none; }
.ds-prep .card > * { max-width: 470px; }
.ds-prep h1 { font-family: var(--ds-font-display); margin: 0; font-size: var(--ds-type-title); line-height: 0.92; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; }
.ds-prep .clock { display: flex; align-items: baseline; gap: 14px; margin-bottom: 10px; }
.ds-prep .clock b { font-family: var(--ds-font-display); font-size: calc(var(--ds-type-display) * 1.6); line-height: 0.85; font-weight: 700; letter-spacing: 0.01em; min-width: 2ch; }
.ds-prep .clock span { font-size: var(--ds-type-small); letter-spacing: 0.16em; text-transform: uppercase; color: var(--ds-text-2); }
.ds-prep .bar { height: 3px; background: var(--ds-line-2); }
.ds-prep .bar i { display: block; height: 100%; background: var(--ds-text); transform-origin: 0 50%; }
.ds-prep .ds-field-label { margin-bottom: 6px; color: var(--ds-text-2); }
.ds-prep .kit { display: grid; gap: 14px; }
.ds-prep .kit .drop-note { margin-top: -8px; font-size: var(--ds-type-small); color: var(--ds-text-2); }
/* A gun's attachments under it: a short row a slot that is open, and the next one still shut in a line. */
.ds-prep .smith { display: grid; gap: 6px; margin-top: -6px; }
.ds-prep .smith-row { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: 10px; }
.ds-prep .smith-row > span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-prep .smith .ds-seg button { min-height: 36px; font-size: var(--ds-type-small); }
.ds-prep .smith .shut { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-prep .ds-seg button { min-height: 44px; font-size: var(--ds-type-body); }
/* At body size the longest gun name (Ridgeline) needs more than the theme's 84 px a tile. */
.ds-prep .ds-seg { grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); }
.ds-prep .smith .ds-seg { grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); }
.ds-prep .ds-seg button:disabled:not(.on) { color: var(--ds-text-3); }
.ds-prep .mates { display: grid; gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); }
.ds-prep .mate { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; padding: 9px 14px; background: rgb(18 22 29 / 0.92); }
.ds-prep .mate b { min-width: 0; font-size: var(--ds-type-body); font-weight: 700; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ds-prep .mate span { flex: none; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-prep .mate.you { box-shadow: inset 0 0 0 1px var(--ds-text-2); }
.ds-prep .mate.on span { color: var(--ds-text); }
.ds-prep .go { margin-top: auto; display: grid; gap: 10px; }
.ds-prep .go .ds-btn { width: 100%; max-width: 470px; }
.ds-prep .go .note { font-size: var(--ds-type-small); color: var(--ds-text-2); }
/* The field, held on screen at the top right over the world. */
.ds-prep .alive { position: absolute; right: var(--ds-gutter); top: 36px; display: flex; flex-direction: column; align-items: flex-end; text-shadow: 0 1px 2px rgb(0 0 0 / 0.9), 0 2px 16px rgb(0 0 0 / 0.8); }
/* A pale sky behind it: a soft shade keeps the small lines readable. */
.ds-prep .alive::before { content: ''; position: absolute; inset: -40px -40px -30px -90px; z-index: -1; background: radial-gradient(closest-side, rgb(7 9 13 / 0.55), rgb(7 9 13 / 0)); pointer-events: none; }
.ds-prep .alive b { font-family: var(--ds-font-display); font-size: calc(var(--ds-type-display) * 1.6); line-height: 0.85; font-weight: 700; }
.ds-prep .alive span { margin-top: 6px; font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
.ds-prep .alive small { margin-top: 2px; font-size: var(--ds-type-small); color: var(--ds-text); letter-spacing: 0.04em; }
.ds-prep.dive .card { background: linear-gradient(90deg, rgb(7 9 13 / 0.7) 0%, rgb(7 9 13 / 0) 100%); }
.ds-prep.dive .kit, .ds-prep.dive .squad { display: none; }
/* At the dive, under the field: the Squad to beat. */
.ds-prep .champ { margin-top: 26px; display: flex; flex-direction: column; align-items: flex-end; text-align: right; animation: ds-in 300ms var(--ds-ease) both; }
.ds-prep .champ span { font-size: var(--ds-type-small); font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ds-light); }
.ds-prep .champ b { font-family: var(--ds-font-display); margin-top: 4px; max-width: min(420px, 60vw); font-size: var(--ds-type-heading); line-height: 1.05; font-weight: 700; letter-spacing: 0.02em; }
.ds-prep .champ small { margin-top: 4px; font-size: var(--ds-type-small); color: var(--ds-text); letter-spacing: 0.04em; }
@media (max-width: 760px) {
  .ds-prep .card { top: auto; width: 100%; max-height: 76vh; gap: 14px; padding: 48px var(--ds-gutter) 18px; background: linear-gradient(0deg, rgb(7 9 13 / 0.96) 0%, rgb(7 9 13 / 0.9) 84%, rgb(7 9 13 / 0) 100%); }
  .ds-prep .card > * { max-width: none; }
  .ds-prep h1 { font-size: var(--ds-type-title); }
  .ds-prep .clock b, .ds-prep .alive b { font-size: var(--ds-type-display); }
  .ds-prep .alive { top: 18px; }
  .ds-prep .champ { margin-top: 14px; }
  .ds-prep .champ b { font-size: var(--ds-type-heading); }
  .ds-prep .ds-seg button { font-size: var(--ds-type-small); letter-spacing: 0.08em; }
  .ds-prep .smith-row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .ds-prep .mates { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
  .ds-prep .mate { flex-direction: column; gap: 0; padding: 6px 10px; }
  .ds-prep .mate b { font-size: var(--ds-type-body); max-width: 100%; }
  .ds-prep .ds-hints { display: none; }
}
@media (prefers-reduced-motion: reduce) { .ds-prep .veil { animation-duration: 1ms; } }
`;

const weaponName = (id: WeaponId) => STATS.weapons[id].traits.name;

/**
 * The Preparation's primaries and what is lit. Under the loot rules the sniper
 * isn't a pick in a Battle Royale (it comes only from a Supply Drop), and a
 * saved pick of it starts with the M4A1; on loadouts (`holds` is `resupply`)
 * it is a pick like any opened gun.
 */
export function preparationKit(loadout: Loadout, open?: readonly WeaponId[], holds: DropHolds = 'sniper'): { readonly primaries: readonly WeaponId[]; readonly secondaries: readonly WeaponId[]; readonly picked: Loadout } {
  const opened = (w: WeaponId) => !open || open.includes(w);
  const options = loadoutOptions();
  const loot = holds === 'sniper';
  return { primaries: options.primary.filter((w) => (!loot || w !== DROP_WEAPON) && opened(w)), secondaries: options.secondary.filter(opened), picked: royaleLoadout(loadout, holds) };
}

export class PreparationPage {
  readonly #root: HTMLDivElement;
  readonly #body: HTMLDivElement;
  readonly #callbacks: PreparationCallbacks;
  #view: PreparationView | null = null;
  #html = '';

  constructor(parent: HTMLElement, callbacks: PreparationCallbacks) {
    installTheme();
    if (!document.getElementById('ds-prep-css')) {
      const style = document.createElement('style');
      style.id = 'ds-prep-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#callbacks = callbacks;
    this.#root = document.createElement('div');
    this.#root.className = 'ds-prep ds-ui';
    this.#root.hidden = true;
    this.#body = document.createElement('div');
    this.#root.append(this.#body);
    this.#root.addEventListener('click', (e) => this.#click(e));
    this.#root.addEventListener('pointermove', () => this.#root.classList.remove('pad'));
    document.addEventListener('keydown', (e) => this.#key(e));
    parent.append(this.#root);
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  /** Shows the Preparation as `view` has it (cheap to call every frame). */
  show(view: PreparationView): void {
    const opening = this.#root.hidden;
    this.#view = view;
    if (opening) {
      // From black, each time a Preparation opens.
      this.#root.querySelector('.veil')?.remove();
      const veil = document.createElement('div');
      veil.className = 'veil';
      this.#root.append(veil);
      this.#root.hidden = false;
    }
    this.#root.classList.toggle('dive', view.stage === 'dive' && !view.play);
    const html = this.#render(view);
    if (html !== this.#html) {
      this.#html = html;
      const focused = this.#root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset['key'] : undefined;
      patchHtml(this.#body, html);
      if (focused && document.activeElement?.getAttribute('data-key') !== focused) this.#root.querySelector<HTMLElement>(`[data-key="${focused}"]`)?.focus({ preventScroll: true });
    }
    if (opening || (view.play && !this.#root.contains(document.activeElement))) this.#root.querySelector<HTMLElement>('[data-key="go"]:not(:disabled)')?.focus({ preventScroll: true });
    this.#markFocus();
  }

  hide(): void {
    this.#root.hidden = true;
    this.#view = null;
  }

  /** Controller navigation: through the picks and Ready; accept presses. */
  navigate(nav: PadNav): void {
    if (!this.open) return;
    this.#root.classList.add('pad');
    const items = [...this.#root.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (nav === 'accept') items[i]?.click();
    else if (nav === 'up' || nav === 'left') items[i <= 0 ? items.length - 1 : i - 1]?.focus();
    else if (nav === 'down' || nav === 'right') items[i < 0 ? 0 : (i + 1) % items.length]?.focus();
    this.#markFocus();
  }

  #markFocus(): void {
    for (const e of this.#root.querySelectorAll('[data-pad-focus]')) e.removeAttribute('data-pad-focus');
    const active = document.activeElement;
    if (this.#root.classList.contains('pad') && active instanceof HTMLElement && this.#root.contains(active)) active.dataset['padFocus'] = '';
  }

  #key(e: KeyboardEvent): void {
    if (!this.open || e.defaultPrevented || e.code !== 'Enter' || e.repeat) return;
    // Enter on a pick picks it (the browser's own press); anywhere else it is the one action.
    if ((document.activeElement as HTMLElement | null)?.closest?.('.ds-seg')) return;
    e.preventDefault();
    this.#root.querySelector<HTMLButtonElement>('[data-key="go"]:not(:disabled)')?.click();
  }

  #click(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    const v = this.#view;
    if (!el || !v || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset['act'];
    if (act === 'go') {
      if (v.play) this.#callbacks.play();
      else this.#callbacks.ready();
    } else if (act === 'fit') {
      const gun = el.dataset['gun'] as WeaponId;
      const slot = el.dataset['slot'] as AttachmentSlot;
      this.#callbacks.build(gun, slot, (el.dataset['value'] || null) as AttachmentId | null);
    } else if (act === 'pick') {
      const slot = el.dataset['slot'] as keyof Loadout;
      const value = el.dataset['value'] ?? '';
      const choice = slot === 'grenade' ? ((value || null) as GrenadeId | null) : (value as WeaponId);
      this.#callbacks.loadout({ ...v.loadout, [slot]: choice });
    }
  }

  #render(v: PreparationView): string {
    const locked = v.stage === 'dive' || v.play;
    const total = v.elapsed + v.left;
    const done = total > 0 ? Math.min(1, v.elapsed / total) : 1;
    const options = loadoutOptions();
    const { primaries, secondaries, picked } = preparationKit(v.loadout, v.open, v.holds);
    const seg = <T extends string | null>(slot: keyof Loadout, title: string, choices: readonly T[], name: (c: T) => string) =>
      `<div><span class="ds-field-label">${escapeHtml(title)}</span><div class="ds-seg" role="group" aria-label="${escapeHtml(title)}">${choices
        .map((c) => {
          const on = picked[slot] === c;
          return `<button type="button" data-act="pick" data-slot="${slot}" data-value="${escapeHtml(c ?? '')}" data-key="${slot}-${escapeHtml(c ?? 'none')}" class="${on ? 'on' : ''}" aria-pressed="${on}"${locked ? ' disabled' : ''}>${escapeHtml(name(c))}</button>`;
        })
        .join('')}</div></div>`;
    // Under each gun, its open attachment slots, and the next shut one with the kills it waits for.
    const smith = (gun: WeaponId, rows: readonly GunsmithSlot[] | undefined) => {
      if (!rows?.length) return '';
      const open = rows.filter((r) => !r.choices.some((c) => c.locked));
      const shut = rows.find((r) => r.choices.some((c) => c.locked));
      const lines = open.map(
        (r) =>
          `<div class="smith-row"><span>${escapeHtml(r.name)}</span><div class="ds-seg" role="group" aria-label="${escapeHtml(`${weaponName(gun)} ${r.name.toLowerCase()}`)}">${r.choices
            .map((c) => `<button type="button" data-act="fit" data-gun="${gun}" data-slot="${r.slot}" data-value="${c.id ?? ''}" data-key="fit-${gun}-${r.slot}-${c.id ?? 'stock'}" class="${c.on ? 'on' : ''}" aria-pressed="${c.on}"${locked ? ' disabled' : ''}>${escapeHtml(c.name)}</button>`)
            .join('')}</div></div>`,
      );
      const wait = shut ? shut.choices.find((c) => c.locked)!.detail : '';
      if (shut) lines.push(`<div class="shut">${escapeHtml(`${shut.name}: ${wait} with the ${weaponName(gun)}`)}</div>`);
      return `<div class="smith">${lines.join('')}</div>`;
    };
    const action = preparationAction(v);
    const clock = v.play ? 'Go' : preparationClock(v.left);
    const clockLabel = v.play ? 'You are down' : v.stage === 'dive' ? 'Dropping in' : 'Drop in';
    const mates = v.squad
      .map((m) => `<div class="mate${m.you ? ' you' : ''}${m.ready ? ' on' : ''}"><b>${escapeHtml(m.name)}</b><span>${m.bot ? 'Bot' : m.ready ? 'Ready' : m.you ? 'You' : 'Choosing'}</span></div>`)
      .join('');
    const c = v.stage === 'dive' && !v.play ? v.champion : null;
    const champ = c ? `<div class="champ"><span>${escapeHtml(c.title)}</span><b>${escapeHtml(c.names)}</b><small>${escapeHtml(c.why)}</small></div>` : '';
    return `<div class="card" role="region" aria-label="Preparation">
<h1>Preparation</h1>
<div><div class="clock"><b>${escapeHtml(clock)}</b><span>${escapeHtml(clockLabel)}</span></div><div class="bar" aria-hidden="true"><i style="transform: scaleX(${(1 - done).toFixed(3)})"></i></div></div>
<div class="kit">${seg('primary', 'Primary', primaries, weaponName)}${smith(picked.primary, v.smith?.primary)}${v.holds === 'resupply' ? '' : '<div class="drop-note">Sniper: Supply Drops only</div>'}${seg('secondary', 'Secondary', secondaries, weaponName)}${smith(picked.secondary, v.smith?.secondary)}${seg('grenade', 'Grenade', options.grenade, (g) => (g ? `Frag ×${STATS.royale.frags.value}` : 'None'))}</div>
${v.squad.length > 1 ? `<div class="squad"><span class="ds-field-label">Your Squad</span><div class="mates">${mates}</div></div>` : ''}
<div class="go"><button type="button" class="ds-btn primary big" data-act="go" data-key="go"${action.enabled ? '' : ' disabled'}>${escapeHtml(action.label)}</button><div class="note">${escapeHtml(action.note)}</div>${action.enabled ? `<div class="ds-hints">${hint('Enter', 'A', action.label)}</div>` : ''}</div>
</div>
<div class="alive" aria-label="${v.alive} alive"><b>${v.alive}</b><span>Alive</span><small>${v.squads} ${v.squads === 1 ? 'Squad' : 'Squads'}</small>${champ}</div>`;
  }
}
