# pytest plugin: which tests spawn a real Node.js process (directly, or through the `rewind record` CLI)?
import json, os, subprocess
_real = subprocess.Popen.__init__
_current = {"id": None}
spawned = set()
def _init(self, args, *a, **kw):
    argv = [str(x) for x in (args if isinstance(args, (list, tuple)) else [args])]
    if _current["id"] and any(os.path.basename(x).lower().removesuffix(".exe") == "node" or x == "record" for x in argv):
        spawned.add(_current["id"])
    return _real(self, args, *a, **kw)
subprocess.Popen.__init__ = _init
def pytest_runtest_setup(item): _current["id"] = item.nodeid
def pytest_runtest_teardown(item): _current["id"] = None
def pytest_terminal_summary(terminalreporter):
    passed = [r.nodeid for r in terminalreporter.stats.get("passed", []) if r.when == "call"]
    out = {"passed": len(passed), "real_process": len([p for p in passed if p in spawned])}
    terminalreporter.write_line("NODESPY " + json.dumps(out))
