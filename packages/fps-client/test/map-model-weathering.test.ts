import { BufferAttribute, BufferGeometry, Color } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { finishGeometry } from '../src/map-models';

/** A two-vertex part with baked vertex colours of `itemSize` channels: occlusion in RGB, weathering (if any) in alpha. */
function part(colors: number[], itemSize: 3 | 4): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(colors), itemSize));
  return g;
}

describe('a map model weathered in its vertex colours (ticket 89)', () => {
  const finish = { family: 'concrete', color: 0xb9b2a4 } as const;
  const base = new Color(finish.color);

  it("darkens the finish's colour by the alpha, and keeps the occlusion from the red", () => {
    const g = finishGeometry(part([0.8, 0.8, 0.8, 0.5, 1, 1, 1, 1], 4), finish);
    const colour = g.getAttribute('finishColor');
    expect(colour.getX(0)).toBeCloseTo(base.r * 0.5);
    expect(colour.getZ(0)).toBeCloseTo(base.b * 0.5);
    expect(colour.getX(1)).toBeCloseTo(base.r);
    expect(g.getAttribute('modelAo').getX(0)).toBeCloseTo(0.8);
  });

  it('leaves a model with occlusion alone (RGB only) in its plain colour', () => {
    const g = finishGeometry(part([0.6, 0.6, 0.6, 1, 1, 1], 3), finish);
    expect(g.getAttribute('finishColor').getY(0)).toBeCloseTo(base.g);
    expect(g.getAttribute('modelAo').getX(0)).toBeCloseTo(0.6);
  });
});
