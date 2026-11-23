// Everything the Investigation shows, derived once from the capture artifacts (plan §4.3, §6.3).
// No seq, ms, id or count is written here: each comes from the artifacts.
import manifest from '../data/capture/manifest.json';
import bad from '../data/capture/runs/bad.json';
import nowatch from '../data/capture/runs/nowatch.json';
import good from '../data/capture/runs/good.json';
import fixed from '../data/capture/runs/fixed.json';
import whyBad from '../data/capture/findings/why-bad.json';
import whySeq from '../data/capture/findings/why-bad-seq.json';
import whyNowatch from '../data/capture/findings/why-nowatch.json';
import traffic from '../data/capture/source/traffic.js?raw';
import prices from '../data/capture/source/prices.json';

const ANSI = import.meta.glob('../data/capture/terminal/*.ansi', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const TXT = import.meta.glob('../data/capture/terminal/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const RUNS = { bad, nowatch, good, fixed } as Record<string, RawRun>;

export type Label = 'bad' | 'nowatch' | 'good' | 'fixed';
export const WIDTHS = manifest.widths as [number, number, number];

// ---- runs -------------------------------------------------------------------------------------------

interface RawEvent { seq: number; t: number; kind: string; name: string | null; request: number | null; data: any; site?: any; describe?: string }
interface RawRun { id: string; label: string; watch: string[]; events: RawEvent[]; story: number[]; requests: any[]; mutations: any[] }

export const GLYPH: Record<string, string> = { 'http.in': '→', 'http.out': '←', log: '»', mutation: '✎', 'error.uncaught': '✖', 'error.logged': '✖', 'run.end': '◉', 'run.start': '◉', instrument: '⚙', 'async.before': '▸', 'async.init': '·' };

/** One event as EventDetail shows it. All fields are recorded (●) except `request` (◆ derived). */
export interface EventInfo {
  seq: number; ms: number; kind: string; glyph: string; request: number | null; text: string;
  loc?: string; before?: string; after?: string; describe?: string;
}
export interface Marker extends EventInfo { label: string }
export interface Lane { id: number; name: string; inMs: number; endMs: number; end: 'out' | 'error' | 'open'; markers: Marker[] }
/** Who holds `currentCart` between consecutive writes: derived by the site (◆ site) from observed writes. */
export interface Holder { seq: number; fromMs: number; toMs: number; owner: string; writer: number | null }
/** Moments of use: observed log/crash events. Reads are not recorded. */
export interface Tick { seq: number; ms: number; request: number | null; text: string; kind: 'log' | 'error' }
export interface RunModel {
  label: Label; id: string; watch: string[]; startMs: number; endMs: number;
  lanes: Lane[]; holders: Holder[]; ticks: Tick[]; events: Record<number, EventInfo>;
}

export const ms = (t: number) => Math.round(t / 100) / 10; // Rewind prints t / 1000 with one decimal
export const fmtMs = (m: number) => m.toFixed(1);
const ownerOf = (after: string) => /"order":"([^"]+)"/.exec(after)?.[1] ?? after;

function info(e: RawEvent): EventInfo {
  const d = e.data ?? {};
  const base = { seq: e.seq, ms: ms(e.t), kind: e.kind, glyph: GLYPH[e.kind] ?? '·', request: e.request, describe: e.describe };
  if (e.kind === 'mutation') return { ...base, text: `${e.name}${d.path ?? ''} ${d.op}`, loc: d.loc, before: d.before, after: d.after };
  if (e.kind === 'http.out') return { ...base, text: `${d.status} ${e.name}  ${d.ms.toFixed(1)}ms` };
  if (e.kind.startsWith('error.')) return { ...base, text: `${d.error ?? 'Error'}: ${e.name}`, loc: e.site ? `${e.site.file}:${e.site.line}` : undefined };
  if (e.kind === 'run.end') return { ...base, text: `exit ${d.code}` };
  if (e.kind.startsWith('async.')) return { ...base, text: e.describe ?? e.kind, loc: e.site ? `${e.site.file}:${e.site.line}` : undefined };
  return { ...base, text: e.name ?? e.kind };
}

const VERB: Record<string, (i: EventInfo) => string> = {
  'http.in': (i) => `arrived, ${i.text}`,
  'http.out': (i) => `responded ${i.text.split('  ')[0]}`,
  log: (i) => `logged “${i.text}”`,
  mutation: (i) => `wrote ${i.text.split(' ')[0]}`,
  'error.uncaught': (i) => `threw ${i.text}`,
  'error.logged': (i) => `logged error ${i.text}`,
};
/** Accessible name, e.g. "seq 371, request #4 wrote currentCart, 218.0 ms". */
export const describeEvent = (i: EventInfo) =>
  `seq ${i.seq}, ${i.request ? `request #${i.request}` : 'process'} ${(VERB[i.kind] ?? ((x: EventInfo) => x.text))(i)}, ${fmtMs(i.ms)} ms`;

export function runModel(label: Label): RunModel {
  const r = RUNS[label];
  const story = r.events.filter((e) => r.story.includes(e.seq));
  const events: Record<number, EventInfo> = Object.fromEntries(r.events.map((e) => [e.seq, info(e)]));
  const end = story.find((e) => e.kind === 'run.end')!;
  const lanes: Lane[] = r.requests.map((q) => {
    const err = story.find((e) => e.kind.startsWith('error.') && e.request === q.id);
    const markers = story
      .filter((e) => e.request === q.id && GLYPH[e.kind] && !e.kind.startsWith('run.') && e.kind !== 'instrument')
      .map((e) => ({ ...events[e.seq], label: describeEvent(events[e.seq]) }));
    const [endMs, endKind] = q.out ? [ms(q.out.t), 'out' as const] : err ? [ms(err.t), 'error' as const] : [ms(end.t), 'open' as const];
    return { id: q.id, name: q.name, inMs: ms(q.in.t), endMs, end: endKind, markers };
  });
  const muts = [...r.mutations].sort((a, b) => a.seq - b.seq);
  const holders = muts.map((m, i) => ({
    seq: m.seq, fromMs: ms(m.t), toMs: i + 1 < muts.length ? ms(muts[i + 1].t) : ms(end.t), owner: ownerOf(m.after), writer: m.writer,
  }));
  const ticks: Tick[] = story
    .filter((e) => (e.kind === 'log' && e.request) || e.kind.startsWith('error.'))
    .map((e) => ({ seq: e.seq, ms: ms(e.t), request: e.request, text: events[e.seq].text, kind: e.kind === 'log' ? 'log' : 'error' }));
  return { label, id: r.id, watch: r.watch, startMs: Math.min(...lanes.map((l) => l.inMs)), endMs: ms(end.t), lanes, holders, ticks, events };
}

// ---- orders (step 8) --------------------------------------------------------------------------------


export interface Order { id: string; items: string[]; coupon: string | null; paymentMs: number; at: number; expected: number }
/** The orders traffic.js sends, parsed from its source. `expected` is authored (◇): prices.json summed, and the
 *  coupon applied the way checkout.js does (`Math.round(total * 0.9)`). */
export function orders(): Order[] {
  return [...traffic.matchAll(/\{ id: '[^}]*\}/g)].map(([o]) => {
    const field = (k: string) => new RegExp(`${k}: ([^,}]+)`).exec(o)?.[1].trim() ?? null;
    const items = [.../items: \[([^\]]*)\]/.exec(o)![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const total = items.reduce((s, sku) => s + (prices as Record<string, number>)[sku], 0);
    const coupon = field('coupon')?.replace(/'/g, '') ?? null;
    return { id: field('id')!.replace(/'/g, ''), items, coupon, paymentMs: Number(field('paymentMs')), at: Number(field('at')),
      expected: coupon ? Math.round(total * 0.9) : total };
  });
}
export const price = (sku: string) => (prices as Record<string, number>)[sku];

/** What each order was charged in a run: the observed `order X: charged $N` log, or the crash of its request. */
export function charged(label: Label) {
  const r = runModel(label);
  return Object.fromEntries(orders().map((o) => {
    const log = r.ticks.find((t) => t.kind === 'log' && t.text.startsWith(`order ${o.id}:`));
    const amount = log ? Number(/\$(\d+)/.exec(log.text)![1]) : null;
    // a crash is attributed to an order only when it is the one order without a log line
    const unlogged = orders().filter((x) => !r.ticks.some((t) => t.kind === 'log' && t.text.startsWith(`order ${x.id}:`)));
    const crash = log || unlogged.length !== 1 ? null : r.ticks.find((t) => t.kind === 'error') ?? null;
    return [o.id, { amount, seq: log?.seq ?? crash?.seq ?? null, request: log?.request ?? crash?.request ?? null, crash: !!crash }];
  }));
}

// ---- steps ------------------------------------------------------------------------------------------

export interface TermBlock { view: string; command: string; prompt: boolean; diff: boolean; runs: string[]; ansi: Record<number, string> }
export interface Focus { lanes: number[] | null; seq: number | null }
export interface StepView { terminals: TermBlock[]; run: Label | null; mode: 'none' | 'lanes' | 'diff' | 'fix'; focus: Focus }
export interface Step { n: number; key: string; title: string; sentence: string; views: { on: StepView; off?: StepView } }

const views = manifest.views as Record<string, { command: string; runs: string[] }>;
function term(view: string): TermBlock {
  const read = (w: number) => (view === 'plain-node' ? TXT[`../data/capture/terminal/plain-node.txt`] : ANSI[`../data/capture/terminal/${view}.${w}.ansi`]);
  const v = views[view];
  return {
    view, command: v ? v.command : manifest.plain_node.command, prompt: !v || view.startsWith('record-'),
    diff: view.startsWith('diff'), runs: v ? v.runs : [], ansi: Object.fromEntries(WIDTHS.map((w) => [w, read(w)])),
  };
}

/** The observed "last write … before this point" finding's evidence: the write a `why` is about. */
const lastWrite = (f: { findings: { level: string; text: string; evidence: number[] }[] }) =>
  f.findings.find((x) => x.level === 'observed' && x.text.startsWith('last write'))?.evidence[0] ?? null;

export function steps(): Step[] {
  const a101 = runModel('bad').events[manifest.a101_log_seq];
  const one = (terminals: string[], run: Label | null, mode: StepView['mode'], focus: Focus = { lanes: null, seq: null }) =>
    ({ on: { terminals: terminals.map(term), run, mode, focus } });
  return [
    { n: 1, key: 'node', title: 'Run it plainly', sentence: `${orders().length} orders reach the checkout at overlapping times. One request crashes, and Node’s trace names no order and no request. Nothing flags the wrong total in the log either.`, views: one(['plain-node'], null, 'none') },
    { n: 2, key: 'record', title: 'Record the same run', sentence: 'The same program under the recorder, preloaded with --require: no change to the app. Same crash, now recorded.', views: one(['record-bad'], 'bad', 'lanes') },
    { n: 3, key: 'why', title: 'Ask why it crashed', sentence: 'Every finding is graded: ● observed, ◆ derived, ? inferred, with the event seqs that back it.', views: one(['why-bad'], 'bad', 'lanes', { lanes: [whyBad.request!], seq: lastWrite(whyBad) }) },
    { n: 4, key: 'timeline', title: 'Read the interleaving', sentence: `The story in seq order: the “${a101.text}” line belongs to request #${a101.request}.`, views: one(['timeline-bad'], 'bad', 'lanes') },
    { n: 5, key: 'why-seq', title: 'Explain the silent overcharge', sentence: `Any event can be explained, not only errors. For request #${whySeq.request}’s log line, Rewind derives who overwrote the cart first, and says reads are not recorded, so it is not proven.`, views: one(['why-bad-seq'], 'bad', 'lanes', { lanes: [whySeq.request!], seq: lastWrite(whySeq) }) },
    {
      n: 6, key: 'nowatch', title: 'Without --watch', sentence: 'Recorded without watching the variable, Rewind claims no write. It points at the module-level name on the failing line and suggests --watch.',
      views: {
        on: { terminals: [term('why-bad')], run: 'bad', mode: 'lanes', focus: { lanes: [whyBad.request!], seq: lastWrite(whyBad) } },
        off: { terminals: [term('record-nowatch'), term('why-nowatch')], run: 'nowatch', mode: 'lanes', focus: { lanes: [whyNowatch.request!], seq: null } },
      },
    },
    { n: 7, key: 'diff', title: 'Compare with a sequential run', sentence: 'The orders sent one at a time pass. Diffing the two runs shows the same code path in a different interleaving.', views: one(['record-good', 'diff-good-bad'], 'bad', 'diff') },
    { n: 8, key: 'fix', title: 'Apply the fix', sentence: 'The patch passes each request its own cart through the callback. Re-recorded, why reports no errors and every total is right.', views: one(['record-fixed', 'why-fixed'], 'fixed', 'fix') },
  ];
}
