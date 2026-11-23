// Homepage content, all sourced: the two metrics, the command showcase, and the small investigation preview.
import manifest from '../data/capture/manifest.json';
import tests from '../data/verify/rewind-tests.json';
import whyBad from '../data/capture/findings/why-bad.json';
import { runModel, type Lane } from './investigation';
import { captures } from './site';

// ---- metrics ------------------------------------------------------------------------------------------

/** Box 1: Rewind's own test suite at the published version (verified run: src/data/verify/rewind-tests.json). */
export const testMetric = {
  big: String(tests.passed),
  unit: 'tests pass',
  text: `${tests.real_process} of them start real Node.js processes and check what Rewind records from them.`,
  source: tests.method,
};

/** Box 2: spikes/RESULTS.md, experiment E6, with its conditions. The figures are checked against the copied file. */
export const eventMetric = {
  big: '~330',
  unit: 'events per HTTP request',
  text: 'Recorded in a 300-request benchmark (an fs read, a timer and Promise.all each, median of 3 runs). Rewind folds them into a short story. Overhead there: 1.1× wall time, 1.9× with promise stacks, the default.',
  source: 'spikes/RESULTS.md, E6',
  quotes: ['about 330 events per request', 'Workload: 300 HTTP requests (fs read + timer + `Promise.all`), median of 3 runs.', '| recorder, no stacks | 0.69s | 1.1 |', '| stacks incl. promises | 1.12s | 1.9 |'],
};

// ---- command showcase ---------------------------------------------------------------------------------

/** Every command in rewind/cli.py (six at the captured sha), each with its real captured output. */
export const COMMANDS = [
  { name: 'record', view: 'record-bad', desc: 'Run a Node.js program under the recorder. No code changes.' },
  { name: 'runs', view: 'runs', desc: 'List the runs recorded here, newest first.' },
  { name: 'timeline', view: 'timeline-bad', desc: 'The run’s story in order: requests, logs, writes and errors.' },
  { name: 'tree', view: 'tree-bad', desc: 'Who scheduled whom: the async causality tree.' },
  { name: 'why', view: 'why-bad', desc: 'Explain an error, or any event, with graded evidence.' },
  { name: 'diff', view: 'diff-good-bad', desc: 'Compare two runs and find where they first part ways.' },
] as const;

export const showcase = () => COMMANDS.map((c) => ({
  ...c,
  command: (manifest.views as Record<string, { command: string }>)[c.view].command,
  ansi: captures(c.view),
  diff: c.view.startsWith('diff'),
}));

// ---- investigation preview ----------------------------------------------------------------------------

/** The concurrent run, cut to its three checkout requests and the shared state they write. Neutral labels: the
 *  requests are numbered by arrival (#1, the health check, is left out); nothing here is invented. */
export function preview() {
  const r = runModel('bad');
  const lanes = r.lanes.filter((l) => l.name.startsWith('POST'));
  const label = new Map(lanes.map((l, i) => [l.id, `Checkout ${i + 1}`]));
  const crashLane = lanes.find((l) => l.end === 'error')!;
  const overwrite = r.events[whyBad.findings.find((f) => f.level === 'observed' && f.text.startsWith('last write'))!.evidence[0]];
  const start = Math.min(...lanes.map((l) => l.inMs)), end = Math.max(...lanes.map((l) => l.endMs));
  const inference = whyBad.findings.find((f) => f.level === 'inferred')!.text;
  return {
    lanes: lanes.map((l: Lane) => ({ ...l, label: label.get(l.id)! })),
    holders: r.holders.map((h) => ({ ...h, by: label.get(h.writer ?? -1) ?? '' })),
    crash: { lane: label.get(crashLane.id)!, seq: crashLane.markers.find((m) => m.kind.startsWith('error.'))!.seq },
    overwrite: { by: label.get(overwrite.request!)!, seq: overwrite.seq, ms: overwrite.ms },
    start, end, inference, runId: r.id,
  };
}
