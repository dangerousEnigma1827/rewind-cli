import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrast, inkStep, toOklch } from '../src/lib/color';
import { GENERATED, inkBlocks, primitive, surfaces } from '../src/lib/ink';
import render from '../src/data/capture/source/render.json';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const S = surfaces(css);
const block = (theme: string) => new RegExp(String.raw`/\* ink:${theme} \*/([\s\S]*?)/\* /ink:`).exec(css)![1];
const inks = (theme: string) => Object.fromEntries([...block(theme).matchAll(/--ink-([\w]+): (#[0-9A-F]{6})/g)].map((m) => [m[1], m[2]]));

describe('ink steps (§5.2)', () => {
  it('contrast maths matches the plan\'s measured values', () => {
    expect(contrast('#7F5AF0', '#FAFAF9')).toBeCloseTo(4.35, 2);
    expect(contrast('#8D6CFF', '#101014')).toBeCloseTo(5.17, 2);
  });

  it('tokens.css is what `npm run ink` generates', () => {
    expect(inkBlocks(css)).toBe(css);
  });

  it.each(['light', 'dark'] as const)('%s: every ink is ≥ 4.5:1 on the page and terminal surfaces', (theme) => {
    const ink = { ...inks(theme), uv: primitive(css, theme === 'light' ? 'uv-lo' : 'uv-hi') };
    expect(Object.keys(ink).sort()).toEqual([...GENERATED, 'uv'].sort());
    for (const [t, hex] of Object.entries(ink)) for (const s of S[theme]) expect(contrast(hex, s), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['light', 'dark'] as const)('%s: inks keep the mark\'s hue', (theme) => {
    for (const [t, hex] of Object.entries(inks(theme))) {
      const [, c0, h0] = toOklch((render.PALETTE as Record<string, string>)[t]);
      const [, c1, h1] = toOklch(hex);
      if (c0 > 0.02 && c1 > 0.02) expect(Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))), t).toBeLessThan(0.05);
    }
  });

  it('marks (CLI hex, unchanged) are ≥ 3:1 on every surface', () => {
    for (const [t, hex] of Object.entries(render.PALETTE))
      if (!['uv.hi', 'uv.lo'].includes(t)) for (const s of [...S.light, ...S.dark]) expect(contrast(hex, s), `${t} on ${s}`).toBeGreaterThanOrEqual(3);
  });

  it('inkStep leaves passing colours alone', () => {
    expect(inkStep('#000000', ['#FFFFFF'])).toBe('#000000');
  });
});
