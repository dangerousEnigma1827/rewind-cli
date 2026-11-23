// Plan §9.2/§9.3: claims the site must never make, checked on the text it shows (built page, captures excluded).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as d from '../src/lib/depth';
import { steps } from '../src/lib/investigation';

const FORBIDDEN: [RegExp, string][] = [
  [/time[- ]?travel|\breplay|step(ping)? back/i, 'replay or step-back "time travel"'],
  [/\bAI\b|automatic(ally)? (root|find)/i, '"AI" or "automatic root cause"'],
  [/(?<!not )\bprove[sn]?\b/i, '"proves the race" (reporting Rewind\'s own "not proven" is allowed)'],
  [/captures? every|records? every (call|value|function)/i, '"captures every call or value"'],
  [/any (framework|node(\.js)? app)/i, '"any framework / any Node app"'],
  [/low overhead|negligible|zero overhead/i, 'unqualified "low overhead"'],
  [/\b(records?|recorded|observes?|observed|captures?|captured) (the |a |every )?reads?\b/i, 'claiming recorded reads'],
];

// Authored text the site shows, gathered from where it is defined. `notCaptured` is a list of negations and is
// checked separately: it must say what Rewind does NOT do.
const authored = [
  ...steps().flatMap((s) => [s.title, s.sentence]),
  ...d.pipeline.flatMap((p) => [p.title, p.body]),
  ...d.experiments.flatMap((e) => [e.q, e.verdict, e.figure]),
  ...d.approaches.flatMap((a) => [a.name, a.cost, a.verdict]),
  ...d.bugs.flatMap((b) => [b.title, b.found, b.fix]),
  ...d.captures.map((c) => c.text), ...d.untested.map((c) => c.text), d.overhead.text,
  ...d.install.map((i) => i.note),
];

describe('§9.3 forbidden claims', () => {
  it.each(FORBIDDEN)('authored copy never says %s', (re) => {
    for (const t of authored) expect(t, t).not.toMatch(re);
  });

  const pages = ['dist/index.html', 'dist/investigation/index.html', 'dist/docs/index.html'];
  it.runIf(pages.every((p) => existsSync(p))).each(FORBIDDEN)('the built pages, outside captures, never say %s', (re) => {
    const html = pages.map((p) => readFileSync(p, 'utf8')).join(' ')
      .replace(/<astro-island[\s\S]*?<\/astro-island>/g, '') // island props carry the captures
      .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
      .replace(/<pre[\s\S]*?<\/pre>/g, '') // captured terminals and source code
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
    // the "Does not capture" list states negatives on purpose
    const negatives = d.notCaptured.map((c) => c.text);
    const cleaned = negatives.reduce((t, n) => t.split(n).join(' '), text);
    expect(cleaned).not.toMatch(re);
  });

  it('the "does not capture" list says reads are never recorded', () => {
    expect(d.notCaptured.some((c) => /reads?.*never recorded/i.test(c.text))).toBe(true);
  });
});
