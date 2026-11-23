# Rewind architecture

```
 ┌─────────────── node process ────────────────┐
 │ app code                                    │
 │ recorder/recorder.js  (node --require)      │
 │   async_hooks · console · http.Server ·     │
 │   uncaughtExceptionMonitor · [--watch AST]  │──► .rewind/runs/<id>.ndjson   (raw, kept)
 └─────────────────────────────────────────────┘
                          │ process exits
                          ▼
 rewind/store.py   ingest ──► .rewind/rewind.db  (SQLite, WAL)
 rewind/analysis.py         pure functions: Run index, tree, investigate, diff
 rewind/render.py + cli.py  Typer commands, Rich output
```

The Node side only writes facts. All interpretation happens in Python.

## Why NDJSON first, then SQLite

async_hooks callbacks must be synchronous and must not create async work, or the recorder ends up recording itself. A synchronous `fs.writeSync` of text lines is the safest thing to do there (spikes E4). This design also avoids native Node modules (no compiler on Windows), keeps partial runs readable after a hard kill, and leaves the raw stream on disk as ground truth. Python ingests each run in a single transaction.

## Recorder

| concern | mechanism |
|---|---|
| async causality | `init(aid, type, triggerAsyncId)` gives the tree. `before`/`after`/`promiseResolve` are recorded too. Nothing is dropped: views filter, storage never does. |
| where work was scheduled | creation stack from V8 CallSites (no string parsing), with node internals and the recorder removed. Promise stacks are on by default. |
| what runs | callback name for timers and immediates (`resource._onTimeout.name`) |
| which callback emitted an event | every event carries `eid = executionAsyncId()` |
| requests | patched `http.Server.prototype.emit('request')`. Each request gets its own `AsyncResource('REWIND_REQUEST')`, and the handler plus all `req`/`res` event callbacks run in its scope. Node's own `HTTPINCOMINGMESSAGE` is per connection, so without this, keep-alive requests are attributed to each other. Found while building the demo; there's a regression test. |
| errors | `uncaughtExceptionMonitor` only, which observes without changing crash semantics. For sync throws the context is the throwing callback. For rejections it is the rejected promise, whose ancestry leads back to the caller (spikes E2/E3). `console.error(err)` produces `error.logged`. |
| re-entrancy | one `inHook` guard wraps every recorder entry point |
| durability | flush every 256 events, immediately on error events, on `exit`, and on SIGINT/SIGTERM (re-raised only if the app has no handler of its own) |
| `--watch` | `instrument.js` (acorn + magic-string, loaded lazily) wraps writes as `__rw.w(name, path, op, loc, before, (expr), reread)`. It preserves the expression's value and its line, reads `before` only when re-evaluating is side-effect free, and skips shadowed names. |

## Event schema

| field | |
|---|---|
| `seq` | total order within the run |
| `t` | µs since recorder start |
| `kind` | `run.start` `run.end` `run.signal` `async.init` `async.before` `async.after` `async.resolve` `log` `http.in` `http.out` `error.uncaught` `error.logged` `mutation` `mutation.capped` `instrument` |
| `eid` | executionAsyncId at emission |
| `aid`, `tid` | resource id and trigger id (async events; `http.in` anchors) |
| `type`, `name` | resource type and callback name; log text, request line, error message, variable name |
| `data` | kind-specific JSON (`origin`, `error`, `raw` stack, `req`, `status`, `path`/`op`/`loc`/`before`/`after`, …) |
| `stack` | `[{fn, file, line, col}]` user-visible frames, max 8, files relative to the cwd |

SQLite: `runs` holds one row per run (status `ok` / `failed` / `crashed`, counts, raw path). `events` mirrors the fields above, keyed by `(run_id, seq)` and indexed on `aid` and `kind`.

## Analysis

`analysis.Run` builds the indexes once: `inits`, `children`, `fired`, `emitted` (story events per eid), `requests` / `anchors`, plus cached `story`, `errors` and `effectful`.

- **Attribution.** `request_of(aid)` walks `tid` links up to the first request anchor (derived).
- **Collapsing.** Hops with no user frame, such as the open/stat/read/close chain inside `fs.readFile`, are folded in views and kept in storage. `tree` prunes branches without story events and reports how many it hid.
- **`investigate(run, event)`.** This is `why`. It reports:
  - throw site and running callback, with its creation site (observed)
  - the collapsed causal chain to the owning request, and other requests' observable activity while it was in flight (derived)
  - for each watched variable: whether the failing source line reads it (derived), the last write (observed) and who made it (derived), and the own-write → foreign-overwrite → target ordering (derived)
  - a race explanation (inferred, citing those seqs)

  Without `--watch`, it can only point out module-level names on the failing line and recommend `--watch`. It never claims a write.
- **`diff(a, b)`.**
  - Tokens are request-tagged steps with ids and times removed: effectful callback firings (`site` and description), requests, logs, writes (location and op, not values), errors, and exit.
  - Callbacks with no observable effect are excluded, because Node's HTTP date-cache timer fires nondeterministically.
  - The token streams are aligned with `difflib.SequenceMatcher`, and the report covers the first divergence, whether the divergent step merely moved, and the reordered / only-A / only-B counts.

## Testing

`pytest` runs real `node` processes:
- recorder fixtures (`tests/test_recorder.py`)
- ingest and lookup (`test_store.py`)
- analysis on recordings of the actual demo (`test_analysis.py`), including invariants that every inference cites evidence, every evidence seq exists, and every observed "write" claim is backed by a mutation event
- the CLI end to end (`test_cli.py`)
- presentation: landing screen, help, colour handling, narrow terminals, palette contrast, console-font fallback (`test_render.py`)

## Terminal presentation

`render.py` owns all output; `cli.py` only passes it data. The identity ("Ultraviolet"):
- **Colour.** One violet accent for derived facts, ids and the `◂◂` mark; text in the terminal's own colour; one mid grey for secondary detail; red only for errors. Every colour is a mid-tone with near-equal contrast on black and white (checked by a test), so one palette serves dark and light terminals.
- **Certainty is brightness.** Observed findings are bold, derived ones carry the violet `◆`, inferred ones are dim italic.
- **Wordmark.** `rewind` opens with REWIND in half-block letters (3 rows, only `█ ▀ ▄`, generated from bitmaps in `render.LETTERS`), rows stepping from light to deep violet; the version, the ruler's `◆` and the tagline share one right edge. 45–47 columns get a tighter letter spacing; below 45 the one-line `◂◂ r e w i n d` mark is used.
- **Structure without boxes.** Each view opens with `◂◂ command  subject · meta`; sections are labelled dotted rules. With colour off (`NO_COLOR`, pipes) glyphs and indentation carry the structure.
- **Help and errors.** `rewind` / `rewind --help` render a landing screen (custom `TyperGroup.format_help`); per-command help uses `TyperCommand.format_help`; usage errors replace `typer.rich_utils.rich_format_error`. The landing screen reads the database only if it already exists.
- **Classic Windows consoles** can't fall back to another font. When the console's actual font lacks Rewind's glyphs, output is written through a translator that swaps in one-cell stand-ins (`• ♦ × =` …) present in Lucida Console, Consolas and Cascadia Mono. Pipes, files, Windows Terminal and VS Code are untouched.
