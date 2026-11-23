// Content of the depth sections (M5). Every claim carries its source: a file captured verbatim at the pinned sha and
// a quote that tests/depth.test.ts finds in it. Numbers shown must appear in the source they cite (§7.4 e).

export type Src = { file: 'RESULTS.md' | 'README.md' | 'FEATURES_AND_LIMITATIONS.md' | 'ENGINEERING_LOG.md' | 'ARCHITECTURE.md'; quote: string };

// ---- How it works ------------------------------------------------------------------------------------

export const pipeline = [
  { title: 'Your program', body: 'node with the recorder preloaded: async_hooks, console, http.Server, uncaughtExceptionMonitor, and the AST rewrite only with --watch.', chips: ['recorder/recorder.js', 'recorder/instrument.js'] },
  { title: 'NDJSON', body: 'One event per line into .rewind/runs/<id>.ndjson. The raw file is kept.', chips: [] },
  { title: 'Ingest', body: 'When the process exits, one transaction into .rewind/rewind.db (SQLite, WAL).', chips: ['rewind/store.py'] },
  { title: 'Analysis', body: 'Pure functions: the Run index, tree, investigate, diff.', chips: ['rewind/analysis.py'] },
  { title: 'CLI', body: 'Typer commands, Rich output.', chips: ['rewind/cli.py', 'rewind/render.py'] },
];
export const pipelineSource: Src = { file: 'ARCHITECTURE.md', quote: 'The Node side only writes facts. All interpretation happens in Python.' };
export const keepAlive: Src = { file: 'ARCHITECTURE.md', quote: 'Node\'s own `HTTPINCOMINGMESSAGE` is per connection, so without this, keep-alive requests are attributed to each other.' };

// ---- Built on evidence -------------------------------------------------------------------------------

/** spikes/RESULTS.md, E0–E7: the question each experiment answered, its verdict, and the figure behind it. */
export const experiments: { id: string; q: string; verdict: string; figure: string; src: Src }[] = [
  { id: 'E0', q: 'Does the Python 3.15 stack work?', verdict: 'PASS', figure: 'typer 0.29.2, rich 15.0.0, pytest 9.2.0, SQLite 3.53.4', src: { file: 'RESULTS.md', quote: '## E0 — Python 3.15 stack: PASS' } },
  { id: 'E1', q: 'Can async causality be walked back to its root?', verdict: 'PASS', figure: 'fs.readFile is 4 chained FSREQCALLBACK hops; only the first has user frames, so frameless hops are collapsed', src: { file: 'RESULTS.md', quote: '## E1 — async causality tree: PASS' } },
  { id: 'E2', q: 'Which callback threw, for sync throws and rejections?', verdict: 'PASS (two different mechanisms)', figure: 'uncaughtExceptionMonitor only: it observes without changing crash semantics or exit codes', src: { file: 'RESULTS.md', quote: '## E2 — exception context: PASS (two different mechanisms)' } },
  { id: 'E3', q: 'Does request attribution survive await?', verdict: 'PASS', figure: 'two concurrent requests, each log attributed to its own request root only', src: { file: 'RESULTS.md', quote: '**Request attribution through `await` works.**' } },
  { id: 'E4', q: 'Does the recorder record itself?', verdict: 'PASS', figure: 'zero async resources attributed to the recorder; seq contiguous, no lost or duplicated lines', src: { file: 'RESULTS.md', quote: 'creates zero async resources attributed to the recorder' } },
  { id: 'E5', q: 'Does a run survive crashes?', verdict: 'PASS', figure: 'run.end flushed on all four exit paths; 201k rows into SQLite (WAL) in 0.32s', src: { file: 'RESULTS.md', quote: 'E5b: 201k rows written to SQLite (WAL mode) in the OneDrive folder in 0.32s' } },
  { id: 'E6', q: 'What does recording cost?', verdict: 'PASS', figure: '1.1× without promise stacks, 1.9× with them (the default); about 330 events per request', src: { file: 'RESULTS.md', quote: '| stacks incl. promises | 1.12s | 1.9 | 99k | 11.9 MB |' } },
  { id: 'E7', q: 'How should writes to a variable be tracked?', verdict: 'AST rewrite: SHIP', figure: '0.14µs per watched write; four approaches compared (below)', src: { file: 'RESULTS.md', quote: '0.14µs per watched write (1M writes, warm)' } },
];
export const experimentsStatus: Src = { file: 'RESULTS.md', quote: '**Status: 39/39 checks pass, plus E0, E5b, E6 and E7.** The first run was 17/33.' };
export const overheadWorkload: Src = { file: 'RESULTS.md', quote: 'Workload: 300 HTTP requests (fs read + timer + `Promise.all`), median of 3 runs.' };

/** E7: the four mutation-tracking approaches, as RESULTS.md measured them. */
export const approaches: { name: string; cost: string; verdict: string; src: Src }[] = [
  { name: 'AST rewrite of watched names', cost: '0.14µs per watched write', verdict: 'Ship, as --watch', src: { file: 'RESULTS.md', quote: '**SHIP** as `--watch name[,name]`' } },
  { name: 'Inspector logpoint', cost: '~39µs per hit', verdict: 'Reject: about 100× slower, and still needs an AST', src: { file: 'RESULTS.md', quote: 'Reject: about 100× slower and still needs an AST to pick the lines' } },
  { name: 'Deep Proxy via rewind.track(obj)', cost: '0.65µs per write', verdict: 'Stretch goal only: breaks identity, needs code edits', src: { file: 'RESULTS.md', quote: 'Stretch goal only, documented hazard' } },
  { name: 'Out-of-process CDP pause', cost: 'not built', verdict: 'Reject: pausing changes the timing that causes the race', src: { file: 'RESULTS.md', quote: 'Pausing per write changes timing, which would hide the very race the demo is about.' } },
];

/** Bugs found and fixed while building (docs/handover/ENGINEERING_LOG.md). */
export const bugs: { id: string; title: string; found: string; fix: string; test: string; src: Src }[] = [
  { id: 'B12', title: 'Keep-alive requests attributed to each other', found: 'Requests on one keep-alive connection shared an anchor, because Node’s HTTPINCOMINGMESSAGE is per connection.', fix: 'A per-request AsyncResource(\'REWIND_REQUEST\'); the req/res events run in its scope.', test: 'test_keepalive_requests_get_distinct_anchors', src: { file: 'ENGINEERING_LOG.md', quote: '### B12. Keep-alive requests attributed to each other' } },
  { id: 'B13', title: 'Nondeterministic HTTP date-cache timer in diff', found: 'Diffs of two good runs diverged: Node’s HTTP date-cache timer fires nondeterministically.', fix: 'Callbacks with no observable effect are excluded from the steps compared.', test: 'test_diff_of_two_good_runs_has_no_divergence', src: { file: 'ENGINEERING_LOG.md', quote: '### B13. Nondeterministic HTTP date-cache timer in `diff`' } },
];

// ---- Limits --------------------------------------------------------------------------------------------

const F = 'FEATURES_AND_LIMITATIONS.md' as const, R = 'README.md' as const;
export const captures: { text: string; src: Src }[] = [
  { text: 'Async causality: who scheduled whom, with creation sites and callback names', src: { file: F, quote: '- Tree: `tid` ancestry with creation sites and callback names; frameless hops (e.g. `fs.readFile`\'s 4 internal hops) folded.' } },
  { text: 'Which request every event belongs to, for Node’s http server, including keep-alive', src: { file: R, quote: '- HTTP attribution covers Node\'s `http` server (including keep-alive).' } },
  { text: 'Timers, immediates, fs callbacks, promises and async/await chains', src: { file: F, quote: '- Timers, immediates, fs callbacks, promises and `async`/`await` chains (attribution through `await` verified in M0 E3).' } },
  { text: 'Logs, uncaught throws and unhandled rejections in Node’s default throw mode', src: { file: F, quote: '- Sync uncaught throws and unhandled rejections in Node\'s default `--unhandled-rejections=throw` mode.' } },
  { text: 'With --watch: every syntactic write to a top-level CommonJS variable, with its location, its request and JSON previews of before and after (200 chars max)', src: { file: R, quote: 'is recorded with its location, the request that made it, and JSON previews of the before and after values (200 chars max).' } },
  { text: 'Normal exit, process.exit, crashes, SIGINT/SIGTERM; a SIGKILLed run is kept and marked crashed', src: { file: F, quote: '- Normal exit, `process.exit(n)`, crashes, SIGINT/SIGTERM; SIGKILL → partial run marked `crashed`.' } },
];
export const notCaptured: { text: string; src: Src }[] = [
  { text: 'Reads of variables: never recorded', src: { file: F, quote: '- reads (never recorded)' } },
  { text: 'Every function call or variable value; there is no stepping backwards', src: { file: R, quote: 'It does not capture every function call or variable value, and it cannot step backwards through the program.' } },
  { text: 'Breakpoints or a web UI', src: { file: F, quote: '- Not a full time-travel debugger: no per-function-call tracing, no arbitrary variable values, no stepping backwards, no breakpoints, no web UI.' } },
  { text: 'With --watch: writes through aliases, destructuring targets, node_modules, ESM files, writes inside functions the value is passed to, same-named locals', src: { file: R, quote: '- writes through aliases (`const c = currentCart; c.x = 1`)' } },
  { text: 'https, http2, outgoing HTTP clients as request anchors, worker threads, child processes', src: { file: F, quote: '- `https`, `http2`, outgoing HTTP clients as request anchors, worker threads, child processes: not instrumented.' } },
  { text: 'Unhandled rejections in --unhandled-rejections=warn or none mode', src: { file: F, quote: '- `--unhandled-rejections=warn|none`: rejections not recorded.' } },
  { text: 'After SIGKILL: up to the last 256 buffered non-error events (errors are written at once)', src: { file: F, quote: '- SIGKILL: abrupt termination can lose up to the last 256 buffered non-error events; error events are written immediately, and the run is marked `crashed`.' } },
];
export const untested: { text: string; src: Src }[] = [
  { text: 'macOS', src: { file: F, quote: 'macOS not tested.' } },
  { text: 'Python 3.13 and 3.14 (the suite has run on 3.15.2 and 3.12.3)', src: { file: F, quote: '- Python ≥ 3.12 per `pyproject.toml`; the suite has run on 3.15.2 (Windows) and 3.12.3 (Ubuntu 24.04, WSL2). 3.13/3.14 not run.' } },
  { text: 'Node 20 and 22: requires Node ≥ 20, developed on v24.22.1', src: { file: F, quote: '- Node.js ≥ 20 (developed on v24.22.1), CommonJS apps, Node core `http` servers including keep-alive.' } },
];
export const overhead: { text: string; src: Src } = {
  text: 'About 1.9× wall time with promise creation stacks (the default) and 1.1× without them, on an HTTP-heavy benchmark: 300 requests, each an fs read, a timer and Promise.all, median of 3 runs. About 330 events per request.',
  src: { file: F, quote: '- Promise creation stacks cost ~1.9× wall time on an HTTP-heavy benchmark (1.1× with `REWIND_PROMISE_STACKS=0`, losing `async` function names in chains).' },
};

// ---- Get started (commands verified by the M6 fresh-clone run) ----------------------------------------

export const install = [
  { cmd: 'git clone https://github.com/dangerousEnigma1827/Rewind.git', note: '' },
  { cmd: 'cd Rewind', note: '' },
  { cmd: 'python -m venv .venv', note: 'Linux: python3; Ubuntu/Debian may need python3-venv' },
  { cmd: '.venv/Scripts/activate', note: 'Windows PowerShell; if it says running scripts is disabled, run Set-ExecutionPolicy -Scope Process RemoteSigned first (this session only). Git Bash: source .venv/Scripts/activate. Linux/macOS: source .venv/bin/activate' },
  { cmd: 'pip install -e ".[dev]"', note: '' },
  { cmd: 'npm install --prefix recorder', note: 'only needed for --watch' },
];
export const tour = [
  'rewind record -l bad -w currentCart -- node demo/traffic.js',
  'rewind why bad --evidence',
  'rewind timeline bad',
  'rewind record -l good -w currentCart -- node demo/traffic.js --sequential',
  'rewind diff good bad --evidence',
];
export const installSource: Src = { file: R, quote: 'npm install --prefix recorder                         # only needed for --watch' };

// ---- Usage and commands -----------------------------------------------------------------------------

/** The README's "## Commands" table as [command, description] rows, verbatim (backticks removed from the command). */
export function commands(readme: string): [string, string][] {
  const section = readme.split('## Commands')[1].split('\n## ')[0];
  return section.split('\n').filter((l) => /^\| `rewind/.test(l))
    .map((l) => { const [, cmd, what] = l.split('|').map((c) => c.trim()); return [cmd.replace(/`/g, ''), what]; });
}
