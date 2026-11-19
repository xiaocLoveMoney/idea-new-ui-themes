/**
 * Minimal sRGB color math shared by the build and the contrast check.
 * Colors are [r, g, b, a] with r/g/b in 0..255 and a in 0..1.
 */
export type Rgba = readonly [number, number, number, number];

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CHANNEL_MAX = 255;
const PERCENT = 100;
const SHORT_HEX_LENGTHS = new Set([3, 4]);
const WCAG_OFFSET = 0.05;
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA = 2.4;
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;

/** True when the value is a CSS hex color with 3, 4, 6 or 8 digits. */
export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/**
 * Parses a CSS hex color.
 * @throws Error when the value is not a hex color.
 */
export function parseHex(value: string): Rgba {
  if (!isHexColor(value)) {
    throw new Error(`not a hex color: ${value}`);
  }
  let digits = value.slice(1);
  if (SHORT_HEX_LENGTHS.has(digits.length)) {
    digits = [...digits].map((digit) => digit + digit).join('');
  }
  const channel = (index: number): number => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  const alpha = digits.length === 8 ? channel(3) / CHANNEL_MAX : 1;
  return [channel(0), channel(1), channel(2), alpha];
}

/** `color-mix(in srgb, first percent%, second)`. */
export function mix(first: Rgba, second: Rgba, percent: number): Rgba {
  const weight = percent / PERCENT;
  const blend = (index: number): number => first[index] * weight + second[index] * (1 - weight);
  return [blend(0), blend(1), blend(2), blend(3)];
}

/** Paints `top` over an opaque or translucent `bottom` (source-over). */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3] + bottom[3] * (1 - top[3]);
  if (alpha === 0) {
    return [0, 0, 0, 0];
  }
  const blend = (index: number): number => (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha;
  return [blend(0), blend(1), blend(2), alpha];
}

function linearChannel(value: number): number {
  const normalized = value / CHANNEL_MAX;
  return normalized <= LINEAR_THRESHOLD
    ? normalized / LINEAR_DIVISOR
    : ((normalized + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA;
}

/** WCAG relative luminance of an opaque color. */
export function luminance(color: Rgba): number {
  return LUMA_RED * linearChannel(color[0]) + LUMA_GREEN * linearChannel(color[1]) + LUMA_BLUE * linearChannel(color[2]);
}

/** WCAG contrast ratio between two opaque colors. */
export function contrastRatio(first: Rgba, second: Rgba): number {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + WCAG_OFFSET) / (darker + WCAG_OFFSET);
}
