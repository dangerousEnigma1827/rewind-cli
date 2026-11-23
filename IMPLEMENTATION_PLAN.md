# Rewind Demo Website: Implementation Plan

> **Single source of truth** for building the Rewind demo website. It is self-contained: a fresh session should need nothing else.
> Status: **M0–M6 done** (single-page site, merged to `main` as PR #1). **Redesign approved 2026-11-23** (§4, §5, §8 R1–R5) on `feat/redesign`; each R phase stops for owner review.
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

## 4. Website structure (redesign, approved 2026-11-23; replaces the single-page structure of M0–M6)

### 4.0 Why the redesign
M0–M6 built a correct single page. Its presentation did not communicate the project's quality:
1. one excessively long page, with the investigation too far down;
2. too many navigation destinations (7);
3. generic typography with a weak hierarchy between headings, body and metadata;
4. a terminal that looked like a coloured card, not a terminal window;
5. an investigation that showed too much at once;
6. a narrow, hard-to-read event detail panel;
7. inconsistent scenario, code and documentation layouts;
8. a phone experience that felt like a compressed desktop;
9. unfinished scrollbars and small interaction details;
10. accessibility handled as a final checklist instead of a design input.

The engineering (capture pipeline, investigation logic, real output, evidence, tests, browser compatibility) is preserved. The redesign changes information architecture and presentation.

### 4.1 Pages and navigation
Three Astro pages share one layout. Primary navigation: **Home · Investigation · Documentation · GitHub ↗ · Get Started** (Get Started is the one filled ultraviolet control and goes to `/docs/#install` from every route).

**Naming (refinement, 2026-11-23):** the user-facing name of the scenario is **The Wrong Order Total Bug** ("Concurrent checkout requests interfere with each other, causing one customer to be charged the wrong amount while another checkout crashes."). "Phantom Discount" remains only in internal identifiers and in Rewind's own files, which are shown verbatim.

**Footer:** the ◂◂ rewind mark, "Built for CODEFESTTHON 2026", and links to the three pages. No commit hashes, run ids or repeated links. Capture provenance lives in the artifacts and the documentation, not on Home.

#### Home (`/`), concise
- **Hero:** Rewind wordmark; a strong statement of what Rewind does; the approved headline "Record a Node.js run once. Then ask *why*."; the problem in one sentence (a stack trace says where an error surfaced, not which request caused it, who scheduled it or who changed the state). Primary action **Open the investigation**; secondary **GitHub**.
- **Investigation preview:** real, static, server-rendered: the bad run's swimlanes, the `currentCart` band, and a short real `rewind why bad` excerpt, generated from committed artifacts with the same model and rendering code. Home ships no investigation island. Clicking the preview opens the investigation at the matching stage.
- **Why Rewind is useful:** three concise points, each backed by captured evidence: which request an error belongs to; silent failures such as the Phantom Discount overcharge; observed / derived / inferred conclusions.
- **One fact:** "Zero application code changes: Rewind records the run through Node.js preloading" (`rewind/cli.py:84`). The event-count reduction (it varies per capture) and the test count (pinned to the captured commit) are not homepage statistics; the test count is shown in Documentation → Evidence.
- Concise footer with the provenance line.

#### Investigation (`/investigation/`), the central product experience
The Wrong Order Total Bug and every existing investigation function, organised as the existing 8 steps (§3.6) grouped into four stages:

| stage | contains | leads with |
|---|---|---|
| **1 · The bug** | the three orders and expected totals; expected vs actual; `checkout.js` with lines 6/12/23 marked; plain Node reproduction (step 1); the original stack trace and what it cannot establish | expected-vs-actual table, then the source |
| **2 · The investigation** | steps 2–5: `rewind record`, `rewind why --evidence`, `rewind timeline`, `rewind why --seq` | the terminal, with a compact linked run strip above it |
| **3 · The causal explanation** | async causal chain/graph (from committed chain and tree data), request swimlanes, `currentCart` band, evidence-level legend, watched vs unwatched (step 6 `--watch` toggle) | the run visualisation; the terminal as a linked evidence panel beside it (desktop) or below (smaller) |
| **4 · The resolution** | step 7 DiffView with its terminal tab; step 8 fix patch; corrected totals; expected vs bad vs fixed | DiffView, then the patch and totals |

- Nothing from the eight steps is removed.
- **Navigation:** a four-stage stepper with visible labels; the individual steps stay reachable inside their stage.
- **URL state:** `?stage=2&step=4&seq=…&request=…&watch=…`. Old `?step=N` links keep working (the stage is derived from the step); old `/#investigate` links lead to `/investigation/`.
- **Without JavaScript:** all four stages render as ordinary ordered sections with every capture.

#### Documentation (`/docs/`)
One organised page: 1 How Rewind works · 2 Architecture · 3 Evidence and experiments · 4 Limitations · 5 Installation · 6 Usage and commands. A sticky table of contents on desktop; an accessible disclosure-based contents navigation on phones. It keeps the existing pipeline and chain diagrams, file references, evidence tables and installation instructions. Only verified claims and commands, consistent with Rewind's implementation (§9).

### 4.2 Provenance labelling (site-wide)
One evidence vocabulary, shown as consistent badges:

| class | badge | meaning | examples |
|---|---|---|---|
| Observed | ● Observed | a recorded event, as recorded | http.in/out, log, error, mutation, their seq and time |
| Derived | ◆ Derived | computed deterministically from recorded events | request attribution, causal chain, diff alignment (Rewind); cart-holder segments (**derived (site)**) |
| Inferred | ? Inferred | Rewind's own heuristic conclusion | the race explanation, "not proven", "suspected" |
| Authored | ◇ Authored | written or drawn by us | diagrams, prose, expected-total arithmetic, diff connectors |

**Rules:**
- Badges replace repetitive provenance footnotes; every visualisation still states its run id and the classes it contains.
- Rewind's ● ◆ ? are never re-labelled; site-computed values are never presented as Rewind output.
- **Reads are never drawn as events.** A moment of use is the observed log or crash event, labelled "reads are not recorded".

### 4.3 The Investigation (interactions)
Reuse the existing implementation: `renderSpans`, hotspots, the reducer, URL sync, Swimlanes, Inspector, EventDetail, DiffView, FixView. The redesign changes presentation and organisation, not working logic.

- **Stage stepper and steps:** the stage stepper has visible labels; steps keep the tablist pattern inside a stage, with Prev/Next and arrow keys. No autoplay.
- **Stage 2:** the terminal leads; the compact run strip above it keeps seq ↔ marker linking.
- **Stage 3:** the run visualisation leads: swimlanes, `currentCart` band, causal graph built from `findings/why-bad.json` (chain) and `findings/tree-bad-r3.json` (tree), the evidence legend, and the `--watch` toggle (it changes what can be established). **Graph nodes are buttons** that select their seq. The terminal is a linked evidence panel.
- **Evidence linking (unchanged behaviour):** hovering or focusing a seq highlights its marker and terminal row; click pins; EventDetail shows the real fields; hovering or focusing a finding highlights every seq it cites; clicking a marker pins it and scrolls its terminal row into view inside the terminal; Esc unpins.
- **EventDetail:** one docked panel on desktop; inline expansion on tablet and phone; JSON previews in a readable wide monospace block. The duplicated side and inline instances are merged.
- **Stage 4:** DiffView (two aligned token columns, collapsed shared prefix, `▼ first divergence`, connectors as an explanatory aid ◇) with its terminal tab; the real `fix.patch`; expected (◇, computed from `prices.json`) vs bad vs fixed (● from logs).
- **Phone:** keep the request inspector (overview strip, selected request's events with foreign writes interleaved) and the holder list. Seq chips move to a separate evidence row **below** each terminal, so captured text is never interrupted. A four-item stage stepper with visible labels. Avoid nested scrolling.
- **Announcements:** a polite live region announces stage and step changes ("Stage 3 of 4, The causal explanation, step 6") and pinned events.
- **Focus:** stage changes move focus to the stage heading.

### 4.4 Visualizations and their evidence
| viz | form | data | provenance |
|---|---|---|---|
| Swimlanes / run strip | lanes, span bars, glyph markers | `bad` story events | events and times ●; lane membership ◆ |
| Request inspector (phone) | overview strip plus one request's event list | same | same |
| Cart band | segmented bar (desktop) / holder list (phone) | `bad` mutations | writes ●; segments ◆ (site); ticks = ● log/crash times |
| `why` findings | captured terminal lines with hotspots | captures + findings JSON | Rewind's own levels |
| Causal graph | nodes as buttons, SVG edges | chain + `tree-bad-r3` | ◆ (Rewind), drawn ◇ |
| Diff alignment | DiffView | diff tokens and opcodes | ◆ (Rewind); connectors ◇ |
| Pipeline | 5 stages with file chips | repo structure | ◇ authored; paths checked at the sha |
| Expected vs charged | table | `prices.json` + logs | expected ◇ computed; charged ● |
| Home preview | static swimlanes, cart band, `why` excerpt | same artifacts | same as above |

---

## 5. Visual design system (redesign; replaces the M0–M6 light/dark system)

### 5.1 Identity
Rewind's "Ultraviolet" terminal identity on a **dark-only**, neutral near-black foundation. A sophisticated developer tool, not a generic dark SaaS dashboard.
- One ultraviolet accent, used deliberately: links, focus, selection, important information. It never dominates surfaces.
- Certainty is shown by brightness in captures (observed bold; derived violet ◆; inferred dim italic ?), exactly as Rewind prints it.
- Red only for errors. The `◂◂` mark. Captured terminal blocks keep their real `◂◂ command  subject · meta` headers.
- **Forbidden:** blue-tinted backgrounds, blue overlays, blue-centric palettes, purple/blue gradients, glows, decorative colour washes, decorative grids or background effects, excessively coloured cards.

### 5.2 Colour: dark only
**The site is always dark.** No light theme, no toggle, no system-preference detection, no alternate light styles, no theme persistence. `color-scheme: dark`; one `theme-color` (`#09090B`).

| token | value | purpose |
|---|---|---|
| `bg` | `#09090B` | page |
| `surface-1` | `#111114` | raised panels |
| `surface-2` | `#18181C` | secondary surfaces, terminal title bar |
| `line` | `#26262C` | hairlines and separators |
| `text` | `#EDEDF0` | primary text |
| `text-2` | `#B4B4BD` | supporting text |
| `text-3` | `#8A8A96` | metadata |
| `term-bg` | `#060608` | terminal windows |
| `accent` | `#8D6CFF` (render `uv.hi`) | links and text accents |
| `accent-fill` | `#7F5AF0` (render `uv`) | focus rings and selected states |

- **Primitive tokens = `render.PALETTE` exactly** (uv `#7F5AF0`, uv.hi `#8D6CFF`, uv.lo `#6A48D8`, mute `#7E7E8C`, err `#E5484D`, ok `#23905C`, write `#A8741F`, r1–r4 `#2C8C99` `#C0567A` `#7D8A2E` `#5A7FC0`; lane mapping verified in `render.req_tag`).
- **Marks and glyphs** use the CLI hex unchanged and must be ≥ 3:1 on `bg`, `surface-1`, `surface-2` and `term-bg`.
- **Ink steps** for small coloured text: same hue, OKLCH lightness shifted until ≥ 4.5:1 on every dark surface (generated by `npm run ink`, checked by a test). Normal text ≥ 4.5:1, aim for 7:1 where practical.
- **Request lanes:** the dataviz validator result (chroma FAIL r1, CVD WARN r2↔r1 ΔE 6.5) is accepted on condition that lanes never depend on colour alone: text labels, a distinct glyph per marker, lane position and rules, labelled buttons on mobile, lane #1 recessive, greyscale and deuteranopia checks. Re-validated against the dark surfaces.

### 5.3 Typography
Chosen 2026-11-23 after comparing six display/body pairings rendered at 1440 and 390 px on `#09090B` (Space Grotesk/Manrope, Space Grotesk/IBM Plex Sans, Manrope, Bricolage Grotesque/Instrument Sans, Schibsted Grotesk, Hanken Grotesk):
- **Headings: Space Grotesk** (`@fontsource/space-grotesk`, OFL-1.1), 500–700. Distinctive geometric grotesk with a technical character; it derives from Space Mono, so it ties to the terminal. Space Grotesk has no italic: emphasis in headings is upright ultraviolet, never a synthesised oblique.
- **Body: IBM Plex Sans**: highly readable at small sizes, and the same skeleton as Plex Mono, so prose and terminal read as one system.
- **Terminal and code: IBM Plex Mono**, with the DejaVu Mono fallback restricted by `unicode-range` to the glyphs Plex Mono lacks and its `size-adjust` (0.6 em advance), as audited in M0/M1.
- Rejected: Manrope body (soft and wide next to Plex Mono), Bricolage (heavy and condensed at phone sizes), Schibsted (poor heading wraps at 390 px), Hanken (generic).

| role | font | size / line-height | weight / tracking |
|---|---|---|---|
| display | Space Grotesk | 64/1.04 desktop, 40/1.08 phone | 600, −0.03 em |
| h1 (page title) | Space Grotesk | 44/1.1 | 600, −0.025 em |
| h2 | Space Grotesk | 30/1.2 | 600, −0.02 em |
| h3 | Space Grotesk | 20/1.3 | 600, −0.01 em |
| body | IBM Plex Sans | 17/1.65, measure ≤ 68 ch | 400 |
| small | IBM Plex Sans | 14/1.5 | 400 |
| label (eyebrows only) | IBM Plex Mono | 12, uppercase | 500, +0.06 em |
| terminal | IBM Plex Mono | 13.5 (12.5 phone) | 400/700 |

No text below 12 px. Captured text is never typographically "corrected". `tabular-nums` on numeric columns. `translate="no"` on code and terminal text. Self-hosted via `@fontsource`, `font-display: swap`, mono preloaded.

### 5.4 Layout and spacing
- Content max width about 1200 px; prose about 720 px; a 12-column grid for split layouts; 16 px phone gutters.
- 8-point spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 px. Strong vertical rhythm; sections separated by spacing (96–128 px), not borders.
- Cards only for something interactive or a real window: terminal, EventDetail, investigation stepper. No containers around ordinary text.
- **No horizontal page scroll from 320 to 1440 px.**
- **Terminal capture width per container** (container queries): ≥ 960 px → 110 cols; 640–959 → 72; < 640 → 46. Only the active variant is displayed. Below 360 px the terminal scrolls horizontally inside itself.

### 5.5 Terminal component
- **Title bar** (about 36 px, `surface-2`): three neutral grey decorative window dots (`aria-hidden`), the real command as the title, a Copy button on the right that copies exactly that command.
- **Body** (`term-bg` `#060608`): a violet prompt marker and the command, then the captured output beneath, unchanged (contents and colours). The component only adds the window around the real output.
- **Long output:** never silently clipped; scroll regions are keyboard-focusable and labelled; a visible indication shows when more lines are available. The 110/72/46 widths are preserved.

### 5.6 Other components
- **Evidence badges:** ● Observed · ◆ Derived · ? Inferred · ◇ Authored, one consistent component (glyphs in Plex Mono).
- **Code:** a custom Shiki theme from the palette: mostly monochrome, ultraviolet keywords, muted comments, readable line numbers, highlighted source lines. Source is verbatim.
- **Scrollbars:** thin; neutral transparent track; subtle grey thumb, slightly brighter on hover; the same on page and terminals; visible enough to discover.

### 5.7 Motion and accessibility
**Motion**
- Allowed: highlight transitions 150 ms; the run-view playhead `transform` 250 ms; press feedback 100 ms. One strong ease-out curve (`--ease-out`). CSS transitions on `transform`/`opacity` only, interruptible.
- Under `prefers-reduced-motion: reduce`, all are instant.
- Forbidden: typewriter output, autoplay loops, fade-in on scroll, parallax, decorative backgrounds, `transition: all`, step crossfades.

**Accessibility (a design input, not a final checklist)**
- One `<h1>` per page, ordered headings, semantic landmarks, accessible navigation with no hidden overflow on phones.
- Complete keyboard navigation; a visible 2 px ultraviolet focus ring with offset, never hidden by the sticky navigation; stage changes move focus to the stage heading; terminal scrolling works by keyboard.
- Polite live region for stage/step changes and pinned events.
- Contrast as §5.2; colour never the only signal (glyph + word + label).
- Touch targets ≥ 44 px with ≥ 8 px spacing; `touch-action: manipulation`; hover styles only for fine pointers; `:active` press feedback.
- Readable sizes (§5.3); reduced motion; `translate="no"` where needed.

### 5.8 Installed UI skills (`.claude/skills/`) and how they're used
| skill | use |
|---|---|
| web-design-guidelines | accessibility and interface rules throughout; final review |
| ui-ux-pro-max | accessibility, typography, colour-token and responsive rules (its font suggestions were evaluated, not adopted) |
| design-system | token layers (primitive → semantic → component) and consistent component rules |
| emil-design-eng | component polish and interaction states |
| mobile-native | phone layout and touch |
| dataviz | run view, causal graph, validator |
| break-ui | worst-case text, long terminal output and JSON layouts |
| review-animations | motion review |
| apple-design | typography and materials guidance only |
| design-taste-frontend | **not applied wholesale** (it bans violet and requires entrance motion); only compatible neutral principles: equal edges, one system, no scroll fade-ins, no invented figures |

The approved specification takes priority over generic skill recommendations. Skill files and `skills-lock.json` are never modified.

### 5.9 Design references
**Reference studied:** `trace-cli.vercel.app`, learned from, never used as a template. Borrow: one interactive artifact as the centre; a position control (here, **seq**) driving every panel; section heads with a tag, a short title and a mechanism sentence; code-path chips; easy-to-find limits. Avoid: hand-written fake terminal lines, typewriter animation, mock video shells, one-hue semantics, bracket/crosshair decoration, unqualified claims, invented stats.

## 6. Technical architecture

### 6.1 Stack
- **Astro** (static output), **Preact** islands, **TypeScript**.
- Dependencies, total:
  - `astro`
  - `@astrojs/preact`
  - `preact`
  - `@fontsource/ibm-plex-sans` (body)
  - `@fontsource/ibm-plex-mono` (terminal)
  - `@fontsource/dejavu-mono` (glyph fallback, added in M0 after the glyph audit)
  - `@fontsource/space-grotesk` (headings, added by the redesign, §5.3)
  - `vitest`
  - `playwright` (dev)
- Versions are pinned exactly in `package.json`.
- **No** global state library, chart library, motion library or CSS framework. Native SVG and CSS for every visualization.
- Static `dist/`, three pages. Hosting is chosen by the owner; any static host works.

### 6.2 Files
```
capture/                         Python, independent of the site (§7)
  capture.py   SCHEMA.md
src/
  pages/index.astro · investigation.astro · docs.astro      Home, Investigation, Documentation (§4.1)
  layouts/Base.astro             head, fonts, color-scheme: dark, theme-color, skip link, OG tags, shared nav and footer
  styles/tokens.css              primitive (CLI hex) → semantic, dark only (surfaces, text, ink, mark, line) → component
  styles/base.css                type scale, labelled dotted rules, focus ring, reduced-motion
  lib/ansi.ts                    SGR parser → spans {text, token, bold, italic, dim}; hex→token map = PALETTE
  lib/hotspots.ts                seq tokens in parsed lines (timeline seq column, evidence column)
  data/capture/                  committed artifacts (§7)
  components/                    static .astro, no JS
    Nav, Footer, Section, Wordmark, Terminal, CommandLine (+ one shared copy script), Provenance,
    Hero, Scenario, HowItWorks (PipelineDiagram, ChainDiagram, InstrumentDiff), BuiltOnEvidence, Limits, GetStarted
  islands/Investigation.tsx      THE ONLY ISLAND (client:visible), on /investigation/ only
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
useReducer → { step: 1..8 (stage derived: 1 → 1, 2–5 → 2, 6 → 3, 7–8 → 4; stage 3 also shows the causal view), pinned: seq|null, hover: seq|null, request: 1..4|null, watch: 'on'|'off', diffTab: 'aligned'|'terminal' }
derived:      focus = pinned ?? hover ?? stepDefault(step) ; highlighted = focus ∪ evidence(hoveredFinding)
```
- The step config is a static table built from the artifacts: capture id, run, view mode, and default focus computed from the data.
- The capture width is CSS, not state.
- URL sync covers `stage`, `step`, `seq`, `request` and `watch`; a bare `?step=` derives the stage.

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
  - screenshots at 1440/1024/768/390/320 (dark only);
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

> M0–M6 below are **done** and kept as history (they describe the pre-redesign single page, including its old light/dark themes). The redesign phases R1–R5 at the end of this section are the current work; where they differ, §4, §5 and R1–R5 win.

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

### Redesign (approved 2026-11-23)
Branch `feat/redesign`, cut from the merged `main` (identical tree to `feat/rewind-demo-website`). Logical commits per phase, no AI trailers, owner's author identity, no push or deploy without approval, `../rewind` read-only, repository visibility unchanged. **Each phase stops for owner review.** Preserve the Astro + Preact + TypeScript + custom CSS + SVG architecture, the capture pipeline and committed artifacts (not modified unless a genuine correctness issue is found and explained), all investigation functionality, the claims safeguards, the integrity checks, and the Vitest and Playwright tests. No unnecessary dependencies.

#### R1: Foundation
- Dark-only tokens and surfaces (§5.2); the final typography pairing (§5.3); the spacing system (§5.4); scrollbars; the rebuilt terminal (§5.5); evidence badges; the custom Shiki theme; the shared layout with three-destination navigation.
- **Accept:** contrast tests pass; the glyph audit passes; terminal output stays byte-identical after ANSI stripping; the terminal renders at all three capture widths; responsive and keyboard checks pass; no light theme or theme toggle exists.

#### R2: Information architecture
- `/`, `/investigation/`, `/docs/`; shared navigation; existing content moved to the right pages; the documentation contents; old anchors and `?step=` links preserved.
- **Accept:** every existing claim and section retained; no horizontal overflow from 320 to 1440 px; no-JS content accessible; navigation works at all widths.

#### R3: Investigation
- Four stages; the linked run strip; the causal graph; docked EventDetail; the phone evidence chip row; stage announcements; deep-link restoration.
- **Accept:** all existing desktop and phone checks pass; keyboard navigation across four stages and eight steps; every seq, marker and graph node links correctly; deep links restore stage, step, seq, request and watch; DiffView behaviour unchanged.

#### R4: Home
- Hero; the static real investigation preview; three evidence-backed points; fact tiles.
- **Accept:** the first screen at 1440 and 390 px explains Rewind and shows genuine output; no island JS on Home; the preview is generated from committed artifacts.

#### R5: Verification
- Chromium, Firefox and WebKit tests; Lighthouse; screenshots at 1440/1024/768/390/320; final accessibility and motion audits; deployment-readiness review.
- **Accept:** browser tests pass; Lighthouse accessibility has no failures; Lighthouse performance ≥ 90 on all three pages; the investigation island ≤ 30 KB gzipped; screenshots reviewed.

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
- Ink text ≥ 4.5:1 (aim 7:1 for body text) and marks ≥ 3:1 on every dark surface.
- Colour is never the only signal (greyscale and deuteranopia checks pass).
- Reduced motion is honoured.
- Lighthouse a11y has no failures.

**Responsive**
- No horizontal page scroll from 1440 down to 320.
- The terminal width variant switches correctly.
- The phone request inspector is usable, with 44 px targets.
- Screenshots reviewed at 1440/1024/768/390/320, dark only, on all three pages.

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
