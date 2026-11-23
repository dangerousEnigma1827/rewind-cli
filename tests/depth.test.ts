import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as d from '../src/lib/depth';
import { manifest, json, read } from './capture';

const src = (s: d.Src) => read(`source/${s.file}`);
const numbers = (t: string) => t.match(/\d+(?:[.,]\d+)*k?/g) ?? [];
const claims = readFileSync('docs/claims.md', 'utf8');

const all: [string, d.Src][] = [
  ['pipeline', d.pipelineSource], ['keep-alive', d.keepAlive], ['status', d.experimentsStatus], ['workload', d.overheadWorkload],
  ['install', d.installSource], ['overhead', d.overhead.src],
  ...d.experiments.map((e) => [e.id, e.src] as [string, d.Src]), ...d.approaches.map((a) => [a.name, a.src] as [string, d.Src]),
  ...d.bugs.map((b) => [b.id, b.src] as [string, d.Src]),
  ...[...d.captures, ...d.notCaptured, ...d.untested].map((c) => [c.text, c.src] as [string, d.Src]),
];

describe('every cited quote is verbatim in its source', () => {
  it.each(all)('%s', (_, s) => expect(src(s)).toContain(s.quote));
});

describe('(e) every figure in "Built on evidence" appears verbatim in its source', () => {
  const results = read('source/RESULTS.md'), log = read('source/ENGINEERING_LOG.md');
  it.each(d.experiments.map((e) => [e.id, e] as const))('%s', (_, e) => {
    for (const n of numbers(`${e.q} ${e.verdict} ${e.figure}`)) expect(results, `${e.id}: ${n}`).toContain(n);
  });
  it.each(d.approaches.map((a) => [a.name, a] as const))('E7 %s', (_, a) => {
    for (const n of numbers(`${a.cost} ${a.verdict}`)) expect(results, n).toContain(n);
  });
  it.each(d.bugs.map((b) => [b.id, b] as const))('%s', (_, b) => {
    for (const n of numbers(`${b.title} ${b.found} ${b.fix}`)) expect(log, n).toContain(n);
    expect(log).toContain(b.test);
  });
  it('the status line is verbatim', () => expect(results).toContain('39/39 checks pass'));
  it('the test count is the manifest\'s', () => expect(manifest.pytest).toMatch(/^\d+ passed$/));
});

describe('limits', () => {
  const docs = read('source/README.md') + read('source/FEATURES_AND_LIMITATIONS.md') + read('source/RESULTS.md');
  it.each([...d.captures, ...d.notCaptured, ...d.untested, d.overhead].map((c) => [c.text, c] as const))('%s: numbers sourced, mapped in claims.md', (_, c) => {
    for (const n of numbers(c.text)) expect(docs, n).toContain(n);
    expect(claims).toContain(c.src.quote.replace(/\|/g, '\\|'));
  });
  it('never claims reads or replay', () => {
    for (const c of d.captures) expect(c.text).not.toMatch(/\bread|replay|step back/i);
  });
});

describe('how it works', () => {
  const files = new Set(json('source/repo-files.json'));
  it('every file chip exists at the captured sha', () => {
    for (const b of d.pipeline) for (const c of b.chips) expect(files.has(c), c).toBe(true);
  });
  it('the instrumented line 12 is the real instrument() output and keeps the line', () => {
    const src = read('source/checkout.js').split('\n'), ins = read('source/checkout.instrumented.js').split('\n');
    expect(src[11]).toMatch(/currentCart = /);
    expect(ins[11]).toContain('__rw.w("currentCart"');
    expect(ins.length).toBe(src.length);
  });
});
