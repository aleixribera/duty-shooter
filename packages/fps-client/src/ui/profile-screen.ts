import { GUN_RANKS, figure, gunOpen, playedFor, rankOf, ratio, todaysChallenges, weaponRows, type Profile } from '../profile/model';
import { escapeHtml as escape } from './theme';

/**
 * The Profile screen (ticket 17) and the line the main menu carries under the
 * name: what this browser has banked. Its markup is built as text from the
 * Profile alone, so it can be checked without a page; the menu sets it in its
 * page shell and owns the buttons. Every figure is the Profile's own: a
 * Profile with nothing in it shows zeros and says how the first match counts.
 */

export const PROFILE_SCREEN_CSS = `
/* A bar that says how far: the track a line, the fill in the text colour (signal is kept for what can be pressed). */
.ds-xpbar { display: block; height: 6px; background: var(--ds-line-2); overflow: hidden; }
.ds-xpbar i { display: block; height: 100%; background: var(--ds-text); transform-origin: 0 50%; }
/* The Profile: you on the left (Rank, lifetime, today's Challenges), the weapons on the right. */
.ds-prof { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 32px 48px; max-width: 1320px; align-items: start; }
.ds-prof section + section { margin-top: 32px; }
.ds-prof .ds-h2 small { text-align: right; }
.ds-prof .rank { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 20px; align-items: end; }
.ds-prof .rank > .ds-label { grid-column: 1 / -1; }
.ds-prof .rank .n { font-family: var(--ds-font-display); font-size: calc(var(--ds-type-display) * 1.4); line-height: 0.8; font-weight: 700; }
.ds-prof .rank .t { font-family: var(--ds-font-display); margin-bottom: 10px; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-prof .rank .xp { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 16px; margin-top: 8px; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-prof .rank .xp b { color: var(--ds-text); font-weight: 700; }
/* The lifetime strip: two full rows. */
.ds-prof .ds-readouts { grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); }
.ds-prof .ds-readouts > div { min-width: 0; }
.ds-prof .none { margin: 12px 0 0; max-width: 60ch; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-prof .list { display: grid; gap: 1px; background: var(--ds-line); border: 1px solid var(--ds-line); }
/* A Challenge: what to do, how far along, what it pays, and the bar under them. */
.ds-prof .task { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: baseline; gap: 8px 18px; padding: 12px 16px 14px; background: var(--ds-panel); font-size: var(--ds-type-body); }
.ds-prof .task .amt { color: var(--ds-text-2); white-space: nowrap; }
.ds-prof .task .amt b { color: var(--ds-text); font-weight: 700; }
.ds-prof .task .pay { min-width: 84px; text-align: right; font-size: var(--ds-type-small); color: var(--ds-text-2); white-space: nowrap; }
.ds-prof .task .ds-xpbar { grid-column: 1 / -1; height: 4px; }
.ds-prof .task.done .what { color: var(--ds-text-2); }
/* A weapon: its name and what it has done, its kills, and its Mastery with the way to the next level. */
.ds-prof .gun { display: grid; grid-template-columns: minmax(0, 1fr) 72px minmax(150px, 210px); align-items: center; gap: 4px 20px; min-height: 68px; padding: 10px 16px; background: var(--ds-panel); }
.ds-prof .gun .who b { font-family: var(--ds-font-display); display: block; font-size: var(--ds-type-heading); line-height: 1.05; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.ds-prof .gun .who span, .ds-prof .gun .m span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-prof .gun .k { display: flex; flex-direction: column; gap: 2px; text-align: right; }
.ds-prof .gun .k b { font-family: var(--ds-font-display); font-size: var(--ds-type-heading); line-height: 1.1; font-weight: 700; }
.ds-prof .gun .m { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 10px; align-items: baseline; }
.ds-prof .gun .m .lvl { color: var(--ds-text); font-weight: 700; }
.ds-prof .gun .m .ds-xpbar { grid-column: 1 / -1; height: 4px; }
/* The footer's question before a Profile is erased. */
.ds-ask { flex: 1; min-width: 0; font-size: var(--ds-type-body); color: var(--ds-text); }
.ds-btn.danger { --ds-edge: var(--ds-alert); color: var(--ds-alert); }
.ds-btn.danger:not(:disabled):hover, .ds-btn.danger:focus-visible, .ds-btn.danger[data-pad-focus] { --ds-edge: var(--ds-alert); --ds-edge-w: 2px; --ds-fill: var(--ds-raised); }
/* The save code: the line to copy, a box to paste one into, and what the last copy or load did. */
.ds-save { max-width: 1320px; margin-top: 32px; }
.ds-save .ds-code { display: block; box-sizing: border-box; width: 100%; margin-top: 10px; padding: 10px 12px; resize: vertical; font: inherit; font-size: var(--ds-type-small); color: var(--ds-text); background: var(--ds-panel); border: 1px solid var(--ds-line); border-radius: 0; }
.ds-save .ds-code[readonly] { word-break: break-all; }
.ds-save .ds-code:focus-visible { outline: 2px solid var(--ds-light); outline-offset: 0; }
.ds-save-row { display: flex; gap: 12px; margin-top: 12px; }
.ds-save-note { margin: 12px 0 0; font-size: var(--ds-type-body); color: var(--ds-text); }
/* A gun not yet opened: its Rank in place of its kills. */
.ds-prof .gun.shut .who b { color: var(--ds-text-2); }
/* "Opens at Rank" stays one line over its number, reaching left into the gap past the Kills column's width. */
.ds-prof .gun.shut .k { align-items: flex-end; } .ds-prof .gun.shut .k .ds-label { white-space: nowrap; }
@media (max-width: 960px) {
  .ds-prof { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .ds-prof section + section { margin-top: 28px; }
  .ds-prof .ds-h2 { flex-wrap: wrap; }
  .ds-prof .ds-readouts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .ds-prof .ds-readouts > div:last-child:nth-child(3n + 1) { grid-column: span 3; }
  .ds-prof .ds-readouts > div:last-child:nth-child(3n + 2) { grid-column: span 2; }
  .ds-prof .ds-readouts > div { padding: 10px 12px; }
  .ds-prof .task { grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px 12px; }
  .ds-prof .task .pay { grid-column: 1 / -1; grid-row: 2; min-width: 0; text-align: left; }
  .ds-prof .gun { grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px 12px; }
  .ds-prof .gun .m { grid-column: 1 / -1; }
  .ds-ask { flex: 1 1 100%; }
}
`;

const share = (n: number) => Math.max(0, Math.min(1, n)).toFixed(3);

/** A bar filled to `part` (0 to 1), named for screen readers by what it measures. */
function bar(part: number, label: string): string {
  return `<span class="ds-xpbar" role="img" aria-label="${escape(label)}"><i style="transform:scaleX(${share(part)})"></i></span>`;
}

/**
 * The main menu's profile corner, in three parts the menu sets round the name: the Rank in its badge, the line under the
 * name ("Rank 7 Range Officer · 3,420 / 4,000 XP") and the bar to the next Rank.
 */
export function rankCorner(profile: Profile): { badge: string; meta: string; bar: string } {
  const r = rankOf(profile.xp);
  const to = r.next === null ? 'Top Rank' : `${figure(r.next - r.xp)} XP to Rank ${r.rank + 1}`;
  const xp = r.next === null ? `${figure(r.xp)} XP` : `${figure(r.xp)} / ${figure(r.next)} XP`;
  return {
    badge: `<span class="badge" role="img" aria-label="Rank ${r.rank}">${r.rank}</span>`,
    meta: `<span class="meta"><b>Rank ${r.rank}</b> ${escape(r.title)} · ${xp}</span>`,
    bar: bar(r.share, to),
  };
}

/** The Profile screen's body: Rank and XP, the lifetime strip and today's Challenges, then every weapon with its Mastery. */
export function profileHtml(profile: Profile, today: string): string {
  const r = rankOf(profile.xp);
  const s = profile.stats;
  const toNext = r.next === null ? 'Top Rank reached' : `${figure(r.next - r.xp)} XP to Rank ${r.rank + 1}`;
  const rank =
    `<section class="rank" aria-label="Rank"><span class="ds-label">Rank</span><b class="n">${r.rank}</b>` +
    `<div><div class="t">${escape(r.title)}</div>${bar(r.share, toNext)}` +
    `<div class="xp"><span><b>${figure(r.xp)}</b> XP${r.next === null ? '' : ` of ${figure(r.next)}`}</span><span>${toNext}</span></div></div></section>`;

  const cell = (label: string, value: string) => `<div><span>${label}</span><b>${value}</b></div>`;
  const cells = [
    cell('Matches', figure(s.matches)),
    cell('Wins', figure(s.wins)),
    cell('Kills', figure(s.kills)),
    cell('Deaths', figure(s.deaths)),
    cell('K/D', ratio(s.kills, s.deaths)),
    cell('Headshots', figure(s.headshots)),
    cell('Assists', figure(s.assists)),
    cell('Score', figure(s.score)),
    cell('Best streak', figure(s.bestStreak)),
    cell('Time played', playedFor(s.seconds)),
  ];
  // A Battle Royale's two figures, once one has been played.
  if ((s.modes['battle-royale'] ?? 0) > 0) cells.push(cell('Royale wins', figure(s.royaleWins)), cell('Best place', s.royaleBest === null ? '–' : `#${s.royaleBest}`));
  const lifetime =
    `<section><h2 class="ds-h2">Lifetime</h2><div class="ds-readouts" style="--n:${cells.length / 2}">${cells.join('')}</div>` +
    (s.matches === 0 ? '<p class="none">Finish a match to start counting. The Practice Range keeps no score.</p>' : '') +
    '</section>';

  const tasks = todaysChallenges(profile, today)
    .map((c) => {
      const amount = c.done ? '<b>Done</b>' : `<b>${figure(c.progress)}</b> / ${figure(c.target)}`;
      return `<div class="task${c.done ? ' done' : ''}"><span class="what">${escape(c.text)}</span><span class="amt">${amount}</span><span class="pay">${c.done ? `${figure(c.xp)} XP paid` : `+${figure(c.xp)} XP`}</span>${bar(c.done ? 1 : c.progress / c.target, `${c.progress} of ${c.target}`)}</div>`;
    })
    .join('');
  const challenges = `<section><h2 class="ds-h2">Today's Challenges<small>New at midnight</small></h2><div class="list">${tasks}</div></section>`;

  // Open guns first, the most used on top; then the locked ones in the order they open.
  const guns = weaponRows(profile)
    .sort((a, b) => Number(!gunOpen(a.id, profile.xp)) - Number(!gunOpen(b.id, profile.xp)) || (gunOpen(a.id, profile.xp) ? 0 : GUN_RANKS[a.id] - GUN_RANKS[b.id]))
    .map((w) => {
      const m = w.mastery;
      // A gun not yet opened: the Rank that opens it in the Kills column, and where to try it under its name.
      if (!gunOpen(w.id, profile.xp))
        return `<div class="gun shut"><div class="who"><b>${escape(w.name)}</b><span>Try it in the Practice Range</span></div><div class="k"><span class="ds-label">Opens at Rank</span><b>${GUN_RANKS[w.id]}</b></div><div class="m"></div></div>`;
      const about = w.kills === 0 ? 'No kills yet' : `${figure(w.headshots)} headshot${w.headshots === 1 ? '' : 's'}${w.longest > 0 ? ` · longest ${figure(w.longest)} m` : ''}`;
      const next = m.next === null ? 'Mastered' : `${figure(m.next - w.kills)} to level ${m.level + 1}`;
      return (
        `<div class="gun"><div class="who"><b>${escape(w.name)}</b><span>${about}</span></div>` +
        `<div class="k"><span class="ds-label">Kills</span><b>${figure(w.kills)}</b></div>` +
        `<div class="m"><span class="lvl">Mastery ${m.level} / ${m.of}</span><span>${next}</span>${bar(m.share, `Mastery ${m.level} of ${m.of}`)}</div></div>`
      );
    })
    .join('');
  const weapons = `<section><h2 class="ds-h2">Weapons</h2><div class="list">${guns}</div></section>`;

  return `<div>${rank}${lifetime}${challenges}</div><div>${weapons}</div>`;
}
