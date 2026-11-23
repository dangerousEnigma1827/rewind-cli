// Ink steps (plan §5.2): same hue as the CLI mark, OKLCH lightness shifted until text is ≥ 4.5:1 on every dark surface.
import { inkStep } from './color.ts';
import render from '../data/capture/source/render.json' with { type: 'json' };

/** Marks whose ink is generated. Violet ink is the approved fixed uv.hi. */
export const GENERATED = ['mute', 'err', 'ok', 'write', 'r1', 'r2', 'r3', 'r4'] as const;

export const primitive = (css: string, name: string) => {
  const m = new RegExp(String.raw`--p-${name}:\s*(#[0-9A-Fa-f]{6})`).exec(css);
  if (!m) throw new Error(`tokens.css: no --p-${name}`);
  return m[1].toUpperCase();
};

/** Every surface text can sit on: page, the two raised surfaces, and the terminal. Ink must pass on all. */
export const surfaces = (css: string) => ['bg', 'surface-1', 'surface-2', 'term-bg'].map((n) => primitive(css, n));

/** tokens.css with the generated ink block rewritten (between the ink:dark markers, keeping their indent). */
export function inkBlocks(css: string): string {
  const s = surfaces(css);
  const pal = render.PALETTE as Record<string, string>;
  const re = new RegExp(String.raw`( *)/\* ink:dark \*/[\s\S]*?/\* /ink:dark \*/`);
  const m = re.exec(css);
  if (!m) throw new Error('tokens.css: no ink:dark markers');
  const lines = GENERATED.map((t) => `${m[1]}--ink-${t}: ${inkStep(pal[t], s)};\n`).join('');
  return css.replace(re, () => `${m[1]}/* ink:dark */\n${lines}${m[1]}/* /ink:dark */`);
}
