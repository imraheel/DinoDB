export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  if (typeof matchMedia === 'undefined') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
}
