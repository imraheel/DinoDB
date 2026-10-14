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

export function isMacPlatform(): boolean {
  if (typeof document === 'undefined') return false;
  const platform = navigator.platform + ' ' + navigator.userAgent;
  return /mac/i.test(platform);
}

export function applyPlatform(vibrancy = true): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('has-vibrancy', isMacPlatform() && vibrancy);
}
