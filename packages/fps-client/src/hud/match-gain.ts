import { STATS } from '@duty-shooter/fps-core';
import type { WeaponId } from '@duty-shooter/fps-core';
import { figure, type MatchGain } from '../profile/model';
import { escapeHtml as escape } from '../ui/theme';

/**
 * The "Your match" strip of a match's end (ticket 25): your numbers as one
 * strip of readouts, the XP the match paid (a win's bonus as its own figure),
 * the Rank bar filling to where it now stands, and the Challenges the match
 * moved. The end panel and a Battle Royale's match card both carry it.
 *
 * Its markup is the same from the moment the match is banked, so the bar's
 * fill plays once: the clock beside it is drawn in another element.
 */

/** When the bar starts to fill after the strip shows, and how long it takes (ms); with a Rank crossed it runs to the end and starts again. */
const GAIN_FILL_DELAY = 400;
const FILL = 900;
const FILL_UP = 1400;
/** The share of the longer fill at which the old Rank's bar is full. */
const CROSS = 0.55;
/** Seconds after the strip shows at which a Rank is crossed: the "Rank up" line and its sound come in here. */
export const GAIN_RANK_UP_AT = (GAIN_FILL_DELAY + FILL_UP * CROSS) / 1000;

export const MATCH_GAIN_CSS = `
.ds-gain { display: flex; flex-direction: column; gap: 10px; text-align: left; font-variant-numeric: tabular-nums; text-shadow: none; }
/* One row, a column for each figure; where that is too tight, three to a row with the last figure taking what is left of its row. */
.ds-gain .ds-readouts { grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); }
.ds-gain .ds-readouts > div { padding: 8px 12px; min-width: 0; }
.ds-gain .ds-readouts small { font-size: var(--ds-type-small); font-weight: 400; color: var(--ds-text-2); }
.ds-gain .rank { display: grid; grid-template-columns: auto minmax(60px, 1fr) auto; align-items: center; gap: 4px 14px; font-size: var(--ds-type-body); }
.ds-gain .rank .who b { font-weight: 700; margin-right: 6px; }
.ds-gain .rank .xp { color: var(--ds-text-2); font-size: var(--ds-type-small); }
.ds-gain .rank .up { margin-left: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; font-size: var(--ds-type-small); animation: ds-gain-word var(--ds-slow) var(--ds-ease) ${Math.round(GAIN_RANK_UP_AT * 1000)}ms backwards; }
.ds-gain .bar { height: 6px; background: rgb(243 241 234 / 0.16); overflow: hidden; }
.ds-gain .bar i { display: block; height: 100%; background: var(--ds-text); transform-origin: 0 50%; transform: scaleX(var(--to)); animation: ds-gain-fill ${FILL}ms var(--ds-ease) ${GAIN_FILL_DELAY}ms backwards; }
.ds-gain .bar i.up { animation: ds-gain-up ${FILL_UP}ms linear ${GAIN_FILL_DELAY}ms backwards; }
.ds-gain .tasks { display: flex; flex-wrap: wrap; gap: 4px 22px; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-gain .tasks > div { display: flex; gap: 8px; min-width: 0; }
.ds-gain .tasks b { color: var(--ds-text); font-weight: 700; white-space: nowrap; }
/* A gun the match opened: lit, with its Equip it button. */
.ds-gain .unlocks { display: flex; flex-direction: column; gap: 6px; }
.ds-gain .unlocks > div { display: flex; align-items: center; gap: 12px; }
.ds-gain .unlocks b { font-family: var(--ds-font-display); font-size: var(--ds-type-heading); color: var(--ds-light); text-shadow: 0 0 22px var(--ds-light-glow); text-transform: uppercase; }
.ds-gain .unlocks .ds-btn { margin-left: auto; pointer-events: auto; }
.ds-gain .unlocks .equipped { margin-left: auto; font-size: var(--ds-type-small); color: var(--ds-text-2); }
@keyframes ds-gain-fill { from { transform: scaleX(var(--from)); } }
@keyframes ds-gain-up { 0% { transform: scaleX(var(--from)); } ${CROSS * 100}% { transform: scaleX(1); } ${CROSS * 100 + 0.01}% { transform: scaleX(0); } 100% { transform: scaleX(var(--to)); } }
@keyframes ds-gain-word { from { opacity: 0; transform: translateX(-6px); } }
@media (max-width: 960px) {
  .ds-gain .ds-readouts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ds-gain .ds-readouts > div:last-child:nth-child(3n + 1) { grid-column: span 3; }
  .ds-gain .ds-readouts > div:last-child:nth-child(3n + 2) { grid-column: span 2; }
}
@media (max-width: 640px) {
  .ds-gain { gap: 8px; }
  .ds-gain .ds-readouts > div { padding: 6px 10px; }
  .ds-gain .ds-readouts b { font-size: var(--ds-type-body); }
  .ds-gain .rank { grid-template-columns: minmax(0, 1fr) auto; }
  .ds-gain .rank .bar { grid-column: 1 / -1; grid-row: 2; }
  .ds-gain .tasks { flex-direction: column; gap: 3px; }
  .ds-gain .tasks > div { justify-content: space-between; }
}
@media (prefers-reduced-motion: reduce) {
  .ds-gain .bar i, .ds-gain .bar i.up, .ds-gain .rank .up { animation: none; }
}
`;

/**
 * The strip's markup: `cells` are the readouts the caller already has (your
 * kills, your place), each a label and its value as markup; the XP figures
 * follow them once the match is banked.
 */
export function matchGainHtml(cells: readonly (readonly [string, string])[], gain: MatchGain | null, equip?: { readonly equipped: ReadonlySet<WeaponId> }): string {
  const all = [...cells];
  if (gain) {
    if (gain.bonus > 0) all.push(['Win bonus', `+${figure(gain.bonus)}`]);
    if (gain.challengeXp > 0) all.push(['Challenges', `+${figure(gain.challengeXp)}`]);
    all.push(['XP earned', `+${figure(gain.xp)}`]);
  }
  let html = `<div class="ds-readouts" style="--n:${all.length}">${all.map(([label, value]) => `<div><span>${escape(label)}</span><b>${value}</b></div>`).join('')}</div>`;
  if (!gain) return html;
  const r = gain.after;
  const share = (n: number) => Math.max(0, Math.min(1, n)).toFixed(3);
  html +=
    `<div class="rank"><span class="who"><b>Rank ${r.rank}</b>${escape(r.title)}${gain.rankUp ? '<span class="up">Rank up</span>' : ''}</span>` +
    `<span class="bar"><i${gain.rankUp ? ' class="up"' : ''} style="--from:${share(gain.before.share)};--to:${share(r.share)}"></i></span>` +
    `<span class="xp">${r.next === null ? 'Top Rank' : `${figure(r.xp)} / ${figure(r.next)} XP`}</span></div>`;
  if (gain.challenges.length > 0) {
    html += `<div class="tasks">${gain.challenges
      .map((c) => `<div><span>${escape(c.text)}</span><b>${c.completed ? `Done · +${figure(c.xp)} XP` : `${figure(c.progress)} / ${figure(c.target)}`}</b></div>`)
      .join('')}</div>`;
  }
  if (gain.unlocks.length > 0) {
    // Each gun the match opened, and (where the screen can take a press) a button that puts it in the loadout.
    const button = (id: WeaponId) => (!equip ? '' : equip.equipped.has(id) ? '<span class="equipped">Equipped</span>' : `<button type="button" class="ds-btn" data-equip="${id}"><i class="ds-kbd key">E</i>Equip it</button>`);
    html += `<div class="unlocks">${gain.unlocks.map((id) => `<div><span class="ds-label">Unlocked</span><b>${escape(STATS.weapons[id].traits.name)}</b>${button(id)}</div>`).join('')}</div>`;
  }
  return html;
}
