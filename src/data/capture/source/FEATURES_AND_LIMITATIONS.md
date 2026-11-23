# Features and limitations

Back to [HANDOVER.md](HANDOVER.md). Command options come from `rewind/cli.py`. CLI behaviour is covered by the 54-test suite. The M7 fresh-clone walkthrough independently verifies the documented installation and demonstration workflow ([TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md)).

## CLI commands

`RUN` everywhere = a label, an id prefix, `last` (default), or `-N` (Nth newest). Unknown runs give a friendly error and exit code 2.

| command | options | does |
|---|---|---|
| `rewind` / `rewind --help` | — | Landing screen (branch `feat/cli-visual-redesign`): REWIND wordmark, runs recorded here and the latest one's status, the commands, the evidence key, and a next step based on the latest run. Bare `rewind` exits 2 (unchanged); it never creates `.rewind`. `rewind <command> --help` lists every option. |
| `rewind record [OPTIONS] -- node app.js [args]` | `-l/--label NAME`, `-w/--watch VAR[,VAR]` | Runs the program with the recorder preloaded, ingests the run, prints a summary, exits with the program's exit code. `rewind record app.js` (no `node`) is accepted as shorthand. |
| `rewind runs` | — | Recorded runs, newest first (id, label, status, counts). |
| `rewind timeline [RUN]` | `-r/--request N`, `-k/--kind log,http,error,mutation,async,run`, `-c/--callbacks`, `--raw` | The run's story in order: requests, logs, writes, errors. `-r` one request; `-c` adds every user callback firing; `--raw` every recorded event unfiltered. |
| `rewind tree [RUN]` | `-r/--request N`, `--full` | Async causality tree ("who scheduled whom"). Quiet branches pruned and internal hops folded unless `--full`; reports how much it hid. |
| `rewind why [RUN]` | `-e/--error N` (default 1), `-s/--seq SEQ`, `--evidence` | Causal investigation of error N, or of any event by seq. |
| `rewind diff A B` | `--all`, `--evidence` | Aligns two runs and finds the first divergence. `--all` includes callbacks outside any request (harness/plumbing). |

## Causal investigation (`why`)

For an error it reports, with evidence levels:
- ● throw site and the running callback, plus where that callback was scheduled (creation stack)
- ◆ the collapsed causal chain back to the owning HTTP request, and what other requests did while it was in flight
- ◆ whether the failing source line references a watched variable; ● the last recorded write preceding the failure; ◆ which request made that write; ◆ the observed own-write → foreign-overwrite sequence, with the subsequent read inferred from source context.
- ? likely root cause (e.g. race on shared module-level state), citing the seqs above

For a non-error event (`--seq`, e.g. a log showing a wrong total) it gives the same story but marks a race as **not proven**, because reads aren't recorded.
Without `--watch` it never claims a mutation: it only suspects module-level state on the failing line and recommends re-recording with `--watch <var>`.

## Timelines and execution trees

- Timeline: request-tagged story events in `seq` order; internal noise collapsed (~330 events per HTTP request measured in M0 E6, so collapsing is essential).
- Tree: `tid` ancestry with creation sites and callback names; frameless hops (e.g. `fs.readFile`'s 4 internal hops) folded.

## Diff

Token stream per run (effectful callbacks, requests, logs, writes by location/op, errors, exit; ids and times stripped), aligned with `difflib.SequenceMatcher`. Reports the first divergence, whether it is a move (same step, different order) or a genuine only-A/only-B step, and counts. On the demo, good (sequential) vs bad (concurrent), both recorded with `-w currentCart`, diverge right after request #2's write to `currentCart`: same code path, different interleaving (verified M7). If only one run was watched, writes are left out and the shared prefix ends at #2's `loadCart` callback.

## Mutation tracking (`--watch`)

Records every **syntactic** write to a watched variable declared at the top level of a CommonJS file, with location, writer request (via `eid`) and JSON previews of before/after (≤200 chars).

Captured: reassignment; property and element assignment; compound operators; `++`/`--`; `delete`; calls to `push pop shift unshift splice sort reverse fill copyWithin set delete clear add`.

Not captured:
- writes through aliases (`const c = currentCart; c.x = 1`)
- destructuring targets (`[currentCart.a] = v`)
- files under `node_modules`; ESM files (`.mjs`, `"type": "module"`) — test confirms ESM is left unharmed
- mutations inside functions the value is passed to
- same-named local variables (skipped on purpose)
- reads (never recorded)

More than `REWIND_MUT_CAP` (default 10 000) writes to one name → counting continues, values stop.
Requires `npm install --prefix recorder` (acorn, acorn-walk, magic-string); without `--watch` the recorder needs no npm packages. If they are missing, a `--watch` run crashes at preload with Node's `Cannot find module 'acorn'` (verified M7).

## Supported scenarios

- Node.js ≥ 20 (developed on v24.22.1), CommonJS apps, Node core `http` servers including keep-alive.
- Timers, immediates, fs callbacks, promises and `async`/`await` chains (attribution through `await` verified in M0 E3).
- Sync uncaught throws and unhandled rejections in Node's default `--unhandled-rejections=throw` mode.
- Normal exit, `process.exit(n)`, crashes, SIGINT/SIGTERM; SIGKILL → partial run marked `crashed`.
- Windows 11 inside a OneDrive folder (M0 E5b).
- Python ≥ 3.12 per `pyproject.toml`; the suite has run on 3.15.2 (Windows) and 3.12.3 (Ubuntu 24.04, WSL2). 3.13/3.14 not run.
- Terminals: the classic PowerShell 5.1 console (with glyph stand-ins for Lucida Console / Consolas), Windows Terminal, Linux terminals (tested in tmux). Tested at widths down to 30 columns and at multiple terminal heights; short terminals scroll naturally, with some landing-screen content potentially moving into scrollback. Colour off with `NO_COLOR` or when piped. Per-terminal evidence: [compatibility matrix](TESTING_AND_VERIFICATION.md#terminal-compatibility-matrix-2026-11-23-branch-featcli-visual-redesign). macOS not tested.

## Unsupported scenarios / known limitations

- `https`, `http2`, outgoing HTTP clients as request anchors, worker threads, child processes: not instrumented.
- `--unhandled-rejections=warn|none`: rejections not recorded.
- SIGKILL: abrupt termination can lose up to the last 256 buffered non-error events; error events are written immediately, and the run is marked `crashed`.
- Not a full time-travel debugger: no per-function-call tracing, no arbitrary variable values, no stepping backwards, no breakpoints, no web UI.
- Promise creation stacks cost ~1.9× wall time on an HTTP-heavy benchmark (1.1× with `REWIND_PROMISE_STACKS=0`, losing `async` function names in chains).
- `REWIND_HOME` defaults to `./.rewind` relative to the cwd where `rewind` is run, so runs recorded from different directories land in different databases.
