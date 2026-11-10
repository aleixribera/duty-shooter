/**
 * The team colours and the enemy marker's colour, from one place (next-level
 * ticket 22): the HUD reads them as the `--ds-blue`, `--ds-orange` and
 * `--ds-enemy` tokens, the world as numbers (soldiers' pads and cloth, the
 * Outposts rings). A colour-vision setting swaps the three for a set that
 * stays apart under that deficiency; the marks (◆ ▲) stay as they are.
 *
 * No three.js and no DOM beyond the one guarded call that writes the tokens.
 */

export type ColourVision = 'off' | 'deuteranopia' | 'protanopia' | 'tritanopia';
export const COLOUR_VISIONS: readonly ColourVision[] = ['off', 'deuteranopia', 'protanopia', 'tritanopia'];
export const COLOUR_VISION_NAMES: Readonly<Record<ColourVision, string>> = { off: 'Off', deuteranopia: 'Deuteranopia', protanopia: 'Protanopia', tritanopia: 'Tritanopia' };

/** A team as it is drawn: its colour (HUD, pads, rings), and the toned-down cloth of its soldiers. */
export interface TeamColours {
  readonly colour: string;
  readonly uniform: string;
  readonly vest: string;
  readonly helmet: string;
  /** The portrait's backing in the match bar: the colour, nearly black. */
  readonly shade: string;
}

export interface TeamPalette {
  /** Team 1 (Blue ◆) and team 2 (Orange ▲). */
  readonly teams: Readonly<Record<1 | 2, TeamColours>>;
  /** An enemy ping, on the screen, the compass and the map. */
  readonly enemy: string;
}

const BLUE: TeamColours = { colour: '#3d8bff', uniform: '#40577a', vest: '#26364d', helmet: '#2f4362', shade: '#1d3354' };
const ORANGE: TeamColours = { colour: '#ff9a3c', uniform: '#8a6544', vest: '#5b412c', helmet: '#6e4c30', shade: '#4a2f17' };

/**
 * The sets. With full colour vision the orange team and the red enemy marker
 * are the close pair; red-green deficiencies close it further (a red and an
 * orange of one lightness are one colour), so those sets move the marker to
 * yellow and the orange toward red, apart in lightness. Tritanopia takes the
 * blue toward violet and the orange toward amber, the marker a lighter red.
 * `team-colours.test.ts` holds each set apart under its deficiency.
 */
export const TEAM_PALETTES: Readonly<Record<ColourVision, TeamPalette>> = {
  off: { teams: { 1: BLUE, 2: ORANGE }, enemy: '#ff6159' },
  deuteranopia: { teams: { 1: BLUE, 2: { colour: '#ff775c', uniform: '#8a544a', vest: '#5b3630', helmet: '#6e4038', shade: '#4a221b' } }, enemy: '#ffe600' },
  protanopia: { teams: { 1: BLUE, 2: { colour: '#ff925c', uniform: '#8a6048', vest: '#5b3e2e', helmet: '#6e4934', shade: '#4a2b19' } }, enemy: '#ffe600' },
  tritanopia: {
    teams: { 1: { colour: '#5c77ff', uniform: '#4a5280', vest: '#2c3150', helmet: '#363d66', shade: '#1f2554' }, 2: { colour: '#ffc93c', uniform: '#8a7544', vest: '#5b4c2c', helmet: '#6e5a30', shade: '#4a3a17' } },
    enemy: '#ff5a5a',
  },
};

let vision: ColourVision = 'off';

/** `#rrggbb` as a number, for three.js. */
export function hexNumber(colour: string): number {
  return Number.parseInt(colour.slice(1), 16);
}

/** `#rrggbb` as the three channels CSS takes in `rgb(r g b / a)`. */
export function rgbChannels(colour: string): string {
  const n = hexNumber(colour);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** The palette in use. */
export function teamPalette(): TeamPalette {
  return TEAM_PALETTES[vision];
}

/** A team's colours now, or null for no team (0, free-for-all). */
export function teamColours(team: number): TeamColours | null {
  return team === 1 || team === 2 ? TEAM_PALETTES[vision].teams[team] : null;
}

/** The CSS tokens a palette sets: the three colours, and each as bare channels for a tint of any strength. */
export function paletteTokens(palette: TeamPalette): Readonly<Record<string, string>> {
  return {
    '--ds-blue': palette.teams[1].colour,
    '--ds-orange': palette.teams[2].colour,
    '--ds-enemy': palette.enemy,
    '--ds-blue-rgb': rgbChannels(palette.teams[1].colour),
    '--ds-orange-rgb': rgbChannels(palette.teams[2].colour),
    '--ds-t1-shade': palette.teams[1].shade,
    '--ds-t2-shade': palette.teams[2].shade,
  };
}

/**
 * Picks the set. The HUD and the menus follow at once (they read the tokens);
 * the world reads the palette as its views are built, so soldiers already on
 * the field keep their colours until the next match.
 */
export function useColourVision(next: ColourVision): void {
  vision = next;
  const root = (globalThis as { document?: Document }).document?.documentElement;
  if (!root) return;
  for (const [token, value] of Object.entries(paletteTokens(TEAM_PALETTES[next]))) root.style.setProperty(token, value);
}

export function colourVision(): ColourVision {
  return vision;
}

/* ------------------------------------------------------------------ */
/* What a deficiency sees, for the tests and nothing else              */
/* ------------------------------------------------------------------ */

/** Machado, Oliveira and Fernandes (2009): full dichromacy, on linear RGB. */
const SEEN: Readonly<Record<Exclude<ColourVision, 'off'>, readonly (readonly number[])[]>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** A colour in CIELAB as someone with `seeing` sees it. */
function labAs(colour: string, seeing: ColourVision): readonly [number, number, number] {
  const n = hexNumber(colour);
  const linear = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const m = seeing === 'off' ? null : SEEN[seeing];
  const [r, g, b] = m ? m.map((row) => Math.min(1, Math.max(0, row[0]! * linear[0]! + row[1]! * linear[1]! + row[2]! * linear[2]!))) : linear;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047);
  const y = f(0.2126 * r! + 0.7152 * g! + 0.0722 * b!);
  const z = f((0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How far apart two colours look (CIELAB distance) to someone with `seeing`. Past 40 or so they are plainly two colours. */
export function seenApart(a: string, b: string, seeing: ColourVision): number {
  const p = labAs(a, seeing);
  const q = labAs(b, seeing);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
