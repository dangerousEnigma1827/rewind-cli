// Plan §5.3 glyph audit: every glyph Rewind prints must be covered by the shipped mono fonts.
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../src/lib/glyphs';

/** Code points mapped in a WOFF 1.0 file's cmap (formats 4 and 12). */
function cmapOf(file: string): Set<number> {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'wOFF') throw new Error(`${file}: not WOFF 1.0`);
  const numTables = b.readUInt16BE(12);
  let t: Buffer | undefined;
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    if (b.toString('ascii', e, e + 4) !== 'cmap') continue;
    const [off, comp, orig] = [b.readUInt32BE(e + 4), b.readUInt32BE(e + 8), b.readUInt32BE(e + 12)];
    const raw = b.subarray(off, off + comp);
    t = comp === orig ? raw : inflateSync(raw);
  }
  if (!t) throw new Error(`${file}: no cmap`);
  const cps = new Set<number>();
  for (let i = 0, n = t.readUInt16BE(2); i < n; i++) {
    const sub = t.readUInt32BE(4 + i * 8 + 4);
    const fmt = t.readUInt16BE(sub);
    if (fmt === 4) {
      const seg = t.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ros = deltas + seg * 2;
      for (let s = 0; s < seg; s++) {
        const end = t.readUInt16BE(ends + s * 2), start = t.readUInt16BE(starts + s * 2);
        const delta = t.readInt16BE(deltas + s * 2), ro = t.readUInt16BE(ros + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const gid = ro === 0 ? (c + delta) & 0xffff
            : t.readUInt16BE(ros + s * 2 + ro + (c - start) * 2);
          if (gid !== 0) cps.add(c);
        }
      }
    } else if (fmt === 12) {
      for (let g = 0, n = t.readUInt32BE(sub + 12); g < n; g++) {
        const p = sub + 16 + g * 12;
        for (let c = t.readUInt32BE(p); c <= t.readUInt32BE(p + 4); c++) cps.add(c);
      }
    }
  }
  return cps;
}

/** Union of code points over every 400-normal subset a fontsource package ships. */
function coverage(pkg: string): Set<number> {
  const dir = join('node_modules', '@fontsource', pkg, 'files');
  const all = new Set<number>();
  for (const f of readdirSync(dir).filter((f) => f.endsWith('-400-normal.woff')))
    for (const c of cmapOf(join(dir, f))) all.add(c);
  return all;
}

const missing = (cov: Set<number>) => [...GLYPHS].filter((g) => !cov.has(g.codePointAt(0)!));

describe('glyph audit (§5.3)', () => {
  it('reads a real cmap', () => {
    expect(coverage('ibm-plex-mono').has('A'.codePointAt(0)!)).toBe(true);
  });

  it('every capture glyph is covered by Plex Mono or the DejaVu Mono fallback', () => {
    const dejavu = coverage('dejavu-mono');
    expect(missing(coverage('ibm-plex-mono')).filter((g) => !dejavu.has(g.codePointAt(0)!))).toEqual([]);
  });
});
