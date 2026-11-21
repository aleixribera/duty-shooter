/** The parts of the page's window that quitting uses. */
export interface QuitWindow {
  /** The window itself on its own, the page framing it in a frame. */
  readonly parent: Pick<QuitWindow, 'postMessage'>;
  postMessage(message: unknown, targetOrigin: string): void;
  readonly location: { readonly origin: string; assign(url: string): void };
  readonly closed: boolean;
  close(): void;
  setTimeout(handler: () => void, ms: number): unknown;
}

/** The message the Arcade, which runs the game in a frame, closes the game on. */
export const ARCADE_QUIT = { type: 'arcade:quit' } as const;

/**
 * Leaves the game for good, after `save` has written progress. In the Arcade's frame the Arcade is asked to close it;
 * on its own the window closes (the Windows app quits with its window), and a tab the page didn't open, which a page
 * may not close, goes to the site's front page instead.
 */
export function quitGame(save: () => void, win: QuitWindow = window as unknown as QuitWindow): void {
  try {
    save();
  } catch {
    // Storage gone: nothing more to keep, and quitting still goes ahead.
  }
  if (win.parent !== win) {
    win.parent.postMessage(ARCADE_QUIT, win.location.origin);
    return;
  }
  win.close();
  win.setTimeout(() => {
    if (!win.closed) win.location.assign('/');
  }, 300);
}

/**
 * Writes progress whenever the page may be about to go without warning: hidden (a tab switched, the window closed or
 * minimised, the console's home button) or torn down. Everything is written as it changes; this catches a write that
 * failed then.
 */
export function saveOnExit(save: () => void, target: Pick<Window, 'addEventListener'> = window, doc: Pick<Document, 'addEventListener' | 'visibilityState'> = document): void {
  const run = () => {
    try {
      save();
    } catch {
      // Nothing to do: the page is going.
    }
  };
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') run();
  });
  target.addEventListener('pagehide', run);
}
