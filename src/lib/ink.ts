// Ink steps (plan §5.2): same hue as the CLI mark, OKLCH lightness shifted until text is ≥ 4.5:1.
import { inkStep } from './color.ts';
import render from '../data/capture/source/render.json' with { type: 'json' };

/** Marks whose ink is generated. Violet ink is the approved fixed pair: uv.lo (light), uv.hi (dark). */
export const GENERATED = ['mute', 'err', 'ok', 'write', 'r1', 'r2', 'r3', 'r4'] as const;

export const primitive = (css: string, name: string) => {
  const m = new RegExp(String.raw`--p-${name}:\s*(#[0-9A-Fa-f]{6})`).exec(css);
  if (!m) throw new Error(`tokens.css: no --p-${name}`);
  return m[1].toUpperCase();
};

/** The page surface and the terminal panel of each theme: ink must pass on both. */
export const surfaces = (css: string) => ({
  light: [primitive(css, 'paper'), primitive(css, 'paper-step')],
  dark: [primitive(css, 'night'), primitive(css, 'night-step')],
});

/** tokens.css with both generated ink blocks rewritten (between the ink:<theme> markers, keeping their indent). */
export function inkBlocks(css: string): string {
  const s = surfaces(css);
  const pal = render.PALETTE as Record<string, string>;
  for (const theme of ['light', 'dark'] as const) {
    const re = new RegExp(String.raw`( *)/\* ink:${theme} \*/[\s\S]*?/\* /ink:${theme} \*/`);
    const m = re.exec(css);
    if (!m) throw new Error(`tokens.css: no ink:${theme} markers`);
    const lines = GENERATED.map((t) => `${m[1]}--ink-${t}: ${inkStep(pal[t], s[theme])};\n`).join('');
    css = css.replace(re, () => `${m[1]}/* ink:${theme} */\n${lines}${m[1]}/* /ink:${theme} */`);
  }
  return css;
}
