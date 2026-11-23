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
| "A stack trace says where an error surfaced. Rewind says which request caused it, who scheduled the failing work, and who changed the state it read." | README.md:5 — "Rewind tells you which request it belonged to, which callback scheduled the failing work and from where, what other requests were doing meanwhile, who last changed the state it read" | cited |
| excerpt of `why bad --evidence` (findings only; the title line with the run id is left out) | `terminal/why-bad.<w>.ansi`; `tests/site.test.ts` checks every line is verbatim and in order | artifact |
| fact: Zero application code changes; Rewind records the run through Node.js preloading | `rewind/cli.py:84` — `subprocess.Popen([node, "--require", str(RECORDER), *cmd[1:]], env=env)`; README.md commands table — "runs the program with the recorder preloaded" | cited (code) |
| benefit: the crash traced back to its request and order | `findings/why-bad.json` (request), `runs/bad.json` (error event), order mapping as in the Scenario | derived (Rewind) |
| benefit: the overcharge (charged vs expected), no error | `runs/bad.json` log event; expected from prices.json | observed + authored |
| benefit: findings graded; Rewind says when it cannot see something (a read) | README.md:7–13; `analysis.py:349–351` "(Reads are not recorded, so this is not proven.)" | cited |
| not on Home (moved or dropped): events recorded → story lines varies per capture (425–515 recorded across runs; `timeline bad` shows "16 events shown of 451 recorded"); the test count belongs to the captured commit (`manifest.json` `pytest`, shown in Documentation → Evidence) | `runs/*.json`, `manifest.json` | — |

## Investigation page: The Wrong Order Total Bug (formerly called the Phantom Discount)

| claim | source | class |
|---|---|---|
| orders, items, send times, payment times | `source/traffic.js`, `source/prices.json` | artifact |
| expected totals | prices summed, coupon as `checkout.js:24` (`Math.round(total * 0.9)`) | authored (computed) |
| request numbers of the orders; #1 is GET /health | `runs/bad.json` events (`request`) | derived (Rewind) |
| lines marked shared / write / use | found in `source/checkout.js` by pattern at build time | authored marks on verbatim source |
| charged column (wrong total, crash, correct total) | `runs/bad.json` log and error events (`charged()`) | observed |
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

## Investigation step copy (§3.6, `src/lib/investigation.ts`)

| claim | source | class |
|---|---|---|
| 1: N orders arrive at overlapping times; one request crashes; the trace names no order and no request; nothing flags the wrong total | `source/traffic.js` (count, `at`); `terminal/plain-node.txt` (checked by `tests/site.test.ts`) | authored, tested |
| 2: preloaded with --require, no change to the app; same crash, now recorded | `rewind/cli.py:84`; `terminal/record-bad.*` | cited + observed |
| 3: findings are graded ● ◆ ? with the event seqs behind them | README.md:7–13; `terminal/why-bad.*` | cited + observed |
| 4: the A-101 log line belongs to request #2 | `runs/bad.json` (log event `request`), interpolated at build | derived (Rewind) |
| 5: any event can be explained; Rewind derives the overwrite and says reads are not recorded, so it is not proven | `analysis.py:349–351` wording; `findings/why-bad-seq.json` | derived + inferred (Rewind) |
| 6: without --watch Rewind claims no write, points at the module-level name, suggests --watch | `analysis.py:303–311`; `findings/why-nowatch.json` | derived + inferred (Rewind) |
| 7: orders one at a time pass; same code path, different interleaving | `manifest.json` good run exit 0; diff finding "the interleaving changed, not the code path" | observed + derived (Rewind) |
| 8: the patch passes each request its own cart; why reports no errors; every total right | `source/fix.patch`; `terminal/why-fixed.*`; `tests/investigation.test.ts` totals | observed + authored |

## Other authored copy

| claim | source | class |
|---|---|---|
| Section lede, How it works: the recorder writes facts, Python interprets | ARCHITECTURE.md:17 (row below) | cited |
| Section lede, Built on evidence: the main design choices were tested in experiments before they were built | spikes/RESULTS.md: "Decisions locked for production" after E0–E7 | cited |
| How it works: Rewind walks an event's trigger links up to a request anchor; a stack trace stops at the timer | `analysis.py:103–111` (`request_of`); `terminal/plain-node.txt` | cited (code) + observed |
| How it works: which requests share a connection varies from run to run | `capture/SCHEMA.md` "Known run-to-run variation": #1+#2 in one capture, #1+#2+#4 in another (M1, re-seen in M6) | observed by us across captures |
| How it works: the line number is unchanged, so stack traces are too | `source/checkout.instrumented.js` has the same line count; README.md "Line numbers in your stack traces are unchanged." | artifact + cited |
| Built on evidence: RESULTS.md calls the overwrite observed; the engine labels the writer derived | RESULTS.md:68 vs `analysis.py:330` (`DERIVED`); plan §2.8 | cited |
| Get started: Set-ExecutionPolicy -Scope Process RemoteSigned lets the venv activate under the Restricted default | verified in M6 (below) | verified |

## Verification of Get started and the tour (M6, 2026-11-23)

| route | result |
|---|---|
| Windows PowerShell 5.1, fresh `git clone` of Rewind.git (main = `388fe45`), every published command | all succeed; bad: A-101 $161, #3 TypeError; good: $128/$186/$11; diff "14 of 21 (A) / 20 (B)", "3 step(s) later"; `why --seq` "not proven"; nowatch claims no write; `git apply demo/fix.patch` applies; fixed: $128/$186/$11, "no errors recorded" |
| Windows PowerShell 5.1 under the Restricted policy | `.venv/Scripts/activate` refused; works after `Set-ExecutionPolicy -Scope Process RemoteSigned` (now in the published note) |
| bash, WSL Ubuntu, Python 3.12.3, Node 24.22.2, clone of `388fe45` | the same outcomes for the whole sequence, `git apply` included. `python3 -m venv` needs the python3-venv package (stated in the note; not installable here without sudo, so Rewind's B17 route made the venv) |
| website fresh clone, no Python on PATH | `npm ci && npm run build && npm test`: build complete, 370 tests pass |
| re-capture from the fresh Windows clone (to a scratch folder, committed artifacts untouched) | findings, diff tokens and opcodes, per-run stories and writers, and the `tree -r 3` shape identical; keep-alive grouping and counts vary, as documented |

Note: Rewind.git and rewind_demo_website.git return 404 to unauthenticated requests (private). The published `git clone` and every GitHub link work only once Rewind.git is public. The WSL run cloned the same commit locally for that reason.

## Home showcase (refinement, 2026-11-23)

| claim | source | class |
|---|---|---|
| 54 tests pass; 44 of them start real Node.js processes | `src/data/verify/rewind-tests.json`: `pytest -q -p nodespy` (`capture/nodespy.py`) in a fresh clone at the captured sha; agrees with `manifest.json` `pytest` (checked by `tests/home.test.ts`). A later unpushed Rewind commit had 56 / 45 | observed (verification run) |
| ~330 events per HTTP request, in a 300-request benchmark (fs read + timer + Promise.all, median of 3 runs); overhead 1.1×, 1.9× with promise stacks | spikes/RESULTS.md:43, :48, :50, :53 (E6); figures checked by `tests/home.test.ts` | cited |
| Six commands: record, runs, timeline, tree, why, diff (homepage showcase; navbar Install → /#install) | `rewind/cli.py` `@app.command` at 388fe45 (and at 1c34e77); README.md commands table (checked) | cited (code) |
| each command's output in the showcase | `terminal/{record-bad,runs,timeline-bad,tree-bad,why-bad,diff-good-bad}.<w>.ansi`; `tests/home.test.ts` checks command ↔ capture | artifact |
| First run: `rewind record -- node app.js`, `rewind why` | `rewind/render.py:253` (landing screen's "record your first run"); `why` defaults to the latest run (`cli.py`, RUN default `last`) | cited (code) |
| Preview: three customers order at nearly the same time; "Customer C’s request overwrote the shared order data, then Customer B’s request failed"; "Reads are not recorded, so the link between them is its inference" | `runs/bad.json` lanes, mutations and error; the overwrite is `why-bad.json`'s observed "last write" evidence; Customer A/B/C = the POST /order requests in arrival order (authored labels; the shared order data is checkout.js’s module-level cart) | observed + derived; labels authored |
| No licence line | neither Rewind nor this repository has a licence file at the captured sha | — |
