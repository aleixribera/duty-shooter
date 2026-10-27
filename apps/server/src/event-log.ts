import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Something worth keeping a record of, as the game server reports it; the log adds the time. */
export type LoggedEvent =
  | { readonly event: 'serverStart'; readonly version: string }
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
    };

/**
 * The server's event log: one JSON line per event, appended to a file (on the
 * container's one writable volume, so it survives redeploys) and printed to
 * stdout. A file that can't be written is reported once; stdout carries on.
 */
export class EventLog {
  readonly #path: string | null;
  readonly #print: (line: string) => void;
  readonly #now: () => Date;
  #failed = false;

  constructor(path: string | null, options: { print?: (line: string) => void; now?: () => Date } = {}) {
    this.#path = path;
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
    const line = JSON.stringify({ time: this.#now().toISOString(), ...entry });
    this.#print(line);
    if (!this.#path || this.#failed) return;
    try {
      appendFileSync(this.#path, `${line}\n`);
    } catch (error) {
      this.#failed = true;
      console.error(`The event log can't be written to ${this.#path}: ${(error as Error).message}`);
    }
  }
}
