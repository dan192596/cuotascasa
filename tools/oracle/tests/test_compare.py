"""`compare` y su esquema privado (FORMAT.md §8.3-§8.4, §9), con archivos sintéticos."""

from __future__ import annotations

import copy
import json
import re
import subprocess
import sys

import pytest
from helpers import ORACLE_DIR

from cuotascasa_oracle import cli, generator
from cuotascasa_oracle.cli import main
from cuotascasa_oracle.fixture import ROW_FIELDS

HEADER = ",".join(ROW_FIELDS)
TERMS = {
    "principal": "123456.78",
    "termMonths": 137,  # recuento de filas distintivo: nunca debe aparecer en la salida
    "disbursementDate": "2026-01-01",
    "firstDueDate": "2026-02-28",
    "paymentDay": "END_OF_MONTH",
    "currency": "GTQ",
    "interestRate": "0.0700",
    "insuranceRates": ["0.01", "0.0026"],
    "fixedCharges": [{"label": "IUSI", "amount": "77.31", "effectiveFrom": "2026-02-28"}],
    "roundingProfile": "FHA_GT_V1",
}
ROW_COUNT = TERMS["termMonths"]


def csv_line(row: dict) -> str:
    cells = []
    for name in ROW_FIELDS:
        value = row[name]
        if name == "insuranceComponents":
            value = ";".join(value)
        elif name == "paid" and isinstance(value, bool):
            value = "true" if value else "false"
        cells.append(str(value))
    return ",".join(cells)


@pytest.fixture
def private(tmp_path):
    """Archivos del esquema privado, sintéticos, bajo tmp_path."""
    from cuotascasa_oracle.schedule import build_schedule

    rows = build_schedule(TERMS)["rows"]
    assert len(rows) == ROW_COUNT

    def write(rows_=None, terms=TERMS, events=(), header=HEADER, eol="\n", extra=""):
        terms_path = tmp_path / "a-terms.json"
        csv_path = tmp_path / "a-expected.csv"
        terms_path.write_text(
            json.dumps({"terms": terms, "events": list(events)}), encoding="utf-8"
        )
        body = [csv_line(r) for r in (rows if rows_ is None else rows_)]
        csv_path.write_bytes((eol.join([header, *body]) + eol + extra).encode("utf-8"))
        return ["compare", "--terms", str(terms_path), "--expected", str(csv_path)]

    write.rows = rows
    write.tmp_path = tmp_path
    return write


def run(argv, capsys):
    code = main(argv)
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def test_all_rows_match(private, capsys):
    code, out, err = run(private(), capsys)
    assert (code, err) == (0, "")
    assert out == "allRowsMatched: yes\nmismatchedRows: 0\nmaxAbsDiff: 0.00\n"


def test_crlf_is_accepted_on_read(private, capsys):
    code, out, _ = run(private(eol="\r\n"), capsys)
    assert code == 0 and out.startswith("allRowsMatched: yes")


def test_differing_row_is_counted_with_max_diff(private, capsys):
    rows = copy.deepcopy(private.rows)
    rows[10]["interest"] = f"{float(rows[10]['interest']) + 12.34:.2f}"
    rows[20]["capital"] = f"{float(rows[20]['capital']) - 0.05:.2f}"
    code, out, _ = run(private(rows), capsys)
    assert code == 1
    assert out == "allRowsMatched: no\nmismatchedRows: 2\nmaxAbsDiff: 12.34\n"


def test_missing_and_extra_rows_count_as_mismatched(private, capsys):
    code, out, _ = run(private(private.rows[:-3]), capsys)
    assert code == 1
    assert out == "allRowsMatched: no\nmismatchedRows: 3\nmaxAbsDiff: 0.00\n"
    extra = copy.deepcopy(private.rows[-1])
    extra["k"] = ROW_COUNT + 1
    code, out, _ = run(private([*private.rows, extra]), capsys)
    assert (code, out.splitlines()[1]) == (1, "mismatchedRows: 1")


def test_non_amount_fields_count_as_a_mismatch_but_not_in_max_diff(private, capsys):
    rows = copy.deepcopy(private.rows)
    rows[4]["paid"] = True
    rows[5]["dueDate"] = "2031-01-31"
    code, out, _ = run(private(rows), capsys)
    assert out == "allRowsMatched: no\nmismatchedRows: 2\nmaxAbsDiff: 0.00\n"
    assert code == 1


def test_output_is_three_labeled_lines_and_never_the_row_count(private, capsys):
    rows = copy.deepcopy(private.rows)
    rows[0]["total"] = "9999.99"
    for argv in (private(), private(rows)):
        _, out, err = run(argv, capsys)
        lines = out.splitlines()
        assert len(lines) == 3 and err == ""
        assert re.fullmatch(r"allRowsMatched: (yes|no)", lines[0])
        assert re.fullmatch(r"mismatchedRows: \d+", lines[1])
        assert re.fullmatch(r"maxAbsDiff: \d+\.\d{2}", lines[2])
        assert re.findall(r"\d+\.\d+", out) == [lines[2].split(": ")[1]]
        assert str(ROW_COUNT) not in out


@pytest.mark.parametrize(
    "header",
    [
        HEADER.replace("k,", "n,", 1),
        HEADER + ",extra",
        HEADER.rsplit(",", 1)[0],
        ",".join(reversed(HEADER.split(","))),
    ],
)
def test_other_header_is_rejected(private, capsys, header):
    code, out, err = run(private(header=header), capsys)
    assert (code, out, err) == (2, "", "error: csv-header\n")


def test_bom_and_empty_file_are_rejected_as_header(private, capsys):
    argv = private()
    path = private.tmp_path / "a-expected.csv"
    path.write_bytes(b"\xef\xbb\xbf" + path.read_bytes())
    assert run(argv, capsys)[2] == "error: csv-header\n"
    path.write_bytes(b"")
    assert run(argv, capsys)[2] == "error: csv-header\n"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda rows: rows[0].update(opening="12345.6"),
        lambda rows: rows[0].update(k="x"),
        lambda rows: rows[0].update(dueDate="28/02/2026"),
        lambda rows: rows[0].update(paid="maybe"),
        lambda rows: rows[0].update(insuranceComponents=["1.00", "2.0"]),
    ],
)
def test_malformed_row_is_csv_row(private, capsys, mutate):
    rows = copy.deepcopy(private.rows)
    mutate(rows)
    argv = private(rows)
    code, out, err = run(argv, capsys)
    assert (code, out, err) == (2, "", "error: csv-row\n")


def test_blank_line_and_wrong_field_count_are_csv_row(private, capsys):
    assert run(private(extra="\n"), capsys)[2] == "error: csv-row\n"
    assert run(private(extra="1,2,3\n"), capsys)[2] == "error: csv-row\n"
    assert run(private(extra='"a",b\n'), capsys)[2] == "error: csv-row\n"


def test_invalid_terms_exit_with_terms_invalid_and_no_values(private, capsys):
    bad = dict(TERMS, firstDueDate="2026-03-15")  # END_OF_MONTH con día 15
    code, out, err = run(private(terms=bad), capsys)
    assert (code, out, err) == (2, "", "error: terms-invalid\n")
    code, out, err = run(private(terms=dict(TERMS, extra=1)), capsys)
    assert err == "error: terms-invalid\n"
    code, out, err = run(private(events=[{"id": "ev-01"}]), capsys)
    assert err == "error: terms-invalid\n"
    argv = private()
    (private.tmp_path / "a-terms.json").write_text("{not json", encoding="utf-8")
    assert run(argv, capsys)[2] == "error: terms-invalid\n"


def test_first_disbursement_after_first_due_date_is_valid(private, capsys):
    terms = dict(TERMS, disbursementDate="2027-01-01")
    code, out, _ = run(private(terms=terms), capsys)
    assert code == 0


def test_missing_file_and_bad_usage_are_usage_errors(tmp_path, capsys):
    missing = [
        "compare",
        "--terms",
        str(tmp_path / "nope.json"),
        "--expected",
        str(tmp_path / "n.csv"),
    ]
    assert run(missing, capsys) == (2, "", "error: usage\n")
    assert run(["compare"], capsys) == (2, "", "error: usage\n")
    assert run([], capsys) == (2, "", "error: usage\n")
    assert run(["bogus"], capsys) == (2, "", "error: usage\n")


SHA = "0123abc"


def log_args(argv, *extra):
    return [*argv, "--log-line", *extra]


def test_log_line_format_and_privacy(private, capsys, monkeypatch):
    monkeypatch.setattr(cli, "_today", lambda: "2026-10-09")
    rows = copy.deepcopy(private.rows)
    rows[0]["total"] = "9999.99"
    ok = log_args(private(), "--sha", SHA, "--label", "a")
    code, out, err = run(ok, capsys)
    assert (code, err) == (0, "")
    assert out == "2026-10-09 · oráculo 0123abc · préstamo a · todas las filas coinciden: sí\n"
    bad = log_args(private(rows), "--sha", SHA, "--label", "b")
    code, out, err = run(bad, capsys)
    assert (code, err) == (1, "")
    assert out == "2026-10-09 · oráculo 0123abc · préstamo b · todas las filas coinciden: no\n"
    for forbidden in (str(ROW_COUNT), "mismatchedRows", "maxAbsDiff", "123456", "2026-02"):
        assert forbidden not in out.replace("2026-10-09", "")


def test_log_line_uses_todays_date_by_default(private, capsys):
    from datetime import date

    out = run(log_args(private(), "--sha", SHA, "--label", "a"), capsys)[1]
    assert re.fullmatch(
        r"\d{4}-\d{2}-\d{2} · oráculo [0-9a-f]{7,40} · préstamo [a-z]{1,8}"
        r" · todas las filas coinciden: (sí|no)\n",
        out,
    )
    assert out.startswith(date.today().isoformat())


@pytest.mark.parametrize(
    "extra",
    [
        [],
        ["--sha", SHA],
        ["--label", "a"],
        ["--sha", "ABCDEF1", "--label", "a"],
        ["--sha", "abc12", "--label", "a"],
        ["--sha", "g" * 7, "--label", "a"],
        ["--sha", "a" * 41, "--label", "a"],
        ["--sha", SHA, "--label", "A"],
        ["--sha", SHA, "--label", "abcdefghi"],
        ["--sha", SHA, "--label", "a1"],
    ],
)
def test_log_line_requires_valid_sha_and_label(private, capsys, extra):
    code, out, err = run(log_args(private(), *extra), capsys)
    assert (code, out, err) == (2, "", "error: usage\n")


def test_sha_and_label_without_log_line_are_usage_errors(private, capsys):
    argv = [*private(), "--sha", SHA, "--label", "a"]
    assert run(argv, capsys) == (2, "", "error: usage\n")


def test_python_dash_m_entry_point(private):
    argv = private()
    result = subprocess.run(
        [sys.executable, "-m", "cuotascasa_oracle", *argv],
        cwd=ORACLE_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert result.stdout == "allRowsMatched: yes\nmismatchedRows: 0\nmaxAbsDiff: 0.00\n"


def test_compare_agrees_with_a_generated_fixture(tmp_path, capsys):
    fixture = generator.build_fixture("core", 5, 12)
    (tmp_path / "a-terms.json").write_text(json.dumps(fixture["inputs"]), encoding="utf-8")
    lines = [HEADER, *(csv_line(row) for row in fixture["expected"]["rows"])]
    (tmp_path / "a-expected.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    argv = [
        "compare",
        "--terms",
        str(tmp_path / "a-terms.json"),
        "--expected",
        str(tmp_path / "a-expected.csv"),
    ]
    assert run(argv, capsys)[0] == 0
