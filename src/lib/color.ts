// sRGB ⇄ OKLCH and WCAG contrast, for the ink-step generator (plan §5.2) and its test.

type RGB = [number, number, number]; // 0..1, gamma-encoded

export const hexToRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
export const rgbToHex = (c: RGB) =>
  '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Björn Ottosson's OKLab.
export function toOklch(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch(L: number, C: number, h: number): RGB | null {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4) ? (lin.map(toGam) as RGB) : null;
}

/** Same hue, OKLCH lightness moved away from the surfaces until text reaches `min` contrast on every one.
 *  Chroma is reduced only when the colour would leave sRGB. Returns the input when it already passes. */
export function inkStep(hex: string, surfaces: string[], min = 4.5): string {
  const ok = (h: string) => surfaces.every((s) => contrast(h, s) >= min);
  if (ok(hex)) return hex;
  const [L0, C0, h] = toOklch(hex);
  const darker = luminance(surfaces[0]) > 0.18; // light surfaces need darker ink
  for (let step = 1; step <= 100; step++) {
    const L = darker ? L0 - step * 0.005 : L0 + step * 0.005;
    for (let C = C0; C >= 0; C -= 0.005) {
      const rgb = fromOklch(L, C, h);
      if (rgb && ok(rgbToHex(rgb))) return rgbToHex(rgb);
      if (rgb) break; // in gamut but not enough contrast yet: go further in lightness
    }
  }
  throw new Error(`inkStep: no ink for ${hex}`);
}
