"""Capture preflight: refuses a dirty Rewind checkout.  Run: <rewind>/.venv/Scripts/python -m pytest capture -q"""
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import capture  # noqa: E402


def fake_checkout(tmp_path: Path) -> Path:
    (tmp_path / "rewind").mkdir()
    (tmp_path / "rewind" / "cli.py").write_text("")
    (tmp_path / "recorder" / "node_modules" / "acorn").mkdir(parents=True)
    (tmp_path / ".gitignore").write_text("node_modules/\n")
    for cmd in (["init", "-q"], ["add", "."], ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x"]):
        subprocess.run(["git", "-C", str(tmp_path), *cmd], check=True)
    return tmp_path


def test_clean_checkout_passes(tmp_path):
    repo = fake_checkout(tmp_path)
    assert capture.preflight(repo) == capture.git(repo, "rev-parse", "HEAD").strip()


@pytest.mark.parametrize("dirty", ["untracked", "modified"])
def test_dirty_checkout_is_refused(tmp_path, dirty):
    repo = fake_checkout(tmp_path)
    if dirty == "untracked":
        (repo / "stray.txt").write_text("x")
    else:
        (repo / "rewind" / "cli.py").write_text("changed")
    with pytest.raises(SystemExit, match="uncommitted changes"):
        capture.preflight(repo)


def test_not_a_checkout_is_refused(tmp_path):
    with pytest.raises(SystemExit, match="not a Rewind checkout"):
        capture.preflight(tmp_path)
