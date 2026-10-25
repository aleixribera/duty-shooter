/** Everything a key or mouse button can be bound to. */
export const ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'sprint',
  'crouch',
  'prone',
  'jump',
  'fire',
  'ads',
  'reload',
  'melee',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * An input: a `KeyboardEvent.code` such as `KeyW` or `ShiftLeft` (layout
 * independent), or `Mouse<button>` for a mouse button (`Mouse0` left,
 * `Mouse2` right).
 */
export type InputCode = string;

/** One input per action; null when unbound. */
export type Bindings = Readonly<Record<Action, InputCode | null>>;

/** MW2019's default keyboard and mouse bindings. */
export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  prone: 'ControlLeft',
  jump: 'Space',
  fire: 'Mouse0',
  ads: 'Mouse2',
  reload: 'KeyR',
  melee: 'KeyV',
};

export function mouseCode(button: number): InputCode {
  return `Mouse${button}`;
}

/** The action bound to an input, or null. */
export function actionFor(bindings: Bindings, code: InputCode): Action | null {
  return ACTIONS.find((action) => bindings[action] === code) ?? null;
}

/** Binds `action` to `code`, unbinding whatever action had that input. Returns new bindings. */
export function rebind(bindings: Bindings, action: Action, code: InputCode): Bindings {
  const next: Record<Action, InputCode | null> = { ...bindings };
  for (const other of ACTIONS) if (next[other] === code) next[other] = null;
  next[action] = code;
  return next;
}

/** A short label for an input, for menus. */
export function inputLabel(code: InputCode | null): string {
  if (code === null) return 'Unbound';
  const mouse = /^Mouse(\d+)$/.exec(code);
  if (mouse) return ['Left click', 'Middle click', 'Right click'][Number(mouse[1])] ?? `Mouse ${mouse[1]}`;
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/(Left|Right)$/, ' $1')
    .trim();
}
