import { STATS, isShellReload, type MagazineReload, type Stat, type Unit, type WeaponId, type WeaponRow } from '../stats';

/**
 * Attachments (ticket 19): four slots on a gun, two choices in each, or
 * nothing. Every choice is a sidegrade (see `STATS.attachments`): it changes
 * the gun's row, and the whole simulation reads the changed row, so a
 * suppressed gun's damage, an extended magazine's rounds and a grip's recoil
 * all follow from one place.
 */

export type AttachmentSlot = 'optic' | 'muzzle' | 'magazine' | 'grip';
export type OpticId = 'reflex' | 'prism';
export type MuzzleId = 'suppressor' | 'compensator';
export type MagazineId = 'extended' | 'speed';
export type GripId = 'vertical' | 'angled';
export type AttachmentId = OpticId | MuzzleId | MagazineId | GripId;

/** What is on one gun; a slot left out is stock. */
export interface Attachments {
  readonly optic?: OpticId;
  readonly muzzle?: MuzzleId;
  readonly magazine?: MagazineId;
  readonly grip?: GripId;
}

export const ATTACHMENT_SLOTS: readonly AttachmentSlot[] = ['optic', 'muzzle', 'magazine', 'grip'];

/** The choices in each slot, in the order the loadout screen shows them. */
export const SLOT_CHOICES: { readonly [S in AttachmentSlot]: readonly NonNullable<Attachments[S]>[] } = {
  optic: ['reflex', 'prism'],
  muzzle: ['suppressor', 'compensator'],
  magazine: ['extended', 'speed'],
  grip: ['vertical', 'angled'],
};

/** The Weapon Mastery level that opens each slot on a gun. */
export const SLOT_MASTERY: { readonly [S in AttachmentSlot]: number } = { optic: 1, muzzle: 2, magazine: 3, grip: 4 };

/** Display names. */
export const ATTACHMENT_NAMES: { readonly [A in AttachmentId]: string } = {
  reflex: 'Reflex',
  prism: 'Prism 2x',
  suppressor: 'Suppressor',
  compensator: 'Compensator',
  extended: 'Extended',
  speed: 'Speed',
  vertical: 'Vertical',
  angled: 'Angled',
};

/**
 * The slots a gun takes. A scoped gun or one with its own optic takes no
 * optic; the shotgun takes no muzzle device; only a gun fed from a box
 * magazine takes a magazine; and a sidearm takes no optic and no grip.
 */
export function slotsOf(id: WeaponId): readonly AttachmentSlot[] {
  const t = STATS.weapons[id].traits;
  return ATTACHMENT_SLOTS.filter((slot) => {
    if (slot === 'optic') return t.slot === 'primary' && t.sight === 'iron';
    if (slot === 'muzzle') return t.fireMode !== 'pump';
    if (slot === 'magazine') return t.reload === 'magazine';
    return t.slot === 'primary';
  });
}

/** Whether `attachments` are nothing at all: a stock gun. */
export function isStock(attachments: Attachments | undefined): boolean {
  return !attachments || ATTACHMENT_SLOTS.every((slot) => attachments[slot] === undefined);
}

/** `attachments` from untrusted data, kept to what gun `id` takes; null if they aren't attachments at all. */
export function parseAttachments(id: WeaponId, value: unknown): Attachments | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: { -readonly [S in AttachmentSlot]?: Attachments[S] } = {};
  const takes = slotsOf(id);
  for (const key of Object.keys(record)) {
    const slot = key as AttachmentSlot;
    const choice = record[key];
    if (choice === undefined || choice === null) continue;
    if (!ATTACHMENT_SLOTS.includes(slot) || !takes.includes(slot)) return null;
    if (!(SLOT_CHOICES[slot] as readonly unknown[]).includes(choice)) return null;
    (out as Record<string, unknown>)[slot] = choice;
  }
  return out;
}

const A = STATS.attachments;

const scaled = <U extends Unit>(stat: Stat<U>, by: number): Stat<U> => (by === 1 ? stat : { ...stat, value: stat.value * by });
const set = <U extends Unit>(stat: Stat<U>, value: number): Stat<U> => ({ ...stat, value });

function build(id: WeaponId, a: Attachments): WeaponRow {
  const row = STATS.weapons[id];
  let ads = 1;
  let vertical = 1;
  let horizontal = 1;
  let hip = 1;
  const reload = reloadPace(a);
  let magazine = 1;
  let range = 1;
  let velocity = 1;
  let zoom = row.handling.zoom.value;
  if (a.optic === 'reflex') ads *= A.reflex.adsTime.value;
  if (a.optic === 'prism') {
    ads *= A.prism.adsTime.value;
    zoom = Math.max(zoom, A.prism.zoom.value);
  }
  if (a.muzzle === 'suppressor') {
    range *= A.suppressor.range.value;
    velocity *= A.suppressor.velocity.value;
  }
  if (a.muzzle === 'compensator') {
    horizontal *= A.compensator.horizontalKick.value;
    vertical *= A.compensator.verticalKick.value;
  }
  if (a.magazine === 'extended') {
    magazine *= A.extended.magazine.value;
    ads *= A.extended.adsTime.value;
  }
  if (a.magazine === 'speed') {
    magazine *= A.speed.magazine.value;
  }
  if (a.grip === 'vertical') {
    vertical *= A.vertical.verticalKick.value;
    ads *= A.vertical.adsTime.value;
  }
  if (a.grip === 'angled') {
    ads *= A.angled.adsTime.value;
    hip *= A.angled.hipSpread.value;
  }

  const h = row.handling;
  const rounds = Math.max(1, Math.round(h.magazineSize.value * magazine));
  const r = row.reload;
  const reloadRow = isShellReload(r) || reload === 1 ? r : ({ tacticalAddAmmo: scaled(r.tacticalAddAmmo, reload), tacticalDuration: scaled(r.tacticalDuration, reload), emptyAddAmmo: scaled(r.emptyAddAmmo, reload), emptyDuration: scaled(r.emptyDuration, reload) } satisfies MagazineReload);
  const c = row.accuracy;
  const bands = Object.fromEntries(Object.entries(row.damage.bands).map(([k, band]) => [k, band.range && range !== 1 ? { ...band, range: scaled(band.range, range) } : band]));
  return {
    traits: a.optic ? { ...row.traits, sight: 'optic' } : row.traits,
    handling: { ...h, adsTime: scaled(h.adsTime, ads), muzzleVelocity: scaled(h.muzzleVelocity, velocity), zoom: zoom === h.zoom.value ? h.zoom : set(h.zoom, zoom), magazineSize: rounds === h.magazineSize.value ? h.magazineSize : set(h.magazineSize, rounds) },
    reload: reloadRow,
    damage: { ...row.damage, bands },
    accuracy: {
      ...c,
      hipSpreadStill: scaled(c.hipSpreadStill, hip),
      hipSpreadMoving: scaled(c.hipSpreadMoving, hip),
      hipSpreadAirborne: scaled(c.hipSpreadAirborne, hip),
      firstShotKick: scaled(c.firstShotKick, vertical),
      verticalKick: scaled(c.verticalKick, vertical),
      horizontalKick: scaled(c.horizontalKick, horizontal),
      ...(c.settledKick ? { settledKick: scaled(c.settledKick, vertical) } : {}),
    },
  };
}

const ROWS = new Map<string, WeaponRow>();

/** The key of one build of a gun: the same build is the same row object. */
function keyOf(id: WeaponId, a: Attachments): string {
  return `${id}|${a.optic ?? ''}|${a.muzzle ?? ''}|${a.magazine ?? ''}|${a.grip ?? ''}`;
}

/** Gun `id`'s stats row with `attachments` on it: its own row when stock. Built once per build and kept. */
export function moddedRow(id: WeaponId, attachments?: Attachments): WeaponRow {
  if (isStock(attachments)) return STATS.weapons[id];
  const key = keyOf(id, attachments!);
  let row = ROWS.get(key);
  if (!row) ROWS.set(key, (row = build(id, fitted(id, attachments!))));
  return row;
}

/** `a` kept to the slots gun `id` takes: an Extended magazine handed to the belt-fed LMG past every parse fits nothing. */
function fitted(id: WeaponId, a: Attachments): Attachments {
  const out: Record<string, string> = {};
  for (const slot of slotsOf(id)) if (a[slot]) out[slot] = a[slot]!;
  return out as Attachments;
}

/** How long a reload takes with `attachments`, as a share of the stock gun's: its animation plays at this pace. */
export function reloadPace(attachments: Attachments | undefined): number {
  return attachments?.magazine === 'extended' ? A.extended.reload.value : attachments?.magazine === 'speed' ? A.speed.reload.value : 1;
}

/** How far a shot from a gun with `muzzle` carries to the ear: the share of the usual hearing distance. */
export function shotLoudness(muzzle: MuzzleId | undefined): number {
  return muzzle === 'suppressor' ? A.suppressor.hearing.value : muzzle === 'compensator' ? A.compensator.hearing.value : 1;
}

/** The share of each damage band's reach a gun with `muzzle` keeps. */
export function bandReach(muzzle: MuzzleId | undefined): number {
  return muzzle === 'suppressor' ? A.suppressor.range.value : 1;
}
