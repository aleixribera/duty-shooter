import { describe, expect, it } from 'vitest';
import { regionAt, REGION_IDS } from '../src/map/zero-island-terrain';
import { report, sight, type Sighted } from './support/sightlines';
import { landPoints, line, map, options, world } from './support/island-sightlines';

// Zero Island's sightlines for a crouched body (head 1.1 m up), as a bot sees it, through foliage or not; standing
// is measured in zero-island-sightlines.test.ts.
const COVER_WITHIN = 15;
const CROUCHED = 1.1;
const crouched: Sighted[] = landPoints().map((p) => sight(world, p, { ...options, target: CROUCHED, soft: true }));
const crouchedBare: Sighted[] = landPoints().map((p) => sight(world, p, { ...options, target: CROUCHED }));

describe('Zero Island: sightlines, crouched', () => {
  it('reports what it measured', () => {
    console.log(line('crouched, bare', crouchedBare));
    console.log(line('crouched, soft', crouched));
    for (const id of REGION_IDS) console.log(line(`  ${id}`, crouched.filter((p) => regionAt(p.x, p.z) === id)));
  });

  it("hides a crouched body from a bot's eyes sooner with the soft cover than without it", () => {
    expect(map.soft!.length).toBeGreaterThan(10_000);
    const [soft, bare] = [report(crouched, COVER_WITHIN), report(crouchedBare, COVER_WITHIN)];
    expect(soft.viewP90).toBeLessThan(bare.viewP90);
    expect(soft.lanes).toBeLessThan(bare.lanes);
  });
});
