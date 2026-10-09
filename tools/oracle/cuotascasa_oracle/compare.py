"""Esquema privado (FORMAT.md §9) y comparación fila por fila (§8.3)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

from .errors import InvalidInputError, OracleError
from .fixture import ROW_FIELDS
from .money import ZERO, calc_context, fmt_amount
from .schedule import build_schedule

HEADER = ",".join(ROW_FIELDS)
_AMOUNT = re.compile(r"(0|[1-9][0-9]*)\.[0-9]{2}")
_INT = re.compile(r"[1-9][0-9]*")
_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
AMOUNT_FIELDS = (
    "opening",
    "level",
    "interest",
    "insurance",
    "capital",
    "fixedCharges",
    "prepayment",
    "commission",
    "total",
    "closing",
)


class CompareError(OracleError):
    """Error de formato con uno de los códigos cerrados de §8.3 (sin valores)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class CompareResult:
    all_matched: bool
    mismatched_rows: int
    max_abs_diff: str


def read_terms(path: Path) -> dict:
    """`a-terms.json`: exactamente la forma de `inputs`; devuelve las condiciones."""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise CompareError("terms-invalid") from error
    if (
        not isinstance(raw, dict)
        or set(raw) != {"terms", "events"}
        or not isinstance(raw["events"], list)
    ):
        raise CompareError("terms-invalid")
    return raw


def _parse_row(line: str) -> dict:
    cells = line.split(",")
    if len(cells) != len(ROW_FIELDS):
        raise CompareError("csv-row")
    row = dict(zip(ROW_FIELDS, cells, strict=True))
    if not _INT.fullmatch(row["k"]):
        raise CompareError("csv-row")
    if not _DATE.fullmatch(row["dueDate"]):
        raise CompareError("csv-row")
    try:
        date(int(row["dueDate"][:4]), int(row["dueDate"][5:7]), int(row["dueDate"][8:10]))
    except ValueError as error:
        raise CompareError("csv-row") from error
    for name in AMOUNT_FIELDS:
        if not _AMOUNT.fullmatch(row[name]):
            raise CompareError("csv-row")
    components = row["insuranceComponents"]
    parts = components.split(";") if components else []
    if not all(_AMOUNT.fullmatch(part) for part in parts):
        raise CompareError("csv-row")
    if row["paid"] not in ("true", "false"):
        raise CompareError("csv-row")
    row["k"] = int(row["k"])
    row["insuranceComponents"] = parts
    row["paid"] = row["paid"] == "true"
    return row


def read_expected(path: Path) -> list[dict]:
    """`a-expected.csv`: encabezado exacto, sin BOM, sin comillas ni líneas vacías."""
    data = path.read_bytes()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise CompareError("csv-header") from error
    lines = text.replace("\r\n", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if not lines or lines[0] != HEADER:  # un BOM queda dentro de lines[0]
        raise CompareError("csv-header")
    return [_parse_row(line) for line in lines[1:]]


def _diff(expected: dict, computed: dict) -> tuple[bool, Decimal]:
    """(la fila difiere, mayor diferencia de monto) para dos filas presentes."""
    differs = any(expected[name] != computed[name] for name in ROW_FIELDS)
    biggest = ZERO
    names = [(expected[name], computed[name]) for name in AMOUNT_FIELDS]
    if len(expected["insuranceComponents"]) == len(computed["insuranceComponents"]):
        names += list(
            zip(expected["insuranceComponents"], computed["insuranceComponents"], strict=True)
        )
    for left, right in names:
        biggest = max(biggest, abs(Decimal(left) - Decimal(right)))
    return differs, biggest


def compare(terms_path: Path, expected_path: Path) -> CompareResult:
    raw = read_terms(terms_path)
    expected_rows = read_expected(expected_path)
    try:
        computed = build_schedule(raw["terms"], raw["events"])["rows"]
    except InvalidInputError as error:
        raise CompareError("terms-invalid") from error
    mismatched = 0
    with calc_context():
        biggest = ZERO
        for position in range(max(len(expected_rows), len(computed))):
            if position >= len(expected_rows) or position >= len(computed):
                mismatched += 1
                continue
            differs, row_max = _diff(expected_rows[position], computed[position])
            mismatched += differs
            biggest = max(biggest, row_max)
        max_text = fmt_amount(biggest)
    return CompareResult(mismatched == 0, mismatched, max_text)
