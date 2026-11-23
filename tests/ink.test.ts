// Plan §5.2: dark-only contrast. Every text token ≥ 4.5:1 (body text ≥ 7:1), every mark and UI token ≥ 3:1,
// on every surface text can sit on.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, inkStep, toOklch } from '../src/lib/color';
import { GENERATED, inkBlocks, primitive, surfaces } from '../src/lib/ink';
import render from '../src/data/capture/source/render.json';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const S = surfaces(css);
const inks = Object.fromEntries([...css.matchAll(/--ink-([\w]+): (#[0-9A-F]{6})/g)].map((m) => [m[1], m[2]]));
const onAll = (hex: string, min: number, what: string) => {
  for (const s of S) expect(contrast(hex, s), `${what} ${hex} on ${s}`).toBeGreaterThanOrEqual(min);
};

describe('dark-only contrast (§5.2)', () => {
  it('surfaces are the approved near-black foundation', () => {
    expect(S).toEqual(['#09090B', '#111114', '#18181C', '#060608']);
  });

  it('contrast maths matches known values', () => {
    expect(contrast('#7F5AF0', '#FAFAF9')).toBeCloseTo(4.35, 2);
    expect(contrast('#8D6CFF', '#101014')).toBeCloseTo(5.17, 2);
  });

  it('tokens.css is what `npm run ink` generates', () => expect(inkBlocks(css)).toBe(css));

  it('text tokens: primary and secondary ≥ 7:1, metadata and accent ≥ 4.5:1', () => {
    onAll(primitive(css, 'text'), 7, 'text');
    onAll(primitive(css, 'text-2'), 7, 'text-2');
    onAll(primitive(css, 'text-3'), 4.5, 'text-3');
    onAll(primitive(css, 'uv-hi'), 4.5, 'accent');
  });

  it('every generated ink is ≥ 4.5:1 and keeps its mark\'s hue', () => {
    expect(Object.keys(inks).sort()).toEqual([...GENERATED].sort());
    for (const [t, hex] of Object.entries(inks)) {
      onAll(hex, 4.5, `ink-${t}`);
      const [, c0, h0] = toOklch((render.PALETTE as Record<string, string>)[t]);
      const [, c1, h1] = toOklch(hex);
      if (c0 > 0.02 && c1 > 0.02) expect(Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))), t).toBeLessThan(0.05);
    }
  });

  it('marks (CLI hex, unchanged) and UI tokens are ≥ 3:1', () => {
    for (const [t, hex] of Object.entries(render.PALETTE)) if (t !== 'uv.lo') onAll(hex, 3, `mark ${t}`);
    onAll(primitive(css, 'uv'), 3, 'focus ring');
    onAll(primitive(css, 'scroll-thumb'), 3, 'scrollbar thumb');
  });

  it('inkStep leaves passing colours alone', () => expect(inkStep('#FFFFFF', ['#000000'])).toBe('#FFFFFF'));
});
