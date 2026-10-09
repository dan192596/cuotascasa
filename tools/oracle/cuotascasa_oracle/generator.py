"""Generador con semilla: perfiles, sub-semillas por préstamo y manifiesto (FORMAT.md §5-§8)."""

from __future__ import annotations

import hashlib
import json
import random
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path

from . import GENERATOR_VERSION, dates
from .fixture import compute_traits, dumps
from .money import calc_context, fmt_rate
from .schedule import build_schedule

SEED_MAX = 4294967295
_FILE = re.compile(r"(?P<profile>[a-z]+)-(?P<index>[0-9]{4})\.json")

INTEREST_GRID = tuple(fmt_rate(Decimal("0.0540") + Decimal("0.0020") * step) for step in range(23))
PRINCIPAL_RANGE = {"GTQ": (150000, 2500000), "USD": (20000, 330000)}
CHARGE_RANGES = {
    "GTQ": {"IUSI": (25, 600), "Seguro de daños": (15, 250), "Seguro adicional": (10, 100)},
    "USD": {"IUSI": (3, 80), "Seguro de daños": (2, 35), "Seguro adicional": (1.5, 15)},
}
CHARGE_LABELS = {
    "F0": [],
    "F1": ["IUSI"],
    "F2": ["IUSI", "Seguro de daños"],
}
INSURANCE = {"FHA": ["0.01", "0.0026"], "NONE": []}


@dataclass(frozen=True)
class Profile:
    """Un perfil: nombre, cantidad exacta de préstamos y cómo construir el préstamo `index`."""

    name: str
    count: int
    build: Callable[[int, int], dict]


@dataclass(frozen=True)
class CoreLoan:
    rounding: str
    insurance: str
    payment_day: int | str
    currency: str
    leap_start: bool
    charges: str


EOM = dates.END_OF_MONTH
# FORMAT.md §6.3: C01 … C15.
CORE_LOANS = (
    CoreLoan("FHA_GT_V1", "FHA", EOM, "GTQ", False, "F2"),
    CoreLoan("FHA_GT_V1", "FHA", EOM, "GTQ", False, "F1"),
    CoreLoan("FHA_GT_V1", "FHA", EOM, "GTQ", False, "F0"),
    CoreLoan("FHA_GT_V1", "FHA", EOM, "GTQ", True, "F2"),
    CoreLoan("FHA_GT_V1", "FHA", EOM, "USD", False, "F2"),
    CoreLoan("FHA_GT_V1", "FHA", 15, "GTQ", False, "F2"),
    CoreLoan("FHA_GT_V1", "FHA", 31, "GTQ", True, "F1"),
    CoreLoan("FHA_GT_V1", "FHA", 30, "GTQ", False, "F2"),
    CoreLoan("FHA_GT_V1", "FHA", EOM, "USD", False, "F0"),
    CoreLoan("FHA_GT_V1", "FHA", 1, "GTQ", False, "F2"),
    CoreLoan("FHA_GT_V1", "FHA", EOM, "GTQ", False, "F2"),
    CoreLoan("SIMPLE", "FHA", EOM, "GTQ", False, "F2"),
    CoreLoan("SIMPLE", "NONE", 28, "GTQ", False, "F1"),
    CoreLoan("SIMPLE", "FHA", 15, "USD", True, "F0"),
    CoreLoan("SIMPLE", "NONE", EOM, "GTQ", False, "F2"),
)


def subseed(profile: str, seed: int, loan_index: int) -> int:
    """FORMAT.md §6.1."""
    digest = hashlib.sha256(f"{profile}:{seed}:{loan_index}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


def rng(profile: str, seed: int, loan_index: int) -> random.Random:
    return random.Random(subseed(profile, seed, loan_index))


def _cents(generator: random.Random, low: float, high: float) -> str:
    """Uniforme en centavos [low, high], con 2 decimales (§6.2)."""
    cents = generator.randint(round(low * 100), round(high * 100))
    return f"{cents // 100}.{cents % 100:02d}"


def _core_terms(loan: CoreLoan, generator: random.Random) -> dict:
    # Orden de los sorteos (cambiarlo exige subir GENERATOR_VERSION): principal, tasa, años,
    # año y mes de inicio (solo si no es bisiesto), y los montos de los cargos en orden.
    principal = _cents(generator, *PRINCIPAL_RANGE[loan.currency])
    rate = generator.choice(INTEREST_GRID)
    years = generator.randint(5, 30)
    if loan.leap_start:
        year, month = 2028, 2
    else:
        year = generator.randint(2024, 2030)
        month = generator.randint(1, 12)
    last = dates.days_in_month(year, month)
    day = last if loan.payment_day == EOM else min(int(loan.payment_day), last)
    first_due = date(year, month, day)
    prev_year, prev_month = (year, month - 1) if month > 1 else (year - 1, 12)
    charges = [
        {
            "label": label,
            "amount": _cents(generator, *CHARGE_RANGES[loan.currency][label]),
            "effectiveFrom": first_due.isoformat(),
        }
        for label in CHARGE_LABELS[loan.charges]
    ]
    return {
        "principal": principal,
        "termMonths": 12 * years,
        "disbursementDate": date(prev_year, prev_month, 1).isoformat(),
        "firstDueDate": first_due.isoformat(),
        "paymentDay": loan.payment_day,
        "currency": loan.currency,
        "interestRate": rate,
        "insuranceRates": list(INSURANCE[loan.insurance]),
        "fixedCharges": charges,
        "roundingProfile": loan.rounding,
    }


def make_fixture(profile: str, seed: int, index: int, terms: dict, features: list[str]) -> dict:
    """Arma el fixture de un préstamo sin eventos a partir de sus condiciones."""
    result = build_schedule(terms)
    return {
        "synthetic": True,
        "id": f"{profile}-{index:04d}",
        "profile": profile,
        "seed": seed,
        "loanIndex": index,
        "generatorVersion": GENERATOR_VERSION,
        "features": features,
        "traits": compute_traits(terms, result["rows"]),
        "inputs": {"terms": terms, "events": []},
        "expected": result,
    }


def _build_core(seed: int, index: int) -> dict:
    loan = CORE_LOANS[index - 1]
    terms = _core_terms(loan, rng("core", seed, index))
    return make_fixture("core", seed, index, terms, ["core"])


PROFILES: dict[str, Profile] = {"core": Profile("core", len(CORE_LOANS), _build_core)}


def build_fixture(profile: str, seed: int, index: int) -> dict:
    return PROFILES[profile].build(seed, index)


def _write(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def generate(profile: str, seed: int, out: Path) -> None:
    """FORMAT.md §8.1: escribe los fixtures, borra los sobrantes y combina el manifiesto."""
    spec = PROFILES[profile]
    out.mkdir(parents=True, exist_ok=True)
    with calc_context():
        for index in range(1, spec.count + 1):
            _write(out / f"{profile}-{index:04d}.json", dumps(spec.build(seed, index)))
    for path in out.iterdir():
        match = _FILE.fullmatch(path.name)
        if match and match["profile"] == profile and int(match["index"]) > spec.count:
            path.unlink()
    manifest_path = out / "manifest.json"
    manifest = {"synthetic": True, "profiles": {}}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["synthetic"] = True
    manifest.setdefault("profiles", {})[profile] = {
        "count": spec.count,
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
    }
    _write(manifest_path, dumps(manifest))
