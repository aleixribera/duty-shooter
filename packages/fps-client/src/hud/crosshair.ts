/**
 * The hipfire crosshair (next-level ticket 22): its shape, size, gap,
 * thickness, colour and centre dot are the player's, and it either opens with
 * the weapon's spread or stands still. The HUD draws it over the world and the
 * Settings screen draws the same one as its preview.
 *
 * The layout is plain numbers (`crosshairLayout`), so it is tested without a
 * page; `CrosshairView` puts it in the DOM.
 */

export type CrosshairShape = 'cross' | 'tee' | 'circle' | 'dot';
export const CROSSHAIR_SHAPES: readonly CrosshairShape[] = ['cross', 'tee', 'circle', 'dot'];
export const CROSSHAIR_SHAPE_NAMES: Readonly<Record<CrosshairShape, string>> = { cross: 'Cross', tee: 'T', circle: 'Circle', dot: 'Dot' };

/** The colours a crosshair comes in: few, and each one bright against any map. */
export const CROSSHAIR_COLOURS = { white: '#ffffff', green: '#5dff6e', yellow: '#ffe14d', cyan: '#4de8ff', magenta: '#ff5cf0', red: '#ff5a5a' } as const;
export type CrosshairColour = keyof typeof CROSSHAIR_COLOURS;
export const CROSSHAIR_COLOUR_NAMES: Readonly<Record<CrosshairColour, string>> = { white: 'White', green: 'Green', yellow: 'Yellow', cyan: 'Cyan', magenta: 'Magenta', red: 'Red' };

export interface CrosshairOptions {
  readonly shape: CrosshairShape;
  /** An arm's length (px). */
  readonly size: number;
  /** From the centre to where an arm starts (px): the least it is while it opens with the spread, all it is when it stands still. */
  readonly gap: number;
  /** A line's thickness (px). */
  readonly thickness: number;
  readonly colour: CrosshairColour;
  /** A dot at the centre. */
  readonly dot: boolean;
  /** Opens with the weapon's spread (moving, jumping, firing), or stands still. */
  readonly dynamic: boolean;
}

/** The crosshair the game always had: four 9 px arms, 2 px thick, a dot, opening with the spread from 4 px. */
export const DEFAULT_CROSSHAIR: CrosshairOptions = { shape: 'cross', size: 9, gap: 4, thickness: 2, colour: 'white', dot: true, dynamic: true };

/** The limits of each number, for the sliders and for a save that has been edited by hand. */
export const CROSSHAIR_LIMITS = { size: [2, 24], gap: [0, 20], thickness: [1, 6] } as const;

/** A box (CSS px), from the crosshair's centre. */
export interface CrosshairBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CrosshairLayout {
  /** Left, right, up and down; null where the shape has no such arm. */
  readonly arms: readonly [CrosshairBox | null, CrosshairBox | null, CrosshairBox | null, CrosshairBox | null];
  readonly dot: CrosshairBox | null;
  /** The circle's outer box, and its line's thickness. */
  readonly ring: (CrosshairBox & { readonly line: number }) | null;
}

const half = (v: number) => Math.round(v * 2) / 2;

/** How far the crosshair is open (px from the centre) with the weapon's spread `spreadPx` wide on screen. */
export function crosshairGap(options: CrosshairOptions, spreadPx: number): number {
  return half(options.dynamic ? Math.max(options.gap, spreadPx) : options.gap);
}

/** Where each part goes, with the weapon's spread `spreadPx` wide on screen. */
export function crosshairLayout(options: CrosshairOptions, spreadPx: number): CrosshairLayout {
  const { shape, size, thickness: t } = options;
  const gap = crosshairGap(options, spreadPx);
  const armed = shape === 'cross' || shape === 'tee';
  const arms: [CrosshairBox | null, CrosshairBox | null, CrosshairBox | null, CrosshairBox | null] = armed
    ? [
        { x: -gap - size, y: -t / 2, w: size, h: t },
        { x: gap, y: -t / 2, w: size, h: t },
        shape === 'tee' ? null : { x: -t / 2, y: -gap - size, w: t, h: size },
        { x: -t / 2, y: gap, w: t, h: size },
      ]
    : [null, null, null, null];
  // A dot crosshair is its dot, whatever the dot option says, and no thinner than 2 px.
  const d = shape === 'dot' ? Math.max(2, t * 2) : Math.max(2, t);
  const dot = shape === 'dot' || options.dot ? { x: -d / 2, y: -d / 2, w: d, h: d } : null;
  const r = Math.max(gap, t) + t;
  const ring = shape === 'circle' ? { x: -r, y: -r, w: r * 2, h: r * 2, line: t } : null;
  return { arms, dot, ring };
}

export const CROSSHAIR_CSS = `
.ds-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; transition: opacity 80ms linear; }
.ds-cross i, .ds-cross b, .ds-cross u { position: absolute; display: block; box-sizing: border-box; }
.ds-cross i, .ds-cross b { background: var(--ds-cross, #fff); box-shadow: 0 0 1px 1px rgb(0 0 0 / 0.55); }
.ds-cross u { border: 2px solid var(--ds-cross, #fff); border-radius: 50%; box-shadow: 0 0 1px 1px rgb(0 0 0 / 0.55), inset 0 0 1px 1px rgb(0 0 0 / 0.55); }
`;

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** The crosshair in the page: four arms, a dot and a circle, shown as the options say. */
export class CrosshairView {
  readonly root: HTMLDivElement;
  readonly #arms: HTMLElement[];
  readonly #dot: HTMLElement;
  readonly #ring: HTMLElement;
  readonly #written = new WeakMap<HTMLElement, string>();
  #options: CrosshairOptions = DEFAULT_CROSSHAIR;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('ds-cross-css')) {
      const style = document.createElement('style');
      style.id = 'ds-cross-css';
      style.textContent = CROSSHAIR_CSS;
      document.head.append(style);
    }
    this.root = document.createElement('div');
    this.root.className = 'ds-cross';
    this.root.innerHTML = '<i></i><i></i><i></i><i></i><b></b><u></u>';
    parent.append(this.root);
    this.#arms = [...this.root.querySelectorAll('i')] as HTMLElement[];
    this.#dot = this.root.querySelector('b') as HTMLElement;
    this.#ring = this.root.querySelector('u') as HTMLElement;
    this.options = DEFAULT_CROSSHAIR;
  }

  get options(): CrosshairOptions {
    return this.#options;
  }

  set options(options: CrosshairOptions) {
    this.#options = options;
    this.root.style.setProperty('--ds-cross', CROSSHAIR_COLOURS[options.colour] ?? CROSSHAIR_COLOURS.white);
  }

  /** Draws it with the weapon's spread `spreadPx` wide on screen. */
  update(spreadPx: number): void {
    const layout = crosshairLayout(this.#options, spreadPx);
    this.#arms.forEach((el, i) => this.#place(el, layout.arms[i] ?? null));
    this.#place(this.#dot, layout.dot);
    this.#place(this.#ring, layout.ring, layout.ring ? `border-width:${px(layout.ring.line)};` : '');
  }

  #place(el: HTMLElement, box: CrosshairBox | null, extra = ''): void {
    const css = box ? `left:${px(box.x)};top:${px(box.y)};width:${px(box.w)};height:${px(box.h)};${extra}` : 'display:none;';
    if (this.#written.get(el) === css) return;
    this.#written.set(el, css);
    el.style.cssText = css;
  }
}
