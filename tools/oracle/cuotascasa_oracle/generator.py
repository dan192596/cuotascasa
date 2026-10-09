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
from .fixture import compute_features, compute_traits, dumps
from .money import calc_context, fmt_rate
from .schedule import build_schedule

SEED_MAX = 4294967295
_FILE = re.compile(r"(?P<profile>[a-z]+)-(?P<index>[0-9]{4})\.json")

INTEREST_GRID = tuple(fmt_rate(Decimal("0.0540") + Decimal("0.0020") * step) for step in range(23))
# Todos los rangos de dinero van en centavos enteros (nunca float).
PRINCIPAL_RANGE = {"GTQ": (15_000_000, 250_000_000), "USD": (2_000_000, 33_000_000)}
CHARGE_RANGES = {
    "GTQ": {
        "IUSI": (2_500, 60_000),
        "Seguro de daños": (1_500, 25_000),
        "Seguro adicional": (1_000, 10_000),
    },
    "USD": {
        "IUSI": (300, 8_000),
        "Seguro de daños": (200, 3_500),
        "Seguro adicional": (150, 1_500),
    },
}
CHARGE_LABELS = {
    "F0": [],
    "F1": ["IUSI"],
    "F2": ["IUSI", "Seguro de daños"],
}
INSURANCE = {"FHA": ["0.01", "0.0026"], "NONE": []}


class ManifestError(Exception):
    """El manifiesto no tiene la forma de FORMAT.md §5."""


def read_manifest(path: Path) -> dict:
    """Lee un manifiesto y valida su forma básica: objeto con `profiles` objeto."""
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ManifestError("unreadable") from error
    if not isinstance(manifest, dict) or not isinstance(manifest.get("profiles"), dict):
        raise ManifestError("profiles")
    return manifest


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


def _cents(generator: random.Random, low: int, high: int) -> str:
    """Uniforme en centavos [low, high] (enteros), con 2 decimales (§6.2)."""
    cents = generator.randint(low, high)
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


def make_fixture(profile: str, seed: int, index: int, terms: dict, events: list[dict]) -> dict:
    """Arma el fixture de un préstamo a partir de sus condiciones y sus eventos."""
    result = build_schedule(terms, events)
    return {
        "synthetic": True,
        "id": f"{profile}-{index:04d}",
        "profile": profile,
        "seed": seed,
        "loanIndex": index,
        "generatorVersion": GENERATOR_VERSION,
        "features": compute_features(events, result["rows"]),
        "traits": compute_traits(terms, result["rows"], events),
        "inputs": {"terms": terms, "events": events},
        "expected": result,
    }


def _build_core(seed: int, index: int) -> dict:
    loan = CORE_LOANS[index - 1]
    terms = _core_terms(loan, rng("core", seed, index))
    return make_fixture("core", seed, index, terms, [])


def _build_full(seed: int, index: int) -> dict:
    from .full_profile import build_full  # importa este módulo: se carga al usarlo

    return build_full(seed, index)


PROFILES: dict[str, Profile] = {
    "core": Profile("core", len(CORE_LOANS), _build_core),
    "full": Profile("full", 40, _build_full),
}


def build_fixture(profile: str, seed: int, index: int) -> dict:
    return PROFILES[profile].build(seed, index)


def _write(path: Path, text: str) -> None:
    path.write_bytes(text.encode("utf-8"))


def generate(profile: str, seed: int, out: Path) -> None:
    """FORMAT.md §8.1: escribe los fixtures, borra los sobrantes y combina el manifiesto."""
    spec = PROFILES[profile]
    manifest_path = out / "manifest.json"
    manifest = {"synthetic": True, "profiles": {}}
    if manifest_path.exists():
        manifest = read_manifest(manifest_path)  # antes de escribir nada
    out.mkdir(parents=True, exist_ok=True)
    with calc_context():
        for index in range(1, spec.count + 1):
            _write(out / f"{profile}-{index:04d}.json", dumps(spec.build(seed, index)))
    for path in out.iterdir():
        match = _FILE.fullmatch(path.name)
        if match and match["profile"] == profile and int(match["index"]) > spec.count:
            path.unlink()
    manifest["synthetic"] = True
    manifest["profiles"][profile] = {
        "count": spec.count,
        "generatorVersion": GENERATOR_VERSION,
        "seed": seed,
    }
    _write(manifest_path, dumps(manifest))
