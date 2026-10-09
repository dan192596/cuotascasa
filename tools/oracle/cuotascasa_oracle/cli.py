"""CLI: `python -m cuotascasa_oracle` (FORMAT.md §8)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

from . import GENERATOR_VERSION, generator
from .compare import CompareError, compare
from .errors import OracleError

_SHA = re.compile(r"[0-9a-f]{7,40}")
_LABEL = re.compile(r"[a-z]{1,8}")


class CliError(Exception):
    """Termina con código 2 e imprime una sola línea `error: <código>`."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class _Parser(argparse.ArgumentParser):
    def error(self, message: str):  # noqa: ARG002 - nunca se imprimen valores del usuario
        raise CliError("usage")


def _build_parser() -> argparse.ArgumentParser:
    parser = _Parser(prog="python -m cuotascasa_oracle", add_help=True)
    sub = parser.add_subparsers(dest="command", required=True, parser_class=_Parser)
    gen = sub.add_parser("generate")
    gen.add_argument("--profile", required=True)
    gen.add_argument("--seed", required=True, type=int)
    gen.add_argument("--out", required=True, type=Path)
    regen = sub.add_parser("regenerate")
    regen.add_argument("--manifest", required=True, type=Path)
    cmp_ = sub.add_parser("compare")
    cmp_.add_argument("--terms", required=True, type=Path)
    cmp_.add_argument("--expected", required=True, type=Path)
    cmp_.add_argument("--log-line", action="store_true")
    cmp_.add_argument("--sha")
    cmp_.add_argument("--label")
    return parser


def _today() -> str:
    return date.today().isoformat()


def _generate(args: argparse.Namespace) -> int:
    if args.profile not in generator.PROFILES or not 0 <= args.seed <= generator.SEED_MAX:
        raise CliError("usage")
    generator.generate(args.profile, args.seed, args.out)
    return 0


def _regenerate(args: argparse.Namespace) -> int:
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        profiles = manifest["profiles"]
        plan = [
            (name, entry["seed"], entry["generatorVersion"]) for name, entry in profiles.items()
        ]
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        raise CliError("manifest") from error
    for name, _seed, version in plan:
        if (
            name not in generator.PROFILES
            or not isinstance(version, int)
            or version > GENERATOR_VERSION
        ):
            raise CliError("manifest")
    for name, seed, version in plan:
        if version < GENERATOR_VERSION:
            print(f"regeneration pending: {name}")
        else:
            generator.generate(name, seed, args.manifest.parent)
    return 0


def _compare(args: argparse.Namespace) -> int:
    if args.log_line:
        if not (
            args.sha and _SHA.fullmatch(args.sha) and args.label and _LABEL.fullmatch(args.label)
        ):
            raise CliError("usage")
    elif args.sha is not None or args.label is not None:
        raise CliError("usage")
    try:
        result = compare(args.terms, args.expected)
    except CompareError as error:
        raise CliError(error.code) from error
    except OSError as error:
        raise CliError("usage") from error
    if args.log_line:
        verdict = "sí" if result.all_matched else "no"
        print(
            f"{_today()} · oráculo {args.sha} · préstamo {args.label}"
            f" · todas las filas coinciden: {verdict}"
        )
    else:
        print(f"allRowsMatched: {'yes' if result.all_matched else 'no'}")
        print(f"mismatchedRows: {result.mismatched_rows}")
        print(f"maxAbsDiff: {result.max_abs_diff}")
    return 0 if result.all_matched else 1


def main(argv: list[str] | None = None) -> int:
    try:
        args = _build_parser().parse_args(argv)
        handlers = {"generate": _generate, "regenerate": _regenerate, "compare": _compare}
        return handlers[args.command](args)
    except CliError as error:
        print(f"error: {error.code}", file=sys.stderr)
        return 2
    except OracleError:
        print("error: usage", file=sys.stderr)
        return 2
