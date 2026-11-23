// Values for the static sections (M4/M5), all read from the capture artifacts.
import manifest from '../data/capture/manifest.json';
import whyBad from '../data/capture/findings/why-bad.json';
import { renderSpans, type TermLine } from './terminal';
import { charged, orders, runModel, WIDTHS } from './investigation';

const ANSI = import.meta.glob('../data/capture/terminal/*.ansi', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const capture = (view: string, w: number) => ANSI[`../data/capture/terminal/${view}.${w}.ansi`];
export const captures = (view: string) => Object.fromEntries(WIDTHS.map((w) => [w, capture(view, w)]));

export const sha = manifest.rewind.sha, short = manifest.rewind.short;
export const REPO = manifest.rewind.repo;
export const blob = (path: string) => `${REPO}/blob/${sha}/${path}`;
export const tree = (path: string) => `${REPO}/tree/${sha}/${path}`;

// ---- hero ---------------------------------------------------------------------------------------------

/** The five findings the hero shows, picked by Rewind's own finding text (one of each kind of claim). */
const HERO = [/^thrown in /, /^belongs to request /, /^last write to /, /^that write was made by /, /^likely root cause/];
export const heroFindings = HERO.map((re) => whyBad.findings.findIndex((f) => re.test(f.text)));

/** `why bad --evidence`, cut to the findings rule and the picked findings, verbatim. The title line (it carries the
 *  run id, which means nothing to a visitor) is left out; nothing inside a kept line changes. */
export function heroExcerpt(w: number): TermLine[] {
  const lines = renderSpans(capture('why-bad', w));
  const text = (l: TermLine) => l.segs.map((s) => s.text).join('');
  const rule = lines.findIndex((l) => /^ {2}findings ┈/.test(text(l)));
  const firstFinding = lines.findIndex((l) => l.finding === 0);
  return [...lines.slice(rule, firstFinding), ...lines.filter((l) => l.finding !== undefined && heroFindings.includes(l.finding))];
}

/** The one homepage fact: a product property, verifiable in rewind/cli.py:84 (`node --require <recorder>`).
 *  Event counts (they vary run to run) and the test count (pinned to the captured commit) live in the docs. */
export const fact = {
  title: 'Zero application code changes',
  text: 'Rewind records the run through Node.js preloading.',
  source: 'rewind/cli.py:84',
};

/** Home: three benefits, each shown by the captured investigation and linking to the step that shows it. */
export function benefits() {
  const v = victims();
  return [
    { title: 'Which request failed', href: '/investigation/?step=3',
      text: `A stack trace stops at a timer callback. Rewind traces the crash back to request #${v.crash.request}, order ${v.crash.order.id}.` },
    { title: 'Silent failures, too', href: '/investigation/?step=5',
      text: `Order ${v.overcharge.order.id} was charged $${v.overcharge.amount} instead of $${v.overcharge.order.expected}, with no error. Rewind ties that line to the request that logged it.` },
    { title: 'Evidence, graded', href: '/investigation/?step=6',
      text: 'Every finding is marked ● observed, ◆ derived or ? inferred. When Rewind cannot see something, such as a variable read, it says so.' },
  ];
}

// ---- scenario -----------------------------------------------------------------------------------------

/** The two victims of the concurrent run, from its own events. */
export function victims() {
  const r = runModel('bad'), c = charged('bad'), o = orders();
  const crashed = o.find((x) => c[x.id].crash)!, over = o.find((x) => c[x.id].amount !== null && c[x.id].amount !== x.expected)!;
  const err = r.events[c[crashed.id].seq!];
  return {
    crash: { order: crashed, request: c[crashed.id].request!, seq: err.seq, text: err.text, loc: err.loc! },
    overcharge: { order: over, request: c[over.id].request!, seq: c[over.id].seq!, amount: c[over.id].amount! },
  };
}

export const runIds = Object.entries(manifest.runs).map(([l, r]) => `${(r as { id: string }).id} (${l})`);
export const capturedOn = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(manifest.captured_at));
