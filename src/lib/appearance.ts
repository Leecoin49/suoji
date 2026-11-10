import type { FontFamily, FontScale } from "@/lib/api";

/**
 * Appearance is applied to the document root rather than threaded through every
 * component: zoom scales the whole layout (including the px-sized type), and the
 * font stack is a token the CSS already reads.
 */

export const FONT_STACKS: Record<FontFamily, string> = {
  sans: '"PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, -apple-system, sans-serif',
  serif: '"Georgia", "Songti SC", "SimSun", "Times New Roman", serif',
  kai: '"Kaiti SC", "KaiTi", "STKaiti", "PingFang SC", serif',
};

export const FONT_SCALES: FontScale[] = ["0.9", "1", "1.1", "1.25"];

export const FONT_FAMILIES: FontFamily[] = ["sans", "serif", "kai"];

export function fontScaleOf(value: string | undefined): FontScale {
  return FONT_SCALES.includes(value as FontScale) ? (value as FontScale) : "1";
}

export function fontFamilyOf(value: string | undefined): FontFamily {
  return FONT_FAMILIES.includes(value as FontFamily) ? (value as FontFamily) : "sans";
}

export function applyAppearance(settings: { fontScale?: string; fontFamily?: string }) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", FONT_STACKS[fontFamilyOf(settings.fontFamily)]);
  // `zoom` resizes the layout too, so nothing is clipped when the type grows.
  root.style.zoom = fontScaleOf(settings.fontScale);
}
