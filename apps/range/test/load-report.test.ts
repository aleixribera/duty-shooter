import { describe, expect, it } from 'vitest';
import { LoadReport } from '../src/load-report';

// Ticket 57: a page tells the server once per Battle Royale that it has the
// island up, the load gate's cue to hand its seat back from a stand-in. A page
// that comes back after the Preparation ended (a hidden tab) still says so.

describe('when the page says it has loaded a Battle Royale', () => {
  it('says so once, in the Preparation', () => {
    const r = new LoadReport();
    expect(r.due({ seated: true, preparation: 100 })).toBe(true);
    expect(r.due({ seated: true, preparation: 100 })).toBe(false);
    expect(r.due({ seated: true, preparation: null })).toBe(false);
  });

  it('says so after the Preparation, when the page first runs then', () => {
    const r = new LoadReport();
    expect(r.due({ seated: false, preparation: null })).toBe(false);
    expect(r.due({ seated: true, preparation: null })).toBe(true);
    expect(r.due({ seated: true, preparation: null })).toBe(false);
  });

  it('says so again in the next match', () => {
    const r = new LoadReport();
    expect(r.due({ seated: true, preparation: 100 })).toBe(true);
    expect(r.due({ seated: false, preparation: null })).toBe(false);
    expect(r.due({ seated: true, preparation: 900 })).toBe(true);
  });

  it('says so for a new Preparation even if the page never left the match', () => {
    const r = new LoadReport();
    expect(r.due({ seated: true, preparation: 100 })).toBe(true);
    expect(r.due({ seated: true, preparation: 900 })).toBe(true);
  });
});
