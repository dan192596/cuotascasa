"""CODEOWNERS covers exactly the paths of docs/plan/frozen-files.json (one '/<path> @<owner>' line each).

Usage: python3 -m unittest discover -s .github/scripts -p 'test_*.py' -v
"""
import json
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


class CodeOwners(unittest.TestCase):
    def test_every_frozen_path_has_one_owner_line(self):
        frozen = [e["path"] for e in json.loads((REPO_ROOT / "docs/plan/frozen-files.json").read_text(encoding="utf-8"))]
        lines = [
            line.split()
            for line in (REPO_ROOT / ".github/CODEOWNERS").read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.startswith("#")
        ]
        self.assertEqual([parts[0] for parts in lines], [f"/{path}" for path in frozen])
        self.assertTrue(all(len(parts) == 2 and parts[1].startswith("@") for parts in lines), lines)


if __name__ == "__main__":
    unittest.main()
