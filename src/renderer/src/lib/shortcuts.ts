export const IS_MAC = /Mac/i.test(navigator.userAgent);

/** True when the platform's primary modifier is held: ⌘ on macOS, Ctrl elsewhere. */
export function hasPrimaryModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey;
}

/**
 * Platform-neutral key tokens. `Mod` is ⌘ on macOS and Ctrl elsewhere; everything else is
 * rendered with the platform's own symbol or name.
 */
export type ShortcutKey =
  | 'Mod'
  | 'Shift'
  | 'Alt'
  | 'Enter'
  | 'Backspace'
  | 'Delete'
  | (string & {});

const MAC_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Shift: '⇧',
  Alt: '⌥',
  Enter: '⏎',
  Backspace: '⌫',
  Delete: '⌦'
};

const OTHER_NAMES: Record<string, string> = {
  Mod: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete'
};

export function formatShortcut(keys: ShortcutKey[]): string {
  return IS_MAC
    ? keys.map((key) => MAC_SYMBOLS[key] ?? key).join(' ')
    : keys.map((key) => OTHER_NAMES[key] ?? key).join('+');
}
