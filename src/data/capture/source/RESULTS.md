# M0 experiment results

Environment: Windows 11, Node v24.22.1, Python 3.15.2 (3.14.10 also installed), repo inside OneDrive.
Reproduce: `.venv/Scripts/python spikes/check.py` (E1–E5, 39 assertions), `spikes/e5_sqlite.py`, `spikes/e6_bench.py`, and the E7 commands below.

**Status: 39/39 checks pass, plus E0, E5b, E6 and E7.** The first run was 17/33. Every failure came from a wrong expectation in a check, not a recorder bug, and the fixes are listed as findings below.

## E0 — Python 3.15 stack: PASS
A venv on 3.15.2 runs typer 0.29.2, rich 15.0.0, pytest 9.2.0, and stdlib sqlite (SQLite 3.53.4). A Rich table renders and a Typer multi-command app works.
**Fallback:** Python 3.14.10 is installed (`py -3.14 -m venv .venv`). We only use pure-Python deps, so switching costs nothing.

## E1 — async causality tree: PASS
- A log inside `setTimeout → fs.readFile → setTimeout` has an `eid` whose `triggerAsyncId` chain walks back through each scheduling step. The sibling branch stays separate.
- **Finding:** `fs.readFile` is 4 chained `FSREQCALLBACK` hops (open/stat/read/close). Only the first one has user frames. → Analysis **collapses hops with no user frames**.
- **Finding:** V8 frames look like `Timeout.stepB`, with a receiver prefix. → Normalize function names.
- **Finding:** a Timeout's *creation stack* tells you where it was scheduled. Its *callback name* (`resource._onTimeout.name`) tells you what runs. We need both, so the recorder captures `cb`.
- In logs, `executionAsyncId()` always equals the top of the recorder's before/after stack.

## E2 — exception context: PASS (two different mechanisms)
| Error kind | Origin seen by `uncaughtExceptionMonitor` | Correct context |
|---|---|---|
| sync throw in timer / fs callback | `uncaughtException` | `executionAsyncId()` = throwing callback (= active-stack top) |
| throw in `.then` / after `await` | `unhandledRejection` | active stack is **empty**. `executionAsyncId()` = **the rejected promise's aid** |

In both cases the ancestor chain reaches the right root callback. With promise stacks on, the creation stack of the rejected promise names the user function (`handler`, `scheduleIt`).
**Decision:** use `uncaughtExceptionMonitor` only. It observes without changing crash semantics or exit codes.

## E3 — promise correlation: PASS
- The aid from a `WeakMap<Promise, aid>` lookup equals the monitor's `eid` in default mode. The WeakMap is redundant, so it is **dropped**, which saves memory.
- **Finding:** an `unhandledRejection` listener that re-throws loses the context (`eid=0`). → Do not install one.
- Two concurrent "requests" each doing `await fs` then `await timer` then `log`: each log is attributed to its own request root only. **Request attribution through `await` works.**
- Known gap: with `--unhandled-rejections=warn|none` the monitor doesn't fire, so those rejections aren't recorded. This will be documented.

## E4 — re-entrancy: PASS
`fs.writeSync` plus `new Error().stack` inside hooks creates zero async resources attributed to the recorder. `seq` is contiguous in every file, with no lost or duplicated lines.

## E5 — persistence: PASS
- `run.end` is flushed on normal exit, `process.exit(1)`, an uncaught throw, and an unhandled rejection (the `exit` handler runs in all four).
- SIGKILL leaves a readable partial file. Anything after the last 256-event flush is lost. → Production also **flushes immediately on error events**, and ingest marks runs without `run.end` as `crashed`.
- E5b: 201k rows written to SQLite (WAL mode) in the OneDrive folder in 0.32s, with a concurrent reader and open/close churn, and no lock errors. `REWIND_HOME` override stays as a cheap escape hatch.

## E6 — overhead: PASS
Workload: 300 HTTP requests (fs read + timer + `Promise.all`), median of 3 runs.

| mode | wall | × | events | size |
|---|---|---|---|---|
| baseline | 0.60s | 1.0 | – | – |
| recorder, no stacks | 0.69s | 1.1 | 99k | 9.6 MB |
| stacks except promises | 0.66s | 1.1 | 99k | 9.8 MB |
| stacks incl. promises | 1.12s | 1.9 | 99k | 11.9 MB |

**Decision:** promise creation stacks are **on by default**. They are what names `handler` in async/await chains, and 1.9× is fine for a debugger. `REWIND_PROMISE_STACKS=0` turns them off.
**Finding:** about 330 events per request, so collapsing noise is mandatory for timeline and tree.

## E7 — variable mutation tracking
Target: `spikes/fixtures/e7_target.js` (the Phantom Discount pattern plus edge cases).

| Approach | Accuracy (measured) | Overhead (measured) | Verdict |
|---|---|---|---|
| **1. AST rewrite of watched names** (`spikes/e7_rewrite.js`) | Caught: reassignment, `.a = `, `[i] = `, `++`, compound `=`, `delete`, `.push()`. Correctly skipped a shadowed local. Computed key `k++` evaluated exactly once. Missed: alias write `c = currentCart; c.coupon = …` (expected). Stack line numbers stay unchanged. | 0.14µs per watched write (1M writes, warm). Unwatched code is untouched. | **SHIP** as `--watch name[,name]` |
| 2. Inspector conditional-breakpoint logpoint (`spikes/e7_inspector.js`) | Works in-process, never pauses, and can read any in-scope value. But it only snapshots a line *before* it runs and doesn't detect writes by itself. | ~39µs per hit at N=2000. The 1M run didn't finish within 120s. | Reject: about 100× slower and still needs an AST to pick the lines |
| 3. Deep Proxy via `rewind.track(obj)` (`spikes/e7_proxy.js`) | Catches alias writes. Misses `let` reassignment. Requires editing user code. **Breaks identity** (`p.a !== p.a`). | 0.65µs per write | Stretch goal only, documented hazard |
| 4. Out-of-process CDP pause | Not built. Pausing per write changes timing, which would hide the very race the demo is about. | — | Reject |

**Honest capability statement for README and CLI:**
`--watch currentCart` records every *syntactic* write to the module-level `currentCart` binding in your CommonJS files. That covers reassignment, property and element assignment, `++/--`, `delete`, and calls to known mutating methods (`push`, `splice`, `set`, …). It does **not** see writes through aliases, writes inside `node_modules`, writes in ESM files, or mutations done by arbitrary functions the value is passed to. Before/after values are JSON previews capped at 200 chars, and re-reads are skipped when the target expression has side effects.

Each mutation event carries `eid`, so it joins the causal tree. That is what lets "request #3 overwrote `currentCart`" be an **OBSERVED** fact.

## Decisions locked for production
1. NDJSON from Node, ingested by Python into SQLite (WAL). Flush every 256 events, on error events, and on exit.
2. `uncaughtExceptionMonitor` is the only error hook. Context = `executionAsyncId()` in both the sync and rejection paths.
3. Capture `cb` names for Timeout/Immediate. Normalize `Type.fn` frame names. Collapse frameless hops.
4. Promise stacks default on.
5. Mutation tracking = AST rewrite with an opt-in `--watch`. acorn, acorn-walk and magic-string are loaded **only when `--watch` is used**, so recording without `--watch` stays zero-dependency.
6. Python 3.15 is primary, 3.14 is the fallback.
