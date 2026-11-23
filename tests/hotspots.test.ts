import { describe, expect, it } from 'vitest';
import { findHotspots } from '../src/lib/hotspots';
import { captures, json, seqsOf } from './capture';

describe('findHotspots', () => {
  it('finds timeline rows, evidence columns and in-text refs', () => {
    const lines = [
      '  215  193.3  │  #3   →  POST /order',
      '  ◆ #3 set it (seq 254); #4 overwrote it          seq 254, 387, 446',
      '  ◆ identical up to and including: x        A seq 156',
    ];
    expect(findHotspots(lines).map((h) => [h.line, h.seq, h.where, h.run])).toEqual([
      [0, 215, 'row', 0],
      [1, 254, 'text', 0], [1, 254, 'evidence', 0], [1, 387, 'evidence', 0], [1, 446, 'evidence', 0],
      [2, 156, 'evidence', 0],
    ]);
    const [h] = findHotspots(lines);
    expect(lines[0].slice(h.start, h.end)).toBe('215');
  });

  it('reads diff steps: run A, or B on + lines', () => {
    const lines = ['      156  #2 ✎ currentCart = @ demo/checkout.js:12:5', '  +   257  #2 ▸ Timeout', '  -   159  #2 ▸ Timeout'];
    expect(findHotspots(lines, { diff: true }).map((h) => [h.seq, h.run])).toEqual([[156, 0], [257, 1], [159, 0]]);
  });
});

const spotsOf = (c: (typeof captures)[number]) => findHotspots(c.txt.split('\n'), { diff: c.view.startsWith('diff') });

describe('(b) every seq in a capture exists in its run', () => {
  it.each(captures.filter((c) => c.runs.length).map((c) => [`${c.view}.${c.width}`, c] as const))('%s', (_, c) => {
    for (const h of spotsOf(c)) expect(seqsOf(c.runs[h.run]).has(h.seq), `seq ${h.seq} (${c.runs[h.run]})`).toBe(true);
  });

  it('the views that cite seqs do have hotspots', () => {
    for (const c of captures.filter((c) => /^(why-bad|why-nowatch|timeline|diff)/.test(c.view)))
      expect(spotsOf(c).length, c.view).toBeGreaterThan(0);
  });
});

describe('(c) evidence columns equal findings[].evidence, in order', () => {
  const evidenceCaptures = captures.filter((c) => c.command.includes('--evidence'));
  it.each(evidenceCaptures.map((c) => [`${c.view}.${c.width}`, c] as const))('%s', (_, c) => {
    const findings = json(`findings/${c.view}.json`).findings as { evidence: number[]; run: string | null }[];
    const shown = spotsOf(c).filter((h) => h.where === 'evidence').map((h) => [h.seq, h.run]);
    const want = findings.flatMap((f) => f.evidence.map((s) => [s, f.run === 'B' ? 1 : 0]));
    expect(shown).toEqual(want);
  });
});
