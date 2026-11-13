import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Something worth keeping a record of, as the game server reports it; the log adds the time. */
export type LoggedEvent = (
  | { readonly event: 'serverStart'; readonly version: string }
  | { readonly event: 'lobbyOpen' | 'lobbyClose' }
  | { readonly event: 'join' | 'leave'; readonly id: string; readonly name: string; readonly bot: boolean; readonly script: boolean }
  | { readonly event: 'matchStart'; readonly map: string; readonly mode: string; readonly hvb: boolean }
  | {
      readonly event: 'matchEnd';
      readonly map: string;
      readonly mode: string;
      readonly hvb: boolean;
      /** Seconds the match lasted. */
      readonly duration: number;
      readonly result: unknown;
    }
) & {
  /** The private lobby it happened in; absent for the public one. */
  readonly lobby?: string;
};

/**
 * The server's event log: one JSON line per event, appended to a file (on the
 * container's one writable volume, so it survives redeploys) and printed to
 * stdout. A file that can't be written is reported once; stdout carries on.
 *
 * Both are synchronous, so what's written during a tick waits for {@link flush}
 * after it: a full lobby's bots joining in one tick is 58 writes otherwise.
 */
export class EventLog {
  readonly #path: string | null;
  readonly #print: (line: string) => void;
  readonly #now: () => Date;
  readonly #process: string | null;
  #failed = false;
  #waiting: string[] = [];

  /** `process` names the server process on every line, where more than one shares the log (ADR 0009); absent for the main one. */
  constructor(path: string | null, options: { print?: (line: string) => void; now?: () => Date; process?: string } = {}) {
    this.#path = path;
    this.#process = options.process ?? null;
    this.#print = options.print ?? ((line) => console.log(line));
    this.#now = options.now ?? (() => new Date());
    if (path) {
      try {
        mkdirSync(dirname(path), { recursive: true });
      } catch {
        // Reported at the first write.
      }
    }
  }

  write(entry: LoggedEvent): void {
    this.#waiting.push(JSON.stringify({ time: this.#now().toISOString(), ...(this.#process ? { process: this.#process } : {}), ...entry }));
  }

  /** Writes out what's waiting, all at once. */
  flush(): void {
    if (this.#waiting.length === 0) return;
    const lines = this.#waiting.join('\n');
    this.#waiting = [];
    this.#print(lines);
    if (!this.#path || this.#failed) return;
    try {
      appendFileSync(this.#path, `${lines}\n`);
    } catch (error) {
      this.#failed = true;
      console.error(`The event log can't be written to ${this.#path}: ${(error as Error).message}`);
    }
  }
}
