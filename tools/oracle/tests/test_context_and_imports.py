"""Contexto decimal de FORMAT.md §2 y ausencia de terceros y de módulos de red."""

from __future__ import annotations

import ast
import decimal
import json
import subprocess
import sys
from pathlib import Path

from helpers import ORACLE_DIR, load_core_example_cases, terms_from_example

from cuotascasa_oracle import money, schedule

PACKAGE_DIR = ORACLE_DIR / "cuotascasa_oracle"
NETWORK_MODULES = {
    "socket",
    "ssl",
    "http",
    "urllib",
    "ftplib",
    "smtplib",
    "poplib",
    "imaplib",
    "telnetlib",
    "socketserver",
    "xmlrpc",
    "asyncio",
    "selectors",
    "webbrowser",
}


def test_decimal_context_equals_format_md():
    assert money.CONTEXT.prec == 34
    assert money.CONTEXT.rounding == decimal.ROUND_HALF_EVEN


def test_calculation_runs_under_the_format_md_context(monkeypatch):
    seen = []
    original = schedule._normal_period

    def spy(*args, **kwargs):
        context = decimal.getcontext()
        seen.append((context.prec, context.rounding))
        return original(*args, **kwargs)

    monkeypatch.setattr(schedule, "_normal_period", spy)
    # Un contexto ajeno activo en el llamador no debe filtrarse al cálculo.
    with decimal.localcontext() as outer:
        outer.prec = 5
        outer.rounding = decimal.ROUND_DOWN
        _, case = load_core_example_cases()[0]
        schedule.build_schedule(terms_from_example(case["terms"]))
    assert seen
    assert set(seen) == {(34, decimal.ROUND_HALF_EVEN)}


def test_half_up_2_rounds_half_away_from_zero():
    with money.calc_context():
        assert str(money.half_up_2(decimal.Decimal("0.005"))) == "0.01"
        assert str(money.half_up_2(decimal.Decimal("-0.005"))) == "-0.01"
        assert str(money.half_up_2(decimal.Decimal("8.785"))) == "8.79"


def _imported_top_level_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            names.add(node.module.split(".")[0])
    return names


def test_package_imports_only_stdlib_and_no_network_modules():
    imported = set()
    for path in PACKAGE_DIR.rglob("*.py"):
        imported |= _imported_top_level_modules(path)
    assert imported
    assert imported <= set(sys.stdlib_module_names) | {"cuotascasa_oracle"}
    assert not imported & NETWORK_MODULES


def test_runtime_import_loads_no_third_party_or_network_module():
    code = (
        "import json, sys\n"
        "sys.path.insert(0, sys.argv[1])\n"
        "import cuotascasa_oracle.cli\n"
        "print(json.dumps(sorted({name.split('.')[0] for name in sys.modules})))"
    )
    out = subprocess.run(
        [sys.executable, "-I", "-c", code, str(ORACLE_DIR)],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    loaded = set(json.loads(out))
    third_party = (
        loaded - set(sys.stdlib_module_names) - {"cuotascasa_oracle", "__main__", "sitecustomize"}
    )
    assert not third_party
    assert not loaded & NETWORK_MODULES
