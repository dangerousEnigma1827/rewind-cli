// Plan §5.2 / R1: dark only. No light theme, no toggle, no system-preference detection, no theme persistence.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCENT, TERM_BG, TEXT, TEXT_2, TEXT_3 } from '../src/lib/shiki-theme';
import { primitive } from '../src/lib/ink';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const source = files('src').filter((f) => /\.(astro|css|tsx?|mjs)$/.test(f) && !f.includes(join('data', 'capture')));
const tokens = readFileSync('src/styles/tokens.css', 'utf8');

describe('dark only (§5.2)', () => {
  it.each(source.map((f) => [f]))('%s has no light theme, toggle, preference detection or persistence', (f) => {
    const t = readFileSync(f, 'utf8');
    expect(t).not.toMatch(/prefers-color-scheme/);
    expect(t).not.toMatch(/color-scheme:\s*light|content="light/);
    expect(t).not.toMatch(/data-theme|theme-toggle|localStorage[^\n]*theme/i);
  });

  it('declares color-scheme: dark and one theme-color', () => {
    expect(tokens).toMatch(/color-scheme: dark;/);
    const base = readFileSync('src/layouts/Base.astro', 'utf8');
    expect(base).toContain('<meta name="color-scheme" content="dark" />');
    expect(base.match(/name="theme-color"/g)).toHaveLength(1);
  });

  it.runIf(existsSync('dist/index.html'))('the built page and CSS carry no light styles', () => {
    const built = [...files('dist').filter((f) => f.endsWith('.html')), ...files(join('dist', '_astro')).filter((f) => f.endsWith('.css'))];
    for (const f of built) expect(readFileSync(f, 'utf8'), f).not.toMatch(/prefers-color-scheme/);
  });

  it('the Shiki theme mirrors the tokens', () => {
    expect([TEXT, TEXT_2, TEXT_3, ACCENT, TERM_BG]).toEqual(['text', 'text-2', 'text-3', 'uv-hi', 'term-bg'].map((n) => primitive(tokens, n)));
  });
});
