/**
 * Just enough of a DOM for HUD pieces that build plain elements and set
 * their class, markup and inline style (the Battle Royale HUD): no parsing,
 * no layout. `innerHTML` is kept as the string it was given, so a test reads
 * what an element says from it. Install it before constructing, and call the
 * returned `restore` after.
 */
export class FakeElement {
  className = '';
  innerHTML = '';
  hidden = false;
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void } = Object.assign(Object.create(null) as Record<string, string>, {
    setProperty(this: Record<string, string>, name: string, value: string) {
      this[name] = value;
    },
  });
  readonly classList = {
    add: (...names: string[]) => this.#classes(new Set([...this.#names(), ...names])),
    remove: (...names: string[]) => this.#classes(new Set(this.#names().filter((n) => !names.includes(n)))),
    contains: (name: string) => this.#names().includes(name),
    toggle: (name: string, on?: boolean) => {
      const want = on ?? !this.#names().includes(name);
      if (want) this.classList.add(name);
      else this.classList.remove(name);
      return want;
    },
  };
  id = '';
  textContent = '';
  width = 0;
  height = 0;
  readonly clientWidth = 0;

  constructor(readonly tagName: string) {}

  #names(): string[] {
    return this.className.split(/\s+/).filter(Boolean);
  }

  #classes(names: Set<string>): void {
    this.className = [...names].join(' ');
  }

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  getContext(): null {
    return null;
  }

  /** Every element under this one (not itself) with class `name`. */
  all(name: string): FakeElement[] {
    const out: FakeElement[] = [];
    for (const c of this.children) {
      if (c.#names().includes(name)) out.push(c);
      out.push(...c.all(name));
    }
    return out;
  }

  /** The one element under this one with class `name`. */
  one(name: string): FakeElement {
    const [e, ...more] = this.all(name);
    if (!e || more.length > 0) throw new Error(`expected one .${name}, found ${more.length + (e ? 1 : 0)}`);
    return e;
  }

  /** Shown by its inline style (the fake has no stylesheet). */
  get shown(): boolean {
    return this.style['display'] !== 'none';
  }

  /** Its markup as plain text. */
  get text(): string {
    return this.innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export function installFakeDom(): { readonly root: FakeElement; restore(): void } {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g['document'], requestIdleCallback: g['requestIdleCallback'] };
  const head = new FakeElement('head');
  g['document'] = {
    head,
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: (id: string) => head.children.find((c) => c.id === id) ?? null,
  };
  // The island painting waits for an idle moment that never comes in a test.
  g['requestIdleCallback'] = () => 0;
  return {
    root: new FakeElement('div'),
    restore() {
      g['document'] = saved.document;
      g['requestIdleCallback'] = saved.requestIdleCallback;
    },
  };
}
