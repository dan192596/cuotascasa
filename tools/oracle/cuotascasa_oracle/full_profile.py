"""Perfil `full` (FORMAT.md §6.4): 40 préstamos con eventos, de sus propias sub-semillas.

Orden de los sorteos de un préstamo (cambiarlo cambia bytes y obliga a subir
`GENERATOR_VERSION`, FORMAT.md §7), todos con `random.Random(subseed)`:

1. Condiciones, como `core`: principal, tasa (siempre se sortea; en `zeroRate` se reemplaza por
   `"0.0000"`), años, año y mes (solo si el inicio no es bisiesto) y los montos de los cargos.
   Con cargo futuro (F05) se sortea después el monto de `Seguro adicional`.
2. Por cada ranura de eventos (k₁, k₂, k₃), hasta que el intento sea válido (muestreo por
   rechazo): la cuota (k₁ uniforme; k₂ = k₁ + j, j en [6, 12]; k₃ = k₂ + j', j' en [1, 12]) y luego
   los sorteos de cada evento de la ranura, en el orden de la lista. Dentro de un evento:
   - fecha: el desfase `o` en [0, 20], antes que el resto de los sorteos del evento, salvo en
     `ADV` (primero N, luego `o`); en `AP`, el desfase de §6.4;
   - `RC`: Δ, signo (y se repiten juntos mientras la tasa salga de la grilla o dé
     `NegativeAmortizationError`) y, con `BANK_INSTALLMENT`, los centavos extra en [0, 50.00],
     dentro de esa repetición;
   - `FCC`: los montos nuevos en el orden de las etiquetas;
   - `PP`: monto y luego la comisión; `PAYOFF`: solo la comisión (el monto es `principal`);
   - `ADV(1–12)`: N (antes de `o`); `RB`: el desvío en centavos; `RB×2`: `o`, desvío, segundo
     `o` (se repite hasta que difiera del primero) y segundo desvío;
   - `AP`: `o` y luego, con desglose, capital, interés, seguros y cargos fijos, o un solo desvío
     sin desglose.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from . import dates
from .errors import NegativeAmortizationError, OracleError
from .events import installment_for_date
from .generator import (
    CHARGE_RANGES,
    EOM,
    INTEREST_GRID,
    CoreLoan,
    _cents,
    _core_terms,
    make_fixture,
    rng,
)
from .money import calc_context, fmt_amount, fmt_rate
from .schedule import build_schedule, level_installment
from .terms import parse_terms

MAX_ATTEMPTS = 1000
RATE_DELTAS = (Decimal("0.0020"), Decimal("0.0040"))
GRID = frozenset(INTEREST_GRID)
RECALC = "RECALC_INSTALLMENT_KEEP_TERM"
KEEP = "KEEP_INSTALLMENT_ADJUST_TERM"
BANK = "BANK_INSTALLMENT"
FLAT_RANGE = {"GTQ": (10_000, 150_000), "USD": (1_500, 20_000)}

Recipe = tuple


@dataclass(frozen=True)
class FullLoan:
    rounding: str
    insurance: str
    payment_day: int | str
    currency: str
    leap_start: bool
    charges: str
    slots: tuple[tuple[Recipe, ...], ...] = ()
    zero_rate: bool = False
    future_charge: bool = False


def _rc(policy: str) -> Recipe:
    return ("RC", policy)


def _pp(mode: str, commission: str | None = None) -> Recipe:
    return ("PP", mode, commission)


def _payoff(mode: str, commission: str | None = None) -> Recipe:
    return ("PAYOFF", mode, commission)


RB_DATE = ("RB", "fecha")
RB_EXPLICIT = ("RB", "explicita")
RB_TWICE = ("RB2",)
AP_ON_TIME_BREAKDOWN = ("AP", False, True)
AP_LATE_BREAKDOWN = ("AP", True, True)
AP_ON_TIME_PLAIN = ("AP", False, False)
AP_LATE_PLAIN = ("AP", True, False)
ADV_ANY = ("ADV", None)
GT, SIMPLE = "FHA_GT_V1", "SIMPLE"
FHA, NONE = "FHA", "NONE"


def _loan(rounding, insurance, day, currency, charges, *slots, leap=False, **flags) -> FullLoan:
    return FullLoan(rounding, insurance, day, currency, leap, charges, tuple(slots), **flags)


# FORMAT.md §6.4, «Composición»: F01 … F40. Cada ranura es la lista de recetas de una cuota.
FULL_LOANS = (
    _loan(GT, FHA, EOM, "GTQ", "F2", (_rc(RECALC),)),
    _loan(GT, FHA, 15, "GTQ", "F2", (_rc(KEEP),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_rc(BANK),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (("FCC", "quita"),)),
    _loan(SIMPLE, FHA, EOM, "GTQ", "F2", (("FCC", "futuro"),), future_charge=True),
    _loan(GT, FHA, EOM, "USD", "F1", (("FCC", "agrega"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_pp("REDUCE_TERM"),)),
    _loan(GT, FHA, 30, "GTQ", "F2", (_pp("REDUCE_INSTALLMENT"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_pp("REDUCE_TERM", "FLAT"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (("ADV", 6),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (("ADV", 1),), leap=True),
    _loan(SIMPLE, NONE, EOM, "GTQ", "F1", (("ADV", 12),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_DATE,)),
    _loan(GT, FHA, 31, "GTQ", "F2", (RB_EXPLICIT,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_TWICE,)),
    _loan(GT, FHA, EOM, "USD", "F2", (AP_ON_TIME_BREAKDOWN,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (AP_LATE_BREAKDOWN,)),
    _loan(SIMPLE, FHA, EOM, "GTQ", "F2", (AP_ON_TIME_PLAIN,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_pp("REDUCE_TERM"),), (_rc(RECALC),)),
    _loan(GT, FHA, 15, "GTQ", "F2", (_rc(KEEP),), (_pp("REDUCE_INSTALLMENT", "PERCENT"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_DATE,), (_rc(BANK),)),
    _loan(
        GT,
        FHA,
        EOM,
        "GTQ",
        "F2",
        (_rc(RECALC),),
        (("FCC", "reprecia"),),
        (AP_ON_TIME_BREAKDOWN,),
    ),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_rc(KEEP),), (ADV_ANY,)),
    _loan(GT, FHA, EOM, "USD", "F2", (_rc(BANK),), (_pp("REDUCE_TERM", "PERCENT"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_DATE, _rc(RECALC))),
    _loan(SIMPLE, FHA, EOM, "GTQ", "F2", (_rc(KEEP),), (RB_EXPLICIT,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_rc(BANK),), (AP_LATE_PLAIN,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_DATE,), (_payoff("REDUCE_TERM"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_payoff("REDUCE_TERM", "FLAT"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_payoff("REDUCE_INSTALLMENT", "PERCENT"),), leap=True),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_TWICE,), (AP_ON_TIME_BREAKDOWN,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (RB_EXPLICIT,), (_pp("REDUCE_INSTALLMENT", "FLAT"),)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (("FCC", "reprecia"),), (ADV_ANY,), (AP_LATE_BREAKDOWN,)),
    _loan(GT, FHA, EOM, "GTQ", "F2", (_rc(RECALC),), (RB_TWICE,)),
    _loan(GT, NONE, EOM, "GTQ", "F0", zero_rate=True),
    _loan(GT, NONE, 31, "GTQ", "F1", zero_rate=True, leap=True),
    _loan(SIMPLE, NONE, EOM, "GTQ", "F2", zero_rate=True),
    _loan(GT, NONE, EOM, "GTQ", "F2"),
    _loan(GT, NONE, 30, "GTQ", "F0"),
    _loan(GT, NONE, EOM, "USD", "F1"),
)


class _Reject(Exception):
    """El intento no cumple FORMAT.md §6.4; se vuelve a sortear con el mismo generador."""


class _Context:
    """Lo que las recetas necesitan de un intento: condiciones, eventos previos y estado."""

    def __init__(self, gen, terms: dict) -> None:
        self.gen = gen
        self.terms = terms
        self.parsed = parse_terms(terms)

    def due(self, k: int) -> date:
        return dates.due_date(self.parsed.first_due_date, self.parsed.payment_day, k)

    def offset_date(self, k: int) -> tuple[str, int]:
        """`date = dueDate(k) − o` con `o` uniforme en [0, 20] (§6.4)."""
        offset = self.gen.randint(0, 20)
        return (self.due(k) - timedelta(days=offset)).isoformat(), offset

    def cents(self, low: int, high: int) -> str:
        return _cents(self.gen, low, high)


def _rate_change(ctx: _Context, k: int, snap, before: list[dict], eid: str, policy: str) -> dict:
    when, _ = ctx.offset_date(k)
    current = snap.interest_rate
    insurance = sum(ctx.parsed.insurance_rates, Decimal(0))
    for _ in range(MAX_ATTEMPTS):
        delta = ctx.gen.choice(RATE_DELTAS)
        sign = ctx.gen.choice((1, -1))
        new = current + sign * delta
        if fmt_rate(new) not in GRID:
            continue
        event = {
            "id": eid,
            "type": "RateChange",
            "date": when,
            "policy": policy,
            "interestRate": fmt_rate(new),
        }
        if policy == BANK:
            with calc_context():
                level = level_installment(snap.opening, new + insurance, snap.term() - (k - 1))
                extra = ctx.gen.randint(0, 5000)
                event["bankInstallment"] = fmt_amount(level + Decimal(extra) / 100)
        if policy != RECALC:
            try:
                build_schedule(ctx.terms, [*before, event])
            except NegativeAmortizationError:
                continue
        return event
    raise _Reject


def _fixed_charge_change(ctx: _Context, k: int, eid: str, variant: str) -> dict:
    when, _ = ctx.offset_date(k)
    currency = ctx.terms["currency"]
    ranges = CHARGE_RANGES[currency]
    iusi = ctx.terms["fixedCharges"][0]["amount"] if ctx.terms["fixedCharges"] else None
    if variant == "quita":
        charges = [{"label": "IUSI", "amount": iusi}]
    elif variant == "agrega":
        charges = [
            {"label": "IUSI", "amount": iusi},
            {"label": "Seguro de daños", "amount": ctx.cents(*ranges["Seguro de daños"])},
        ]
    else:  # «futuro» y «reprecia»: los mismos nombres de F2 con montos nuevos sorteados.
        charges = [
            {"label": "IUSI", "amount": ctx.cents(*ranges["IUSI"])},
            {"label": "Seguro de daños", "amount": ctx.cents(*ranges["Seguro de daños"])},
        ]
    return {"id": eid, "type": "FixedChargeChange", "date": when, "fixedCharges": charges}


def _prepayment(ctx: _Context, k: int, eid: str, recipe: Recipe) -> dict:
    kind, mode, commission = recipe
    when, _ = ctx.offset_date(k)
    principal = ctx.terms["principal"]
    if kind == "PAYOFF":
        amount = principal
    else:
        total = int(Decimal(principal) * 100)
        cents = ctx.gen.randint(-(-total // 100), total // 5)
        amount = f"{cents // 100}.{cents % 100:02d}"
    event = {"id": eid, "type": "Prepayment", "date": when, "amount": amount, "mode": mode}
    if commission == "FLAT":
        event["commission"] = {
            "kind": "FLAT",
            "amount": ctx.cents(*FLAT_RANGE[ctx.terms["currency"]]),
        }
    elif commission == "PERCENT":
        event["commission"] = {"kind": "PERCENT", "rate": ctx.gen.choice(("0.01", "0.02", "0.03"))}
    return event


def _reported_balance(ctx: _Context, k: int, trace: dict, eid: str, variant: str) -> dict:
    when, _ = ctx.offset_date(k)
    target = k + 1 if variant == "explicita" else k
    if target not in trace:
        raise _Reject
    projected = int(trace[target].projected_opening * 100)
    balance = max(0, projected + ctx.gen.randint(-50_000, 50_000))
    event = {
        "id": eid,
        "type": "ReportedBalance",
        "date": when,
        "balance": f"{balance // 100}.{balance % 100:02d}",
    }
    if variant == "explicita":
        event["installmentNumber"] = target
    return event


def _two_anchors(ctx: _Context, k: int, trace: dict, ids: tuple[str, str]) -> list[dict]:
    if k not in trace:
        raise _Reject
    projected = int(trace[k].projected_opening * 100)
    events = []
    first_offset = None
    for eid in ids:
        offset = ctx.gen.randint(0, 20)
        while offset == first_offset:
            offset = ctx.gen.randint(0, 20)
        first_offset = offset if first_offset is None else first_offset
        balance = max(0, projected + ctx.gen.randint(-50_000, 50_000))
        events.append(
            {
                "id": eid,
                "type": "ReportedBalance",
                "date": (ctx.due(k) - timedelta(days=offset)).isoformat(),
                "balance": f"{balance // 100}.{balance % 100:02d}",
            }
        )
    return events


def _actual_payment(ctx: _Context, k: int, rows: list[dict], eid: str, recipe: Recipe) -> dict:
    _, late, breakdown = recipe
    if k > len(rows):
        raise _Reject
    if late:
        paid = ctx.due(k) + timedelta(days=ctx.gen.randint(1, 20))
    else:
        paid = ctx.due(k) - timedelta(days=ctx.gen.randint(0, 5))
    row = rows[k - 1]
    event = {
        "id": eid,
        "type": "ActualPayment",
        "paidDate": paid.isoformat(),
        "installmentNumber": k,
    }
    with calc_context():
        if breakdown:
            parts = {}
            for name in ("capital", "interest", "insurance", "fixedCharges"):
                parts[name] = fmt_amount(
                    Decimal(row[name]) + Decimal(ctx.gen.randint(0, 500)) / 100
                )
            event["breakdown"] = parts
            event["total"] = fmt_amount(sum((Decimal(v) for v in parts.values()), Decimal(0)))
        else:
            extra = Decimal(ctx.gen.randint(0, 500)) / 100
            event["total"] = fmt_amount(Decimal(row["total"]) + extra)
    return event


def _slot_events(
    gen, terms: dict, events: list[dict], recipes: tuple[Recipe, ...], k: int
) -> list[dict]:
    """Eventos de una ranura en la cuota nominal `k`; lanza _Reject u OracleError si no vale."""
    ctx = _Context(gen, terms)
    previous = build_schedule(terms, events)
    created: list[dict] = []
    for recipe in recipes:
        trace: dict = {}
        current = build_schedule(terms, [*events, *created], trace=trace)
        eid = f"ev-{len(events) + len(created) + 1:02d}"
        kind = recipe[0]
        if kind == "RC":
            created.append(_rate_change(ctx, k, trace[k], [*events, *created], eid, recipe[1]))
        elif kind == "FCC":
            created.append(_fixed_charge_change(ctx, k, eid, recipe[1]))
        elif kind in ("PP", "PAYOFF"):
            created.append(_prepayment(ctx, k, eid, recipe))
        elif kind == "ADV":
            count = recipe[1] if recipe[1] is not None else gen.randint(1, 12)
            when, _ = ctx.offset_date(k)
            created.append({"id": eid, "type": "AdvanceInstallments", "date": when, "count": count})
        elif kind == "RB":
            created.append(_reported_balance(ctx, k, trace, eid, recipe[1]))
        elif kind == "RB2":
            second = f"ev-{len(events) + len(created) + 2:02d}"
            created.extend(_two_anchors(ctx, k, trace, (eid, second)))
        else:
            created.append(_actual_payment(ctx, k, current["rows"], eid, recipe))
    last_allowed = len(previous["rows"]) - 1
    parsed = ctx.parsed
    for event in created:
        number = event.get("installmentNumber")
        effective = number or installment_for_date(parsed, date.fromisoformat(event["date"]))
        if not 1 <= effective <= last_allowed:  # existe y no es la última del calendario vigente
            raise _Reject
    final = build_schedule(terms, [*events, *created])["rows"][-1]
    pays_off = Decimal(final["prepayment"]) > 0 and final["prepayment"] == final["closing"]
    if pays_off != any(recipe[0] == "PAYOFF" for recipe in recipes):
        raise _Reject  # solo las recetas PAYOFF liquidan el préstamo
    return created


def _draw_k(gen, slot: int, previous: int | None, term_months: int) -> int:
    if slot == 0:
        return gen.randint(6, min(48, term_months - 36))
    return previous + (gen.randint(6, 12) if slot == 1 else gen.randint(1, 12))


def _with_future_charge(terms: dict, amount: str, k: int) -> dict:
    parsed = parse_terms(terms)
    effective = dates.due_date(parsed.first_due_date, parsed.payment_day, k + 6)
    charge = {"label": "Seguro adicional", "amount": amount, "effectiveFrom": effective.isoformat()}
    return {**terms, "fixedCharges": [*terms["fixedCharges"], charge]}


def build_full(seed: int, index: int) -> dict:
    """Fixture del préstamo `index` (F01 = 1) del perfil `full`."""
    spec = FULL_LOANS[index - 1]
    gen = rng("full", seed, index)
    base = _core_terms(
        CoreLoan(
            spec.rounding,
            spec.insurance,
            spec.payment_day,
            spec.currency,
            spec.leap_start,
            spec.charges,
        ),
        gen,
    )
    if spec.zero_rate:
        base["interestRate"] = "0.0000"
    future_amount = None
    if spec.future_charge:
        future_amount = _cents(gen, *CHARGE_RANGES[spec.currency]["Seguro adicional"])
    terms, events, previous_k = base, [], None
    for slot, recipes in enumerate(spec.slots):
        for _ in range(MAX_ATTEMPTS):
            k = _draw_k(gen, slot, previous_k, base["termMonths"])
            attempt = _with_future_charge(base, future_amount, k) if future_amount else base
            try:
                created = _slot_events(gen, attempt, events, recipes, k)
            except (_Reject, OracleError):
                continue
            terms, previous_k = attempt, k
            events = [*events, *created]
            break
        else:
            raise RuntimeError(f"full-{index:04d}: sin intento válido")
    return make_fixture("full", seed, index, terms, events)
