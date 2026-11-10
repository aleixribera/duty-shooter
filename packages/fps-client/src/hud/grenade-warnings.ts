import { STATS, blastDamage, partCentres, type GrenadeOutput, type HitPose, type Vec3 } from '@duty-shooter/fps-core';

/**
 * The grenade indicator (ticket 12): a live frag within `warningRadius` of you
 * is marked on a ring round the crosshair, on the side it lies, so you know
 * which way to run. Where its blast would take all the health you have the
 * mark fills in, and in the fuse's last second it blinks.
 */

export interface GrenadeWarning {
  readonly id: number;
  /** World yaw from you toward the grenade (as the damage indicator's). */
  readonly worldYaw: number;
  /** How far its blast would start from the nearest part of your body (m), as the simulation measures it. */
  readonly metres: number;
  /** In the open, its blast would take all the health you have. */
  readonly lethal: boolean;
  /** Seconds until it explodes. */
  readonly fuse: number;
}

/** Marks on screen at once: more than this is a wall of red that points nowhere. */
export const GRENADE_WARNINGS_MOST = 4;
/** The middle of a standing body above its feet (m): which way a throw of your own is going is judged from here. */
const BODY_MIDDLE = 0.9;
/** A blast starts this far above where its grenade lies (m), as in the simulation's `#explode`. */
const BLAST_LIFT = 0.05;
/** No part of a body lies farther than this from its feet position (m): a prone one's head and feet reach about a metre. */
const BODY_REACH = 2;

export interface WarnedPlayer extends HitPose {
  readonly id: string;
  readonly team: number;
  readonly alive: boolean;
  readonly health: number;
}

/**
 * The grenades to warn `self` of at simulation time `time`, nearest first.
 * A teammate's cannot hurt you where sides are played (`allies`), so it is not
 * marked; your own can, and is, once it stops flying away from you. Distance
 * is the blast's own: from where it would start to the nearest part of your
 * body as you stand, crouch or lie. Cover is not counted, so behind a wall a
 * mark says more than the blast will do, never less.
 */
export function grenadeWarnings(self: WarnedPlayer | null, grenades: readonly GrenadeOutput[], time: number, allies: boolean): GrenadeWarning[] {
  if (!self || !self.alive) return [];
  const reach = STATS.grenade.warningRadius.value;
  let parts: readonly Vec3[] | null = null;
  const out: GrenadeWarning[] = [];
  for (const g of grenades) {
    // A smoke or a flash does no harm: only a frag is marked.
    if (g.kind !== undefined && g.kind !== 'frag') continue;
    if (allies && g.thrower !== self.id && g.team === self.team) continue;
    const dx = g.position[0] - self.position[0];
    const dy = g.position[1] - (self.position[1] + BODY_MIDDLE);
    const dz = g.position[2] - self.position[2];
    // Your own throw on its way out is no news to you; one that comes back off a wall, or lies there, is.
    if (g.thrower === self.id && !g.resting && dx * g.velocity[0] + dy * g.velocity[1] + dz * g.velocity[2] > 0) continue;
    // Nothing nearer than this can be marked, so the body is only measured for a grenade that may be.
    if (Math.hypot(dx, dz) > reach + BODY_REACH) continue;
    parts ??= partCentres(self).map((p) => p.centre);
    let metres = Infinity;
    for (const c of parts) metres = Math.min(metres, Math.hypot(g.position[0] - c[0], g.position[1] + BLAST_LIFT - c[1], g.position[2] - c[2]));
    if (metres > reach) continue;
    out.push({ id: g.id, worldYaw: Math.atan2(-dx, -dz), metres, lethal: blastDamage(metres) >= self.health, fuse: Math.max(0, g.explodeAt - time) });
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, GRENADE_WARNINGS_MOST);
}

/** The mark blinks through the fuse's last second, eight times. */
export function fuseBlink(fuse: number): boolean {
  return fuse < 1 && Math.floor(fuse * 16) % 2 === 1;
}

const GLYPH =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 1h5v2h2l2 3-1.4.9L14.4 5H13v1.3a6 6 0 1 1-5 0z"/></svg>';

export const GRENADE_WARNINGS_CSS = `
.ds-nades { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.ds-nades .w { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.ds-nades .g { position: absolute; left: -17px; top: -167px; width: 34px; height: 34px; display: grid; place-items: center; background: var(--ds-scrim); box-shadow: inset 0 0 0 2px var(--ds-alert); color: var(--ds-alert); text-shadow: none; }
.ds-nades .p { position: absolute; left: -9px; top: -181px; width: 0; height: 0; border: 9px solid transparent; border-top-width: 0; border-bottom: 10px solid var(--ds-alert); }
.ds-nades .w.lethal .g { background: var(--ds-alert); color: var(--ds-ink); }
.ds-nades .w.blink { opacity: 0.35; }
@media (prefers-reduced-motion: reduce) { .ds-nades .w.blink { opacity: 1; } }
@media (max-height: 420px) { .ds-nades .g { top: -96px; } .ds-nades .p { top: -110px; } }
`;

/** The marks on the HUD: one element a grenade, turned to its side of the ring each frame. */
export class GrenadeWarningsView {
  readonly #root: HTMLDivElement;
  readonly #marks = new Map<number, { readonly el: HTMLDivElement; readonly glyph: HTMLElement; cls: string }>();

  constructor(parent: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'ds-nades';
    parent.append(this.#root);
  }

  /** `warnings` as of this frame, for a view looking along `yaw`. */
  update(warnings: readonly GrenadeWarning[], yaw: number): void {
    for (const [id, mark] of this.#marks) {
      if (warnings.some((w) => w.id === id)) continue;
      mark.el.remove();
      this.#marks.delete(id);
    }
    for (const w of warnings) {
      let mark = this.#marks.get(w.id);
      if (!mark) {
        const el = document.createElement('div');
        const pointer = document.createElement('i');
        pointer.className = 'p';
        const glyph = document.createElement('span');
        glyph.className = 'g';
        glyph.innerHTML = GLYPH;
        el.append(pointer, glyph);
        this.#root.append(el);
        mark = { el, glyph, cls: '' };
        this.#marks.set(w.id, mark);
      }
      const cls = `w${w.lethal ? ' lethal' : ''}${fuseBlink(w.fuse) ? ' blink' : ''}`;
      if (cls !== mark.cls) mark.el.className = mark.cls = cls;
      const turn = (-(w.worldYaw - yaw) * 180) / Math.PI;
      mark.el.style.transform = `rotate(${turn.toFixed(1)}deg)`;
      // The grenade itself stays upright wherever on the ring it sits.
      mark.glyph.style.transform = `rotate(${(-turn).toFixed(1)}deg)`;
    }
  }
}
