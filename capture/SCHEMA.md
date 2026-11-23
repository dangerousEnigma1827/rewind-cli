# Capture artifacts: the contract between `capture.py` and the site

`schema_version` 1. Written by `capture/capture.py` into `src/data/capture/`. The site reads only these committed files.
It never runs Rewind, Python or Node. A re-capture changes ids, seqs, times and counts, but not the structure or findings (plan §7.5).

```
npm run capture [-- --rewind <clean checkout>]     # default ../rewind; uses <checkout>/.venv
<checkout>/.venv/Scripts/python -m pytest capture  # preflight tests (dirty checkout is refused)
```

Requirements: a **clean** Rewind checkout (`git status --porcelain` empty) with its venv (`pip install -e ".[dev]"`)
and `npm install --prefix recorder`, plus `node` on PATH. Nothing is written inside the checkout. The demo is copied
from git blobs (`git show <sha>:demo/...`) into a temp workdir, and the fixed copy has `fix.patch` applied with `git apply`.
`REWIND_HOME` is `<workdir>/.rewind`. Verified on Windows 11 and on WSL Ubuntu (fresh clone, Python 3.12) on 2026-11-23.

## Files

| path | content | provenance |
|---|---|---|
| `manifest.json` | sha, versions, capture date, runs, views, widths, normalisations, pytest summary | observed (from the run) |
| `terminal/<view>.<w>.ansi` | the view as Rewind printed it, truecolor SGR, LF | observed (Rewind's own output) |
| `terminal/<view>.<w>.txt` | the same render pass without styles (Rich `export_text`) | observed |
| `terminal/plain-node.txt` | `node demo/traffic.js` stdout+stderr, in order, without Rewind | observed |
| `runs/<label>.json` | events, requests, mutations of one run | per field, below |
| `findings/why-*.json` | `investigate()` findings, causal chain, branch | `level` copied from `Finding.level` |
| `findings/diff-good-bad.json` | `diff()` tokens, opcodes, findings | derived (Rewind) |
| `findings/tree-bad*.json` | `build_tree()` for the whole run and for request #3 | derived (Rewind) |
| `source/checkout.js`, `prices.json`, `fix.patch`, `traffic.js`, `RESULTS.md`, `README.md`, `ARCHITECTURE.md`, `FEATURES_AND_LIMITATIONS.md`, `ENGINEERING_LOG.md` | verbatim from git at the sha (basename only) | authored by Rewind's author |
| `source/checkout.instrumented.js` | `recorder/instrument.js:instrument(src, file, ['currentCart']).code` | observed (tool output) |
| `source/render.json` | `render.PALETTE`, `LETTERS`, `TAGLINE`, `WORDMARK`, `WORDMARK_TIGHT` | verbatim |
| `source/repo-files.json` | `git ls-tree -r --name-only <sha>`, for file chips | observed |

### Views (`manifest.views`)
`record-{bad,nowatch,good,fixed}`, `why-bad` (`--evidence`), `why-bad-seq` (`--seq` = the A-101 log, looked up, see
`manifest.a101_log_seq`), `why-nowatch`, `timeline-bad`, `timeline-bad-r3` (`-r 3 -c`), `tree-bad`, `tree-bad-r3`,
`diff-good-bad` (`--evidence`), `runs`, `why-fixed`. Each has `command` and `runs`, the labels whose seqs it shows.
For the diff, index 0 is A and 1 is B. Widths are 110, 72 and 46. Each is a real Rich render at that console width, not a re-wrap.

- `record-*`: Rewind's `recording` line, then the child's output, then the summary. That is the order a terminal shows.
  At 72 and 46 the same `row` and `secs` go through `render.recording` and `render.run_summary`.
- `record-*.110.ansi` contains `ESC[?25l ESC[?25h`: the transient "indexing" spinner hides and re-shows the cursor.
  It prints no text. The parser ignores non-SGR CSI.

### `runs/<label>.json`
- `t` is **microseconds** since the recorder started. Rewind displays `t / 1000` as ms.
- `events[]` holds the story, every user-callback firing (`async.before`), and every `async.init` on a story event's
  causal chain. That covers every seq any view or finding can cite. Not all `event_count` events are exported.
- Fields:
  - observed: `seq t kind name aid eid data type site`;
  - derived: `request` (`Run.request_of`, the same rule as `render.timeline`) and `describe` (`Run.describe`).
- `requests[]`: `in` and `out` are observed; pairing them into one request is derived.
- `mutations[]`: `loc path op before after seq t` are observed. `writer` is derived. Previews are ≤ 200 chars, as recorded.
- There is no `read` kind. Rewind never records reads.

### Privacy normalisation
Only absolute path prefixes are changed: the temp workdirs become `…`, keeping the separator that follows
(`…\demo\checkout.js` on Windows, `…/demo/checkout.js` on Linux). Every replacement is counted in
`manifest.normalisations`. No other text is changed. `tests/integrity.test.ts` fails on any absolute path.

## Known run-to-run variation (do not present as fact)
- seq, ms, ids and event counts change on every capture.
- **Keep-alive connection grouping is not stable.** Which requests share an `HTTPINCOMINGMESSAGE` varies:
  #1+#2 in one capture, #1+#2+#4 in another. Findings, diff tokens and opcodes, per-request story and writers, and the
  `tree -r 3` shape were identical between the Windows and Linux captures.
