// Homepage facts: the two metrics, the six commands and their real output, and the preview's data.
import { describe, expect, it } from 'vitest';
import { COMMANDS, eventMetric, preview, showcase, testMetric } from '../src/lib/home';
import { commands } from '../src/lib/depth';
import tests from '../src/data/verify/rewind-tests.json';
import { manifest, read, runs } from './capture';

describe('metrics', () => {
  it('the test count is the verified run at the captured commit, and agrees with the capture manifest', () => {
    expect(tests.rewind_sha).toBe(manifest.rewind.sha);
    expect(manifest.pytest).toBe(`${tests.passed} passed`);
    expect(testMetric.big).toBe(String(tests.passed));
    expect(tests.real_process).toBeLessThan(tests.passed); // not every test starts a real process
    expect(testMetric.text).toContain(`${tests.real_process} of them`);
  });

  it('the event metric quotes RESULTS.md (E6) verbatim, conditions included', () => {
    const results = read('source/RESULTS.md');
    for (const q of eventMetric.quotes) expect(results).toContain(q);
    for (const n of eventMetric.text.match(/\d+(?:\.\d+)?/g)!) expect(results, n).toContain(n);
    expect(results).toContain(eventMetric.big.replace('~', ''));
  });
});

describe('command showcase', () => {
  it('lists exactly the commands in Rewind\'s README table, in order', () => {
    const readmeCmds = commands(read('source/README.md')).map(([c]) => c.split(' ')[1]);
    expect(COMMANDS.map((c) => c.name)).toEqual(readmeCmds);
  });

  it.each(showcase().map((c) => [c.name, c] as const))('rewind %s shows its own real output', (name, c) => {
    expect(c.command).toBe(manifest.views[c.view].command);
    expect(c.command.split(' ')[1]).toBe(name);
    for (const w of manifest.widths) {
      const txt = read(`terminal/${c.view}.${w}.txt`);
      expect(c.ansi[w]).toBe(read(`terminal/${c.view}.${w}.ansi`));
      // the capture is that command's own output: its first line names it (record prints "recording")
      expect(txt.split('\n')[0]).toContain(name === 'record' ? '◂◂ recording' : `◂◂ ${name === 'tree' ? 'async tree' : name}`);
    }
  });
});

describe('investigation preview', () => {
  const p = preview();
  it('is the three checkout requests of the captured run, with neutral labels', () => {
    expect(p.lanes.map((l) => l.label)).toEqual(['Customer A', 'Customer B', 'Customer C']);
    expect(p.lanes.every((l) => l.name === 'POST /order')).toBe(true);
    expect(p.runId).toBe(manifest.runs.bad.id);
  });
  it('highlights the recorded overwrite and the recorded crash, in that order', () => {
    const ev = (s: number) => runs.bad.events.find((e: any) => e.seq === s);
    expect(ev(p.overwrite.seq).kind).toBe('mutation');
    expect(ev(p.crash.seq).kind).toMatch(/^error\./);
    expect(p.overwrite.seq).toBeLessThan(p.crash.seq);
    expect(p.overwrite.by).not.toBe(p.crash.lane);
  });
});
