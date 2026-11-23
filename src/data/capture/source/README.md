# rewind

**Causal time-travel debugging for Node.js.** Record a run once, then ask *why* something happened, not just *what* broke.

A stack trace tells you where an exception surfaced. Rewind tells you which request it belonged to, which callback scheduled the failing work and from where, what other requests were doing meanwhile, who last changed the state it read, and where a failing run first diverged from a good one. Every statement it makes is labelled:

| | level | meaning |
|---|---|---|
| `●` | **observed** | a recorded event, reported as-is |
| `◆` | **derived** | computed deterministically from recorded events (ancestry, ordering, attribution) |
| `?` | **inferred** | a heuristic explanation, always citing the observed/derived evidence behind it |

`--evidence` prints the event sequence numbers behind every line.

## Install

Requires Node.js ≥ 20 and Python ≥ 3.12 (developed on Node 24 and Python 3.15 on Windows; the test suite also passes on Ubuntu 24.04 with Python 3.12).

On Ubuntu/Debian the interpreter is `python3`, and `venv` needs the `python3-venv` package (`sudo apt install python3-venv`).

```sh
python -m venv .venv
.venv/Scripts/activate      # Windows PowerShell   (Git Bash: source .venv/Scripts/activate; Linux/macOS: source .venv/bin/activate)
pip install -e ".[dev]"
npm install --prefix recorder                         # only needed for --watch
```

## Thirty-second tour

```sh
rewind record --label bad --watch currentCart -- node demo/traffic.js
rewind why bad                 # the causal story of the crash
rewind timeline bad            # requests, logs, writes, errors in order
rewind tree bad                # who scheduled whom
rewind record --label good --watch currentCart -- node demo/traffic.js --sequential
rewind diff good bad           # where the two executions part ways
```

## Commands

| command | what it does |
|---|---|
| `rewind record [-l LABEL] [-w VAR,...] -- node app.js [args]` | runs the program with the recorder preloaded, stores the run, passes the exit code through. `rewind record app.js` also works |
| `rewind runs` | recorded runs, newest first |
| `rewind timeline [RUN] [-r N] [-k kinds] [-c] [--raw]` | the run's story; `-r` one request, `-k log,http,error,mutation`, `-c` adds every user callback firing, `--raw` every recorded event |
| `rewind tree [RUN] [-r N] [--full]` | async causality tree; quiet branches pruned and internal hops folded unless `--full` |
| `rewind why [RUN] [-e N] [-s SEQ] [--evidence]` | investigates error N (default the first), or any event by seq |
| `rewind diff A B [--all] [--evidence]` | aligns two runs and finds the first divergence |

`RUN` is a label, an id prefix, `last` (the default), or `-N` (Nth newest).

## The demo: the Phantom Discount

`demo/checkout.js` is a small order service. `demo/traffic.js` starts it and sends a health check plus three orders. With `--sequential` it waits for each order to finish before sending the next.

```sh
node demo/traffic.js
#   TypeError: Cannot read properties of undefined (reading 'price')
#       at applyDiscount (demo/checkout.js:23)
#       at Timeout.paymentConfirmed (demo/checkout.js:18)
```

Plain Node says nothing about *which* order failed, or why. Run it under rewind:

1. `rewind record -l bad -w currentCart -- node demo/traffic.js`
2. `rewind timeline bad` shows the three orders interleaving and three writes to `currentCart` from three different requests. It also ties a log line that is easy to miss next to the crash to its request: **order A-101 (#2) was charged $161 instead of $128.** The bug has a second, silent victim.
3. `rewind why bad` gives the crash's story:
   - ● thrown in `applyDiscount` at `demo/checkout.js:23`, inside the `paymentConfirmed` timer created in `chargePayment`
   - ◆ belongs to request #3 (order B-202)
   - ◆ the failing line reads watched variable `currentCart`
   - ● the last write before the crash was `currentCart = {order: "C-303", …}` at `checkout.js:12`
   - ◆ #3 set `currentCart` itself, then request #4 overwrote it, and only then did #3 read it
   - ? likely root cause: a race on shared module-level state
4. `rewind why bad --seq <the A-101 log seq>` gives the silent overcharge's story. Here the overwrite by #3 is *derived*, but the race is explicitly marked *not proven*, because reads are not recorded.
5. Record without `--watch` and run `why` again. Rewind will not claim a mutation it didn't see. It only suspects shared state, and tells you to re-record with `--watch currentCart`.
6. `rewind record -l good -w currentCart -- node demo/traffic.js --sequential`, then `rewind diff good bad`. (Without `-w` on both runs, writes are left out of the comparison and the shared prefix ends at #2's `loadCart` callback instead.) The runs are identical up to #2's write to `currentCart`. Next, the good run lets #2's payment finish, but in the bad run #3 arrives first. The code path is the same; only the interleaving differs.
7. `git apply demo/fix.patch` (cart passed per request), re-record, and `rewind why` reports no errors. All three totals are correct.

## What `--watch` captures, exactly

`--watch currentCart` rewrites CommonJS files as they load, so that every *syntactic* write to a watched variable declared at the top level of that file is recorded with its location, the request that made it, and JSON previews of the before and after values (200 chars max). Covered writes:
- reassignment, property and element assignment, compound operators
- `++` / `--` and `delete`
- calls to known mutating methods: `push pop shift unshift splice sort reverse fill copyWithin set delete clear add`

It does **not** see:
- writes through aliases (`const c = currentCart; c.x = 1`)
- destructuring targets (`[currentCart.a] = v`)
- files under `node_modules`, and ESM (`.mjs` / `"type": "module"`) files
- mutations made inside functions the value is passed to
- same-named local variables (skipped on purpose)

Line numbers in your stack traces are unchanged. A variable written more than `REWIND_MUT_CAP` times (default 10 000) keeps counting but stops recording values. The AST dependencies load only when `--watch` is used.

## Other limitations

- HTTP attribution covers Node's `http` server (including keep-alive). `https`, `http2`, worker threads and child processes are not instrumented.
- Unhandled rejections are captured in Node's default `--unhandled-rejections=throw` mode only.
- A run killed with SIGKILL loses up to its last 256 events. Error events are flushed immediately, so they survive. Such runs are marked `crashed`.
- Rewind records the causal skeleton of a run: async lifecycle, requests, logs, errors and watched writes. It does not capture every function call or variable value, and it cannot step backwards through the program.

## Configuration

| env | default | |
|---|---|---|
| `REWIND_HOME` | `./.rewind` | database (`rewind.db`) and raw NDJSON recordings (`runs/`) |
| `REWIND_PROMISE_STACKS` | `1` | `0` skips promise creation stacks (about 1.9× → 1.1× overhead; loses `async` function names in chains) |
| `REWIND_MUT_CAP` | `10000` | recorded writes per watched variable |
| `NO_COLOR` | unset | any value turns colour off; layout and the ● ◆ ? marks stay. Piped output never has colour |

## How it works

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The experiments behind each design decision are in [spikes/RESULTS.md](spikes/RESULTS.md). The development history, bug record and test evidence are in [docs/handover/](docs/handover/HANDOVER.md).

```sh
pytest          # 54 tests; most run real node processes end to end
```
