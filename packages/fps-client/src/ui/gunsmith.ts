import { ATTACHMENT_NAMES, SLOT_CHOICES, SLOT_MASTERY, STATS, isShellReload, isStock, moddedRow, slotsOf, type AttachmentId, type AttachmentSlot, type Attachments, type Loadout, type WeaponId, type WeaponRow } from '@duty-shooter/fps-core';
import { MASTERY_KILLS, masteryOf } from '../profile/model';

/**
 * The loadout screen's gunsmith (ticket 19): for each slot a gun takes, the
 * stock choice and the two attachments, each open once the gun's Weapon
 * Mastery reaches the slot's level, and what a build gives and costs, read
 * from the gun's own numbers.
 */

export const SLOT_NAMES: { readonly [S in AttachmentSlot]: string } = { optic: 'Optic', muzzle: 'Muzzle', magazine: 'Magazine', grip: 'Grip' };

/** A tile's short line: what the choice is for, in a word or two. */
export const ATTACHMENT_GIST: { readonly [A in AttachmentId]: string } = {
  reflex: 'clear dot',
  prism: `${STATS.attachments.prism.zoom.value}x sight`,
  suppressor: 'quiet',
  compensator: 'less drift',
  extended: `+${Math.round((STATS.attachments.extended.magazine.value - 1) * 100)}% rounds`,
  speed: 'quick reload',
  vertical: 'less climb',
  angled: 'quick aim',
};

export interface GunsmithChoice {
  /** The attachment, or null for stock. */
  readonly id: AttachmentId | null;
  readonly name: string;
  /** Its tile's short line: the gist, or what it waits for when locked. */
  readonly detail: string;
  readonly locked: boolean;
  readonly on: boolean;
}

export interface GunsmithSlot {
  readonly slot: AttachmentSlot;
  readonly name: string;
  readonly choices: readonly GunsmithChoice[];
}

/** The rows of the gunsmith for gun `id` with `kit` on it, `kills` made with it so far. */
export function gunsmithRows(id: WeaponId, kit: Attachments | undefined, kills: number): GunsmithSlot[] {
  const level = masteryOf(kills).level;
  return slotsOf(id).map((slot) => {
    const need = SLOT_MASTERY[slot];
    const locked = level < need;
    const toGo = (MASTERY_KILLS[need - 1] ?? 0) - kills;
    const equipped = kit?.[slot] ?? null;
    const stock: GunsmithChoice = { id: null, name: 'Stock', detail: 'as issued', locked: false, on: equipped === null };
    const options = (SLOT_CHOICES[slot] as readonly AttachmentId[]).map(
      (choice): GunsmithChoice => ({
        id: choice,
        name: ATTACHMENT_NAMES[choice],
        // "to go" kept together, so a narrow tile breaks before it.
        detail: locked ? `${toGo} kill${toGo === 1 ? '' : 's'} to go` : ATTACHMENT_GIST[choice],
        locked,
        on: equipped === choice,
      }),
    );
    return { slot, name: SLOT_NAMES[slot], choices: [stock, ...options] };
  });
}

/** What a slot waits for, as its locked tiles say it in full: the Mastery level and the kills it takes. */
export function slotLock(slot: AttachmentSlot): string {
  const need = SLOT_MASTERY[slot];
  return `Opens at Mastery ${need}: ${MASTERY_KILLS[need - 1]} kills with this gun.`;
}

/** Keeps of `kit` only what `kills` with gun `id` have opened: a save from before a reset, or a gun just changed. */
export function openKit(id: WeaponId, kit: Attachments | undefined, kills: number): Attachments {
  const level = masteryOf(kills).level;
  const out: Record<string, AttachmentId> = {};
  for (const slot of slotsOf(id)) {
    const choice = kit?.[slot];
    if (choice && level >= SLOT_MASTERY[slot]) out[slot] = choice;
  }
  return out as Attachments;
}

/** Every gun's build in the gunsmith, by gun. */
export type Builds = Readonly<Partial<Record<WeaponId, Attachments>>>;

/**
 * `loadout` carrying the builds of its two guns from `builds`, each kept to
 * what `kills` with that gun have opened (a gun with nothing open, or nothing
 * built, goes stock).
 */
export function withBuilds(loadout: Loadout, builds: Builds, kills: (id: WeaponId) => number): Loadout {
  const primary = openKit(loadout.primary, builds[loadout.primary], kills(loadout.primary));
  const secondary = openKit(loadout.secondary, builds[loadout.secondary], kills(loadout.secondary));
  const { attachments: _, ...rest } = loadout;
  const attachments = { ...(isStock(primary) ? {} : { primary }), ...(isStock(secondary) ? {} : { secondary }) };
  return attachments.primary || attachments.secondary ? { ...rest, attachments } : rest;
}

/** `builds` with gun `id`'s `slot` set to `choice` (null: back to stock). */
export function rebuild(builds: Builds, id: WeaponId, slot: AttachmentSlot, choice: AttachmentId | null): Builds {
  const { [slot]: _, ...kept } = builds[id] ?? {};
  const kit = (choice ? { ...kept, [slot]: choice } : kept) as Attachments;
  const { [id]: __, ...others } = builds;
  return isStock(kit) ? others : { ...others, [id]: kit };
}

export interface BuildEffects {
  readonly gains: readonly string[];
  readonly costs: readonly string[];
}

const pct = (k: number) => `${Math.round(Math.abs(k - 1) * 100)}%`;
/** Figures keep their unit on their own line. */
const NB = '\u00a0';
const secs = (s: number) => `${s.toFixed(2)}${NB}s`;

/** A magazine reload's tactical time, or a shell reload's first shell. */
function reloadTime(row: WeaponRow): number {
  return isShellReload(row.reload) ? row.reload.start.value : row.reload.tacticalDuration.value;
}

/** What `kit` on gun `id` gives and costs against the stock gun, line by line, with the figures. */
export function buildEffects(id: WeaponId, kit: Attachments): BuildEffects {
  const stock = STATS.weapons[id];
  const row = moddedRow(id, kit);
  const gains: string[] = [];
  const costs: string[] = [];
  const to = (better: boolean, line: string) => (better ? gains : costs).push(line);
  if (kit.optic === 'reflex') gains.push('A clear dot in place of the iron sights');
  if (row.handling.zoom.value !== stock.handling.zoom.value) {
    gains.push(`Sights magnify ${row.handling.zoom.value}x, not ${stock.handling.zoom.value}x`);
    costs.push('A narrower view, and a slower turn, aimed');
  }
  if (kit.muzzle === 'suppressor') gains.push(`Heard from ${Math.round(STATS.attachments.suppressor.hearing.value * 100)}% as far, by bots and players, and no flash shows`);
  if (kit.muzzle === 'compensator') costs.push(`Heard ${pct(STATS.attachments.compensator.hearing.value)} farther, with a bigger flash`);
  const h = row.handling;
  const s = stock.handling;
  if (h.magazineSize.value !== s.magazineSize.value) to(h.magazineSize.value > s.magazineSize.value, `Magazine ${s.magazineSize.value} → ${h.magazineSize.value}${NB}rounds`);
  if (Math.abs(reloadTime(row) - reloadTime(stock)) > 1e-6) to(reloadTime(row) < reloadTime(stock), `Reload ${secs(reloadTime(stock))} → ${secs(reloadTime(row))}`);
  if (Math.abs(h.adsTime.value - s.adsTime.value) > 1e-6) to(h.adsTime.value < s.adsTime.value, `Aim-in ${secs(s.adsTime.value)} → ${secs(h.adsTime.value)}`);
  const a = row.accuracy;
  const b = stock.accuracy;
  if (a.verticalKick.value !== b.verticalKick.value) to(a.verticalKick.value < b.verticalKick.value, `Climb per shot ${a.verticalKick.value < b.verticalKick.value ? '−' : '+'}${pct(a.verticalKick.value / b.verticalKick.value)}`);
  if (a.horizontalKick.value !== b.horizontalKick.value) to(a.horizontalKick.value < b.horizontalKick.value, `Drift sideways ${a.horizontalKick.value < b.horizontalKick.value ? '−' : '+'}${pct(a.horizontalKick.value / b.horizontalKick.value)}`);
  if (a.hipSpreadStill.value !== b.hipSpreadStill.value) to(a.hipSpreadStill.value < b.hipSpreadStill.value, `Hipfire spread ${a.hipSpreadStill.value < b.hipSpreadStill.value ? '−' : '+'}${pct(a.hipSpreadStill.value / b.hipSpreadStill.value)}`);
  const first = Object.values(row.damage.bands)[0]?.range?.value;
  const firstStock = Object.values(stock.damage.bands)[0]?.range?.value;
  if (first !== undefined && firstStock !== undefined && first !== firstStock) to(first > firstStock, `Full damage to ${Math.round(firstStock)} → ${Math.round(first)}${NB}m`);
  if (h.muzzleVelocity.value !== s.muzzleVelocity.value) to(h.muzzleVelocity.value > s.muzzleVelocity.value, `Round speed ${Math.round(s.muzzleVelocity.value)} → ${Math.round(h.muzzleVelocity.value)}${NB}m/s`);
  return { gains, costs };
}
