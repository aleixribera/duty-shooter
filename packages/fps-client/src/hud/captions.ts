/**
 * Captions for what the announcer says (next-level ticket 22): the line, on a
 * plate above the readouts, for as long as it takes to say and a moment more.
 * It shows whether or not the voice is heard, so it works with the voice
 * turned down as well as for someone who cannot hear it.
 */
import { escapeHtml } from '../ui/theme';

export const CAPTIONS_CSS = `
.ds-caption { position: absolute; left: 50%; bottom: calc(176px + var(--ds-safe-b)); transform: translateX(-50%); width: max-content; max-width: min(640px, calc(100vw - 32px)); padding: 7px 14px 8px; background: var(--ds-scrim); font-size: var(--ds-type-body); line-height: 1.3; text-align: center; text-shadow: none; display: none; }
.ds-caption.on { display: block; }
.ds-caption small { font-size: var(--ds-type-small); color: var(--ds-text-2); margin-right: 10px; }
/* A phone: the thumbs own the bottom, so the line sits under the match bar instead. */
@media (max-width: 1000px) { .ds-caption { bottom: auto; top: calc(var(--ds-safe-t, 0px) + 108px); } .ds-hud.royale .ds-caption { top: calc(var(--ds-brstack-foot, 150px) + 12px); } }
`;

/** The shortest a caption stays (s), and how long it outlasts the voice. */
const SHORTEST = 2.5;
const LINGER = 1.2;

/** How long a caption for a line that takes `speech` seconds to say stays up. */
export function captionSeconds(speech: number): number {
  return Math.max(SHORTEST, speech + LINGER);
}

export class CaptionView {
  readonly root: HTMLDivElement;
  #left = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ds-caption';
    // Not a live region: the voice already says it, and a screen reader would say it twice.
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  /** Shows `line` (the announcer's, taking `speech` seconds to say), or clears it with null. */
  show(line: string | null, speech = 0): void {
    if (line === null) {
      this.#left = 0;
      this.root.classList.remove('on');
      return;
    }
    this.root.innerHTML = `<small>Range Control</small>${escapeHtml(line)}`;
    this.root.classList.add('on');
    this.#left = captionSeconds(speech);
  }

  update(dt: number): void {
    if (this.#left <= 0) return;
    this.#left -= dt;
    if (this.#left <= 0) this.root.classList.remove('on');
  }
}
