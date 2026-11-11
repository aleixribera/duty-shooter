import { describe, expect, it } from 'vitest';
import { formatPlayReport, playReport } from '../src/play-report';

const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h, m)).toISOString();
const line = (o: object) => JSON.stringify(o);

const join = (time: string, id: string, name: string, extra: object = {}) => line({ time, event: 'join', id, name, bot: false, script: false, ...extra });
const leave = (time: string, id: string, name: string, extra: object = {}) => line({ time, event: 'leave', id, name, bot: false, script: false, ...extra });

describe('play report', () => {
  it('counts sessions per day, the peak of people at once, finished matches, and people time against bot time', () => {
    const log = [
      line({ time: at(24, 19), event: 'serverStart', version: 'v1.3.9' }),
      join(at(24, 20), 'p1', 'alice'),
      join(at(24, 20, 5), 'p2', 'Kestrel', { bot: true }),
      join(at(24, 20, 10), 'p3', 'bob'),
      line({ time: at(24, 20, 10), event: 'matchStart', map: 'survival-town', mode: 'tdm', hvb: false }),
      line({ time: at(24, 20, 20), event: 'matchEnd', map: 'survival-town', mode: 'tdm', hvb: false, duration: 600, result: { winner: 1, winnerName: 'Blue', draw: false, reason: 'timeLimit' } }),
      leave(at(24, 20, 40), 'p3', 'bob'),
      leave(at(24, 21), 'p1', 'alice'),
      leave(at(24, 21), 'p2', 'Kestrel', { bot: true }),
      join(at(25, 18), 'p4', 'alice'),
      leave(at(25, 18, 30), 'p4', 'alice'),
    ].join('\n');

    const report = playReport(log);

    expect(report.days).toEqual([
      { day: '2026-10-24', sessions: 2, people: 2 },
      { day: '2026-10-25', sessions: 1, people: 1 },
    ]);
    expect(report.peakPeople).toBe(2);
    expect(report.matchesFinished).toBe(1);
    expect(report.peopleSeconds).toBe(60 * 60 + 30 * 60 + 30 * 60);
    expect(report.botSeconds).toBe(55 * 60);
  });

  it('keeps the Battle Royale process apart (ADR 0009): its seats are its own though ids repeat, and its restart ends only its own sessions', () => {
    const royale = { process: 'royale' };
    const log = [
      line({ time: at(27, 10), event: 'serverStart', version: 'v2' }),
      join(at(27, 10), 'p1', 'alice'),
      line({ time: at(27, 10, 5), event: 'serverStart', version: 'v2', ...royale }),
      join(at(27, 10, 5), 'p1', 'bob', royale),
      // The Battle Royale process ended with bob still in it, and a fresh one started.
      line({ time: at(27, 10, 15), event: 'serverStart', version: 'v2', ...royale }),
      leave(at(27, 10, 30), 'p1', 'alice'),
    ].join('\n');

    const report = playReport(log);

    expect(report.peakPeople).toBe(2);
    expect(report.days).toEqual([{ day: '2026-10-27', sessions: 2, people: 2 }]);
    // alice 30 min; bob from his join to the last line before his process restarted (10:05 to 10:05).
    expect(report.peopleSeconds).toBe(30 * 60);
  });

  it('leaves script players out of everything, and closes sessions a restart cut off at the last thing heard before it', () => {
    const log = [
      line({ time: at(26, 10), event: 'serverStart', version: 'v1.3.9' }),
      join(at(26, 10, 1), 'p1', 'smoke', { script: true }),
      leave(at(26, 10, 2), 'p1', 'smoke', { script: true }),
      join(at(26, 11), 'p2', 'carol'),
      line({ time: at(26, 11, 20), event: 'matchStart', map: 'survival-town', mode: 'ffa', hvb: false }),
      line({ time: at(26, 12), event: 'serverStart', version: 'v1.4.0' }),
      join(at(26, 12, 5), 'p1', 'carol'),
      leave(at(26, 12, 15), 'p1', 'carol'),
      'not json',
    ].join('\n');

    const report = playReport(log);

    expect(report.days).toEqual([{ day: '2026-10-26', sessions: 2, people: 1 }]);
    expect(report.peakPeople).toBe(1);
    expect(report.peopleSeconds).toBe(20 * 60 + 10 * 60);
    expect(report.matchesFinished).toBe(0);
  });

  it('prints as plain text', () => {
    const text = formatPlayReport(playReport([join(at(24, 20), 'p1', 'alice'), leave(at(24, 21, 30), 'p1', 'alice')].join('\n')));
    expect(text).toContain('2026-10-24  1 session');
    expect(text).toContain('1 h 30 min');
  });
});
