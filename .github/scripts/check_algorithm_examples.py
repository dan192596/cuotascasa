"""Structural check of docs/specs/algorithm-examples (W0-02 rules, run by CI since W0-06).

Usage: python3 .github/scripts/check_algorithm_examples.py REPO_ROOT [algorithm|glossary|examples|index|all]
Checks docs/algorithm.md anchors, docs/glossary.md tokens, every example JSON (including the field names of the
frozen contracts of W0-03 and W0-04) and INDEX.md, following rules 1 to 8 of the «Reglas de validación» section of
docs/specs/algorithm-examples/INDEX.md. No arithmetic: the numbers were recomputed by W0-02 with two independent
engines.
Prints 'OK: <part>' and exits 0, or one 'ERROR: …' line per problem and exits 1 (2 for an unknown part).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

EX_DIR = "docs/specs/algorithm-examples"
SCHEMA = "cuotascasa/algorithm-example@1"
DEF_RE = re.compile(r'(?m)^#+ (?:<a id="[^"]+"></a>)?\[(ALG\.[A-Z0-9_.]+)\]|\*\*\[(ALG\.[A-Z0-9_.]+)\]')
REF_RE = re.compile(r"\[(ALG\.[A-Z0-9_.]+)\]")
ANCHOR_RE = re.compile(r'<a id="([a-z0-9-]+)"></a>')
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
INT_KEYS = {"termMonths", "paymentDay", "k", "count", "installmentNumber", "installmentCount", "monthsSaved",
            "cutoffK", "year"}
BOOL_KEYS = {"synthetic", "paid", "isPayoff"}
MONEY_KEYS = {"principal", "amount", "balance", "bankInstallment", "total", "totalInstallment", "level", "opening",
              "interest", "insurance", "insuranceComponents", "capital", "fixedCharges", "closing", "prepayment",
              "commission", "prepayments", "commissions", "totalPaid", "baseTotalPaid", "reported", "projected",
              "modeled", "modeledPrevious", "modeledNext", "realDelta", "interestSaved", "netSaving", "closingK",
              "payoffAmount"}
RATE_KEYS = {"interestRate", "insuranceRates", "rate", "reportedRate", "amberLimit"}
MONEY_RE = re.compile(r"^-?\d+\.\d{2}$")
DECIMAL_RE = re.compile(r"^-?\d+(\.\d+)?$")
EVENT_LISTS = ("events", "realEvents", "scenarioEvents")
IMPLICIT = {"goalSeek": "Prepayment", "validateAgainstReportedBalance": "ReportedBalance"}

# Field names of the frozen contracts (W0-03 packages/domain, W0-04 packages/schema).
CASE_INPUTS = {"buildSchedule": {"terms", "events"},
               "buildPaths": {"terms", "realEvents", "scenarioEvents"},
               "goalSeek": {"terms", "realEvents", "scenarioEvents", "request"},
               "validateAgainstReportedBalance": {"terms", "realEvents", "reported"}}
CASE_KEYS = {"id", "operation", "description", "expected", "context"}
TERMS_KEYS = {"principal", "termMonths", "disbursementDate", "firstDueDate", "paymentDay", "currency",
              "interestRate", "insuranceRates", "fixedCharges", "roundingProfile", "rateType"}
EVENT_BASE = {"id", "type", "date"}
EVENT_FIELDS = {"ReportedBalance": ({"balance"}, {"installmentNumber", "reportedRate", "totalInstallment"}),
                "RateChange": ({"policy"}, {"interestRate", "insuranceRates", "bankInstallment"}),
                "FixedChargeChange": ({"fixedCharges"}, set()),
                "Prepayment": ({"amount", "mode"}, {"commission"}),
                "AdvanceInstallments": ({"count"}, set()),
                "ActualPayment": ({"installmentNumber", "total"}, {"breakdown"})}
BY_KIND = {"commission": {"FLAT": {"kind", "amount"}, "PERCENT": {"kind", "rate"}},
           "goal": {"FINISH_BY": {"kind", "date"}, "MAX_INSTALLMENT": {"kind", "amount"}},
           "result": {"ALREADY_MET": {"kind"}, "FOUND": {"kind", "amount", "metrics", "isPayoff"},
                      "INFEASIBLE": {"kind", "payoffAmount", "reason"}}}
SCHEDULE_KEYS = {"installmentCount", "endDate", "rows", "totals"}
NESTED = {"rows": {"k", "dueDate", "opening", "level", "interest", "insurance", "insuranceComponents", "capital",
                   "fixedCharges", "total", "closing", "prepayment", "commission", "paid"},
          "totals": {"interest", "insurance", "capital", "fixedCharges", "prepayments", "commissions", "total",
                     "totalPaid"},
          "metrics": {"currency", "interestSaved", "monthsSaved", "baseEndDate", "endDate", "baseTotalPaid",
                      "totalPaid", "netSaving"},
          "perAnchor": {"eventId", "k", "reported", "projected", "realDelta"},
          "perComponent": {"eventId", "k", "capital", "interest", "insurance", "fixedCharges"},
          "yearly": {"year", "capital", "interest", "insurance", "fixedCharges", "prepayments", "commissions", "total"},
          "original": {"installmentCount", "endDate", "totals"}}
NESTED["comparedToNoEvents"] = NESTED["metrics"]
CONTEXT_KEYS = {"goalSeek": {"k", "closingK"},
                "validateAgainstReportedBalance": {"modeledPrevious", "modeledNext", "amberLimit"}}


def slug(rule_id: str) -> str:
    return rule_id.lower().replace(".", "-").replace("_", "-")


def defined_ids(alg: str) -> list:
    return [a or b for a, b in DEF_RE.findall(alg)]


def pending_items(alg: str) -> list:
    m = re.search(r"(?ms)^## (?:<a id=\"[^\"]+\"></a>)?\[ALG\.PENDING\].*?(?=^## |\Z)", alg)
    return [int(x) for x in re.findall(r"(?m)^(\d+)\. ", m.group(0))] if m else []


def check_algorithm(alg: str) -> list:
    errs = []
    ids = defined_ids(alg)
    for rid in sorted({r for r in ids if ids.count(r) > 1}):
        errs.append(f"algorithm.md defines {rid} more than once")
    anchors = ANCHOR_RE.findall(alg)
    for rid in ids:
        line = next(ln for ln in alg.splitlines() if DEF_RE.search(ln) and f"[{rid}]" in ln
                    and (ln.startswith("#") or f"**[{rid}]" in ln))
        if f'<a id="{slug(rid)}"></a>' not in line:
            errs.append(f"algorithm.md: {rid} has no <a id=\"{slug(rid)}\"></a> on its definition line")
    for a in sorted({a for a in anchors if anchors.count(a) > 1}):
        errs.append(f"algorithm.md: duplicate anchor {a}")
    for rid in sorted(set(REF_RE.findall(alg)) - set(ids)):
        errs.append(f"algorithm.md references undefined {rid}")
    if not pending_items(alg):
        errs.append("algorithm.md: [ALG.PENDING] has no numbered items")
    return errs


def check_glossary(alg: str, glossary: str) -> list:
    m = re.search(r"(?ms)^## Identificadores de sección.*?(?=^## |\Z)", glossary)
    if not m:
        return ["glossary.md: missing section '## Identificadores de sección'"]
    have = set(re.findall(r"(?m)^\| `([A-Z0-9_]+)` \|", m.group(0)))
    need = {tok for rid in defined_ids(alg) for tok in rid.split(".")}
    return [f"glossary.md: token {tok} of the section ids has no row" for tok in sorted(need - have)]


def walk(node, key, where, errs):
    if isinstance(node, dict):
        for k2, v2 in node.items():
            walk(v2, k2, f"{where}.{k2}", errs)
    elif isinstance(node, list):
        for j, v2 in enumerate(node):
            walk(v2, key, f"{where}[{j}]", errs)
    elif isinstance(node, bool):
        if key not in BOOL_KEYS:
            errs.append(f"{where}: boolean not allowed under '{key}'")
    elif isinstance(node, int):
        if key not in INT_KEYS:
            errs.append(f"{where}: JSON integer not allowed under '{key}'")
    elif isinstance(node, float):
        errs.append(f"{where}: JSON float {node!r}; use a decimal string")
    elif isinstance(node, str):
        if key in MONEY_KEYS and not MONEY_RE.match(node):
            errs.append(f"{where}: money '{node}' must be a decimal string with 2 decimals")
        if key in RATE_KEYS and not DECIMAL_RE.match(node):
            errs.append(f"{where}: rate '{node}' must be a decimal string")


def fields(where: str, obj, required: set, optional: set = frozenset()) -> list:
    """Exact key set of one object: required keys present, nothing outside required | optional."""
    if not isinstance(obj, dict):
        return [f"{where}: object expected"]
    errs = [f"{where}: unknown key '{k}'" for k in sorted(set(obj) - set(required) - set(optional))]
    return errs + [f"{where}: missing key '{k}'" for k in sorted(set(required) - set(obj))]


def by_kind(where: str, obj, table: dict) -> list:
    if not isinstance(obj, dict) or obj.get("kind") not in table:
        return [f"{where}: kind must be one of {', '.join(table)}"]
    return fields(where, obj, table[obj["kind"]])


def check_event(where: str, e, lenient: bool) -> list:
    """One DomainEvent: known type, only its fields, no nulls; required fields unless the case expects an error."""
    kind = e.get("type") if isinstance(e, dict) else None
    if kind not in EVENT_FIELDS:
        return [f"{where}: unknown event type {kind!r}"]
    required, optional = EVENT_FIELDS[e["type"]]
    errs = []
    for key, val in e.items():
        if val is None:
            errs.append(f"{where}.{key} is null; omit optional fields")
        elif key not in EVENT_BASE | required | optional:
            errs.append(f"{where}: unknown field '{key}' for {e['type']}")
    if not lenient:
        errs += [f"{where}: missing field '{key}' for {e['type']}" for key in sorted((EVENT_BASE | required) - set(e))]
    if isinstance(e.get("commission"), dict):
        errs += by_kind(f"{where}.commission", e["commission"], BY_KIND["commission"])
    if isinstance(e.get("breakdown"), dict):
        errs += fields(f"{where}.breakdown", e["breakdown"], NESTED["perComponent"] - {"eventId", "k"})
    if e["type"] == "FixedChargeChange":
        for j, c in enumerate(e.get("fixedCharges") or []):
            errs += fields(f"{where}.fixedCharges[{j}]", c, {"label", "amount"})
    return errs


def nested(where: str, node) -> list:
    """Every named output object (rows, totals, metrics, realDelta lists, yearly, original) has its exact keys."""
    errs = []
    if isinstance(node, list):
        for j, item in enumerate(node):
            errs += nested(f"{where}[{j}]", item)
    elif isinstance(node, dict):
        for key, val in node.items():
            if key == "realDelta" and isinstance(val, dict):
                errs += fields(f"{where}.realDelta", val, {"perAnchor", "perComponent"})
            if key in NESTED:
                for j, item in enumerate(val if isinstance(val, list) else [val]):
                    errs += fields(f"{where}.{key}" + (f"[{j}]" if isinstance(val, list) else ""), item, NESTED[key])
            errs += nested(f"{where}.{key}", val)
    return errs


def check_expected(where: str, op: str, exp, context) -> list:
    if isinstance(exp, dict) and "error" in exp:
        errs = fields(f"{where}.expected", exp, {"error"})
        errs += fields(f"{where}.expected.error", exp["error"], {"type", "rule"}, {"k"})
        return errs + ([f"{where}: a failing case has no context"] if context is not None else [])
    if op == "buildSchedule":
        errs = fields(f"{where}.expected", exp, SCHEDULE_KEYS, {"realDelta", "yearly", "comparedToNoEvents"})
    elif op == "buildPaths":
        errs = fields(f"{where}.expected", exp, {"cutoffK", "original", "real", "scenario", "realDelta", "metrics"})
        for path in ("real", "scenario"):
            errs += fields(f"{where}.expected.{path}", (exp or {}).get(path), SCHEDULE_KEYS, {"yearly"})
    elif op == "goalSeek":
        errs = by_kind(f"{where}.expected", exp, BY_KIND["result"])
    else:
        errs = fields(f"{where}.expected", exp, {"k", "reported", "modeled", "realDelta", "status", "cause"})
    errs += nested(f"{where}.expected", exp)
    if op in CONTEXT_KEYS:
        errs += fields(f"{where}.context", context, CONTEXT_KEYS[op])
    elif context is not None:
        errs.append(f"{where}: {op} has no context")
    return errs


def check_case(rel: str, case: dict) -> list:
    """Inputs and outputs of one case use the names of the frozen contracts."""
    op, where = case.get("operation"), f"{rel}: {case.get('id')}"
    if op not in CASE_INPUTS:
        return [f"{where}: unknown operation {op!r}"]
    errs = [f"{where}: unknown key '{k}' for {op}" for k in sorted(set(case) - CASE_KEYS - CASE_INPUTS[op])]
    errs += [f"{where}: missing input '{k}' for {op}" for k in sorted(CASE_INPUTS[op] - set(case))]
    terms = case.get("terms")
    errs += fields(f"{where}.terms", terms, TERMS_KEYS)
    for j, c in enumerate((terms or {}).get("fixedCharges") or []):
        errs += fields(f"{where}.terms.fixedCharges[{j}]", c, {"label", "amount", "effectiveFrom"})
    lenient = isinstance(case.get("expected"), dict) and "error" in case["expected"]
    for lst in EVENT_LISTS:
        for j, e in enumerate(case.get(lst) or []):
            errs += check_event(f"{where}.{lst}[{j}]", e, lenient)
    if op == "validateAgainstReportedBalance":
        errs += check_event(f"{where}.reported", case.get("reported"), lenient)
    if op == "goalSeek":
        request = case.get("request")
        errs += fields(f"{where}.request", request, {"basePath", "prepaymentDate", "goal"})
        errs += by_kind(f"{where}.request.goal", (request or {}).get("goal"), BY_KIND["goal"])
    return errs + check_expected(where, op, case.get("expected"), case.get("context"))


def event_types(doc: dict) -> list:
    types = set()
    for case in doc.get("cases", []):
        for lst in EVENT_LISTS:
            types.update(e["type"] for e in (case.get(lst) or []))
        if case.get("operation") in IMPLICIT:
            types.add(IMPLICIT[case["operation"]])
    return sorted(types)


def check_json(path: Path, set_name: str, ids: set) -> list:
    rel = f"{set_name}/{path.name}"
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as err:
        return [f"{rel}: invalid JSON ({err})"]
    errs = []
    if doc.get("synthetic") is not True:
        errs.append(f"{rel}: root synthetic must be true")
    if doc.get("schema") != SCHEMA:
        errs.append(f"{rel}: schema must be '{SCHEMA}'")
    if doc.get("id") != path.stem:
        errs.append(f"{rel}: id must equal the file name")
    for sec in doc.get("sections", []):
        if sec not in ids:
            errs.append(f"{rel}: section {sec} is not defined in algorithm.md")
    expected_types = event_types(doc)
    if doc.get("eventTypes") != expected_types:
        errs.append(f"{rel}: eventTypes {doc.get('eventTypes')} != {expected_types}")
    if set_name == "core" and expected_types:
        errs.append(f"{rel}: core/ files must be event-free")
    if set_name == "events" and not expected_types:
        errs.append(f"{rel}: events/ files must use at least one event")
    if not doc.get("cases"):
        errs.append(f"{rel}: no cases")
    for case in doc.get("cases", []):
        errs += check_case(rel, case)
    walk({k: v for k, v in doc.items() if k != "pendingItems"}, "", rel, errs)
    if not all(isinstance(x, int) and not isinstance(x, bool) for x in doc.get("pendingItems", [None])):
        errs.append(f"{rel}: pendingItems must be a list of integers")
    return errs


def table(md: str, heading: str) -> list:
    m = re.search(rf"(?ms)^## {re.escape(heading)}.*?(?=^## |\Z)", md)
    if not m:
        return []
    rows = [ln for ln in m.group(0).splitlines() if ln.startswith("|")][2:]
    return [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in rows]


def check_index(root: Path, alg: str, docs: dict) -> list:
    index_path = root / EX_DIR / "INDEX.md"
    if not index_path.exists():
        return ["INDEX.md is missing"]
    md = index_path.read_text(encoding="utf-8")
    errs = []
    anchors = set(ANCHOR_RE.findall(alg))
    for target in LINK_RE.findall(md):
        file_part, _, frag = target.partition("#")
        if target.startswith("http"):
            continue
        dest = (index_path.parent / file_part).resolve()
        if not dest.exists():
            errs.append(f"INDEX.md: broken link {target}")
        elif frag and dest.name == "algorithm.md" and frag not in anchors:
            errs.append(f"INDEX.md: anchor #{frag} does not exist in algorithm.md")
    checklist = table(md, "Checklist")
    by_item: dict = {}
    for cells in checklist:
        files = [t for t in LINK_RE.findall(cells[3]) if t.endswith(".json")] if len(cells) > 3 else []
        rules = [t for t in LINK_RE.findall(cells[2]) if "algorithm.md#" in t] if len(cells) > 2 else []
        if not files or not rules:
            errs.append(f"INDEX.md checklist row '{cells[0]}' needs rule anchors and example files")
        if len(cells) < 5 or cells[4] != "sí":
            errs.append(f"INDEX.md checklist row '{cells[0]}' is not marked 'sí' in Recalculado")
        by_item[cells[0]] = files
    for item in ["EX"] + [str(n) for n in pending_items(alg)]:
        files = by_item.get(item)
        if not files:
            errs.append(f"INDEX.md: [ALG.PENDING] item {item} is unmapped")
            continue
        for f in files:
            doc = docs.get(f)
            if doc is None:
                errs.append(f"INDEX.md: item {item} links {f}, which is not an example file")
            elif item != "EX" and int(item) not in doc.get("pendingItems", []):
                errs.append(f"INDEX.md: {f} does not list item {item} in pendingItems")
            elif item == "EX" and "ALG.EXAMPLE" not in doc.get("sections", []):
                errs.append(f"INDEX.md: {f} does not cite ALG.EXAMPLE")
    listed = {}
    for cells in table(md, "Archivos"):
        links = LINK_RE.findall(cells[0])
        if links:
            listed[links[0]] = cells[2]
    for f, doc in docs.items():
        if f not in listed:
            errs.append(f"INDEX.md: {f} is not listed under '## Archivos'")
            continue
        shown = "—" if not doc.get("eventTypes") else ", ".join(doc["eventTypes"])
        if listed[f] != shown:
            errs.append(f"INDEX.md: events of {f} are '{listed[f]}', expected '{shown}'")
    return errs


PARTS = ("algorithm", "glossary", "examples", "index", "all")


def run_checks(root: Path, part: str = "all") -> list:
    alg = (root / "docs/algorithm.md").read_text(encoding="utf-8")
    ids = set(defined_ids(alg))
    errs = []
    if part in ("algorithm", "all"):
        errs += check_algorithm(alg)
    if part in ("glossary", "all"):
        errs += check_glossary(alg, (root / "docs/glossary.md").read_text(encoding="utf-8"))
    if part in ("examples", "index", "all"):
        docs = {}
        for set_name in ("core", "events"):
            for path in sorted((root / EX_DIR / set_name).glob("*.json")):
                if part != "index":
                    errs += check_json(path, set_name, ids)
                docs[f"{set_name}/{path.name}"] = json.loads(path.read_text(encoding="utf-8"))
        if part != "index":
            if not docs:
                errs.append(f"no example files under {EX_DIR}/core and {EX_DIR}/events")
            others = [p for p in (root / EX_DIR).rglob("*") if p.is_file() and p.name != "INDEX.md"
                      and p.parent.name not in ("core", "events")]
            errs += [f"unexpected file {p.relative_to(root)}" for p in others]
        if part in ("index", "all"):
            errs += check_index(root, alg, docs)
    return errs


def main(argv: list) -> int:
    root, part = Path(argv[1]), (argv[2] if len(argv) > 2 else "all")
    if part not in PARTS:
        print(f"ERROR: part must be one of {', '.join(PARTS)}")
        return 2
    errs = run_checks(root, part)
    for e in errs:
        print(f"ERROR: {e}")
    if not errs:
        print(f"OK: {part}")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
