import { describe, expect, it } from 'vitest';
import { heroExcerpt, heroFindings, tiles, victims } from '../src/lib/site';
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

  it('tiles come from the artifacts', () => {
    expect(tiles[1].big).toBe(`${runs.bad.event_count.toLocaleString('en')} → ${runs.bad.story_count}`);
    expect(tiles[2].big).toBe(manifest.pytest.split(' ')[0]);
    expect(tiles.length).toBeLessThanOrEqual(3);
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
