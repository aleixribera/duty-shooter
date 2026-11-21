import type { PadNav } from '../gamepad';
import { escapeHtml, installTheme } from './theme';

/**
 * The on-screen keyboard: how a controller types into a text field (a name, a passphrase). It stands as a dialog
 * plate at the lower left over the screen that opened it. The d-pad or stick moves over the keys, Cross types,
 * Square erases, Triangle types a space, Options is Done and Circle puts the field back as it was.
 */
const CSS = `
.ds-osk { position: fixed; inset: 0; z-index: 40; background: var(--ds-scrim-soft); }
.ds-osk .plate { position: absolute; left: calc(var(--ds-gutter) + var(--ds-safe-l)); bottom: calc(56px + var(--ds-safe-b)); width: min(760px, calc(100vw - 2 * var(--ds-gutter))); padding: 24px 28px 22px; }
.ds-osk .plate > * { position: relative; }
.ds-osk .field { display: block; margin: 0 0 18px; }
.ds-osk .text { display: flex; align-items: center; min-height: 64px; padding: 0 16px; background: var(--ds-ink); border: 1px solid var(--ds-light-edge); font: 700 var(--ds-type-heading) var(--ds-font); font-size: 30px; letter-spacing: 0.02em; color: var(--ds-text); white-space: pre; overflow: hidden; }
.ds-osk .text i { display: inline-block; width: 3px; height: 1.1em; margin-left: 2px; background: var(--ds-light); animation: ds-osk-caret 1s steps(1) infinite; }
@keyframes ds-osk-caret { 50% { opacity: 0; } }
.ds-osk .keys { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 6px; }
.ds-osk .keys .ds-btn { --ds-ch: 8px; min-height: 56px; min-width: 0; padding: 0; font-size: var(--ds-type-heading); letter-spacing: 0.02em; text-transform: none; }
.ds-osk .keys .ds-btn.word { gap: 10px; font-size: var(--ds-type-body); letter-spacing: 0.1em; text-transform: uppercase; }
.ds-osk .keys .ds-btn .ds-kbd.pad { min-width: 24px; width: 24px; height: 24px; font-size: var(--ds-type-small); letter-spacing: 0; }
.ds-osk .keys .ds-btn.on { --ds-edge: var(--ds-text-2); --ds-fill: var(--ds-raised); }
.ds-osk .ds-hints { margin-top: 18px; font-size: var(--ds-type-body); }
.ds-osk .ds-hints .ds-kbd.pad { display: inline-flex; min-width: 28px; width: 28px; height: 28px; margin-right: 8px; font-size: var(--ds-type-body); }
@media (prefers-reduced-motion: reduce) { .ds-osk .text i { animation: none; } }
@media (max-width: 640px) { .ds-osk .plate { padding: 16px; } .ds-osk .keys .ds-btn { min-height: 44px; font-size: var(--ds-type-body); } }
`;

/** A key: what it types, or a word key's action; `span` columns of ten. */
interface Key {
  readonly label: string;
  readonly act: 'type' | 'shift' | 'space' | 'erase' | 'done';
  readonly span: number;
  /** The pad button that does this key from anywhere on the keyboard. */
  readonly glyph?: string;
}

const ROWS: readonly string[] = ['1234567890', 'qwertyuiop', "asdfghjkl-", "zxcvbnm_.'"];
const LAST_ROW: readonly Key[] = [
  { label: 'Shift', act: 'shift', span: 2 },
  { label: 'Space', act: 'space', span: 4, glyph: '△' },
  { label: 'Delete', act: 'erase', span: 2, glyph: '□' },
  { label: 'Done', act: 'done', span: 2, glyph: '≡' },
];

function layout(): Key[][] {
  return [...ROWS.map((r) => [...r].map((c): Key => ({ label: c, act: 'type', span: 1 }))), [...LAST_ROW]];
}

export class PadKeyboard {
  readonly #root: HTMLElement;
  readonly #keys = layout();
  #input: HTMLInputElement | null = null;
  #before = '';
  #label = '';
  #done: (() => void) | null = null;
  #row = 0;
  /** The column (of ten) the focus is over, kept while moving up and down through wide keys. */
  #col = 0;
  #shift = false;

  constructor(parent: HTMLElement = document.body) {
    installTheme();
    if (!document.getElementById('ds-osk-css')) {
      const style = document.createElement('style');
      style.id = 'ds-osk-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#root = document.createElement('div');
    this.#root.className = 'ds-osk ds-ui pad';
    this.#root.hidden = true;
    this.#root.setAttribute('role', 'dialog');
    this.#root.setAttribute('aria-modal', 'true');
    this.#root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (!b) return;
      this.#row = Number(b.dataset['r']);
      this.#col = Number(b.dataset['c']);
      this.#press();
    });
    parent.append(this.#root);
    // A real keyboard still types into the field itself; its Escape and Enter end the edit here, not on the screen behind.
    document.addEventListener(
      'keydown',
      (e) => {
        if (!this.open || (e.key !== 'Escape' && e.key !== 'Enter')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.#close(e.key === 'Enter');
      },
      true,
    );
  }

  get open(): boolean {
    return !this.#root.hidden;
  }

  /** Opens over `input`, typing into it; `done` hears Done (not a cancel). */
  edit(input: HTMLInputElement, label: string, done?: () => void): void {
    this.#input = input;
    this.#before = input.value;
    this.#label = label;
    this.#done = done ?? null;
    this.#row = 1;
    this.#col = 0;
    // A name starts with a capital; a passphrase or a code types as it comes.
    this.#shift = input.value.length === 0 && input.type !== 'password' && /name/i.test(label);
    this.#root.setAttribute('aria-label', label);
    this.#root.hidden = false;
    this.#render();
  }

  navigate(nav: PadNav): void {
    if (!this.open) return;
    // Its field was drawn away under it (its screen closed or redrawn): nothing left to type into.
    if (!this.#input?.isConnected) return this.cancel();
    switch (nav) {
      case 'up':
        this.#row = (this.#row + this.#keys.length - 1) % this.#keys.length;
        break;
      case 'down':
        this.#row = (this.#row + 1) % this.#keys.length;
        break;
      case 'left':
      case 'right': {
        const row = this.#keys[this.#row]!;
        const i = this.#indexAt(this.#row, this.#col);
        const next = row[(i + (nav === 'left' ? row.length - 1 : 1)) % row.length]!;
        this.#col = this.#startOf(this.#row, row.indexOf(next));
        break;
      }
      case 'accept':
        this.#press();
        return;
      case 'erase':
        this.#act('erase');
        return;
      case 'alt':
        this.#act('space');
        return;
      case 'start':
        this.#act('done');
        return;
      case 'back':
        this.#close(false);
        return;
      default:
        return;
    }
    this.#render();
  }

  /** Closes without typing: the field goes back as it was. */
  cancel(): void {
    if (this.open) this.#close(false);
  }

  /** The key of row `r` covering column `col`. */
  #indexAt(r: number, col: number): number {
    let start = 0;
    const row = this.#keys[r]!;
    for (let i = 0; i < row.length; i++) {
      start += row[i]!.span;
      if (col < start) return i;
    }
    return row.length - 1;
  }

  #startOf(r: number, i: number): number {
    return this.#keys[r]!.slice(0, i).reduce((a, k) => a + k.span, 0);
  }

  #press(): void {
    const key = this.#keys[this.#row]![this.#indexAt(this.#row, this.#col)]!;
    if (key.act === 'type') this.#type(this.#shift ? key.label.toUpperCase() : key.label);
    else this.#act(key.act);
  }

  #act(act: Key['act']): void {
    const input = this.#input;
    if (!input) return;
    if (act === 'shift') this.#shift = !this.#shift;
    else if (act === 'space') this.#type(' ');
    else if (act === 'erase') this.#set(input.value.slice(0, -1));
    else if (act === 'done') return this.#close(true);
    this.#render();
  }

  #type(text: string): void {
    const input = this.#input;
    if (!input) return;
    const max = input.maxLength > 0 ? input.maxLength : Infinity;
    if (input.value.length >= max) return;
    this.#set(input.value + text);
    // A capital starts a name; the next letters are small, as on a phone.
    if (/[a-z]/i.test(text)) this.#shift = false;
    this.#render();
  }

  #set(value: string): void {
    const input = this.#input!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  #close(done: boolean): void {
    const input = this.#input;
    const after = this.#done;
    this.#root.hidden = true;
    this.#input = null;
    this.#done = null;
    if (!input) return;
    if (!done && input.value !== this.#before) this.#set(this.#before);
    if (done) input.dispatchEvent(new Event('change', { bubbles: true }));
    if (done) after?.();
  }

  #render(): void {
    const input = this.#input;
    if (!input) return;
    const shown = input.type === 'password' ? '•'.repeat(input.value.length) : input.value;
    const focus = this.#indexAt(this.#row, this.#col);
    const keys = this.#keys
      .map((row, r) =>
        row
          .map((k, i) => {
            const label = k.act === 'type' && this.#shift ? k.label.toUpperCase() : k.label;
            const cls = ['ds-btn', k.act === 'type' ? '' : 'word', k.act === 'shift' && this.#shift ? 'on' : ''].filter(Boolean).join(' ');
            const pad = r === this.#row && i === focus ? ' data-pad-focus' : '';
            const glyph = k.glyph ? `<i class="ds-kbd pad" aria-hidden="true">${k.glyph}</i>` : '';
            return `<button type="button" tabindex="-1" class="${cls}" style="grid-column: span ${k.span}" data-r="${r}" data-c="${this.#startOf(r, i)}"${pad}>${escapeHtml(label)}${glyph}</button>`;
          })
          .join(''),
      )
      .join('');
    const hint = (glyph: string, label: string) => `<span><i class="ds-kbd pad">${glyph}</i>${label}</span>`;
    this.#root.innerHTML = `<div class="plate ds-plate"><div class="field"><span class="ds-field-label">${escapeHtml(this.#label)}</span><span class="text" aria-live="polite">${escapeHtml(shown)}<i aria-hidden="true"></i></span></div><div class="keys">${keys}</div><div class="ds-hints">${hint('○', 'Cancel')}</div></div>`;
  }
}

/** Whether `el` is a field the on-screen keyboard types into. */
export function typable(el: Element | null | undefined): el is HTMLInputElement {
  return el instanceof HTMLInputElement && !el.readOnly && !el.disabled && ['text', 'password', 'search', ''].includes(el.type);
}

/** A field's name for the keyboard's plate: its label's words, or its aria-label. */
export function fieldLabel(input: HTMLInputElement): string {
  const label = input.closest('label')?.querySelector('.ds-field-label')?.textContent ?? input.closest('.ds-row')?.querySelector('.ds-row-label, label, span')?.textContent;
  return (label ?? input.getAttribute('aria-label') ?? input.placeholder ?? '').trim();
}

let shared: PadKeyboard | null = null;

/** The page's one on-screen keyboard, made on first use. */
export function padKeyboard(): PadKeyboard {
  return (shared ??= new PadKeyboard());
}

/** Whether the page's on-screen keyboard is up (without making one). */
export function padKeyboardOpen(): boolean {
  return shared?.open ?? false;
}
