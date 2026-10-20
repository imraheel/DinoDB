import type { AccentSetting, AppSettings, CodeFontSetting, UiFontSetting } from '../../../shared/types';
import { resolveTheme } from './theme';

export interface AccentPalette {
  accent: string;
  hover: string;
  active: string;
  keyword: string;
}

const ACCENT_HEX: Record<AccentSetting, { light: string; dark: string }> = {
  blue: { light: '#007aff', dark: '#0a84ff' },
  purple: { light: '#8944ab', dark: '#bf5af2' },
  pink: { light: '#e0407a', dark: '#ff4d94' },
  red: { light: '#e0383e', dark: '#ff453a' },
  orange: { light: '#f7630c', dark: '#ff9f0a' },
  yellow: { light: '#f0b000', dark: '#ffd60a' },
  green: { light: '#28a844', dark: '#30d158' },
  graphite: { light: '#8e8e93', dark: '#98989d' }
};

const UI_FONT_STACKS: Record<UiFontSetting, string> = {
  system: "ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace"
};

const CODE_FONT_STACKS: Record<CodeFontSetting, string> = {
  'system-mono': "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace",
  menlo: "Menlo, 'SF Mono', monospace",
  consolas: "Consolas, 'Courier New', monospace",
  courier: "'Courier New', Courier, monospace"
};

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mix(hex: string, target: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([
    r + (target[0] - r) * amount,
    g + (target[1] - g) * amount,
    b + (target[2] - b) * amount
  ]);
}

function darken(hex: string, amount: number): string {
  return mix(hex, [0, 0, 0], amount);
}

function lighten(hex: string, amount: number): string {
  return mix(hex, [255, 255, 255], amount);
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function accentHex(accent: AccentSetting, mode: 'light' | 'dark'): string {
  return ACCENT_HEX[accent][mode];
}

export function getAccentPalette(accent: AccentSetting, mode: 'light' | 'dark'): AccentPalette {
  const base = accentHex(accent, mode);
  if (mode === 'dark') {
    return {
      accent: base,
      hover: lighten(base, 0.18),
      active: lighten(base, 0.3),
      keyword: lighten(base, 0.35)
    };
  }
  return {
    accent: base,
    hover: darken(base, 0.15),
    active: darken(base, 0.28),
    keyword: darken(base, 0.28)
  };
}

export function uiFontStack(uiFont: UiFontSetting): string {
  return UI_FONT_STACKS[uiFont];
}

export function codeFontStack(codeFont: CodeFontSetting): string {
  return CODE_FONT_STACKS[codeFont];
}

export function accentSoftRgba(accent: AccentSetting, mode: 'light' | 'dark'): string {
  return hexToRgba(accentHex(accent, mode), mode === 'dark' ? 0.16 : 0.12);
}

export function accentRingRgba(accent: AccentSetting, mode: 'light' | 'dark'): string {
  return hexToRgba(accentHex(accent, mode), mode === 'dark' ? 0.4 : 0.35);
}

export function applyAppearance(settings: AppSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const mode = resolveTheme(settings.theme);
  const palette = getAccentPalette(settings.accent, mode);
  root.style.setProperty('--color-accent', palette.accent);
  root.style.setProperty('--color-accent-hover', palette.hover);
  root.style.setProperty('--color-accent-active', palette.active);
  root.style.setProperty(
    '--color-accent-ring',
    hexToRgba(palette.accent, mode === 'dark' ? 0.4 : 0.35)
  );
  root.style.setProperty(
    '--color-accent-soft',
    hexToRgba(palette.accent, mode === 'dark' ? 0.16 : 0.12)
  );
  root.style.setProperty('--font-ui', uiFontStack(settings.uiFont));
  root.style.setProperty('--font-code', codeFontStack(settings.codeFont));
  root.style.setProperty('--ui-font-size', `${settings.uiFontSize}px`);
  root.style.setProperty('--dt-font-size', `${settings.tableFontSize}px`);
}
