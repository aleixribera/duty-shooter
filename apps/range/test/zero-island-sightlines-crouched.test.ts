import { describe, expect, it } from 'vitest';
import { regionAt, REGION_IDS } from '../src/map/zero-island-terrain';
import { report } from './support/sightlines';
import { crouched, line, map } from './support/island-sightlines';

// Zero Island's sightlines for a crouched body (head 1.1 m up), as a bot sees it, through foliage or not; standing
// is measured in zero-island-sightlines.test.ts.
const COVER_WITHIN = 15;
const { soft, bare } = crouched();

describe('Zero Island: sightlines, crouched', () => {
  it('reports what it measured', () => {
    console.log(line('crouched, bare', bare));
    console.log(line('crouched, soft', soft));
    for (const id of REGION_IDS) console.log(line(`  ${id}`, soft.filter((p) => regionAt(p.x, p.z) === id)));
  });

  it("hides a crouched body from a bot's eyes sooner with the soft cover than without it", () => {
    expect(map.soft!.length).toBeGreaterThan(10_000);
    const [s, b] = [report(soft, COVER_WITHIN), report(bare, COVER_WITHIN)];
    expect(s.viewP90).toBeLessThan(b.viewP90);
    expect(s.lanes).toBeLessThan(b.lanes);
  });
});
