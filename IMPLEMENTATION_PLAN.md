# Rewind Demo Website: Implementation Plan

> **Single source of truth** for building the Rewind demo website. It is self-contained: a fresh session should need nothing else.
> Status: **approved for review, not started.** M0 begins only on explicit approval.
> Last verified against `../rewind` at commit `388fe45` (2026-11-23).

---

## 0. Repositories and ground rules

| | path | Git | role |
|---|---|---|---|
| **Website** | `rewind-demo-website/` (this repo) | root = this folder<br>`origin` = `https://github.com/dangerousEnigma1827/rewind_demo_website.git` (note the underscores; the local folder uses hyphens)<br>`main` = `b04c0e0 initial commit` | All website work happens here. |
| **Rewind CLI** | `../rewind/` | root = that folder<br>`origin` = `https://github.com/dangerousEnigma1827/Rewind.git`<br>`main` = `388fe45` | **Read-only.** It is a source of truth and of captures, and is never modified. |
| (unrelated) | `../rewind_test/` | another clone of `Rewind.git` | not used |

- **Existing contents of this repo.** `.claude/skills/` holds 29 UI skills, and there is `skills-lock.json`. The lock file's sha256 at `b04c0e0` is `af46eb6371068bfe715ac0be1e997b2299d2aa826d8abecc87f6bbc0153912e5`. Both are **kept unchanged**.
- **Relationship between the repos.** It is one-way. The website's capture script *reads* a clean Rewind checkout. Rewind gets no website files, no submodule and no dependency. The website build uses only committed artifacts.
- **Commits.** Make logical commits on a feature branch, never directly on `main`. Commit messages carry **no** Co-Authored-By or AI trailer. Nothing is pushed unless the owner asks.
- **Check after every milestone.**
  - `git -C ../rewind rev-parse --short HEAD` is `388fe45`, or the pinned capture sha.
  - `git -C ../rewind status --porcelain` is empty.
  - `git diff --stat b04c0e0 -- .claude skills-lock.json` is empty.
  - The `skills-lock.json` sha256 is unchanged.

---

## 1. Project overview

**Purpose.** Let people **experience a real Rewind investigation**, rather than read about one. The site walks through the Phantom Discount bug using Rewind's real terminal output and real recorded events. Every visual is linked back to the evidence it came from.

**Audience.**
- Hackathon judges, who have a few minutes and need to grasp the idea, the proof and the credibility.
- Technical developers, who need enough depth to trust the mechanism and try it.

**Goals.**
1. Within one screen, the site says what Rewind does and shows genuine CLI output.
2. The Phantom Discount investigation is the centrepiece: interactive, evidence-linked, and the most prominent part of the page.
3. Every claim is accurate and traceable. Observed, derived, inferred and authored content are visibly different.
4. It preserves Rewind's own "Ultraviolet" terminal identity. It is an interactive technical demonstration, not a generic SaaS landing page.

**Non-goals.** The site is not a docs site for the whole codebase. It doesn't record in the browser, has no backend, and doesn't fake video, dashboards or decorative motion.

---

## 2. Product and technical context: what Rewind actually is

Everything here was verified in `../rewind` at `388fe45`: the code was read, `pytest` gave **54 passed**, and the demo was re-run on Node v24.22.1. File references are relative to `../rewind`.

### 2.1 What it is
A causal debugger for Node.js. You record a run once, then query it after the fact.
- The CLI's own tagline (`rewind/render.py:TAGLINE`) is **"Postmortem debugging for asynchronous Node.js."**
- The README and `pyproject.toml` say "Causal time-travel debugging for Node.js". **The website must not suggest replay or stepping backwards.** The README itself says Rewind "cannot step backwards".
- Version `0.1.0`. Requires Python ≥ 3.12 and Node ≥ 20 (only Node 24 has been run).

### 2.2 Architecture (`docs/ARCHITECTURE.md`)
```
node process: app code + recorder/recorder.js (node --require)
  async_hooks · console · http.Server · uncaughtExceptionMonitor · [--watch AST rewrite]
        │  NDJSON, one event per line → .rewind/runs/<id>.ndjson (raw, kept)
        ▼ on exit
rewind/store.py     ingest → .rewind/rewind.db (SQLite, WAL)
rewind/analysis.py  pure functions: Run index, build_tree, investigate, diff
rewind/render.py + cli.py   Typer commands, Rich output
```
"The Node side only writes facts. All interpretation happens in Python."

### 2.3 Recorder (`recorder/recorder.js`, `recorder/instrument.js`)
| concern | mechanism |
|---|---|
| Async causality | `async_hooks` init/before/after/promiseResolve. Every event carries `eid = executionAsyncId()`. `init` records `aid`, `tid` (triggerAsyncId) and type. |
| Where work was scheduled | Creation stacks from V8 CallSites (max 8 user frames). Promise stacks are on by default (`REWIND_PROMISE_STACKS=0` turns them off). Timer and immediate callback names come from `_onTimeout`/`_onImmediate`. |
| Request attribution | Patches `http.Server.prototype.emit('request')`. Each request gets its own `AsyncResource('REWIND_REQUEST')` anchor, and its handler and req/res event callbacks run in that scope. This is needed because Node's `HTTPINCOMINGMESSAGE` is per *connection*, which breaks under keep-alive (ENGINEERING_LOG B12, test `test_keepalive_requests_get_distinct_anchors`). |
| Errors | `uncaughtExceptionMonitor` only: it observes without changing crash semantics or exit codes. Covers sync throws and unhandled rejections, including after `await`. `console.error(err)` gives `error.logged`. |
| Logs | `console.log/info/warn/error/debug` produce `log` events. |
| `--watch VAR` (opt-in) | An acorn + magic-string rewrite of CommonJS files at load time. It records every **syntactic** write to a watched top-level binding with `path`, `op`, `file:line:col`, writer `eid`, and JSON previews of before/after (≤ 200 chars). Line numbers are preserved and shadowed locals are skipped. The AST packages load only with `--watch`, and need `npm install --prefix recorder`. |
| Durability | Flushes every 256 events, flushes error events immediately, and flushes on exit and SIGINT/SIGTERM. A SIGKILL run is marked `crashed`, and a torn last line is skipped. |
| Re-entrancy | One `inHook` guard. The recorder never records itself. |

Event kinds: `run.start` `run.end` `run.signal` `async.init` `async.before` `async.after` `async.resolve` `log` `http.in` `http.out` `error.uncaught` `error.logged` `mutation` `mutation.capped` `instrument`.
**There is no read event. Rewind never records variable reads.**

### 2.4 CLI commands (`rewind/cli.py`)
`RUN` is one of: a label, an id prefix, `last` (the default), or `-N` (the Nth newest).

| command | behaviour |
|---|---|
| `rewind` / `--help` | Landing screen (REWIND wordmark, runs, commands, evidence key, next step). It never creates `.rewind`. |
| `rewind record [-l LABEL] [-w VAR,..] -- node app.js [args]` | Runs the program with the recorder preloaded, ingests it, prints a summary, and passes the exit code through. `rewind record app.js` also works. |
| `rewind runs` | Lists runs, newest first. |
| `rewind timeline [RUN] [-r N] [-k kinds] [-c] [--raw]` | The story in seq order. `-r` shows one request, `-k` filters by kind, `-c` adds user callback firings, `--raw` shows everything. |
| `rewind tree [RUN] [-r N] [--full]` | The async causality tree. Quiet branches are pruned and frameless hops folded, and it reports how much it hid. |
| `rewind why [RUN] [-e N] [-s SEQ] [--evidence]` | Investigates error N (default 1), or any event by seq. `--evidence` shows the seqs backing each finding. |
| `rewind diff A B [--all] [--evidence]` | Aligns two runs (`difflib.SequenceMatcher` over normalised tokens) and reports the first divergence. |

Config: `REWIND_HOME` (default `./.rewind`), `REWIND_PROMISE_STACKS`, `REWIND_MUT_CAP` (default 10 000), `NO_COLOR`.

### 2.5 Analysis and evidence levels (`rewind/analysis.py`)
| level | glyph | meaning |
|---|---|---|
| observed | ● | a recorded event, reported as is |
| derived | ◆ | computed deterministically from recorded events (ancestry, ordering, attribution) |
| inferred | ? | a heuristic explanation, always citing observed or derived evidence |

- `Run.request_of(aid)` walks the `tid` links to the first request anchor. The result is **derived**.
- `investigate()` (the `why` command) reports these, in order:
  1. the throw site and the running callback with its creation site (observed)
  2. the collapsed causal chain to the request (derived)
  3. other requests active in flight (derived)
  4. for a watched variable:
     - whether the failing source line names it (derived, by regex over the source line; **not a recorded read**)
     - the last write (observed) and its writer (derived)
     - the own-write → foreign-overwrite ordering (derived)
  5. **one** templated inference, `RACE_INFERENCE` (inferred)
- For a non-error event (`--seq`), the race is marked **"(Reads are not recorded, so this is not proven.)"**
- Without `--watch`, it never claims a write. It only points at module-level names on the failing line (a column-0 regex heuristic, marked `shortcut:` in the code) and recommends `--watch`.
- `diff()` tokens strip ids and times and keep write *location and op*, **not values**. Its inference says the first divergence is "the place to start, not necessarily the cause".
- The test `tests/test_analysis.py:assert_evidence_integrity` enforces three things:
  - every inference cites evidence;
  - every cited seq exists;
  - every observed "write" is backed by a `mutation` event.

### 2.6 Verified strengths and differentiators
1. It answers **which request** an error belonged to. A stack trace cannot.
2. **Honesty is built into the engine:** graded evidence, refusal to claim unseen writes, and "not proven" wording.
3. It finds a **silent** bug (the A-101 overcharge) that never threw.
4. `diff` explains "works sequentially, fails concurrently": the code path is the same and the interleaving differs.
5. **Design choices were tested before building** (`spikes/RESULTS.md`): experiments E0–E7, 39/39 checks, measured overhead, and four mutation-tracking approaches compared.
6. **The recorder needs no code changes and no dependencies** (`--require`). Only `--watch` needs npm packages.

### 2.7 Limitations and unsupported scenarios (README, `docs/handover/FEATURES_AND_LIMITATIONS.md`)
**`--watch` misses:**
- writes through aliases;
- destructuring targets;
- `node_modules`;
- ESM files;
- writes made inside functions the value is passed to;
- same-named locals (skipped on purpose);
- reads (never recorded).

**Not instrumented:**
- `https`, `http2`, and outgoing HTTP clients as anchors;
- worker threads and child processes.

**Recording limits:**
- Rejections are captured only in `--unhandled-rejections=throw` mode.
- SIGKILL can lose up to 256 trailing non-error events.

**Not a full debugger:**
- No per-call tracing.
- No arbitrary value capture.
- No stepping back, no breakpoints, no web UI.

**Overhead** (E6, a 300-request HTTP benchmark):
- 1.1× with promise stacks off; 1.9× with promise stacks on (the default).
- About 330 events per request.

**Not verified:**
- macOS.
- Node 20 and 22.
- Python 3.13 and 3.14.
- `REWIND_PROMISE_STACKS=0`.

### 2.8 Known repo inconsistencies (resolved here; do not reproduce them)
- `spikes/RESULTS.md` E7 calls "request #3 overwrote `currentCart`" **OBSERVED**. The implementation labels the writer attribution **DERIVED**. **Follow the implementation.**
- `docs/handover/PROJECT_STATUS.md` says `feat/cli-visual-redesign` is "not merged". In fact it was merged as PR #1 (`388fe45`). That doc is stale.
- Output glitches are **reproduced, never "cleaned up"**:
  - the finding text "`currentCart` = at demo/checkout.js:12:5" (empty path);
  - the diff token "`currentCart = @`".
- Tagline: "time-travel" (README) vs "Postmortem debugging…" (CLI). The site follows the CLI wording and avoids replay claims.
- `demo/fix.patch` sits in the dev working copy with CRLF endings, while `checkout.js` is LF (`git ls-files --eol`). Because of that, `git apply` failed there and only worked after normalising line endings. M7 reports a fresh clone works. **Re-verify in M6**, and publish whichever command works.

---

## 3. The Phantom Discount scenario (`../rewind/demo/`)

### 3.1 The application
- `checkout.js` is a tiny order service. `POST /order` runs this chain:
  1. `loadCart`: `fs.readFile` of `prices.json`, then sets the cart.
  2. `chargePayment`: a `setTimeout` named `paymentConfirmed`, standing in for gateway latency.
  3. `applyDiscount`: sums the cart prices, 10% off with a coupon.
  4. It logs `order X: charged $N`, then responds.
- **The bug.** `let currentCart = null` sits at module level, line 6: one cart shared by every request in flight.
  - Line 12 (`loadCart`) writes it.
  - Line 23 (`applyDiscount`) reads it, **after** the payment timer.
- `traffic.js` sends a `GET /health` warm-up, then three orders. With `--sequential`, each order waits for the previous one.
- `fix.patch` passes the cart through the callback, one per request.

### 3.2 Orders, request numbering and totals
**Request numbering:**
- **#1 = `GET /health`** (the warm-up, 404)
- **#2 = A-101**
- **#3 = B-202**
- **#4 = C-303**

| order | items (prices, `prices.json`) | sent at | payment | expected | concurrent run | fixed run |
|---|---|---|---|---|---|---|
| A-101 (#2) | kbd-01 89 + mouse-02 39 | 0 ms | 80 ms | **$128** | **$161**, silently wrong | $128 |
| B-202 (#3) | dock-04 149 + cable-03 12 + mat-05 25 | 40 ms | 150 ms | **$186** | **TypeError crash** | $186 |
| C-303 (#4) | cable-03 12, coupon SAVE10 | 100 ms | 10 ms | **$11** (10.8 rounded) | $11 | $11 |

- **Sequential run:** $128 / $186 / $11, exit 0.
- **Fixed run:** the same totals, exit 0, and `why` reports "no errors recorded".
  - In the verified run, the log order was A-101, C-303, B-202.

### 3.3 Why each order behaves as it does
- **A-101 is silently overcharged.**
  - #3 writes B-202's cart to `currentCart` before #2's 80 ms payment timer fires.
  - #2's `applyDiscount` then sums its two items from B-202's cart: 149 + 12 = **$161**.
  - There's no error, just a wrong log line.
- **B-202 crashes.**
  - By the time #3's 150 ms timer fires, #4 has overwritten the cart with C-303's one-item cart.
  - `currentCart.items[1]` is undefined, so it throws `TypeError: Cannot read properties of undefined (reading 'price')` at `checkout.js:23`.
- **C-303 succeeds.**
  - Its 10 ms payment completes before anyone overwrites its cart.

### 3.4 Plain Node output (what a developer normally sees)
```
order A-101: charged $161
order C-303: charged $11
…/demo/checkout.js:23
TypeError: Cannot read properties of undefined (reading 'price')
    at applyDiscount (…/demo/checkout.js:23:78)
    at …/demo/checkout.js:34:23
    at Timeout.paymentConfirmed [as _onTimeout] (…/demo/checkout.js:18:44)
    at listOnTimeout (node:internal/timers:685:17)
```
It doesn't say which order failed. It doesn't name the request, `loadCart`, or who changed the cart. Nothing flags the $161.

### 3.5 Verified timeline (one recorded run, `rewind timeline bad`: 16 of 432 events shown)
> **The seq numbers and milliseconds below come from one reference run (`2272c8fa`). They change between runs** (in another run, the #4 overwrite was seq 386 and the crash seq 445). The site always shows the values of *its own captured run*, never these.

| seq | ms | req | event |
|---|---|---|---|
| 43 | 102.4 | #1 | → GET /health |
| 59 | 103.8 | #1 | ← 404 GET /health 1.5ms |
| 138 | 107.3 | #2 | → POST /order |
| 177 | 108.6 | #2 | ✎ currentCart = null → {"order":"A-101",…} `checkout.js:12:5` |
| 215 | 160.1 | #3 | → POST /order |
| 254 | 162.6 | #3 | ✎ currentCart = {A-101…} → {"order":"B-202",…} |
| 258 | 201.0 | #2 | » order A-101: charged $161 |
| 270 | 202.1 | #2 | ← 200 POST /order 94.9ms |
| 332 | 217.4 | #4 | → POST /order |
| 371 | 218.0 | #4 | ✎ currentCart = {B-202…} → {"order":"C-303",…} |
| 375 | 232.4 | #4 | » order C-303: charged $11 |
| 387 | 233.0 | #4 | ← 200 POST /order 15.6ms |
| 430 | 325.9 | #3 | ✖ TypeError … `checkout.js:23` |
| 431 | 326.3 | ·· | ◉ exit 1 |

**What stays the same across runs:**
- the request numbering;
- the ordering of these events;
- the totals;
- the findings.

**Causal chain of the crash (◆ derived):**

```
request #3 POST /order ← FSREQCALLBACK from loadCart (checkout.js:9) ← Timeout paymentConfirmed from chargePayment (checkout.js:18) → ✖ checkout.js:23
```

- `fs.readFile`'s internal hops are folded.
- The tree hid "100 quiet async resources".
- In the tree, #1, #2 and #4 shared one keep-alive `HTTPINCOMINGMESSAGE` and #3 had another. **This was seen in one run and should not be presented as guaranteed.**

### 3.6 The investigation sequence (the website's 8 steps)
1. **Plain `node demo/traffic.js`.** The crash, and the unhelpful trace from §3.4.
2. **`rewind record -l bad -w currentCart -- node demo/traffic.js`.** Same program, same crash, now recorded. Summary seen: `432 events · 1 error · exit 1 · failed`.
3. **`rewind why bad --evidence`.** The findings:
   - ● thrown in applyDiscount at demo/checkout.js:23
   - ● ran inside the callback of Timeout paymentConfirmed from chargePayment, created at demo/checkout.js:18
   - ◆ causal chain …
   - ◆ belongs to request #3 POST /order
   - ◆ request #4 was active while #3 was in flight (arrived, logged, responded, wrote state)
   - ◆ the failing line reads watched variable `currentCart`
   - ● last write to `currentCart` before this point … new value {"order":"C-303",…}
   - ◆ that write was made by request #4 POST /order
   - ◆ #3 set `currentCart` itself (seq a); request #4 overwrote it (seq b) before this point (seq c)
   - ? likely root cause: a race on shared module-level state … Fix: keep this state per request
4. **`rewind timeline bad`.** The interleaving. It ties the $161 log line to request #2.
5. **`rewind why bad --seq <A-101 log seq>`.** It derives #3's overwrite before #2's log. Its inference ends with "(Reads are not recorded, so this is not proven.)"
6. **Without `--watch`** (`record -l nowatch`, then `why nowatch`):
   - ◆ "the failing line uses module-level binding(s) `currentCart`, shared by every request"
   - ? "shared state suspected, but writes were not recorded. Re-record with `--watch currentCart`…"

   No write is claimed. On the site this step is a toggle between watch on and watch off.
7. **`record -l good -w currentCart -- node demo/traffic.js --sequential`, then `rewind diff good bad --evidence`.** The findings:
   - "14 of 21 (A) / 20 (B) normalised steps line up"
   - "identical up to and including: #2 ✎ currentCart = @ demo/checkout.js:12:5"
   - next, A runs #2's paymentConfirmed; next, B does `#3 http.in`
   - "that step also happens in A, but 3 step(s) later: the interleaving changed, not the code path"
   - ? "…the place to start, not necessarily the cause"

   Without `-w` on *both* runs, writes are left out (ENGINEERING_LOG B5/B14).
8. **The fix.** Apply `fix.patch`, re-record, and `why` reports no errors. Totals are $128 / $186 / $11.

### 3.7 What proves the diagnosis
- **Observed:**
  - the three `mutation` events at `checkout.js:12:5`, with before/after values;
  - the error event and its stack.
- **Derived:**
  - each write's request (eid → tid ancestry → anchor);
  - the ordering own-write < foreign-write < error. This is asserted in `test_why_with_watch_proves_the_overwrite`.
- **Inferred, not observed:** that #3 *read* #4's value. Reads are not recorded.

---

## 4. Website structure

### 4.1 Page order (approved)
| # | section (anchor) | content and purpose |
|---|---|---|
| 1 | **Hero** (`#top`) | REWIND wordmark (from `render.LETTERS`). Headline "Record a Node.js run once. Then ask *why*." *(authored copy)*. A one-line subtitle. A **static, real excerpt of `why bad`** showing five findings with ● ◆ ?. Two actions: **"Investigate the bug"** (to §3) and **"GitHub ↗"**. Up to three fact tiles, each **sourced from the capture manifest**: e.g. "0 source changes: `--require` preload", "<event_count> events → <story_count>-line story", "<pytest> tests · real node processes". |
| 2 | **The Phantom Discount** (`#scenario`) | Orders and expected-totals table. `checkout.js` with lines 6 / 12 / 23 marked "shared" / "write" / "use". Two victims: the #3 crash and the #2 silent overcharge. The real plain-Node trace, with margin notes on what it can't tell you. (This absorbs a separate "problem" section and the "traditional vs Rewind" idea.) |
| 3 | **Investigation** (`#investigate`) | **The centrepiece**: the dominant section, full content width, the only interactive island. The 8 steps of §3.6, with a linked terminal pane, run view and event detail (§4.3). |
| 4 | **How it works** (`#how`) | The pipeline diagram; a request-attribution explainer (causal chain plus the keep-alive note); a mutation-tracking before/after of line 12 (from a real `instrument()` call); the `tree bad -r 3` capture. |
| 5 | **Built on evidence** (`#evidence`) | The E0–E7 table (question → verdict → number). The E7 four-approach comparison. The B12 and B13 "found and fixed" notes. The test count. Plain text. |
| 6 | **Limits** (`#limits`) | "Captures" / "does not capture" in two columns, plus untested platforms and overhead with its workload. Shown in full, neutral tone. |
| 7 | **Get started** (`#start`) | Copyable install commands, then the tour commands. These are **only** commands verified by the M6 fresh-clone run, including `npm install --prefix recorder` for `--watch`. Links to the repo, `docs/ARCHITECTURE.md` and `spikes/RESULTS.md`. |
| — | **Footer** | Wordmark, links, and the provenance line: "Captured from rewind@<sha>, runs <ids>, <date>". |

**Nav:** sticky, with Scenario · Investigate · How it works · Evidence · Limits · Get started · GitHub ↗. Anchors use `scroll-margin-top`.

### 4.2 Provenance labelling (site-wide)
| class | mark | meaning | examples |
|---|---|---|---|
| Observed | ● | a recorded event, as recorded | http.in/out, log, error, mutation, their seq and time |
| Derived | ◆ | computed deterministically from recorded events | request attribution, causal chain, diff alignment (Rewind); cart-holder segments (**derived (site)**) |
| Inferred | ? | Rewind's own heuristic conclusion | the race explanation, "not proven", "suspected" |
| Authored | ◇ *explanatory* | written or drawn by us | diagrams, prose, expected-total arithmetic, diff connectors |

**Rules:**
- Each visualization has one short provenance line naming its run id and the classes it contains.
- Rewind's ● ◆ ? are never re-labelled.
- Site-computed values are never presented as Rewind output.
- **Reads are never drawn as events.** A moment of use is shown as the observed log or crash event, labelled "reads are not recorded".

### 4.3 The Investigation (interactions)
- **Stepper.** 8 steps. Each has a title, one sentence, and the real command with a copy button.
  - Prev and Next buttons. Arrow keys work (tablist pattern).
  - **No autoplay.**
  - The URL reflects state: `?step=4&seq=371&request=3&watch=off#investigate` (via `history.replaceState`), and is restored on load.
- **Terminal pane.** The step's real capture. Every `seq N` (timeline seq column, evidence column) is a button hotspot.
- **Run view** (desktop and tablet):
  - Swimlanes: 4 labelled lanes on a ms axis, with span bars `→` … `←`/`✖` and markers ✎ » ✖.
  - Below them, the **`currentCart` band**: the holder between consecutive writes, coloured by writer request, with dashed "used here" ticks at the A-101 log, the C-303 log and the crash, labelled "log/crash time; reads are not recorded".
- **Evidence linking (the main interaction):**
  - Hovering or focusing a seq highlights its marker and its terminal row.
  - Click pins it, and `EventDetail` shows the event's real fields: kind, request, ms, location, before→after.
  - Hovering a finding highlights every seq it cites.
  - Clicking a marker pins it and scrolls the terminal row into view *inside* the pane.
  - Esc unpins.
  - A single `aria-live="polite"` region announces the pinned event.
- **Default focus per step** comes from the data:
  - timeline: all lanes
  - `why`: lane #3 and the #4 write
  - `why --seq`: lane #2 and the #3 write
  - no-watch: lane #3 with no writes
  - diff: the DiffView
  - fix: the fixed run's totals in ok-green
- **Step 6:** an `aria-pressed` toggle, `--watch currentCart` on/off, swapping the two real `why` captures.
- **Step 7 (`DiffView`, the only implementation):**
  - Two aligned token columns, with the shared prefix collapsed and a `▼ first divergence` rule.
  - Connectors join moved steps. These are an *explanatory aid*: identical token text.
  - A "terminal view" tab shows the captured `diff` output.
- **Step 8:** the real `fix.patch` hunks, and an expected-vs-charged table. Expected is computed from `prices.json` and labelled authored. Charged is observed from the logs.
- **Without JavaScript:** an ordered list of the 8 steps, each with its static terminal output.

### 4.4 Visualizations and their evidence
| viz | form | data | provenance |
|---|---|---|---|
| Swimlanes | lanes, span bars, glyph markers | `bad` story events | events and times ●; lane membership ◆ |
| Request inspector (phone) | overview strip plus one request's event list | same | same |
| Cart band | segmented bar (desktop) / holder list (phone) | `bad` mutations | writes ●; segments ◆ (site); ticks = ● log/crash times |
| `why` findings | captured terminal lines with hotspots | captures + findings JSON | Rewind's own levels |
| Diff alignment | DiffView | diff tokens and opcodes | ◆ (Rewind); connectors ◇ |
| Causal chain | 4-node SVG | `investigate(bad)` chain | ◆ (Rewind), drawn ◇ |
| Pipeline | 5 boxes with file chips | repo structure | ◇ authored; paths checked at the sha |
| Expected vs charged | table | `prices.json` + logs | expected ◇ computed; charged ● |

---

## 5. Visual design system

### 5.1 Identity
Carry over the CLI's **"Ultraviolet"** identity (`render.py`, ARCHITECTURE "Terminal presentation"):
- one violet accent;
- **certainty is shown by brightness** (observed bold; derived violet ◆; inferred dim italic ?);
- red only for errors;
- the `◂◂` mark;
- **structure without boxes**: labelled dotted rules like `findings ┈┈┈┈`. Each terminal block is headed by its real `◂◂ command  subject · meta` line.

### 5.2 Colour
**Primitive tokens = `render.PALETTE`, exactly:**

| token | hex | use |
|---|---|---|
| uv / uv.hi / uv.lo | `#7F5AF0` / `#8D6CFF` / `#6A48D8` | derived, accent, ids, links, wordmark |
| mute | `#7E7E8C` | secondary, inferred |
| err | `#E5484D` | errors only |
| ok | `#23905C` | good / fixed runs, the + side of the diff |
| write | `#A8741F` | ✎ mutations, the cart band |
| r1–r4 | `#2C8C99` `#C0567A` `#7D8A2E` `#5A7FC0` | request lanes **#1–#4** (mapping verified in `render.req_tag`) |

- **Surfaces:** `#FAFAF9` (light), `#101014` (dark). The terminal panel is one small step off the background.
- **Marks and glyphs** use the CLI hex values unchanged (all ≥ 3:1 on both surfaces).
- **Ink steps for small coloured text** (approved). Measured WCAG contrast:
  - light: uv 4.35, mute 3.83, err/ok/write/r* 3.6–4.1; uv.lo 5.69
  - dark: r2 4.39, uv.lo 3.19; uv.hi 5.17

  So coloured *text* uses a per-theme **ink** step: same hue, OKLCH lightness shifted to ≥ 4.5:1, generated by a script and checked by a test. Violet text uses `uv.lo` in light and `uv.hi` in dark.
- **dataviz validator** on r1–r4 against both surfaces:
  - Lightness, normal-vision floor (ΔE 21.4) and contrast: PASS.
  - Chroma: **FAIL** for r1.
  - CVD: **WARN**, r2↔r1 ΔE 6.5 (deutan).
  - **Accepted (approved)**, on condition that lanes never depend on colour alone. The conditions:
    - text labels (`#1 GET /health` …);
    - a distinct glyph per marker;
    - lane position and rules;
    - labelled buttons on mobile;
    - lane #1 drawn recessive;
    - greyscale and deuteranopia checks in M3.
- **Never Trace's orange.** Never one hue collapsing semantic meaning.

### 5.3 Typography
- **IBM Plex Sans:** prose and headings. Tight headings, not italic, `text-wrap: balance`.
- **IBM Plex Mono:** terminal output, data, labels, the wordmark.
- **Captured text is never typographically "corrected".** No curly quotes, no ellipsis substitution.
- `tabular-nums` on seq and ms columns.
- `translate="no"` on code and terminal text.
- Self-hosted via `@fontsource`, `font-display: swap`, mono preloaded.
- **To verify in M0:** Plex Mono must cover every glyph used in the captures (● ◆ ✖ ✎ ▸ ◉ ⚙ ◂ ┈ ┃ ◌ → ← » and box drawing). If it doesn't, add a `unicode-range` fallback to a 0.6 em-advance mono (e.g. JetBrains Mono) so columns stay aligned. **Never** use the CLI's glyph-substitution table.

### 5.4 Themes
- Follow the system preference only (`prefers-color-scheme`). No switcher.
- `color-scheme: light dark`, plus two `theme-color` metas.
- Dark-mode values are *selected and validated*, not inverted.

### 5.5 Layout and responsive behaviour
- One column, `max-width` about 1200 px, 16 px phone gutters, equal edges, one idea per screen.
- **No horizontal page scroll at 320 px.**
- **Terminal capture width per container** (container queries):

| container width | capture |
|---|---|
| ≥ 960 px | 110 cols |
| 640–959 px | 72 cols |
| < 640 px | 46 cols |

  Only the active variant is displayed (`display:none` on the others). Below 360 px the terminal block scrolls horizontally *inside itself*.
- **Investigation by width:**

  **Desktop (≥ 960 px)**
  - The run view sits above the terminal and is **sticky under the nav inside the section**. This is not scroll-jacking.
  - EventDetail sits beside the swimlanes.

  **Tablet (640–959 px)**
  - Full-height lanes with labels, and a compressed ms axis.
  - Not sticky.
  - EventDetail appears inline under the terminal line.

  **Phone (< 640 px)**
  - The swimlanes are **not shrunk**. They are replaced by a **request inspector**:
    1. An overview strip: 4 thin labelled rows showing span, ✎ and ✖, each a ≥ 44 px button that selects its request.
    2. The selected request's events as a vertical list (seq, ms, glyph, text), with **other requests' writes to `currentCart` interleaved** and marked foreign. This mirrors Rewind's own "story of request #N + other requests' writes".
    3. Each row expands into EventDetail.
    4. The cart band becomes a holder list.
    5. Each step selects a default request (`why bad` → #3, `why --seq` → #2). Tapping a seq from another request switches the selection and says so.
    6. A bottom step bar *within the section* with ≥ 44 px Prev/Next and "Step 4 of 8 · why".
    7. Seq hotspots have ≥ 44 px hit areas and ≥ 8 px spacing.
  - The DiffView becomes one interleaved column with A/B labels.
- **Hero:** two columns at ≥ 960 px, stacked below that. The wordmark falls back below 45 columns, as in `render.py`.

### 5.6 Motion and accessibility
**Motion**
- **Allowed:**
  - highlight transitions, 150 ms;
  - step crossfade, 200 ms;
  - the run-view playhead `transform` on a step change, 250 ms ease-out.
- These are CSS transitions on `transform`/`opacity` only and are interruptible.
- **Under `prefers-reduced-motion: reduce`, all of them are instant.**
- **Forbidden:**
  - typewriter output;
  - autoplay loops;
  - fade-in on scroll;
  - parallax;
  - decorative backgrounds or grids;
  - `transition: all`.

**Accessibility**
- Semantic `<button>`/`<a>`.
- Visible `:focus-visible` rings, never covered by the sticky nav.
- A skip link and ordered headings.
- Accessible names on hotspots and markers (e.g. "seq 371, request #4 wrote currentCart, 218.0 ms").
- Colour never the only signal: glyph + word + label.
- Touch: `touch-action: manipulation`, deliberate tap-highlight styling.

### 5.7 Design references
**Reference studied:** `trace-cli.vercel.app`, from its raw JSX and CSS source. It is used to learn from, never as a template.

**Borrow:**
- one interactive artifact as the centre of the page;
- a position control that drives every panel (for Rewind, the control is **seq**);
- the section-head pattern: tag, short title, a mechanism sentence;
- code-path chips on claims;
- easy-to-find limits.

**Avoid:**
- hand-written fake terminal lines;
- typewriter animation;
- a mock GitHub/video shell and waveform;
- one-hue semantics;
- dark-only;
- bracket/crosshair decoration;
- unqualified claims like "No hallucination";
- invented stats.

### 5.8 Installed UI skills (`.claude/skills/`, 29), and how they're used
| skill | use |
|---|---|
| dataviz (global) | Form → colour by job → **run the validator** → thin marks, direct labels. The terminal timeline is the table view. Dark mode is selected. Re-run in M6. |
| web-design-guidelines | Rules applied throughout. Formal review in M6. |
| emil-design-eng, review-animations, remove-animations | Animation decision framework (almost nothing animates). Audit in M6. |
| design-system | Three token layers: primitive → semantic → component. |
| pick-ui-library | **shiki** via Astro's `<Code>` only. No motion library, no recharts, no zustand. |
| break-ui, mobile-native | A few rules: long lines, touch handling. |
| **design-taste-frontend** | **Not invoked; its gate is not armed.** It bans violet, requires entrance and hover motion, dealt palettes, photographs and effects, and installs a Stop-hook gate. That conflicts with the approved direction. Borrow only its neutral rules: equal edges, one system, no scroll fade-ins, no invented figures, 44 px targets, nothing past 320 px, headings that name things. |
| others (animate-expo, apple-design, gestures, ask-sonner, banner-design, brand, design, slides, ui-styling, ui-ux-pro-max, prototype, learn-taste, find-animation-opportunities, animate, animation-*, choreograph, improve-animations, ask-emil, write-swift) | not used |

---

## 6. Technical architecture

### 6.1 Stack
- **Astro** (static output), **Preact** islands, **TypeScript**.
- Dependencies, total:
  - `astro`
  - `@astrojs/preact`
  - `preact`
  - `@fontsource/ibm-plex-sans`
  - `@fontsource/ibm-plex-mono`
  - `vitest`
  - `playwright` (dev)
- Versions are pinned at M0 from the npm registry. **Not yet chosen; do not assume.**
- **No** global state library, chart library, motion library or CSS framework. Native SVG and CSS for every visualization.
- Static `dist/`. **Hosting is deferred to M6.** Any static host works.

### 6.2 Files
```
capture/                         Python, independent of the site (§7)
  capture.py   SCHEMA.md
src/
  layouts/Base.astro             head, fonts, color-scheme, theme-color×2, skip link, OG tags
  styles/tokens.css              primitive (CLI hex) → semantic per theme (ink, mark, surface, rule) → component
  styles/base.css                type scale, labelled dotted rules, focus ring, reduced-motion
  lib/ansi.ts                    SGR parser → spans {text, token, bold, italic, dim}; hex→token map = PALETTE
  lib/hotspots.ts                seq tokens in parsed lines (timeline seq column, evidence column)
  data/capture/                  committed artifacts (§7)
  components/                    static .astro, no JS
    Nav, Footer, Section, Wordmark, Terminal, CommandLine (+ one shared copy script), Provenance,
    Hero, Scenario, HowItWorks (PipelineDiagram, ChainDiagram, InstrumentDiff), BuiltOnEvidence, Limits, GetStarted
  islands/Investigation.tsx      THE ONLY ISLAND (client:visible)
    Stepper · TerminalPane · RunView { Swimlanes | RequestInspector } · EventDetail · DiffView
tests/                           vitest + playwright
docs/claims.md                   claims table (§9.4)
```

**Simplicity rules:**
- **One terminal renderer.** `renderSpans()` from `lib/ansi.ts` is used by both the static `Terminal` and the `TerminalPane`. The island only adds hotspot buttons.
- **`DiffView` exists once.**
- Swimlanes and RequestInspector are two views of one per-request event list, derived once.
- No abstractions beyond these.

### 6.3 State (inside the island only)
```
useReducer → { step: 1..8, pinned: seq|null, hover: seq|null, request: 1..4|null, watch: 'on'|'off', diffTab: 'aligned'|'terminal' }
derived:      focus = pinned ?? hover ?? stepDefault(step) ; highlighted = focus ∪ evidence(hoveredFinding)
```
- The step config is a static table built from the artifacts: capture id, run, view mode, and default focus computed from the data.
- The capture width is CSS, not state.
- URL sync covers `step`, `seq`, `request` and `watch`.

### 6.4 Testing strategy
- **Vitest:**
  - the ANSI parser;
  - hotspots;
  - schema validation of the artifacts;
  - integrity checks (a)–(h) in §7.4;
  - the ink-contrast test;
  - hero-excerpt-in-capture;
  - quoted numbers present in `RESULTS.md`;
  - the private-path grep.
- **Playwright:**
  - keyboard walkthrough;
  - deep-link restore;
  - reduced motion;
  - tap targets and overflow at 390 and 320 px;
  - greyscale and deuteranopia screenshots;
  - screenshots at 1440/1024/768/390/320 in both themes;
  - Chromium, Firefox and WebKit.
- `npm test` must pass on a machine with no Python.

---

## 7. Real data and capture pipeline

### 7.1 Principle
Every terminal block, swimlane, cart band, diff column and figure is generated from artifacts of **one capture session** against a **clean, pinned Rewind commit**.

- Nothing is retyped by hand. Seqs, ms, run ids and counts always agree across panes.
- The capture is **independent of the site**: it is Python, imports nothing from the site, and the site imports nothing from it.
- The contract is `capture/SCHEMA.md` plus `schema_version` in the manifest.

### 7.2 Running it
```
"<rewind>/.venv/Scripts/python" capture/capture.py --rewind <path-to-clean-rewind-checkout> --out src/data/capture
```
- It aborts if `git -C <rewind> status --porcelain` is not empty, or if `node` is missing.
- The recommended source is a fresh clone of `Rewind.git` at the pinned sha.
- It needs Rewind's venv (`pip install -e ".[dev]"`) and `npm install --prefix recorder` in that checkout.
- **To verify in M1:** whether the harness behaves the same on Linux/WSL. It has only been prototyped on Windows.

### 7.3 Steps
1. **Workdirs.** Copy `demo/` into a temp workdir. Make a second copy, normalise its line endings, and apply `fix.patch`. Set `REWIND_HOME` to a temp dir. **Nothing is written inside the Rewind checkout.**
2. **Runs.** Record with the real CLI as a subprocess:
   - `bad` (`-w currentCart`)
   - `nowatch`
   - `good` (`-w currentCart --sequential`)
   - `fixed` (patched copy, `-w currentCart`)

   Also capture plain `node demo/traffic.js` (stdout and stderr) and its exit code, plus each `record` summary.
3. **Terminal captures, in colour.**
   - On Windows, piped `rewind` output has **no ANSI** even with `FORCE_COLOR` or `TTY_COMPATIBLE`, because Rich falls back to legacy-Windows rendering.
   - The capture therefore runs each view **in-process** with Rich in truecolor mode, which reproduces Rewind's own styling exactly. This was verified with a scratch prototype: `38;2;127;90;240` = uv, bold = observed.
   - Normalise CRLF to LF.
   - Views:
     - `why bad --evidence`
     - `why bad --seq <A-101 log seq>` (the seq is looked up in the events, **never hard-coded**)
     - `why nowatch`
     - `timeline bad`
     - `timeline bad -r 3 -c`
     - `tree bad`
     - `tree bad -r 3`
     - `diff good bad --evidence`
     - `runs`
     - `why fixed`
   - Widths: **110, 72 and 46**, all from the same run ids.

   The harness:
   ```python
   c = Console(theme=render.THEME, highlight=False, force_terminal=True, legacy_windows=False,
               color_system="truecolor", width=W, file=buffer)
   render.console = c; cli.console = c
   cli.app(argv, standalone_mode=False)
   ```
4. **Structured JSON per run**, from Rewind's Python API (`store.events`, `analysis.Run`, `investigate`, `diff`, `build_tree`). Every field carries provenance:

   | data | provenance |
   |---|---|
   | story events (`seq`, `t`, `kind`, `name`, `data`) | observed |
   | request id (`request_of`) | derived |
   | requests: in/out seq and time | observed |
   | the pairing of in/out into one request | derived |
   | mutations: `loc`, before/after | observed |
   | mutation writer | derived |
   | findings (`level`, `text`, `evidence[]`) | `level` copied exactly from `Finding.level` |
   | diff tokens and opcodes | derived |
   | causal chain | derived |
   | event counts and story counts | observed |

   **No `read` event type exists.**
5. **Other real artifacts:**
   - `checkout.js`, `prices.json` and `fix.patch` text.
   - Line 12 after rewriting, produced by `node -e` calling `recorder/instrument.js:instrument(src, file, ['currentCart'])`.
   - `render.LETTERS` for the wordmark, and `render.PALETTE`.
   - The `pytest -q` summary line.
   - A copy of `spikes/RESULTS.md`.
   - The list of repo file paths, so file chips can be checked.
6. **Privacy normalisation.** Replace the absolute workdir, user-home and `REWIND_HOME` prefixes with `…/`. This affects the plain-Node trace and the `runs` header. Each replacement is listed in the manifest. **No other text is changed.**
7. **`manifest.json`.** Holds:
   - `schema_version`;
   - the Rewind commit sha;
   - node, python and rewind versions;
   - the capture date;
   - run ids, labels and event counts;
   - the widths;
   - the normalisations;
   - the pytest summary.

   The footer and the hero tiles read from it.

### 7.4 Integrity checks (Vitest, run on every build)
- (a) The ANSI parser is lossless: the stripped text equals the plain-text capture.
- (b) Every `seq N` in any capture exists in that run's events.
- (c) Each `why` capture's seqs equal `findings[].evidence`, in order.
- (d) Cart-band owners parse from mutation `after` previews (`"order":"…"`), for every one.
- (e) Every number quoted in "Built on evidence" appears verbatim in the copied `RESULTS.md`.
- (f) DiffView's equal-step count equals the "N of A/B" finding.
- (g) Run ids, labels and seq ranges in the UI data match the manifest. No seq, ms, id or count appears in authored copy except through the artifacts.
- (h) No artifact or dataset contains a `read` event. Every "used here" mark links to a `log` or `error` event and carries the "reads are not recorded" label.

Plus: hero excerpt lines exist verbatim in the capture; the ink tokens are ≥ 4.5:1; no private paths.

### 7.5 Reproducibility
- Artifacts are committed. Re-capturing is deliberate: run `npm run capture`, then review the git diff.
- A re-capture changes ids, seqs and ms but must keep the structure and findings the same. M6 checks this against a fresh clone.

---

## 8. Milestones

**Every milestone:**
- ends with the §0 untouched-check;
- is a logical commit (or a few) on a feature branch, without AI trailers;
- requires owner review before the next begins.

### Why this ordering (it replaces the first draft's order)
The first draft ran:
- M0 scaffold
- M1 capture
- M2 static sections
- M3 interactive investigation
- M4 watch toggle and diff
- M5 visualizations
- M6 audits and deploy

It was regrouped into **vertical slices**, so that each milestone can be checked on its own and the riskiest, most important part is built first:
1. **Every milestone can be verified when it ends.**
   - Evidence linking, which is M3's core, needs the swimlanes and cart band. The old order put those in M5, so M3 couldn't be checked until M5.
   - In the new order, the investigation's visuals and interactions are built and tested together.
2. **The watch toggle and the diff are investigation steps 6 and 7.** They share the island's state (`watch`, `diffTab`) and the `DiffView`. Building them as a separate milestone would split one component's state and tests across milestones.
3. **Risk first.**
   - The investigation is the centrepiece and the hardest part: hotspots, two-way linking, the sticky run view, URL state, the phone inspector. Doing it right after the data layer exposes problems while there's time to fix them.
   - The static sections are low-risk, depend only on M1, and can slot in later or run in parallel.
4. **Phones get their own milestone.** The request inspector is a different design, not a smaller layout, and needs its own touch and colour-independence checks.

**Every deliverable from the first draft is kept:**

| first-draft milestone | deliverable | now in |
|---|---|---|
| M0 scaffold | Astro + Preact + TS, fonts, tokens, base layout | **M0** |
| M1 capture | capture script, artifacts, manifest, parser, integrity checks | **M1** |
| M2 static sections | Hero, Scenario, Footer | **M4** |
| M2 static sections | How it works, Built on evidence, Limits, Get started | **M5** |
| M3 interactive investigation | Stepper, terminal hotspots, linking, URL, keyboard | **M2** (desktop/tablet) + **M3** (phone) |
| M4 watch toggle + diff | watch toggle, DiffView + terminal tab | **M2** (steps 6–7), single-column DiffView in **M3** |
| M5 visualizations | swimlanes, cart band, EventDetail | **M2**; phone request inspector and holder list in **M3** |
| M5 visualizations | pipeline diagram, causal-chain diagram, instrumented line 12, tree | **M5** |
| M6 audits + deploy | claims audit, fresh-clone checks, guideline/animation/dataviz reviews, Lighthouse, browsers, deploy | **M6** |

### Pre: repository verification. **Done (2026-11-23).**
- §0 facts verified.
- `../rewind` is at `388fe45` and clean.
- The website repo is on `main`, clean, at `b04c0e0`.

### M0: Scaffold. **Starts only on explicit approval.**
- **Objective:** an empty, correct shell of the site.
- **Deliverables:**
  - Astro + Preact + TS beside the existing `.claude/skills/`;
  - `.gitignore` (`node_modules/`, `dist/`, `.astro/`, `.taste-skill/`);
  - pinned dependencies (§6.1);
  - self-hosted fonts;
  - `tokens.css` with all three layers in both themes;
  - `Base.astro`;
  - empty sections in the §4.1 order, with the nav.
- **Depends on:** Pre.
- **Verify:**
  - `npm run build` produces a static `dist/`;
  - light and dark emulation render the right surfaces;
  - no horizontal scroll at 320 px;
  - **the glyph audit (§5.3)** passes, or the fallback is added.

### M1: Capture pipeline and data layer
- **Objective:** real artifacts and the code that reads them.
- **Deliverables:**
  - `capture/capture.py` and `SCHEMA.md` (§7);
  - the committed `src/data/capture/` and `manifest.json`;
  - `lib/ansi.ts`;
  - `lib/hotspots.ts`;
  - the ink-step generator;
  - the Vitest suite.
- **Depends on:** M0 and a clean Rewind checkout.
- **Verify:**
  - `npm run capture` succeeds;
  - (a)–(h) pass;
  - the ink contrast is ≥ 4.5:1 in both themes;
  - no private paths;
  - the dirty-checkout refusal is tested;
  - Linux/WSL behaviour of the harness is checked (§7.2).

### M2: The Investigation, desktop and tablet (centrepiece)
- **Objective:** the full interactive walkthrough at ≥ 640 px.
- **Deliverables:**
  - Stepper;
  - TerminalPane hotspots;
  - Swimlanes and the cart band;
  - EventDetail;
  - the step-6 watch toggle;
  - **DiffView** (step 7);
  - the fix (step 8);
  - URL sync;
  - keyboard support;
  - `aria-live`;
  - the no-JS fallback.
- **Depends on:** M1.
- **Verify:**
  - every hotspot resolves to an event, and every marker to a terminal row;
  - a keyboard-only walk through all 8 steps works;
  - deep links restore state;
  - reduced motion is respected;
  - the provenance line is on each visual;
  - DiffView connectors match the "3 step(s) later" finding;
  - visually the dominant section in screenshots.

### M3: The Investigation on phones
- **Objective:** usable and evidence-linked at < 640 px.
- **Deliverables:**
  - RequestInspector (overview strip and request detail);
  - inline EventDetail;
  - the cart holder list;
  - the bottom step bar;
  - the single-column DiffView.
- **Depends on:** M2.
- **Verify** (Playwright at 390 and 320 px):
  - all 8 steps by touch;
  - every seq reachable;
  - targets ≥ 44 px with ≥ 8 px spacing;
  - no page overflow;
  - **greyscale and deuteranopia renders still identify every lane and marker** (the r1 condition).

### M4: Hero, Scenario, Footer
- **Objective:** the first screen and the setup of the story.
- **Deliverables:**
  - the hero (wordmark, headline, real `why` excerpt, manifest-sourced tiles, two actions);
  - the scenario (orders table, `<Code>` with marked lines, the plain-Node trace);
  - the footer provenance line.
- **Depends on:** M1. It can run in parallel with M2/M3 if needed.
- **Verify:**
  - at 1440 and 390 px, the first screen says what Rewind does and shows real output;
  - the excerpt is verbatim in the capture (test);
  - the tiles come from the manifest.

### M5: How it works, Built on evidence, Limits, Get started
- **Objective:** depth and credibility after the demo.
- **Deliverables:**
  - the pipeline SVG with file chips (GitHub links at the captured sha);
  - ChainDiagram;
  - InstrumentDiff (from the artifact);
  - the `tree bad -r 3` capture;
  - the E0–E7 and E7-comparison tables;
  - the B12 and B13 notes;
  - the test count;
  - Limits;
  - Get started.
- **Depends on:** M1.
- **Verify:**
  - the chips resolve;
  - check (e) passes;
  - every limitation maps to a README or FEATURES_AND_LIMITATIONS line in `docs/claims.md`.

### M6: Accuracy review, audit and ship
- **Objective:** prove the site is complete and correct, then deploy.
- **Deliverables:**
  - a finished `docs/claims.md`;
  - audit reports with fixes or recorded reasons;
  - a hosting choice and a deployed URL.
- **Depends on:** M2–M5.
- **Verify:**
  1. **Claims audit (§9.4).**
  2. **Fresh-clone Rewind, in temp folders.**
     - Clone `Rewind.git` at the captured sha.
     - Follow Get started **exactly as published**, in PowerShell 5.1 and in bash (WSL).
     - Run the whole §3.6 sequence.
     - Confirm the outcomes: #3 crashes; A-101 is charged $161; fixed run gives $128/$186/$11.
     - If `git apply demo/fix.patch` fails on line endings, Get started must publish the working command.
  3. **Fresh-clone website.**
     - Clone `rewind_demo_website.git` (or the local repo if the branch isn't pushed).
     - Run `npm ci && npm run build && npm test` with no Python present.
  4. **Re-capture from the fresh clone.** Structure and findings must agree with the committed artifacts.
  5. **Reviews:**
     - web-design-guidelines;
     - review-animations;
     - the dataviz validator on the final tokens;
     - Lighthouse (a11y and perf);
     - no-JS check;
     - JS budget: the single island ≤ ~30 KB gz (a target, to be confirmed);
     - three browsers;
     - screenshots at 1440/1024/768/390/320 in both themes.
  6. The deployed URL serves the same build.

---

## 9. Implementation constraints

### 9.1 Data
- **Never fabricate** any of these:
  - CLI output;
  - seq numbers;
  - timings;
  - run ids;
  - event counts;
  - performance figures;
  - test counts.
- Every one comes from the artifacts or the manifest. The reference values in §3.5 are documentation, not site data.

### 9.2 Reads
- **Never claim that Rewind observes variable reads.**
- No read event, no "read at" marker.
- "The failing line reads X" is Rewind's derived wording, from source text. Present it as Rewind's derived finding and never as a recorded read.

### 9.3 Claims to avoid
- Replay or step-back "time travel".
- "AI" or "automatic root cause". The inference is one fixed template.
- "Proves the race".
- "Captures every call or value".
- "Any framework / any Node app". Only `http` + CommonJS are tested.
- Unqualified "low overhead".
- Seqs presented as stable.
- Request #1 presented as an order.

### 9.4 Claims table
- `docs/claims.md` gives every claim, command, limitation, architecture statement and figure a row with: claim → source (file:line / function / test / capture id / manifest field) → provenance class.
- No source means no claim.

### 9.5 Scope
- Only what this document lists.
- **Out of scope:**
  - video/waveform/fake shells;
  - an explorer for all 432 events or the `--full` tree;
  - in-browser recording or a backend;
  - a docs subsite;
  - 3D and effects;
  - unverifiable stat tiles;
  - a theme switcher;
  - per-command pages.

### 9.6 Repository boundaries
- `../rewind` is read-only.
- All website changes go in `rewind-demo-website`.
- `.claude/skills/` and `skills-lock.json` are never modified.

### 9.7 Commits
- Logical, per milestone, on a feature branch.
- No Co-Authored-By or AI trailers.
- No push without the owner's request.

---

## 10. Final acceptance criteria

**Functional**
- All 8 investigation steps work on desktop, tablet and phone.
- Evidence linking works both ways between terminal seqs and the visuals.
- The watch toggle, DiffView with its terminal tab, and the fix step work.
- Deep links restore any state.
- Without JavaScript, all content and captures are readable.

**Technical**
- Static build.
- `npm ci && npm run build && npm test` passes from a fresh clone without Python.
- Integrity checks (a)–(h) pass.
- The single island is within the JS budget.
- `../rewind` is unchanged, and so are `.claude/skills/` and `skills-lock.json`.

**Accessibility**
- Keyboard-complete, with visible focus and named controls.
- `aria-live` announcements.
- Ink text ≥ 4.5:1 and marks ≥ 3:1 in both themes.
- Colour is never the only signal (greyscale and deuteranopia checks pass).
- Reduced motion is honoured.
- Lighthouse a11y has no failures.

**Responsive**
- No horizontal page scroll from 1440 down to 320.
- The terminal width variant switches correctly.
- The phone request inspector is usable, with 44 px targets.
- Screenshots reviewed at 1440/1024/768/390/320 in both themes.

**Content accuracy**
- Every claim has a row in `docs/claims.md`.
- The terminal output is byte-identical, after ANSI stripping, to what Rewind printed.
- Provenance classes are shown on every visual.
- No read is presented as observed.
- Get started works from a fresh clone (M6, steps 2–3).
- The hero communicates Rewind and shows real output on the first screen.
- The Investigation is visibly the centrepiece.

---

## 11. Still to verify (do not assume)
| item | when |
|---|---|
| Plex Mono glyph coverage for every capture glyph | M0 |
| Dependency versions to pin | M0 |
| Capture harness behaviour on Linux/WSL | M1 |
| Rich output at 46 columns: readable, with no layout regressions | M1 (by eye) |
| Container-query support in the target browsers | M0/M6 |
| `git apply demo/fix.patch` on a fresh clone (Windows and Linux) | M6 |
| Final Rewind sha to pin (`388fe45` unless Rewind changes first) | M1 |
| JS budget figure (~30 KB gz is a target) | M2/M6 |
| Hosting provider | M6 |
| Keep-alive grouping in the tree (#1/#2/#4 on one connection) is stable across runs? If not, don't present it as a fact | M1 |
