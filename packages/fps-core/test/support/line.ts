import type { Connection } from '@duty-shooter/fps-core';

/** The line a client plays over: `cut` drops it, `silence` leaves it open and passing nothing, as a half-open socket does. */
export class Line {
  live!: Connection;
  silent = false;
  /** Attempts refused until this many have failed. */
  refuse = 0;
  attempts = 0;

  constructor(private readonly open: () => Connection) {}

  connect = (): Connection => {
    this.attempts += 1;
    this.silent = false;
    const raw = this.open();
    const refused = this.refuse > 0;
    if (refused) this.refuse -= 1;
    this.live = raw;
    return {
      get open() {
        return raw.open;
      },
      send: (data) => {
        if (!this.silent || this.live !== raw) raw.send(data);
      },
      close: (reason) => raw.close(reason),
      onMessage: (handler) =>
        raw.onMessage((data) => {
          if (!this.silent || this.live !== raw) handler(data);
        }),
      onClose: (handler) => {
        raw.onClose(handler);
        if (refused) raw.close('connection refused');
      },
    };
  };

  cut(): void {
    this.live.close('network went away');
  }
}
