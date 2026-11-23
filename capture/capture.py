"""Capture real Rewind output and data for the demo website (plan §7). Independent of the site.

    "<rewind>/.venv/Scripts/python" capture/capture.py --rewind <clean rewind checkout> --out src/data/capture

Runs the real CLI against a temp copy of <rewind>/demo, renders every view with Rewind's own Rich theme in
truecolor, and writes terminal captures (ANSI + plain), structured JSON and manifest.json. Nothing is
written inside the Rewind checkout. The contract with the site is capture/SCHEMA.md.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
WIDTHS = (110, 72, 46)
WATCH = "currentCart"


# ---- preflight ------------------------------------------------------------------------------------

def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True,
                          encoding="utf-8").stdout


def preflight(rewind: Path) -> str:
    """Refuse a dirty checkout or a machine without node. Returns the checkout's full sha."""
    if not (rewind / "rewind" / "cli.py").is_file():
        sys.exit(f"capture: {rewind} is not a Rewind checkout")
    if git(rewind, "status", "--porcelain").strip():
        sys.exit(f"capture: {rewind} has uncommitted changes; capture only from a clean checkout")
    if not shutil.which("node"):
        sys.exit("capture: node is not on PATH")
    if not (rewind / "recorder" / "node_modules" / "acorn").is_dir():
        sys.exit("capture: run `npm install --prefix recorder` in the Rewind checkout (needed for --watch)")
    return git(rewind, "rev-parse", "HEAD").strip()


# ---- rendering ------------------------------------------------------------------------------------

class Capture:
    """One view rendered by Rewind's own code into a buffer: ANSI text and its plain twin from the same pass."""

    def __init__(self, render, cli, width: int):
        from rich.console import Console
        self.buf = io.StringIO()
        self.console = Console(theme=render.THEME, highlight=False, force_terminal=True, force_interactive=False,
                               legacy_windows=False, color_system="truecolor", width=width, file=self.buf,
                               record=True)
        self.render, self.cli = render, cli

    @contextmanager
    def active(self):
        old = self.render.console, self.cli.console
        self.render.console = self.cli.console = self.console
        try:
            yield self
        finally:
            self.render.console, self.cli.console = old

    def texts(self) -> tuple[str, str]:
        return lf(self.buf.getvalue()), lf(self.console.export_text(styles=False))


def lf(s: str) -> str:
    return s.replace("\r\n", "\n")


# ---- main -----------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--rewind", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args(argv)
    rewind, out = a.rewind.resolve(), a.out.resolve()
    sha = preflight(rewind)

    sys.dont_write_bytecode = True  # importing must not leave __pycache__ inside the checkout
    sys.path.insert(0, str(rewind))
    from rewind import __version__, analysis, cli, render, store
    if Path(cli.__file__).resolve().parent != rewind / "rewind":
        sys.exit(f"capture: imported rewind from {cli.__file__}, not from {rewind}")
    import rich
    from importlib.metadata import version

    tmp = Path(tempfile.mkdtemp(prefix="rewind-capture-"))
    try:
        # REWIND_HOME is <work>/.rewind: `rewind runs` then shows it as `.rewind`, as with Rewind's default home,
        # so no absolute path can reach a capture (Rich would wrap a long one past the prefix normalisation).
        work, fixed = tmp / "work", tmp / "fixed"
        home = work / ".rewind"
        for d in (work, fixed):
            (d / "demo").mkdir(parents=True)
            for name in git(rewind, "ls-tree", "--name-only", sha, "demo/").split():
                (d / name).write_bytes(show(rewind, sha, name))  # canonical LF blobs, not the worktree
        subprocess.run(["git", "apply", "--unsafe-paths", "-"], input=show(rewind, sha, "demo/fix.patch"),
                       cwd=fixed, check=True, capture_output=True)
        os.environ["REWIND_HOME"] = str(home)
        os.environ.pop("NO_COLOR", None)

        files: dict[str, str] = {}  # relative output path -> text (privacy-normalised at the end)
        node_version = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()

        # 1. plain node: what a developer normally sees
        p = subprocess.run(["node", "demo/traffic.js"], cwd=work, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        files["terminal/plain-node.txt"] = lf(p.stdout.decode("utf-8"))
        plain_exit = p.returncode

        # 2. record the four runs through the real CLI
        runs: dict[str, dict] = {}
        for label, cwd, extra in (("bad", work, ["-w", WATCH]), ("nowatch", work, []),
                                  ("good", work, ["-w", WATCH]), ("fixed", fixed, ["-w", WATCH])):
            args = ["record", "-l", label, *extra, "--", "node", "demo/traffic.js"]
            if label == "good":
                args.append("--sequential")
            runs[label] = record(cli, render, cwd, args, files, label)

        # 3. views, in colour, at every width
        db = store.connect()
        loaded = {lb: analysis.Run(store.events(db, store.resolve(db, lb)["id"]), dict(store.resolve(db, lb)))
                  for lb in runs}
        bad = loaded["bad"]
        a101 = next(e for e in bad.story if e.kind == "log" and "order A-101" in (e.name or ""))
        views = {
            "why-bad": ["why", "bad", "--evidence"],
            "why-bad-seq": ["why", "bad", "--seq", str(a101.seq)],
            "why-nowatch": ["why", "nowatch"],
            "timeline-bad": ["timeline", "bad"],
            "timeline-bad-r3": ["timeline", "bad", "-r", "3", "-c"],
            "tree-bad": ["tree", "bad"],
            "tree-bad-r3": ["tree", "bad", "-r", "3"],
            "diff-good-bad": ["diff", "good", "bad", "--evidence"],
            "runs": ["runs"],
            "why-fixed": ["why", "fixed"],
        }
        os.chdir(work)  # `runs` shows REWIND_HOME relative to cwd, and source lines resolve from each run's cwd
        commands = {}
        for name, argv_ in views.items():
            commands[name] = {"command": "rewind " + " ".join(argv_), "runs": [x for x in argv_ if x in runs]}
            for w in WIDTHS:
                c = Capture(render, cli, w)
                with c.active():
                    code = cli.app(argv_, standalone_mode=False)
                if code not in (None, 0):
                    sys.exit(f"capture: `{commands[name]['command']}` exited {code}")
                ansi, plain = c.texts()
                files[f"terminal/{name}.{w}.ansi"], files[f"terminal/{name}.{w}.txt"] = ansi, plain

        # 4. structured JSON per run, from Rewind's Python API
        for label, r in loaded.items():
            files[f"runs/{label}.json"] = dump(run_json(analysis, render, r, label))
        investigations = {
            "why-bad": investigation_json(analysis, bad, bad.errors[0]),
            "why-bad-seq": investigation_json(analysis, bad, a101),
            "why-nowatch": investigation_json(analysis, loaded["nowatch"], loaded["nowatch"].errors[0]),
        }
        for name, inv in investigations.items():
            files[f"findings/{name}.json"] = dump(inv)
        files["findings/diff-good-bad.json"] = dump(diff_json(analysis.diff(loaded["good"], bad)))
        node, pruned = analysis.build_tree(bad, bad.requests[3].anchor)
        files["findings/tree-bad-r3.json"] = dump({"run": runs["bad"]["id"], "pruned": pruned,
                                                   "root": tree_json(bad, node), "provenance": "derived"})
        node, pruned = analysis.build_tree(bad, 1)
        files["findings/tree-bad.json"] = dump({"run": runs["bad"]["id"], "pruned": pruned,
                                                "root": tree_json(bad, node), "provenance": "derived"})

        # 5. other real artifacts
        for src in ("demo/checkout.js", "demo/prices.json", "demo/fix.patch", "spikes/RESULTS.md"):
            files[f"source/{Path(src).name}"] = show(rewind, sha, src).decode("utf-8")
        files["source/checkout.instrumented.js"] = instrumented(rewind, work)
        files["source/repo-files.json"] = dump(git(rewind, "ls-tree", "-r", "--name-only", sha).split("\n")[:-1])
        files["source/render.json"] = dump({"PALETTE": render.PALETTE, "LETTERS": render.LETTERS,
                                            "TAGLINE": render.TAGLINE, "WORDMARK": render.WORDMARK,
                                            "WORDMARK_TIGHT": render.WORDMARK_TIGHT})
        pytest_line = run_pytest(rewind)

        # 6. privacy normalisation: only absolute path prefixes, each listed in the manifest
        prefixes = [(str(tmp / "work"), "<workdir>"), (str(tmp / "fixed"), "<fixed workdir>"),
                    (str(home), "<REWIND_HOME>"), (str(tmp), "<capture tmp>"), (str(Path.home()), "<user home>")]
        normalisations = []
        for path_, placeholder in prefixes:
            hits = {}
            for k, v in files.items():
                n = 0
                for form in {path_, path_.replace("\\", "/"), path_.replace("\\", "\\\\")}:  # raw, posix, JSON-escaped
                    n += v.count(form)
                    v = v.replace(form, "…")
                if n:
                    files[k], hits[k] = v, n
            if hits:
                normalisations.append({"prefix": placeholder, "replacement": "…", "files": hits})

        # 7. manifest
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "rewind": {"sha": sha, "short": sha[:7], "version": __version__,
                       "repo": "https://github.com/dangerousEnigma1827/Rewind"},
            "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "platform": {"os": platform.system(), "release": platform.release(), "node": node_version,
                         "python": platform.python_version(), "rich": version("rich"), "typer": version("typer")},
            "widths": list(WIDTHS),
            "plain_node": {"command": "node demo/traffic.js", "exit_code": plain_exit},
            "runs": {lb: {k: v for k, v in r.items() if k != "secs"} for lb, r in runs.items()},
            # terminal/<view>.<width>.{ansi,txt}; `runs` = labels whose seqs the view shows (diff: A, then B)
            "views": {**{f"record-{lb}": {"command": r["command"], "runs": [lb]} for lb, r in runs.items()}, **commands},
            "a101_log_seq": a101.seq,
            "normalisations": normalisations,
            "pytest": pytest_line,
        }
        files["manifest.json"] = dump(manifest)

        for f in out.rglob("*") if out.exists() else []:  # files only: a shell may sit in one of the dirs
            if f.is_file():
                f.unlink()
        for k, v in files.items():
            dst = out / k
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_text(v, encoding="utf-8", newline="\n")
        print(f"capture: wrote {len(files)} files to {out} from rewind@{sha[:7]}")
    finally:
        os.chdir(Path(__file__).parent)
        shutil.rmtree(tmp, ignore_errors=True)


def show(repo: Path, sha: str, path: str) -> bytes:
    return subprocess.run(["git", "-C", str(repo), "show", f"{sha}:{path}"], check=True, capture_output=True).stdout


def dump(o) -> str:
    return json.dumps(o, indent=1, ensure_ascii=False) + "\n"


def record(cli, render, cwd: Path, args: list[str], files: dict, label: str) -> dict:
    """`rewind record` through the real CLI. The child's stdout+stderr are captured in order and placed
    where a terminal would show them: after the `recording` line, before the summary."""
    import subprocess as sp
    child = {}
    real_popen = sp.Popen

    class Shim:  # cli.py calls subprocess.Popen(...); give it a pipe instead of our terminal
        def __getattr__(self, k):
            return getattr(sp, k)

        def Popen(self, cmd, **kw):
            child["at"] = len(cap.buf.getvalue()), len(cap.console.export_text(clear=False, styles=False))
            child["p"] = real_popen(cmd, stdout=sp.PIPE, stderr=sp.STDOUT, **kw)
            return child["p"]

    summary = {}
    real_summary = render.run_summary

    def spy(row, secs):
        summary.update(row=dict(row), secs=secs)
        return real_summary(row, secs)

    old_cwd, real_sub = os.getcwd(), cli.subprocess
    os.chdir(cwd)
    cap = Capture(render, cli, WIDTHS[0])
    cli.subprocess, render.run_summary = Shim(), spy
    try:
        with cap.active():
            # wait() is called by cli; drain the pipe first so a chatty child can't block
            orig_wait = real_popen.wait

            def wait(self, timeout=None):
                child["out"] = lf(self.stdout.read().decode("utf-8"))
                return orig_wait(self, timeout)
            real_popen.wait = wait
            try:
                code = cli.app(args, standalone_mode=False)
            finally:
                real_popen.wait = orig_wait
    finally:
        cli.subprocess, render.run_summary = real_sub, real_summary
        os.chdir(old_cwd)
    row = summary["row"]
    if code != row["exit_code"]:
        sys.exit(f"capture: record {label} exit {code} != recorded exit {row['exit_code']}")

    ansi, plain = cap.texts()
    (ai, pi) = child["at"]
    files[f"terminal/record-{label}.{WIDTHS[0]}.ansi"] = ansi[:ai] + child["out"] + ansi[ai:]
    files[f"terminal/record-{label}.{WIDTHS[0]}.txt"] = plain[:pi] + child["out"] + plain[pi:]
    for w in WIDTHS[1:]:  # same data through the same render functions, at the narrower widths
        c = Capture(render, cli, w)
        with c.active():
            render.recording(row["id"], " ".join(json.loads(row["cmd"])), args[args.index("-w") + 1] if "-w" in args else None)
            mid = len(c.buf.getvalue()), len(c.console.export_text(clear=False, styles=False))
            render.run_summary(row, summary["secs"])
        a2, p2 = c.texts()
        files[f"terminal/record-{label}.{w}.ansi"] = a2[:mid[0]] + child["out"] + a2[mid[0]:]
        files[f"terminal/record-{label}.{w}.txt"] = p2[:mid[1]] + child["out"] + p2[mid[1]:]
    return {"id": row["id"], "label": label, "command": "rewind " + " ".join(args), "exit_code": row["exit_code"],
            "status": row["status"], "event_count": row["event_count"], "error_count": row["error_count"],
            "watch": json.loads(row["watch"]), "secs": summary["secs"]}


# ---- structured data ------------------------------------------------------------------------------

def ctx_aid(e) -> int | None:
    return e.aid if e.kind.startswith("async.") else e.eid


def event_json(analysis, r, e) -> dict:
    out = {"seq": e.seq, "t": e.t, "kind": e.kind, "name": e.name, "aid": e.aid, "eid": e.eid,
           "request": None if e.kind.startswith("run.") else r.request_of(ctx_aid(e)), "data": e.data}
    if e.kind.startswith("async."):
        out["type"], out["site"], out["describe"] = (r.inits[e.aid].type if e.aid in r.inits else e.type,
                                                     analysis.user_frame(r.inits[e.aid].stack) if e.aid in r.inits else None,
                                                     r.describe(e.aid))
    elif e.kind in analysis.ERROR_KINDS:
        out["site"] = analysis.user_frame(e.stack)
    return out


def referenced(r, analysis) -> set[int]:
    """Seqs of every event the views and findings can cite: the story, callback firings, and every
    async.init on the causal chain of a story event."""
    seqs = {e.seq for e in r.story} | {e.seq for e in r.callback_fires()}
    for e in r.story:
        seqs |= {i.seq for i in r.chain(e.eid)}
    return seqs


def run_json(analysis, render, r, label: str) -> dict:
    keep = referenced(r, analysis)
    events = [event_json(analysis, r, e) for e in r.events if e.seq in keep]
    requests = [{"id": q.id, "name": q.inbound.name, "anchor": q.anchor,
                 "in": {"seq": q.inbound.seq, "t": q.inbound.t},
                 "out": {"seq": q.outbound.seq, "t": q.outbound.t, "status": (q.outbound.data or {}).get("status"),
                         "ms": (q.outbound.data or {}).get("ms")} if q.outbound else None}
                for q in r.requests.values()]
    mutations = [{"seq": e.seq, "t": e.t, "name": e.name, **{k: (e.data or {}).get(k) for k in ("path", "op", "loc", "before", "after")},
                  "writer": r.request_of(e.eid)} for e in r.events if e.kind == "mutation"]
    return {
        "id": r.meta["id"], "label": label, "status": r.meta["status"], "exit_code": r.meta["exit_code"],
        "watch": r.watch, "event_count": r.meta["event_count"], "story_count": len(r.story),
        "story": [e.seq for e in r.story], "callbacks": [e.seq for e in r.callback_fires()],
        "errors": [e.seq for e in r.errors],
        "events": events, "requests": requests, "mutations": mutations,
        "provenance": {
            "events[].seq,t,kind,name,aid,eid,data,type,site": "observed",
            "events[].request": "derived", "events[].describe": "derived",
            "requests[].in,out": "observed", "requests[] (pairing in/out)": "derived",
            "mutations[].loc,before,after,path,op,seq,t": "observed", "mutations[].writer": "derived",
            "event_count,story_count,story,callbacks,errors": "observed",
        },
    }


def finding_json(f) -> dict:
    d = asdict(f)  # level copied exactly from Finding.level
    return {k: d[k] for k in ("level", "text", "evidence", "run")}


def investigation_json(analysis, r, target) -> dict:
    inv = analysis.investigate(r, target)
    hops = r.user_chain(target.eid)
    return {
        "run": r.meta["id"], "target": target.seq,
        "request": inv.request.id if inv.request else None,
        "findings": [finding_json(f) for f in inv.findings],
        "chain": [{"seq": h.seq, "aid": h.aid, "type": h.type, "name": h.name, "describe": r.describe(h.aid),
                   "site": r.site(h.aid), "request": r.anchors.get(h.aid)} for h in hops],
        "branch": [e.seq for e in inv.branch],
        "provenance": {"findings[].level": "copied from Finding.level", "chain": "derived", "branch": "derived"},
    }


def diff_json(res) -> dict:
    return {
        "a": [{"token": t, "seq": e.seq} for t, e in res.a], "b": [{"token": t, "seq": e.seq} for t, e in res.b],
        "opcodes": [list(op) for op in res.opcodes], "findings": [finding_json(f) for f in res.findings],
        "provenance": {"a,b,opcodes": "derived", "findings[].level": "copied from Finding.level"},
    }


def tree_json(r, n) -> dict:
    return {"aid": n.aid, "type": n.init.type if n.init else None, "name": n.init.name if n.init else None,
            "request": r.anchors.get(n.aid), "site": r.site(n.aid) if n.init else None, "hidden": n.hidden,
            "events": [e.seq for e in n.events], "children": [tree_json(r, c) for c in n.children]}


def instrumented(rewind: Path, work: Path) -> str:
    js = ("const {instrument}=require(process.argv[1]);const fs=require('fs');"
          "process.stdout.write(instrument(fs.readFileSync(process.argv[2],'utf8'),process.argv[2],['currentCart']).code)")
    p = subprocess.run(["node", "-e", js, str(rewind / "recorder" / "instrument.js"), "demo/checkout.js"],
                       cwd=work, check=True, capture_output=True)
    return lf(p.stdout.decode("utf-8"))


def run_pytest(rewind: Path) -> str:
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    env.pop("REWIND_HOME", None)
    p = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=rewind, env=env,
                       capture_output=True, text=True, encoding="utf-8")
    line = [l for l in p.stdout.splitlines() if l.strip()][-1]
    if p.returncode != 0 or not re.search(r"\d+ passed", line):
        sys.exit(f"capture: Rewind's tests did not pass: {line}")
    return re.sub(r"\s+in [\d.]+s.*$", "", line.strip("= "))


if __name__ == "__main__":
    main()
