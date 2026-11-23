# Engineering log

The development record of Rewind: every commit, each milestone's decisions and fixes, and every bug found in testing. Back to [HANDOVER.md](HANDOVER.md). Test evidence and the terminal matrix live in [TESTING_AND_VERIFICATION.md](TESTING_AND_VERIFICATION.md); design rationale in [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) and [`spikes/RESULTS.md`](../../spikes/RESULTS.md).

**Sources.** Commit messages and diffs (`git log`), `spikes/RESULTS.md`, the M7 and redesign verification sessions recorded in `TESTING_AND_VERIFICATION.md`, and a re-run of every milestone's test suite during this audit (2026-11-23, see [Test count history](TESTING_AND_VERIFICATION.md#test-count-history)). Each statement below says which. Nothing comes from memory alone. Where a source doesn't exist, the entry says so.

Evidence labels used below:
- **commit msg**: stated in that commit's message (written at the time; not independently re-checked unless noted).
- **re-run**: checked during this audit by running the code at that commit.
- **verified**: checked in a recorded verification session (M7 or the redesign sessions).
- **unknown**: no record exists.

## 1. Commit history

Author dates from `git log`. `main` and `origin/main` are at `0d4cb3d`. `feat/cli-visual-redesign` is 5 commits ahead of `main`, unmerged and unpushed.

| # | commit | date | message | kind | contents | tests at commit (re-run) |
|---|---|---|---|---|---|---|
| 1 | `773d6dd` | 11-22 00:10 | first commit | setup | empty README | – |
| 2 | `f10af80` | 11-22 00:43 | M0: spike experiments validating recorder assumptions | milestone | `spikes/` E0–E7 scripts, fixtures, `RESULTS.md` | spikes only (39 checks, own runner) |
| 3 | `2ab347b` | 11-22 00:51 | M1: production execution recorder with opt-in mutation tracking | milestone | `recorder/recorder.js`, `recorder/instrument.js`, `tests/test_recorder.py`, fixtures | 14 / 14 |
| 4 | `caea6e5` | 11-22 00:52 | M2: SQLite store, rewind record and rewind runs | milestone | `rewind/store.py`, `cli.py`, `render.py`, `pyproject.toml`, `test_store.py`, `test_cli.py` | 24 / 24 |
| 5 | `fe853b2` | 11-22 01:00 | M3: analysis core, timeline and tree views, Phantom Discount demo | milestone | `rewind/analysis.py`, `demo/`, recorder request anchors, `test_analysis.py` | 30 / 30 |
| 6 | `408d4a9` | 11-22 01:03 | M4: rewind why - graded causal investigation of errors and any event | milestone | `investigate()`, `why` command and view | 36 / 36 |
| 7 | `a1b9988` | 11-22 01:06 | M5: rewind diff - where two runs' executions part ways | milestone | `diff()`, `diff` command and view | 39 / 39 |
| 8 | `ab02a7b` | 11-22 01:09 | M6: docs, demo fix patch, fresh-clone fixes | milestone | `README.md`, `docs/ARCHITECTURE.md`, `demo/fix.patch`, three fixes | 40 / 40 |
| 9 | `4097ca2` | 11-22 15:03 | docs: add comprehensive project handover | docs | `docs/handover/` (7 files) | 40 / 40 (docs only) |
| 10 | `0d4cb3d` | 11-23 11:14 | M7: fresh-clone verification fixes | milestone | `cli.py` `-N` fix, README fixes, handover results | 41 / 41 |
| 11 | `769708f` | 11-23 12:43 | cli: Ultraviolet visual identity across every command | redesign | `render.py` rewrite, `cli.py` help/landing hooks, `test_render.py` | 50 / 50 |
| 12 | `467936b` | 11-23 12:44 | cli: glyph fallback for classic Windows console fonts | compatibility fix | `render.py` console-font detection | 51 / 51 |
| 13 | `49b34bb` | 11-23 12:44 | docs: terminal presentation rules, NO_COLOR, test count | docs | README, `docs/ARCHITECTURE.md`, handover | 51 / 51 (docs only) |
| 14 | `b903d1e` | 11-23 12:58 | style: add prominent Rewind terminal wordmark | redesign | `render.py` wordmark, narrow landing layout | 52 / 52 |
| 15 | `6320276` | 11-23 13:18 | fix: landing screen fits 80x24 and switches at a real 45 columns | compatibility fix | `render.py`, tests, compatibility matrix | 54 / 54 |

## 2. Milestones

### M0 — Feasibility experiments (`f10af80`)
- **Objective:** test the risky assumptions before writing production code (plan Revision 2, experiments E0–E7).
- **Decisions** (from `spikes/RESULTS.md`):
  - NDJSON written from Node and ingested into SQLite by Python.
  - `uncaughtExceptionMonitor` as the only error hook.
  - `executionAsyncId()` as the error context, for both sync throws and rejections.
  - Promise creation stacks on by default (1.9× overhead accepted).
  - Folding of internal hops that have no user frames.
  - AST rewrite for mutation tracking. Inspector logpoints (~100× slower), a deep Proxy (breaks identity) and an out-of-process CDP pause (perturbs timing) were rejected.
- **Files:** `spikes/` (scripts, fixtures, `check_results.json`, `e6_results.json`).
- **Tests:** 39/39 checks plus E0, E5b, E6 and E7 passed, per `RESULTS.md`.
- **Bugs:** the first run passed 17/33. Every failure was a wrong expectation in a check, not a recorder bug (`RESULTS.md`).

### M1 — Node.js recorder (`2ab347b`)
- **Objective:** a zero-dependency recorder preloaded with `--require`, writing NDJSON.
- **Decisions** (commit msg):
  - async_hooks lifecycle with callback names, structured creation stacks and promise stacks.
  - Events from `console` and `http.Server`.
  - A re-entrancy guard.
  - Flush every 256 events, on error events, on exit and on signals.
  - `recorder/instrument.js` (the `--watch` AST rewrite), loaded lazily.
- **Files:** `recorder/recorder.js`, `recorder/instrument.js`, `recorder/package.json`, `tests/conftest.py`, `tests/test_recorder.py`, fixtures.
- **Tests:** 14 integration tests against real `node` (commit msg; re-run: 14/14).

### M2 — Storage and CLI (`caea6e5`)
- **Objective:** ingest NDJSON into SQLite, `rewind record`, `rewind runs`.
- **Decisions** (commit msg):
  - The raw NDJSON is kept on disk.
  - Runs are classified as ok, failed or crashed.
  - A torn final line is tolerated.
  - Runs are resolved by id prefix, label, `last` or `-N`.
  - The child's exit code is passed through.
- **Files:** `rewind/store.py`, `rewind/cli.py`, `rewind/render.py`, `rewind/__init__.py`, `pyproject.toml`, `tests/test_store.py`, `tests/test_cli.py`.
- **Tests:** re-run 24/24.
- **Note:** the CLI layer could not actually accept `-N`; see [B3](#b3-negative-run-selectors--1--2-rejected).

### M3 — Timeline and async tree (`fe853b2`)
- **Objective:** the analysis core, `rewind timeline`, `rewind tree`, and the Phantom Discount demo.
- **Decisions** (commit msg):
  - `analysis.Run` indexes ancestry, request attribution, creation sites and story events.
  - `build_tree` prunes quiet branches and folds frameless hops, without hiding any story event.
  - Demo timings are chosen for a deterministic interleaving: commit msg reports a crash in 12 of 12 runs and correct recording in 8 of 8.
- **Files:** `rewind/analysis.py`, `cli.py`, `render.py`, `recorder/recorder.js`, `demo/checkout.js`, `demo/traffic.js`, `demo/prices.json`, `tests/test_analysis.py`, `tests/fixtures/http_keepalive.js`.
- **Bugs:** keep-alive requests were attributed to one another ([B12](#b12-keep-alive-requests-attributed-to-each-other)).
- **Tests:** re-run 30/30.

### M4 — Causal investigation, `why` (`408d4a9`)
- **Objective:** explain an error, or any event, with graded findings.
- **Decisions** (commit msg):
  - `investigate()` emits Findings tagged observed, derived or inferred, each citing the event seqs behind it.
  - Without `--watch` it only suspects shared state.
  - On a non-error event (`--seq`), a race is marked unproven because reads are not recorded.
  - Tests assert evidence-integrity invariants.
- **Files:** `rewind/analysis.py`, `cli.py`, `render.py`, `tests/test_analysis.py`, `tests/test_cli.py`.
- **Tests:** re-run 36/36.

### M4.5 — Variable mutation tracking
The plan's Revision 2 scheduled mutation tracking as a separate "M4.5" between `why` and `diff`. **Git has no separate M4.5 commit.** The work shipped in two parts:
- **Capture** in M1 (`2ab347b`): `recorder/instrument.js`, `--watch`, the mutation cap, lazy-loaded AST dependencies. Tests: `test_mutations_capture_exactly_documented_set`, `test_mutation_carries_writer_context`, `test_mutation_cap`, `test_esm_not_instrumented_and_unharmed`, `test_ast_deps_lazy`.
- **Use in analysis** in M4 (`408d4a9`): last write, writer request, and own-write → foreign-overwrite → read ordering. Tests: `test_why_with_watch_proves_the_overwrite`, `test_why_without_watch_never_claims_a_mutation`.

Approach and coverage: `spikes/RESULTS.md` E7; README "What `--watch` captures, exactly".

### M5 — Execution comparison, `diff` (`a1b9988`)
- **Objective:** find where two runs' executions part ways.
- **Decisions** (commit msg):
  - Each run is turned into request-tagged steps with ids and timings removed.
  - The two step lists are aligned with `difflib`.
  - It reports the last common step, what each run does next, whether that step merely moved, and reordered / only-A / only-B counts.
- **Files:** `rewind/analysis.py`, `cli.py`, `render.py`, tests.
- **Bugs:** Node's HTTP date-cache timer made two good runs diverge ([B13](#b13-nondeterministic-http-date-cache-timer-in-diff)).
- **Tests:** re-run 39/39.

### M6 — Demo, documentation and polish (`ab02a7b`)
- **Objective:** README walkthrough, `docs/ARCHITECTURE.md`, and the demo fix patch.
- **Files:** `README.md`, `docs/ARCHITECTURE.md`, `demo/fix.patch`, `pyproject.toml`, `analysis.py`, `cli.py`, `render.py`, `tests/test_cli.py`.
- **Bugs found by a fresh-clone walkthrough** (commit msg): [B14](#b14-diff-diverged-on-writes-watched-in-only-one-run), [B15](#b15-piping-output-to-head-crashed-with-einval-on-windows), [B16](#b16-runs-table-wrapped-the-command-column). Whether that walkthrough covered all seven demo steps is not recorded.
- **Tests:** re-run 40/40.

### Handover documentation (`4097ca2`)
Seven handover files, written without running anything; the claims were checked later in M7.

### M7 — Fresh-clone verification (`0d4cb3d`)
- **Objective:** clone into a scratch directory outside OneDrive, follow the README exactly in PowerShell 5.1, run the tests, run all seven demo steps, and check the P1 items.
- **Result** (verified): 40/40 before the fix and 41/41 after it. All seven demo steps reproduced.
- **Bugs:** [B2](#b2-readme-install-line-fails-in-powershell-51), [B3](#b3-negative-run-selectors--1--2-rejected), [B5](#b5-diff-demo-step-needs---watch-on-both-runs), [B6](#b6-readme-claim-that-crashed-runs-lose-piped-stdout).
- **Investigated:** [B1](#b1-nine-unexplained-test-failures) and [B4](#b4---watch-without-the-npm-dependencies).
- **Files:** `rewind/cli.py`, `tests/test_cli.py`, `README.md`, handover docs.
- **Not done:** the three demo rehearsals and the backup video, which are the user's tasks.

### Ultraviolet CLI visual redesign (`769708f`, `467936b`, `49b34bb`)
- **Objective:** replace generated-looking output with a distinct visual identity, as presentation only, with no change to commands, options, exit codes or analysis. Three directions were mocked up; the user chose "Ultraviolet".
- **Decisions:**
  - One violet accent for derived findings and run ids; text in the terminal's own colour; one mid grey; red only for errors.
  - Every colour is a mid-tone with ≥3.5:1 contrast on both black and white, enforced by a test.
  - "Certainty is brightness": observed findings bold, derived ones violet, inferred ones dim italic.
  - Labelled dotted rules instead of boxes.
  - A landing screen replaces Typer's help ([B7](#b7-typer-generated-help-and-error-boxes)).
  - Glyph stand-ins for classic consoles ([B8](#b8-classic-powershell-console-shows-boxes-for-rewinds-glyphs)).
- **Files:** `rewind/render.py`, `rewind/cli.py`, `tests/test_render.py`, `tests/test_cli.py` (the `rw()` env option, and one assertion now allows the two-space indent), `README.md`, `docs/ARCHITECTURE.md`.
- **Tests:** 10 new rendering tests. Re-run: 50/50 at `769708f`, 51/51 at `467936b`.
- **Verification:**
  - **Real classic consoles:** Lucida Console and Consolas, with the console screen read back.
  - **Font coverage:** checked per glyph through GDI.
  - **Encoding:** `PYTHONUTF8=0`.
  - **Widths:** 100 and 60 columns.

### Large REWIND wordmark (`b903d1e`)
- **Objective:** make the product name the first thing seen. Three wordmarks were drawn; the user chose option A, "UV print".
- **Decisions:**
  - Half-block letters generated from bitmaps (`render.LETTERS`), using only █ ▀ ▄. Quadrant blocks, heavy lines and rounded corners were avoided because Lucida Console lacks them (GDI check).
  - The rows step from light to deep violet.
  - The version, the ruler's ◆ and the tagline share one right edge.
  - A tight variant for 45–47 columns, and the compact mark below 45.
- **Bugs:** narrow landing layout ([B11](#b11-landing-command-descriptions-squeezed-at-narrow-widths)).
- **Files:** `rewind/render.py`, `tests/test_render.py`, `README.md`, `docs/ARCHITECTURE.md`, `TESTING_AND_VERIFICATION.md`.
- **Tests:** re-run 52/52.

### Cross-platform and short-terminal verification (`6320276`)
- **Objective:** Linux compatibility, and very short terminals.
- **Verification:**
  - WSL2 Ubuntu 24.04: fresh clone, full suite, then the real CLI in tmux at exact sizes.
  - Classic console and Windows Terminal at exact sizes.
  - Details: [compatibility matrix](TESTING_AND_VERIFICATION.md#terminal-compatibility-matrix-2026-11-23-branch-featcli-visual-redesign).
- **Bugs:** [B9](#b9-wordmark-switch-used-the-wrong-width-outside-legacy-windows), [B10](#b10-landing-screen-too-tall-for-8024). Also found a README gap on Ubuntu ([B17](#b17-readme-install-on-ubuntu)).
- **Tests:** 2 new. 54/54 on Windows and on Linux.

## 3. Bug-fix and verification record

Root cause labels: **confirmed** = demonstrated (reproduced, and the fix made the symptom go away, or shown directly in source); **suspected** = plausible explanation not demonstrated; **unknown**.

<a id="b1-nine-unexplained-test-failures"></a>
### B1. Nine unexplained test failures
1. **Observed:** the user reported nine failures from an earlier, interrupted session. No record of them (test names, messages, environment or commit) exists anywhere in the repository.
2. **Root cause:** unknown.
3. **Investigation (M7):** none of these conditions produced nine failures:

   | condition | result |
   |---|---|
   | fresh clone with README install | 40 passed |
   | no `npm install` | 16 failed |
   | original OneDrive tree | 40 passed |
   | run from outside the repo | 40 passed |
   | stale `REWIND_HOME` | 40 passed |
   | three repeat runs | 40 passed each |
   | under CPU load | 40 passed |
   | M5 / M4 commits | 39 and 36 passed |

   The audit re-run of every commit (14 … 54) also found no failures.
4. **Fix:** none; the failures were not reproduced.
5. **Files / test / commit:** none.
6. **Verification:** not reproducible. `node` missing from PATH was not tested.

<a id="b2-readme-install-line-fails-in-powershell-51"></a>
### B2. README install line fails in PowerShell 5.1
1. **Observed:** `python -m venv .venv && .venv/Scripts/activate` → "The token '&&' is not a valid statement separator in this version."
2. **Root cause (confirmed):** PowerShell 5.1 has no `&&`. The `activate` half works on its own; it resolves to `Activate.ps1`.
3. **Fix:** split into two lines in the README.
4. **Files:** `README.md`.
5. **Test:** none (documentation).
6. **Verification:** a second fresh clone installed with the new lines (M7).
7. **Commit:** `0d4cb3d`.

<a id="b3-negative-run-selectors--1--2-rejected"></a>
### B3. Negative run selectors (`-1`, `-2`) rejected
1. **Observed:** `rewind timeline -1` → "No such option: -1", exit 2, although the README and the CLI help both offer `-N`. `rewind timeline -- -1` worked.
2. **Root cause (confirmed):** Click parses a leading `-` as an option before Rewind's resolver sees it. `store.resolve` itself handled `-N` correctly.
3. **Fix:** `context_settings={"ignore_unknown_options": True}` (`RUN_REF`) on `timeline`, `tree`, `why` and `diff`. Side effect: a bogus option such as `--bogus` is now reported as "no run matches '--bogus'", still exit 2.
4. **Files:** `rewind/cli.py`, `tests/test_cli.py`.
5. **Regression test:** `test_negative_run_refs_are_not_parsed_as_options`. It fails on the old code ("No such option: -1").
6. **Verification:** second fresh clone. `-1`, `-3`, `diff -2 -3` and `tree -2` all work; `-9` gives "only 3 runs recorded".
7. **Commit:** `0d4cb3d`.

<a id="b4---watch-without-the-npm-dependencies"></a>
### B4. `--watch` without the npm dependencies
1. **Observed:** in a clone without `npm install --prefix recorder`, 16 tests fail. A `--watch` recording crashes at preload with Node's `Error: Cannot find module 'acorn'` and is marked `crashed`.
2. **Root cause (confirmed):** acorn, acorn-walk and magic-string are only installed by that npm step. They are loaded lazily, only with `--watch`, which is why recording without `--watch` still works.
3. **Fix / workaround:** none in code. The npm step is documented in the README and the development guide. The error message is still Node's raw output; making it friendlier would be new behaviour and was deliberately left out.
4. **Files:** none.
5. **Test:** `test_ast_deps_lazy` covers the lazy loading.
6. **Verification:** reproduced (M7).
7. **Commit:** none.

<a id="b5-diff-demo-step-needs---watch-on-both-runs"></a>
### B5. `diff` demo step needs `--watch` on both runs
1. **Observed:** the README's step-6 good run had no `--watch`. `diff good bad` then reported "writes … left out: watched in only one run", and its shared prefix ended at "#2 FSREQCALLBACK from loadCart", not "#2's write" as the README claimed.
2. **Root cause (confirmed):** by design since M6 ([B14](#b14-diff-diverged-on-writes-watched-in-only-one-run)), `diff` compares writes only for variables watched in both runs. The README command didn't match the README claim.
3. **Fix:** `-w currentCart` added to the good-run command, plus a note explaining what happens without it.
4. **Files:** `README.md`.
5. **Test:** `test_diff_ignores_writes_watched_in_only_one_run` (M6).
6. **Verification:** with both runs watched, the output reads "identical up to and including: #2 ✎ currentCart =" (M7; again in the redesign session).
7. **Commit:** `0d4cb3d`.

<a id="b6-readme-claim-that-crashed-runs-lose-piped-stdout"></a>
### B6. README claim that crashed runs lose piped stdout
1. **Observed:** the README said "on Windows, stdout to a pipe is lost when the process crashes". In M7 the A-101 log line printed every time: 3 of 3 through a pipe, to a file, and under `rewind record`.
2. **Root cause of the original claim:** unknown. An interactive console (TTY) was not tested.
3. **Fix:** claim removed.
4. **Files:** `README.md`.
5. **Test / commit:** none / `0d4cb3d`.

<a id="b7-typer-generated-help-and-error-boxes"></a>
### B7. Typer-generated help and error boxes
1. **Observed:** bare `rewind`, `--help` and usage errors showed Typer's boxed panels, which didn't match the design.
2. **Root cause (confirmed, Typer source):** Typer hard-codes `Panel(...)` in `rich_utils`; its style constants can't remove the boxes.
3. **Fix:**
   - A `TyperGroup.format_help` override renders the landing screen. Bare `rewind` still exits 2, because Click raises `NoArgsIsHelpError`.
   - A `TyperCommand.format_help` override renders per-command help.
   - `typer.rich_utils.rich_format_error` is replaced for usage errors. This one depends on a Typer internal and is marked with a `shortcut:` comment.
4. **Files:** `rewind/cli.py`, `rewind/render.py`.
5. **Tests:** `test_command_help_keeps_every_option_and_drops_boxes`, `test_usage_errors_keep_message_and_exit_code`, `test_landing_without_runs_creates_nothing`.
6. **Verification:** every option and default still listed; exit codes unchanged.
7. **Commit:** `769708f`.
8. **Caught during this work, before committing** (recorded in this session only, never committed): command help crashed with `AttributeError: 'TyperOption' object has no attribute 'type'`, because Typer's vendored Click option has no `.type`. Fixed by reading `type_descriptor.annotation` instead.

<a id="b8-classic-powershell-console-shows-boxes-for-rewinds-glyphs"></a>
### B8. Classic PowerShell console shows boxes for Rewind's glyphs
1. **Observed:** a GDI check (`GetGlyphIndicesW`) showed these fonts missing glyphs Rewind prints:

   | font | missing |
   |---|---|
   | Lucida Console (this machine's PowerShell console font, per its registry profile) | ● ◆ ✖ ✎ ▸ ◉ ⚙, plus the redesign's ◂ ┈ ┃ ◌ |
   | Consolas | ◆ ✖ ✎ ◉ ⚙ |

   Most of these were already in use before the redesign.
2. **Root cause:**
   - **Confirmed:** the glyphs are absent from those fonts.
   - **Not observed here:** that the classic console then draws boxes, because it has no font fallback. This is known conhost behaviour, but no screenshot was taken; the screen buffer only stores characters.
3. **Fix:** `_console_font_lacks_glyphs` reads the console's real font (`GetCurrentConsoleFontEx`) and checks it with GDI. If glyphs are missing, output goes through `_GlyphSafe`, which swaps in one-cell stand-ins: • ♦ × = ► ○ * · ║. Skipped for pipes, files, Windows Terminal (`WT_SESSION`) and VS Code (`TERM_PROGRAM`).
4. **Files:** `rewind/render.py`, `tests/test_render.py`.
5. **Test:** `test_console_font_fallback_is_complete_and_keeps_layout` checks, through GDI, that the stand-ins exist in all three fonts.
6. **Verification:** in real conhost windows with Lucida and with Consolas, the screen buffer read back shows the stand-ins and the layout unchanged, with colour on.
7. **Commit:** `467936b`.

<a id="b9-wordmark-switch-used-the-wrong-width-outside-legacy-windows"></a>
### B9. Wordmark switch used the wrong width outside legacy Windows
1. **Observed:** on Linux (tmux) a 44-column terminal still showed the wordmark, although the spec is compact below 45.
2. **Root cause (confirmed, Rich source):** Rich subtracts `console.legacy_windows` (1 or 0) from the width. That only happens in legacy Windows mode, which includes Windows pipes. The threshold had been tuned on Windows pipes, where the reported width is one less.
3. **Fix:** the threshold uses `console.width + console.legacy_windows`, the terminal's real width.
4. **Files:** `rewind/render.py`, `tests/test_render.py`.
5. **Regression test:** `test_wordmark_switch_is_the_terminals_45_columns_in_every_rich_mode`. It fails on `b903d1e`.
6. **Verification:** 45 shows the wordmark and 44 the compact mark, in tmux, the classic console and Windows Terminal.
7. **Commit:** `6320276`.

<a id="b10-landing-screen-too-tall-for-8024"></a>
### B10. Landing screen too tall for 80×24
1. **Observed:** the landing screen was 25 lines, so in an 80×24 terminal the prompt pushed the top two wordmark rows off screen (tmux visible pane).
2. **Root cause (confirmed):** the wordmark added 2 lines; the `why` description wrapped at 80 columns; and there was a trailing blank line.
3. **Fix:**
   - `why` description reworded to "why an error (or any event) happened".
   - Trailing blank line removed.
   - Result: 23 lines, nothing removed.
4. **Files:** `rewind/render.py`, `tests/test_render.py`.
5. **Regression test:** `test_short_terminals_scroll_instead_of_clipping` asserts ≤ 23 lines at 80 columns; it fails on `b903d1e`. It also checks that height never truncates the output, and that colour on and off render alike.
6. **Verification:** at 80×24 the whole screen plus the prompt is visible (tmux, conhost, Windows Terminal).
7. **Commit:** `6320276`.

<a id="b11-landing-command-descriptions-squeezed-at-narrow-widths"></a>
### B11. Landing command descriptions squeezed at narrow widths
1. **Observed:** at 47 columns the fixed-width command columns left about 5 cells for descriptions. The landing screen ran to 61 lines, and to 119 lines at 44 columns. The tagline's wrapped line also lost its indent.
2. **Root cause (confirmed):** fixed column widths, from `769708f`.
3. **Fix:**
   - Below 64 columns, each description goes on its own line under its command.
   - The tagline is printed inside an indented `Padding`.
   - Result: 36 lines at 44 columns.
4. **Files:** `rewind/render.py`.
5. **Test:** `test_wordmark_fits_every_width_and_falls_back_below_45` and `test_narrow_terminal_never_overflows` check widths. No test asserts a line count at narrow widths.
6. **Commit:** `b903d1e`.

<a id="b12-keep-alive-requests-attributed-to-each-other"></a>
### B12. Keep-alive requests attributed to each other
- **Observed** (commit msg): requests sent over one keep-alive connection were attributed to one another.
- **Explanation** (commit msg and the comment in `recorder/recorder.js`; not demonstrated separately): Node's `HTTPINCOMINGMESSAGE` async resource is per connection, so requests on the same socket shared one anchor.
- **What the regression test proves:** three POSTs over one keep-alive socket each get a distinct `REWIND_REQUEST` anchor, and each request's log has exactly its own request on its async ancestry. It checks the fixed behaviour, not the Node.js explanation.
- **Fix:** a per-request `AsyncResource('REWIND_REQUEST')`; the `req`/`res` events run in its scope.
- **Files:** `recorder/recorder.js`.
- **Test:** `test_keepalive_requests_get_distinct_anchors`.
- **Commit:** `fe853b2`.

<a id="b13-nondeterministic-http-date-cache-timer-in-diff"></a>
### B13. Nondeterministic HTTP date-cache timer in `diff`
- **Observed** (commit msg): diffs of two good runs diverged.
- **Root cause** (commit msg): Node's HTTP date-cache timer fires nondeterministically.
- **Fix:** callbacks with no observable effect are excluded from the steps compared.
- **Files:** `rewind/analysis.py`.
- **Test:** `test_diff_of_two_good_runs_has_no_divergence`.
- **Commit:** `a1b9988`.

<a id="b14-diff-diverged-on-writes-watched-in-only-one-run"></a>
### B14. `diff` diverged on writes watched in only one run
- **Observed** (commit msg): a good run without `--watch` diverged from a watched bad run on write steps alone.
- **Fix:** writes are compared only for variables watched in both runs.
- **Files:** `rewind/analysis.py`.
- **Test:** `test_diff_ignores_writes_watched_in_only_one_run`.
- **Commit:** `ab02a7b`.

<a id="b15-piping-output-to-head-crashed-with-einval-on-windows"></a>
### B15. Piping output to `head` crashed with EINVAL on Windows
- **Observed** (commit msg): piping into `head` crashed.
- **Fix:** `cli.main()` exits quietly on `BrokenPipeError` or `OSError` errno 22.
- **Files:** `rewind/cli.py`.
- **Test:** none.
- **Commit:** `ab02a7b`.
- **Related (M7):** PowerShell's `Select-Object -First N` gives exit code 255 because PowerShell stops the pipeline. That is not a Rewind defect.

<a id="b16-runs-table-wrapped-the-command-column"></a>
### B16. `runs` table wrapped the command column
- **Observed and fixed** (commit msg): the `runs` table no longer wraps the command column.
- **Files:** `rewind/render.py`.
- **Test:** none.
- **Commit:** `ab02a7b`.

<a id="b17-readme-install-on-ubuntu"></a>
### B17. README install on Ubuntu
1. **Observed** (WSL2 Ubuntu 24.04):
   - `python` doesn't exist; the interpreter is `python3`.
   - `python3 -m venv` fails without the `python3-venv` package, because `ensurepip` is missing.
2. **Root cause (confirmed):** Ubuntu's Python packaging.
3. **Fix:** README note (`python3`, `sudo apt install python3-venv`).
4. **Commit:** `6320276`.
5. **Caveat:** the documented `apt` route itself was not run (no sudo). The Linux test run used `venv --without-pip` and pip run from its wheel instead.

### Smaller issues caught during the redesign, before committing
Recorded in this session only; none of these was ever committed:
- the landing "here" column truncated to "…" by a long path
- a doubled ✖ in the record summary
- `[run]` and `[i]` swallowed as Rich markup in mockups
- `render.fail()` not escaping its text (now escapes it)
- the recording console capturing the transient spinner's last frame (a capture artefact only; on a real TTY the spinner erases itself, verified in tmux)
