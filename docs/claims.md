# Claims table

Every claim the site makes, with its source and provenance class (plan §9.4). No source means no claim.
Sources are files of Rewind at the captured sha (see `src/data/capture/manifest.json`), quoted verbatim, or the
capture artifacts themselves. Figures, seqs, ids, times and counts in the UI come from the artifacts and are not
repeated here; `tests/` checks them (integrity, depth and site tests).

Classes: **observed / derived / inferred** = Rewind's own levels, shown as it printed them · **cited** = stated in a
Rewind document · **artifact** = read from the capture · **authored** = written or drawn by us (◇).

## Hero (§4.1 #1)

| claim | source | class |
|---|---|---|
| "Postmortem debugging for asynchronous Node.js." | `rewind/render.py:TAGLINE` → `source/render.json` | artifact (verbatim) |
| Headline "Record a Node.js run once. Then ask *why*." | approved copy (plan §4.1) | authored |
| "records which request scheduled what, then explains a failure with graded evidence" | README.md:5 — "Rewind tells you which request it belonged to, which callback scheduled the failing work and from where"; README.md:7–11 evidence table | cited |
| excerpt of `why bad --evidence` | `terminal/why-bad.<w>.ansi`; `tests/site.test.ts` checks every line is verbatim and in order | artifact |
| tile: 0 edits to the app; preloaded with --require | `rewind/cli.py:84` — `subprocess.Popen([node, "--require", str(RECORDER), *cmd[1:]], env=env)` | cited (code) |
| tile: events recorded → timeline story lines | `runs/bad.json` `event_count`, `story_count` | artifact |
| tile: N tests pass, against real node processes | `manifest.json` `pytest`; README.md:116 — "54 tests; most run real node processes end to end"; `tests/conftest.py:40` spawns `node` | artifact + cited |

## Scenario (§4.1 #2)

| claim | source | class |
|---|---|---|
| orders, items, send times, payment times | `source/traffic.js`, `source/prices.json` | artifact |
| expected totals | prices summed, coupon as `checkout.js:24` (`Math.round(total * 0.9)`) | authored (computed) |
| request numbers of the orders; #1 is GET /health | `runs/bad.json` events (`request`) | derived (Rewind) |
| lines marked shared / write / use | found in `source/checkout.js` by pattern at build time | authored marks on verbatim source |
| victim: the crash (TypeError at checkout.js:23) | `runs/bad.json` error event | observed |
| victim: the overcharge (charged vs expected) | `runs/bad.json` log event; expected as above | observed + authored |
| notes on the plain trace (no order id, no request, no loadCart, nothing flags the total) | `terminal/plain-node.txt`; `tests/site.test.ts` checks each note against it | authored, tested |

## Investigation (§4.1 #3)

| claim | source | class |
|---|---|---|
| every terminal block | `terminal/*.ansi` | observed (Rewind output) |
| swimlane events and times; cart writes | `runs/<label>.json` events, mutations | observed |
| lane membership; writer of each write | `runs/<label>.json` `request`, `writer` | derived (Rewind) |
| cart holder between writes | computed from observed writes | derived (site) |
| "used here" ticks: log/crash times; reads are not recorded | log and error events | observed; no read is drawn |
| DiffView tokens and alignment | `findings/diff-good-bad.json` | derived (Rewind) |
| DiffView connectors | identical token text, A-only ↔ B-only | authored (explanatory) |
| expected vs charged (step 8) | `source/prices.json` + logs of `bad` and `fixed` | authored + observed |

### Limits (§4.1 #6)

| claim | source | class |
|---|---|---|
| captures: Async causality: who scheduled whom, with creation sites and callback names | docs/handover/FEATURES_AND_LIMITATIONS.md:33 — “- Tree: `tid` ancestry with creation sites and callback names; frameless hops (e.g. `fs.readFile`'s 4 internal hops) folded.” | cited |
| captures: Which request every event belongs to, for Node’s http server, including keep-alive | README.md:97 — “- HTTP attribution covers Node's `http` server (including keep-alive).” | cited |
| captures: Timers, immediates, fs callbacks, promises and async/await chains | docs/handover/FEATURES_AND_LIMITATIONS.md:59 — “- Timers, immediates, fs callbacks, promises and `async`/`await` chains (attribution through `await` verified in M0 E3).” | cited |
| captures: Logs, uncaught throws and unhandled rejections in Node’s default throw mode | docs/handover/FEATURES_AND_LIMITATIONS.md:60 — “- Sync uncaught throws and unhandled rejections in Node's default `--unhandled-rejections=throw` mode.” | cited |
| captures: With --watch: every syntactic write to a top-level CommonJS variable, with its location, its request and JSON previews of before and after (200 chars max) | README.md:81 — “is recorded with its location, the request that made it, and JSON previews of the before and after values (200 chars max).” | cited |
| captures: Normal exit, process.exit, crashes, SIGINT/SIGTERM; a SIGKILLed run is kept and marked crashed | docs/handover/FEATURES_AND_LIMITATIONS.md:61 — “- Normal exit, `process.exit(n)`, crashes, SIGINT/SIGTERM; SIGKILL → partial run marked `crashed`.” | cited |
| does not capture: Reads of variables: never recorded | docs/handover/FEATURES_AND_LIMITATIONS.md:51 — “- reads (never recorded)” | cited |
| does not capture: Every function call or variable value; there is no stepping backwards | README.md:100 — “It does not capture every function call or variable value, and it cannot step backwards through the program.” | cited |
| does not capture: Breakpoints or a web UI | docs/handover/FEATURES_AND_LIMITATIONS.md:71 — “- Not a full time-travel debugger: no per-function-call tracing, no arbitrary variable values, no stepping backwards, no breakpoints, no web UI.” | cited |
| does not capture: With --watch: writes through aliases, destructuring targets, node_modules, ESM files, writes inside functions the value is passed to, same-named locals | README.md:87 — “- writes through aliases (`const c = currentCart; c.x = 1`)” | cited |
| does not capture: https, http2, outgoing HTTP clients as request anchors, worker threads, child processes | docs/handover/FEATURES_AND_LIMITATIONS.md:68 — “- `https`, `http2`, outgoing HTTP clients as request anchors, worker threads, child processes: not instrumented.” | cited |
| does not capture: Unhandled rejections in --unhandled-rejections=warn or none mode | docs/handover/FEATURES_AND_LIMITATIONS.md:69 — “- `--unhandled-rejections=warn\|none`: rejections not recorded.” | cited |
| does not capture: After SIGKILL: up to the last 256 buffered non-error events (errors are written at once) | docs/handover/FEATURES_AND_LIMITATIONS.md:70 — “- SIGKILL: abrupt termination can lose up to the last 256 buffered non-error events; error events are written immediately, and the run is marked `crashed`.” | cited |
| not tested: macOS | docs/handover/FEATURES_AND_LIMITATIONS.md:64 — “macOS not tested.” | cited |
| not tested: Python 3.13 and 3.14 (the suite has run on 3.15.2 and 3.12.3) | docs/handover/FEATURES_AND_LIMITATIONS.md:63 — “- Python ≥ 3.12 per `pyproject.toml`; the suite has run on 3.15.2 (Windows) and 3.12.3 (Ubuntu 24.04, WSL2). 3.13/3.14 not run.” | cited |
| not tested: Node 20 and 22: requires Node ≥ 20, developed on v24.22.1 | docs/handover/FEATURES_AND_LIMITATIONS.md:58 — “- Node.js ≥ 20 (developed on v24.22.1), CommonJS apps, Node core `http` servers including keep-alive.” | cited |
| overhead: About 1.9× wall time with promise creation stacks (the default) and 1.1× without them, on an HTTP-heavy benchmark: 300 requests, each an fs read, a timer and Promise.all, median of 3 runs. About 330 events per request. | docs/handover/FEATURES_AND_LIMITATIONS.md:72 — “- Promise creation stacks cost ~1.9× wall time on an HTTP-heavy benchmark (1.1× with `REWIND_PROMISE_STACKS=0`, losing `async` function names in chains).” | cited |
| overhead workload | spikes/RESULTS.md:43 — “Workload: 300 HTTP requests (fs read + timer + `Promise.all`), median of 3 runs.” | cited |

### Built on evidence (§4.1 #5)

| claim | source | class |
|---|---|---|
| status line | spikes/RESULTS.md:6 — “**Status: 39/39 checks pass, plus E0, E5b, E6 and E7.** The first run was 17/33.” | cited (verbatim) |
| E0: Does the Python 3.15 stack work? PASS; typer 0.29.2, rich 15.0.0, pytest 9.2.0, SQLite 3.53.4 | spikes/RESULTS.md:8 — “## E0 — Python 3.15 stack: PASS” | cited |
| E1: Can async causality be walked back to its root? PASS; fs.readFile is 4 chained FSREQCALLBACK hops; only the first has user frames, so frameless hops are collapsed | spikes/RESULTS.md:12 — “## E1 — async causality tree: PASS” | cited |
| E2: Which callback threw, for sync throws and rejections? PASS (two different mechanisms); uncaughtExceptionMonitor only: it observes without changing crash semantics or exit codes | spikes/RESULTS.md:19 — “## E2 — exception context: PASS (two different mechanisms)” | cited |
| E3: Does request attribution survive await? PASS; two concurrent requests, each log attributed to its own request root only | spikes/RESULTS.md:31 — “**Request attribution through `await` works.**” | cited |
| E4: Does the recorder record itself? PASS; zero async resources attributed to the recorder; seq contiguous, no lost or duplicated lines | spikes/RESULTS.md:35 — “creates zero async resources attributed to the recorder” | cited |
| E5: Does a run survive crashes? PASS; run.end flushed on all four exit paths; 201k rows into SQLite (WAL) in 0.32s | spikes/RESULTS.md:40 — “E5b: 201k rows written to SQLite (WAL mode) in the OneDrive folder in 0.32s” | cited |
| E6: What does recording cost? PASS; 1.1× without promise stacks, 1.9× with them (the default); about 330 events per request | spikes/RESULTS.md:50 — “\| stacks incl. promises \| 1.12s \| 1.9 \| 99k \| 11.9 MB \|” | cited |
| E7: How should writes to a variable be tracked? AST rewrite: SHIP; 0.14µs per watched write; four approaches compared (below) | spikes/RESULTS.md:60 — “0.14µs per watched write (1M writes, warm)” | cited |
| E7 AST rewrite of watched names: 0.14µs per watched write; Ship, as --watch | spikes/RESULTS.md:60 — “**SHIP** as `--watch name[,name]`” | cited |
| E7 Inspector logpoint: ~39µs per hit; Reject: about 100× slower, and still needs an AST | spikes/RESULTS.md:61 — “Reject: about 100× slower and still needs an AST to pick the lines” | cited |
| E7 Deep Proxy via rewind.track(obj): 0.65µs per write; Stretch goal only: breaks identity, needs code edits | spikes/RESULTS.md:62 — “Stretch goal only, documented hazard” | cited |
| E7 Out-of-process CDP pause: not built; Reject: pausing changes the timing that causes the race | spikes/RESULTS.md:63 — “Pausing per write changes timing, which would hide the very race the demo is about.” | cited |
| B12 Keep-alive requests attributed to each other: Requests on one keep-alive connection shared an anchor, because Node’s HTTPINCOMINGMESSAGE is per connection. A per-request AsyncResource('REWIND_REQUEST'); the req/res events run in its scope. (test_keepalive_requests_get_distinct_anchors) | docs/handover/ENGINEERING_LOG.md:307 — “### B12. Keep-alive requests attributed to each other” | cited |
| B13 Nondeterministic HTTP date-cache timer in diff: Diffs of two good runs diverged: Node’s HTTP date-cache timer fires nondeterministically. Callbacks with no observable effect are excluded from the steps compared. (test_diff_of_two_good_runs_has_no_divergence) | docs/handover/ENGINEERING_LOG.md:317 — “### B13. Nondeterministic HTTP date-cache timer in `diff`” | cited |

### How it works (§4.1 #4)

| claim | source | class |
|---|---|---|
| pipeline: Node writes facts, Python interprets | docs/ARCHITECTURE.md:17 — “The Node side only writes facts. All interpretation happens in Python.” | authored diagram of a cited structure |
| keep-alive: HTTPINCOMINGMESSAGE is per connection | docs/ARCHITECTURE.md:31 — “Node's own `HTTPINCOMINGMESSAGE` is per connection, so without this, keep-alive requests are attributed to each other.” | cited |
| Get started: install commands | README.md:25 — “npm install --prefix recorder                         # only needed for --watch” | cited; verified by the M6 fresh-clone run |
