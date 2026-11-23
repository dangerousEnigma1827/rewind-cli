// Values for the static sections (M4/M5), all read from the capture artifacts.
import manifest from '../data/capture/manifest.json';
import bad from '../data/capture/runs/bad.json';
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

/** `why bad --evidence`, cut to: its title line, the findings rule, and the picked findings, verbatim. */
export function heroExcerpt(w: number): TermLine[] {
  const lines = renderSpans(capture('why-bad', w));
  const text = (l: TermLine) => l.segs.map((s) => s.text).join('');
  const rule = lines.findIndex((l) => /^ {2}findings ┈/.test(text(l)));
  const firstFinding = lines.findIndex((l) => l.finding === 0);
  return [lines[0], { segs: [] }, ...lines.slice(rule, firstFinding), ...lines.filter((l) => l.finding !== undefined && heroFindings.includes(l.finding))];
}

export const tiles = [
  { big: '0', text: 'edits to the app: the recorder is preloaded with --require', source: 'rewind/cli.py:84' },
  { big: `${bad.event_count.toLocaleString('en')} → ${bad.story_count}`, text: `events recorded → lines in the timeline story (run ${bad.id})`, source: 'manifest, runs/bad.json' },
  { big: manifest.pytest.split(' ')[0], text: `tests pass at rewind@${short}, against real node processes`, source: 'pytest -q at the captured sha' },
];

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
