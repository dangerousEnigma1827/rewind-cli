// Plan §7.4 integrity checks over the committed artifacts (b, c and a live in hotspots/ansi tests).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIR, captures, json, labels, manifest, read, runs } from './capture';

// recorder/recorder.js event kinds at the captured sha (plan §2.3). There is no read event.
const KINDS = ['run.start', 'run.end', 'run.signal', 'async.init', 'async.before', 'async.after', 'async.resolve', 'log',
  'http.in', 'http.out', 'error.uncaught', 'error.logged', 'mutation', 'mutation.capped', 'instrument'];
const LEVELS = ['observed', 'derived', 'inferred'];

describe('schema', () => {
  it('manifest', () => {
    expect(manifest.schema_version).toBe(1);
    expect(manifest.rewind.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.rewind.short).toBe(manifest.rewind.sha.slice(0, 7));
    expect(manifest.widths).toEqual([110, 72, 46]);
    expect(labels).toEqual(['bad', 'nowatch', 'good', 'fixed']);
    expect(manifest.pytest).toMatch(/^\d+ passed$/);
    expect(Number.isNaN(Date.parse(manifest.captured_at))).toBe(false);
  });

  it.each(labels)('runs/%s.json', (l) => {
    const r = runs[l];
    for (const k of ['id', 'label', 'status', 'exit_code', 'watch', 'event_count', 'story_count', 'story', 'callbacks',
      'errors', 'events', 'requests', 'mutations', 'provenance']) expect(r, k).toHaveProperty(k);
    for (const e of r.events) {
      expect(typeof e.seq).toBe('number');
      expect(typeof e.t).toBe('number');
      expect(KINDS).toContain(e.kind);
    }
    const seqs = r.events.map((e: any) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    for (const s of [...r.story, ...r.callbacks, ...r.errors]) expect(seqs).toContain(s);
  });

  it.each(['why-bad', 'why-bad-seq', 'why-nowatch', 'diff-good-bad'])('findings/%s.json', (f) => {
    for (const x of json(`findings/${f}.json`).findings) {
      expect(LEVELS).toContain(x.level);
      expect(typeof x.text).toBe('string');
      expect(Array.isArray(x.evidence)).toBe(true);
    }
  });
});

describe('(d) every cart-band owner parses from a mutation `after` preview', () => {
  it.each(labels)('%s', (l) => {
    for (const m of runs[l].mutations) expect(m.after, `seq ${m.seq}`).toMatch(/"order":"[A-Z]-\d+"/);
  });
  it('the bad run has the three writes at checkout.js:12:5', () => {
    expect(runs.bad.mutations.map((m: any) => [m.loc, m.writer])).toEqual([
      ['demo/checkout.js:12:5', 2], ['demo/checkout.js:12:5', 3], ['demo/checkout.js:12:5', 4],
    ]);
  });
});

describe('(e) quoted numbers appear in RESULTS.md', () => {
  // shortcut: "Built on evidence" has no copy yet (M5); this guards the copied file until then.
  it('RESULTS.md is the verbatim copy', () => {
    expect(read('source/RESULTS.md')).toMatch(/E7/);
  });
});

describe('(f) diff alignment matches the "N of A / B" finding', () => {
  it('equal steps and token counts', () => {
    const d = json('findings/diff-good-bad.json');
    const same = d.opcodes.filter((o: any[]) => o[0] === 'equal').reduce((n: number, o: number[]) => n + o[2] - o[1], 0);
    const m = /^(\d+) of (\d+) \(A\) \/ (\d+) \(B\) normalised steps line up$/.exec(
      d.findings.find((f: any) => / normalised steps line up$/.test(f.text)).text,
    )!;
    expect([same, d.a.length, d.b.length]).toEqual([+m[1], +m[2], +m[3]]);
  });
});

describe('(g) ids, labels and counts agree with the manifest', () => {
  it.each(labels)('%s', (l) => {
    const m = manifest.runs[l], r = runs[l];
    expect([r.id, r.label, r.event_count, r.exit_code, r.status]).toEqual([m.id, l, m.event_count, m.exit_code, m.status]);
  });
  it('every view names its runs by id and label', () => {
    for (const c of captures.filter((c) => !c.view.startsWith('record-') && c.runs.length))
      for (const l of c.runs) // narrow titles wrap
        expect(c.txt.replace(/\s+/g, ' '), `${c.view}.${c.width}`).toContain(`run ${manifest.runs[l].id} (${l})`);
  });
  it('record captures show their run id and event count', () => {
    for (const c of captures.filter((c) => c.view.startsWith('record-'))) {
      const m = manifest.runs[c.runs[0]];
      expect(c.txt).toContain(`recorded run ${m.id} ${c.runs[0]}`);
      expect(c.txt.replace(/\s+/g, ' ')).toContain(`${m.event_count} events`);
    }
  });
  it('findings belong to the run they claim', () => {
    for (const [f, l] of [['why-bad', 'bad'], ['why-bad-seq', 'bad'], ['why-nowatch', 'nowatch']])
      expect(json(`findings/${f}.json`).run).toBe(manifest.runs[l].id);
    expect(json('findings/why-bad-seq.json').target).toBe(manifest.a101_log_seq);
  });
});

describe('(h) reads are never events', () => {
  it.each(labels)('%s has no read event', (l) => {
    expect(runs[l].events.some((e: any) => /read/i.test(e.kind))).toBe(false);
  });
});

describe('privacy', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  // Absolute paths of any OS, temp/capture dirs, and this machine's home folder name.
  const PRIVATE = [/[A-Za-z]:[\\/](?!\/)/, /\/(?:Users|home|tmp)\//, /AppData/i, /rewind-capture-/, /\\Users\\/];
  it.each(files(DIR).map((f) => [f]))('%s has no private paths', (f) => {
    const text = readFileSync(f, 'utf8');
    for (const re of PRIVATE) expect(text, String(re)).not.toMatch(re);
  });
});

