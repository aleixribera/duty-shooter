/** One line of the server's event log (see event-log.ts). */
interface LogLine {
  readonly time: string;
  readonly event: string;
  readonly id?: string;
  readonly name?: string;
  readonly bot?: boolean;
  readonly script?: boolean;
}

export interface PlayReport {
  /** Per day (UTC) that anyone played: people's sessions (a join to its leave) and how many different people. */
  readonly days: readonly { readonly day: string; readonly sessions: number; readonly people: number }[];
  /** The most people in the lobby at the same time. */
  readonly peakPeople: number;
  readonly matchesFinished: number;
  /** Seat time summed over every person, and over every bot (seconds). */
  readonly peopleSeconds: number;
  readonly botSeconds: number;
}

interface Session {
  readonly name: string;
  readonly bot: boolean;
  readonly start: number;
}

/**
 * Reads the event log (one JSON object per line) into the play report.
 * Script players (smoke and load tests) are left out. Sessions a restart cut
 * off (no `leave` before the next `serverStart`) end at the last line before
 * the restart. Unreadable lines are skipped.
 */
export function playReport(log: string): PlayReport {
  const days = new Map<string, { sessions: number; people: Set<string> }>();
  let open = new Map<string, Session>();
  let peak = 0;
  let matches = 0;
  let peopleSeconds = 0;
  let botSeconds = 0;
  let lastTime: number | null = null;

  const close = (session: Session, end: number) => {
    const seconds = Math.max(0, (end - session.start) / 1000);
    if (session.bot) botSeconds += seconds;
    else peopleSeconds += seconds;
  };
  const people = () => [...open.values()].filter((s) => !s.bot).length;

  for (const raw of log.split('\n')) {
    const line = parse(raw);
    if (!line) continue;
    const time = Date.parse(line.time);
    if (line.event === 'serverStart') {
      for (const s of open.values()) close(s, lastTime ?? time);
      open = new Map();
    } else if ((line.event === 'join' || line.event === 'leave') && line.id && !line.script) {
      const bot = line.bot === true;
      if (line.event === 'join') {
        const session = { name: line.name ?? line.id, bot, start: time };
        open.set(line.id, session);
        if (!bot) {
          const day = line.time.slice(0, 10);
          const entry = days.get(day) ?? { sessions: 0, people: new Set<string>() };
          entry.sessions += 1;
          entry.people.add(session.name);
          days.set(day, entry);
          peak = Math.max(peak, people());
        }
      } else {
        const session = open.get(line.id);
        if (session) {
          close(session, time);
          open.delete(line.id);
        }
      }
    } else if (line.event === 'matchEnd') matches += 1;
    lastTime = time;
  }
  for (const s of open.values()) close(s, lastTime ?? s.start);

  return {
    days: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, e]) => ({ day, sessions: e.sessions, people: e.people.size })),
    peakPeople: peak,
    matchesFinished: matches,
    peopleSeconds,
    botSeconds,
  };
}

function parse(raw: string): LogLine | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object') return null;
    const line = value as LogLine;
    return typeof line.time === 'string' && typeof line.event === 'string' && !Number.isNaN(Date.parse(line.time)) ? line : null;
  } catch {
    return null;
  }
}

const duration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
};

/** The report as plain text for the terminal. */
export function formatPlayReport(report: PlayReport): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return [
    'Sessions per day (UTC):',
    ...(report.days.length ? report.days.map((d) => `  ${d.day}  ${plural(d.sessions, 'session')}, ${plural(d.people, 'person').replace('persons', 'people')}`) : ['  none yet']),
    `Peak people at once: ${report.peakPeople}`,
    `Matches finished: ${report.matchesFinished}`,
    `Time played by people: ${duration(report.peopleSeconds)}`,
    `Time played by bots: ${duration(report.botSeconds)}`,
  ].join('\n');
}
