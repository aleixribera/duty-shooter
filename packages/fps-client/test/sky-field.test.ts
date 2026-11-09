import { describe, expect, it } from 'vitest';
import { box, orientedBox, type Solid, type TerrainData, type Vec3 } from '@duty-shooter/fps-core';
import { buildSkyField, NEAR_CASTERS, shadeOver, type SkyField } from '../src/sky-field';

/** 200 m of ground a side round the origin, flat at 0 unless `height` says otherwise. */
function ground(height: (x: number, z: number) => number = () => 0): TerrainData {
  const columns = 200;
  const rows = 200;
  const heights = new Float32Array((columns + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) heights[j * (columns + 1) + i] = height(i - 100, j - 100);
  return { origin: [-100, -100], cell: 1, columns, rows, heights, palette: ['dirt'] } as TerrainData;
}

const SHADE = 0;
const CLOSE = 1;
const WIDE = 2;
const FAR = 3;

/** One of the field's four heights at the cell holding (x, z). */
function at(field: SkyField, x: number, z: number, which: number): number {
  const i = Math.floor((x - field.origin[0]) / field.cell);
  const j = Math.floor((z - field.origin[1]) / field.cell);
  return field.data[(j * field.columns + i) * 4 + which]!;
}

const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A sun in the east, one up for two along: a shadow runs twice its caster's height, west. */
const EAST = unit([1, 0.5, 0]);
const block = (min: Vec3, max: Vec3): Solid => box({ min, max, material: 'concrete' });

describe('the sky field (next-level ticket 07): what lights a map too wide to bake', () => {
  it('casts a block’s shadow away from the sun, as long as the sun’s height makes it', () => {
    const field = buildSkyField(ground(), [block([0, 0, -10], [10, 10, 10])], EAST);
    // 9 m behind the block the shadow stands about 5 m; past 20 m it is under the ground.
    expect(at(field, -9, 0, SHADE)).toBeGreaterThan(4);
    expect(at(field, -9, 0, SHADE)).toBeLessThan(6.5);
    expect(at(field, -17, 0, SHADE)).toBeGreaterThan(0.35);
    expect(at(field, -27, 0, SHADE)).toBeLessThan(0);
    // Toward the sun, and to either side, nothing.
    expect(at(field, 17, 0, SHADE)).toBeLessThan(0);
    expect(at(field, -9, 17, SHADE)).toBeLessThan(0);
  });

  it('follows a sun that stands across the grid', () => {
    const sun = unit([-0.62, 0.2, 0.76]);
    const field = buildSkyField(ground(), [block([-5, 0, -5], [5, 10, 5])], sun);
    const flat = Math.hypot(sun[0], sun[2]);
    // 25 m down the shadow from the block's middle (20 m past its edge, about).
    const x = (-sun[0] / flat) * 25;
    const z = (-sun[2] / flat) * 25;
    const due = 10 - 20 * (sun[1] / flat);
    expect(Math.abs(at(field, x, z, SHADE) - due)).toBeLessThan(1.6);
    // The same distance toward the sun, nothing.
    expect(at(field, -x, -z, SHADE)).toBeLessThan(0);
  });

  it('leaves a roof in the sun: what stands in a cell casts nothing on itself', () => {
    const field = buildSkyField(ground(), [block([0, 0, -10], [10, 10, 10])], EAST);
    for (const x of [1, 5, 9]) expect(at(field, x, 0, SHADE)).toBeLessThan(10.35);
    // Nor on the lit ground at its foot.
    expect(at(field, 13, 0, SHADE)).toBeLessThan(0);
  });

  it('casts a hill’s shadow like a block’s', () => {
    // A ridge 12 m high running north to south, 6 m through.
    const field = buildSkyField(ground((x) => (Math.abs(x) <= 3 ? 12 : 0)), [], EAST);
    expect(at(field, -13, 0, SHADE)).toBeGreaterThan(5);
    expect(at(field, -40, 0, SHADE)).toBeLessThan(0);
    expect(at(field, 13, 0, SHADE)).toBeLessThan(0);
  });

  it('keeps the casters close by out of the far shade, which the shadow map draws', () => {
    const wall = block([0, 0, -10], [2, 10, 10]);
    const field = buildSkyField(ground(), [wall], EAST);
    const near = NEAR_CASTERS / 2;
    expect(at(field, -near, 0, SHADE)).toBeGreaterThan(5);
    expect(at(field, -near, 0, FAR)).toBeLessThan(0.25);
    // Past that distance the two agree.
    const far = NEAR_CASTERS + 3;
    expect(at(field, -far, 0, FAR)).toBeGreaterThan(1);
    expect(Math.abs(at(field, -far, 0, FAR) - at(field, -far, 0, SHADE))).toBeLessThan(1.5);
  });

  it('gives a thin wall a shadow, and a post none', () => {
    const wall = buildSkyField(ground(), [block([2.1, 0, -10], [2.5, 10, 10])], EAST);
    expect(at(wall, -5, 0, SHADE)).toBeGreaterThan(4);
    const post = buildSkyField(ground(), [block([2.1, 0, 2.1], [2.5, 10, 2.5])], EAST);
    expect(at(post, -5, 2.3, SHADE)).toBeLessThan(0);
  });

  it('casts nothing from clip or from a prop', () => {
    const clip = box({ min: [0, 0, -10], max: [10, 10, 10], material: 'concrete', blocks: 'players' });
    const prop = box({ min: [0, 0, -10], max: [10, 10, 10], material: 'wood', prop: 'crate' });
    const field = buildSkyField(ground(), [clip, prop], EAST);
    expect(at(field, -9, 0, SHADE)).toBeLessThan(0);
    expect(at(field, 5, 0, CLOSE)).toBeCloseTo(0, 5);
  });

  it('stands a turned box where it is', () => {
    const turned = orientedBox({ center: [0, 5, 0], size: [10, 10, 10], yaw: Math.PI / 4, pitch: 0, roll: 0, material: 'concrete' });
    const field = buildSkyField(ground(), [turned], EAST);
    // Over its middle it is 10 m; at the corner of its bounds, where the turned box isn't, the ground.
    expect(at(field, 0.5, 0.5, CLOSE)).toBeGreaterThan(8);
    expect(at(field, -13, 0, SHADE)).toBeGreaterThan(2);
    expect(at(field, 6.5, 6.5, SHADE)).toBeLessThan(0);
  });

  it('knows how much stands over a place: much at a wall’s foot, less across the yard, nothing in the open', () => {
    const field = buildSkyField(ground(), [block([0, 0, -30], [20, 12, 30])], EAST);
    expect(at(field, -1, 0, CLOSE)).toBeGreaterThan(3);
    expect(at(field, -9, 0, CLOSE)).toBeLessThan(0.5);
    expect(at(field, -9, 0, WIDE)).toBeGreaterThan(1.5);
    expect(at(field, -80, 0, WIDE)).toBeLessThan(0.1);
    expect(at(field, -80, 0, CLOSE)).toBeCloseTo(0, 5);
  });

  it('casts nothing under a sun straight overhead, or under none', () => {
    const top = new Float32Array([0, 5, 0, 0, 0, 0, 0, 0, 0]);
    expect([...shadeOver(top, 3, 3, 2, [0, 1, 0])]).toEqual([...top]);
    expect([...shadeOver(top, 3, 3, 2, [1, -0.2, 0])]).toEqual([...top]);
  });

  it('is a quarter of the terrain’s cells, and quick to make', () => {
    const solids: Solid[] = [];
    for (let x = -90; x < 90; x += 6) for (let z = -90; z < 90; z += 6) solids.push(block([x, 0, z], [x + 3, 4, z + 3]));
    const from = performance.now();
    const field = buildSkyField(ground((x, z) => Math.sin(x / 20) * 4 + Math.cos(z / 30) * 3), solids, EAST);
    expect(field.columns * field.rows).toBe(100 * 100);
    expect(field.data.length).toBe(100 * 100 * 4);
    expect(performance.now() - from).toBeLessThan(2000);
  });
});
