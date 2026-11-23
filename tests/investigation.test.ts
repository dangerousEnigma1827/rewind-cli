import { describe, expect, it } from 'vitest';
import { renderSpans } from '../src/lib/terminal';
import { findHotspots } from '../src/lib/hotspots';
import { diffView } from '../src/lib/diffview';
import { charged, orders, runModel, steps, WIDTHS } from '../src/lib/investigation';
import { captures, json } from './capture';

describe('renderSpans', () => {
  it.each(captures.map((c) => [`${c.view}.${c.width}`, c] as const))('%s keeps every hotspot and all text', (_, c) => {
    const diff = c.view.startsWith('diff');
    const lines = renderSpans(c.ansi, { diff });
    expect(lines.map((l) => l.segs.map((s) => s.text).join('')).join('\n')).toBe(c.txt);
    const hot = lines.flatMap((l) => l.segs.filter((s) => s.hot).map((s) => s.hot!.seq));
    expect(hot).toEqual(findHotspots(c.txt.split('\n'), { diff }).map((h) => h.seq));
  });

  it('groups lines by finding, and a finding\'s evidence seqs are on its lines', () => {
    const c = captures.find((c) => c.view === 'why-bad' && c.width === 110)!;
    const lines = renderSpans(c.ansi);
    const fs = json('findings/why-bad.json').findings as { evidence: number[] }[];
    expect(Math.max(...lines.map((l) => l.finding ?? -1)) + 1).toBe(fs.length);
    fs.forEach((f, i) => {
      const ev = lines.filter((l) => l.finding === i).flatMap((l) => l.segs.filter((s) => s.hot?.where === 'evidence').map((s) => s.hot!.seq));
      expect(ev).toEqual(f.evidence);
    });
  });
});

describe('run models', () => {
  const bad = runModel('bad');
  it('has the four requests in order, #3 ending in the crash', () => {
    expect(bad.lanes.map((l) => l.id)).toEqual([1, 2, 3, 4]);
    expect(bad.lanes.find((l) => l.id === 3)!.end).toBe('error');
  });
  it('every marker and tick is a recorded event of the run', () => {
    for (const l of bad.lanes) for (const m of l.markers) expect(bad.events[m.seq]).toBeDefined();
    for (const t of bad.ticks) expect(['log', 'error.uncaught', 'error.logged']).toContain(bad.events[t.seq].kind);
  });
  it('holders follow the recorded writes', () => {
    expect(bad.holders.map((h) => [h.owner, h.writer])).toEqual([['A-101', 2], ['B-202', 3], ['C-303', 4]]);
    expect(runModel('nowatch').holders).toEqual([]);
  });
});

describe('steps', () => {
  const s = steps();
  it('are the 8 steps of §3.6 with real captures at every width', () => {
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const x of s) for (const v of [x.views.on, x.views.off].filter(Boolean)) for (const t of v!.terminals)
      for (const w of WIDTHS) expect(t.ansi[w], `${t.view}.${w}`).toBeTruthy();
  });
  it('default focus comes from the findings', () => {
    const bad = runModel('bad');
    const why = s[2].views.on.focus, seq = s[4].views.on.focus;
    expect(why.lanes).toEqual([3]);
    expect(bad.events[why.seq!].request).toBe(4); // the #4 write
    expect(seq.lanes).toEqual([2]);
    expect(bad.events[seq.seq!].request).toBe(3); // the #3 write
    expect(s[5].views.off!.focus).toEqual({ lanes: [3], seq: null });
  });
});

describe('DiffView', () => {
  const v = diffView();
  const f = (re: RegExp) => v.findings.find((x: any) => re.test(x.text))!.text;
  it('connectors = the "N step(s) occur in both runs at different positions" finding', () => {
    expect(v.connectors.length).toBe(Number(/^(\d+) step\(s\) occur in both runs/.exec(f(/occur in both runs/))![1]));
    for (const c of v.connectors) expect(c.from).not.toBe(c.to);
  });
  it('B\'s first divergent step is A\'s step "N step(s) later"', () => {
    const later = Number(/but (\d+) step\(s\) later/.exec(f(/step\(s\) later/))![1]);
    const d = json('findings/diff-good-bad.json');
    const [, i1, , j1] = v.first;
    expect(d.a[i1 + later].token).toBe(d.b[j1].token);
  });
  it('one divergence rule, before the first change', () => {
    expect(v.rows.filter((r) => r.kind === 'divergence').length).toBe(1);
    expect(v.rows[v.rows.findIndex((r) => r.kind === 'divergence') + 1].kind).toBe('change');
  });
});

describe('orders and totals', () => {
  it('expected totals match the sequential and fixed runs, and the bug in the bad run', () => {
    const o = orders();
    expect(o.length).toBeGreaterThan(0);
    for (const label of ['good', 'fixed'] as const) {
      const c = charged(label);
      for (const x of o) expect(c[x.id].amount, `${label} ${x.id}`).toBe(x.expected);
    }
    const c = charged('bad');
    expect(o.filter((x) => c[x.id].crash).length).toBe(1);
    expect(o.some((x) => c[x.id].amount !== null && c[x.id].amount !== x.expected)).toBe(true);
  });
});
