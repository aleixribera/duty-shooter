/** What the page knows each frame: seated in a Battle Royale being played, and the Preparation's start while it runs (else null). */
export interface LoadView {
  readonly seated: boolean;
  readonly preparation: number | null;
}

/**
 * When the page tells the server it has the island up (`loaded`), the load
 * gate's cue to let its seat in, or to take it back from the bot that held it:
 * once per Battle Royale, the first frame it runs seated in one, whether in
 * the Preparation or after it (a tab hidden through it, ticket 57).
 */
export class LoadReport {
  #sent = false;
  #preparation: number | null = null;

  /** True on the frame `loaded` should be sent. */
  due(view: LoadView): boolean {
    if (!view.seated) {
      this.#sent = false;
      return false;
    }
    if (view.preparation !== null && view.preparation !== this.#preparation) {
      this.#preparation = view.preparation;
      this.#sent = false;
    }
    if (this.#sent) return false;
    this.#sent = true;
    return true;
  }
}
