import { describe, expect, it } from 'vitest';
import { heroExcerpt, heroFindings, victims } from '../src/lib/site';
import { existsSync, readFileSync } from 'node:fs';
import { WIDTHS } from '../src/lib/investigation';
import { json, manifest, read, runs } from './capture';

const text = (segs: { text: string }[]) => segs.map((s) => s.text).join('');

describe('hero (M4)', () => {
  it.each(WIDTHS)('the %i-column excerpt is verbatim capture lines, in order', (w) => {
    const capture = read(`terminal/why-bad.${w}.txt`).split('\n');
    let at = 0;
    for (const l of heroExcerpt(w)) {
      const t = text(l.segs);
      if (t === '') continue;
      const i = capture.indexOf(t, at);
      expect(i, t).toBeGreaterThanOrEqual(at);
      at = i + 1;
    }
  });

  it('shows five findings covering ● ◆ ?', () => {
    const fs = json('findings/why-bad.json').findings;
    expect(heroFindings.every((i) => i >= 0)).toBe(true);
    expect(new Set(heroFindings.map((i) => fs[i].level))).toEqual(new Set(['observed', 'derived', 'inferred']));
    expect(heroFindings.length).toBe(5);
  });

  it.runIf(existsSync('dist/index.html'))('outside real captured output, Home shows no run ids, commit hashes or capture bookkeeping', () => {
    // terminal output is Rewind's own and keeps whatever it printed; everything else must not expose ids
    const html = readFileSync('dist/index.html', 'utf8').replace(/<pre[\s\S]*?<\/pre>/g, '');
    for (const r of Object.values(manifest.runs) as { id: string }[]) expect(html).not.toContain(r.id);
    expect(html).not.toContain(manifest.rewind.short);
    expect(html).not.toMatch(/Captured from/i);
    expect(html).not.toContain('astro-island'); // no island JS on Home
  });
});

describe('scenario (M4)', () => {
  const plain = read('terminal/plain-node.txt');
  const v = victims();
  it('the notes on the plain trace are true of it', () => {
    expect(plain).toContain('TypeError');
    expect(plain).not.toContain(v.crash.order.id); // "no order id appears"
    expect(plain).not.toMatch(/request/i); // "which request"
    expect(plain).not.toContain('loadCart'); // "loadCart is not on the stack"
    expect(plain).toContain(`order ${v.overcharge.order.id}: charged $${v.overcharge.amount}`);
    expect(plain).toMatch(/at Timeout\.paymentConfirmed/); // "starts at a timer callback"
  });
  it('the victims are the crashed and the overcharged orders', () => {
    expect(v.crash.text).toMatch(/^TypeError: /);
    expect(v.overcharge.amount).not.toBe(v.overcharge.order.expected);
  });
});
