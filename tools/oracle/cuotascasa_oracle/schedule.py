"""Camino real con eventos: [ALG.LEVEL], [ALG.PERIOD.*], [ALG.LAST*], [ALG.FIXED], [ALG.ZERO],
[ALG.EVENTS.*], [ALG.RATE.*], [ALG.PREPAY.*], [ALG.ADVANCE], [ALG.ANCHOR] y [ALG.ACTUAL]."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal

from . import dates
from .errors import InvalidInputError, NegativeAmortizationError
from .events import Event, Planned, parse_events, plan_events
from .money import ZERO, calc_context, fmt_amount, half_up_2
from .terms import Terms, parse_terms

TWELVE = Decimal(12)


def level_installment(balance: Decimal, rate_sum: Decimal, months: int) -> Decimal:
    """[ALG.LEVEL] con [ALG.ZERO]: `rate_sum` es i + f; r = rate_sum / 12."""
    r = rate_sum / TWELVE
    if r == 0:
        return half_up_2(balance / Decimal(months))
    power = (1 + r) ** months
    return half_up_2((balance * r) / (1 - (1 / power)))


def _split_insurance(insurance: Decimal, rates: tuple[Decimal, ...], f: Decimal) -> list[Decimal]:
    """[ALG.PERIOD.SPLIT]; con f = 0 cada componente vale 0.00 ([ALG.ZERO])."""
    if not rates:
        return []
    if f == 0:
        return [ZERO.quantize(Decimal("0.01")) for _ in rates]
    parts = [half_up_2((insurance * rate) / f) for rate in rates[:-1]]
    parts.append(insurance - sum(parts, ZERO))
    return parts


def _normal_period(profile: str, i: Decimal, rates: tuple[Decimal, ...], balance: Decimal):
    """Cuota «como normal»: devuelve (financialCharge, interest, components)."""
    f = sum(rates, ZERO)
    if profile == "SIMPLE":
        interest = half_up_2((balance * i) / TWELVE)
        parts = [half_up_2((balance * rate) / TWELVE) for rate in rates]
        return interest + sum(parts, ZERO), interest, parts
    if i + f == 0:
        return ZERO, ZERO, _split_insurance(ZERO, rates, f)
    charge = half_up_2((balance * (i + f)) / TWELVE)
    if f == 0:
        interest = charge
    else:
        interest = half_up_2((charge * i) / (i + f))
    insurance = charge - interest
    return charge, interest, _split_insurance(insurance, rates, f)


def _last_period(profile: str, i: Decimal, rates: tuple[Decimal, ...], balance: Decimal):
    """[ALG.LAST]: devuelve (interest, components)."""
    interest = half_up_2((balance * i) / TWELVE)
    if profile == "SIMPLE":
        return interest, [half_up_2((balance * rate) / TWELVE) for rate in rates]
    f = sum(rates, ZERO)
    insurance = half_up_2((balance * f) / TWELVE)
    return interest, _split_insurance(insurance, rates, f)


# Tope de seguridad de la simulación de un plazo derivado. Ninguna entrada de los perfiles lo
# alcanza; evita un ciclo infinito si la amortización es de centavos.
MAX_SIMULATED = 100_000


@dataclass
class _Loan:
    """Estado corriente del camino real (`PeriodState`, [ALG.TERM]). `term` es None cuando el
    plazo es derivado."""

    profile: str
    i: Decimal
    rates: tuple[Decimal, ...]
    level: Decimal
    term: int | None
    balance: Decimal

    def classify(self, k: int, balance: Decimal):
        """Cuota `k` con saldo de apertura `balance`: (charge, interest, parts, amort, last).

        [ALG.LAST.FIXED_TERM] y [ALG.LAST.DERIVED_TERM]. En plazo derivado, una cuota normal con
        amortización nula o negativa lanza NegativeAmortizationError ([ALG.TERM]).
        """
        charge, interest, parts = _normal_period(self.profile, self.i, self.rates, balance)
        amort = self.level - charge
        last = (self.term is not None and k >= self.term) or amort >= balance
        if not last and self.term is None and amort <= 0:
            raise NegativeAmortizationError("ALG.TERM", k)
        return charge, interest, parts, amort, last

    def periods(self, first_k: int):
        """Simula, sin mutar, las cuotas `first_k`, … con `level` fijo: (capital, es_última)."""
        balance = self.balance
        for k in range(first_k, first_k + MAX_SIMULATED):
            _charge, _interest, _parts, amort, last = self.classify(k, balance)
            if last:
                yield balance, True
                return
            yield amort, False
            balance -= amort
        raise InvalidInputError("ALG.TERM", "el plazo derivado no termina")

    def remaining_term(self, first_k: int) -> int:
        """`remainingTerm`: número de cuotas `first_k … última` ([ALG.TERM])."""
        return sum(1 for _ in self.periods(first_k))

    def project_capital(self, first_k: int, count: int) -> Decimal:
        """`projectCapital`: capital de las cuotas `first_k … first_k + count − 1`."""
        total = ZERO
        for position, (capital, _last) in enumerate(self.periods(first_k)):
            if position >= count:
                break
            total += capital
        return total

    def current_term(self, k: int) -> int:
        """Plazo vigente al iniciar la fase 1 de `k` ([ALG.TERM], «Plazo vigente en las fases 1
        y 3»): el dato en plazo fijo; `(k − 1) + remainingTerm` en plazo derivado."""
        return self.term if self.term is not None else (k - 1) + self.remaining_term(k)


def _term_probe(loan: _Loan, k: int) -> Callable[[], int]:
    """Congela el estado al iniciar la fase 1 de `k` y calcula el plazo vigente al pedirlo."""
    frozen = replace(loan)
    return lambda: frozen.current_term(k)


@dataclass(frozen=True)
class Snapshot:
    """Estado al iniciar la fase 1 de la cuota `k` (lo usa el generador, FORMAT.md §6.4)."""

    projected_opening: Decimal
    opening: Decimal
    interest_rate: Decimal
    level: Decimal
    term: Callable[[], int]


def build_schedule(raw_terms: dict, events: object = (), *, trace: dict | None = None) -> dict:
    """Camino real con todos los eventos. Devuelve {rows, anchors, payments, summary}.

    `trace`, si se pasa, se llena con un `Snapshot` por cuota alcanzada.
    """
    if isinstance(events, tuple) and not events:
        events = []
    terms = parse_terms(raw_terms)
    parsed = parse_events(events)
    planned = plan_events(terms, parsed)
    with calc_context():
        return _build(terms, parsed, planned, trace)


def _phase1(loan: _Loan, items: list[Planned], k: int, due: date):
    """Fase 1: RateChange y FixedChargeChange de la cuota `k`. Devuelve los cargos nuevos o None."""
    charges = None
    for item in items:
        data = item.event.data
        if item.event.type == "FixedChargeChange":
            charges = [(amount, due) for _label, amount in data["charges"]]
            continue
        new_i = loan.i if data["interest"] is None else data["interest"]
        new_rates = loan.rates if data["insurance"] is None else data["insurance"]
        policy = data["policy"]
        if policy == "RECALC_INSTALLMENT_KEEP_TERM":
            term = loan.current_term(k)  # con el nivel y las tasas anteriores (ruling de Opus)
            f = sum(new_rates, ZERO)
            loan.level = level_installment(loan.balance, new_i + f, max(1, term - (k - 1)))
            loan.term = term
        else:
            rule = "ALG.RATE." + (
                "KEEP_INSTALLMENT"
                if policy == "KEEP_INSTALLMENT_ADJUST_TERM"
                else "BANK_INSTALLMENT"
            )
            if policy == "BANK_INSTALLMENT":
                loan.level = data["bank"]
            charge, _interest, _parts = _normal_period(loan.profile, new_i, new_rates, loan.balance)
            if loan.level - charge <= 0:
                raise NegativeAmortizationError(rule, k)
            loan.term = None
        loan.i, loan.rates = new_i, new_rates
    return charges


def _phase3(loan: _Loan, items: list[Planned], k: int) -> tuple[Decimal, Decimal]:
    """Fase 3: abonos y adelantos de la cuota `k`. Devuelve (abonado, comisiones)."""
    applied_total = ZERO
    commissions = ZERO
    for item in items:
        if loan.balance <= 0:
            break  # [ALG.PREPAY.CAP]: con saldo 0.00 el evento es un no-op y no cobra comisión
        data = item.event.data
        if item.event.type == "AdvanceInstallments":
            count = data["count"]
            # Ruling de Opus: un capital proyectado negativo se recorta a 0.00; el plazo fijo
            # baja N aunque el abono aplicado sea 0.00.
            amount = max(ZERO, loan.project_capital(k + 1, count))
            applied = min(amount, loan.balance)
            if loan.term is not None:
                loan.term -= count
            loan.balance -= applied
        else:
            applied = min(data["amount"], loan.balance)
            if data["commission"] is not None:
                kind, value = data["commission"]
                commissions += value if kind == "FLAT" else half_up_2(applied * value)
            if data["mode"] == "REDUCE_INSTALLMENT":
                term = loan.term if loan.term is not None else k + loan.remaining_term(k + 1)
                loan.balance -= applied
                if loan.balance > 0:
                    f = sum(loan.rates, ZERO)
                    loan.level = level_installment(loan.balance, loan.i + f, max(1, term - k))
                loan.term = term
            else:
                loan.balance -= applied
                loan.term = None
        applied_total += applied
    return applied_total, commissions


def _build(terms: Terms, parsed: list[Event], planned: list[Planned], trace: dict | None) -> dict:
    by_k: dict[int, list[Planned]] = {}
    for item in planned:
        by_k.setdefault(item.k, []).append(item)
    f = sum(terms.insurance_rates, ZERO)
    loan = _Loan(
        terms.rounding_profile,
        terms.interest_rate,
        terms.insurance_rates,
        level_installment(terms.principal, terms.interest_rate + f, terms.term_months),
        terms.term_months,
        terms.principal,
    )
    fixed_charges = [(c.amount, c.effective_from) for c in terms.fixed_charges]
    rows: list[dict] = []
    anchors: dict[str, dict] = {}
    payments: dict[str, dict] = {}
    k = 0
    while True:
        k += 1
        due = dates.due_date(terms.first_due_date, terms.payment_day, k)
        here = by_k.pop(k, [])
        # Fase 0: anclas ([ALG.ANCHOR]); todas reportan contra la apertura proyectada.
        projected_opening = loan.balance
        reported = [item for item in here if item.phase == 0]
        for item in reported:
            delta = item.event.data["balance"] - projected_opening
            anchors[item.event.id] = {
                "eventId": item.event.id,
                "k": k,
                "realDelta": fmt_amount(delta),
            }
        if reported:
            winner = max(reported, key=lambda a: (a.event.date, a.event.id))
            loan.balance = winner.event.data["balance"]
        if trace is not None:
            trace[k] = Snapshot(
                projected_opening,
                loan.balance,
                loan.i,
                loan.level,
                _term_probe(loan, k),
            )
        # Fase 1.
        new_charges = _phase1(loan, [item for item in here if item.phase == 1], k, due)
        if new_charges is not None:
            fixed_charges = new_charges
        # Fase 2.
        opening = loan.balance
        level = loan.level
        fixed = half_up_2(sum((amount for amount, since in fixed_charges if since <= due), ZERO))
        _charge, interest, parts, amort, last = loan.classify(k, opening)
        if last:
            capital = opening
            interest, parts = _last_period(loan.profile, loan.i, loan.rates, opening)
        else:
            capital = amort
        insurance = sum(parts, ZERO)
        total = capital + interest + insurance + fixed
        loan.balance = opening - capital
        closing = loan.balance
        # Fase 3.
        applied, commission = _phase3(loan, [item for item in here if item.phase == 3], k)
        row = {
            "k": k,
            "dueDate": due.isoformat(),
            "opening": fmt_amount(opening),
            "level": fmt_amount(level),
            "interest": fmt_amount(interest),
            "insurance": fmt_amount(insurance),
            "insuranceComponents": [fmt_amount(p) for p in parts],
            "capital": fmt_amount(capital),
            "fixedCharges": fmt_amount(fixed),
            "prepayment": fmt_amount(applied),
            "commission": fmt_amount(commission),
            "total": fmt_amount(total),
            "closing": fmt_amount(closing),
            "paid": False,
        }
        # Fase 4: pagos reales; solo comparan ([ALG.ACTUAL]).
        for item in (item for item in here if item.phase == 4):
            row["paid"] = True
            breakdown = item.event.data["breakdown"]
            deltas = None
            if breakdown is not None:
                real = {
                    "capital": capital,
                    "interest": interest,
                    "insurance": insurance,
                    "fixedCharges": fixed,
                }
                deltas = {name: fmt_amount(breakdown[name] - real[name]) for name in real}
            payments[item.event.id] = {
                "eventId": item.event.id,
                "k": k,
                "componentDeltas": deltas,
            }
        rows.append(row)
        if loan.balance <= 0:
            break
    if by_k:
        raise InvalidInputError(
            "ALG.EVENTS.ANCHOR", "evento después de la última cuota", k=min(by_k)
        )
    return {
        "rows": rows,
        "anchors": [anchors[event.id] for event in parsed if event.id in anchors],
        "payments": [payments[event.id] for event in parsed if event.id in payments],
        "summary": summarize(rows),
    }


def _sum(rows: list[dict], field: str) -> Decimal:
    return sum((Decimal(row[field]) for row in rows), ZERO)


def summarize(rows: list[dict]) -> dict:
    """[ALG.METRICS]: resumen de FORMAT.md §3.5."""
    with calc_context():
        prepayments = _sum(rows, "prepayment")
        commissions = _sum(rows, "commission")
        return {
            "installments": len(rows),
            "endDate": rows[-1]["dueDate"],
            "totalInterest": fmt_amount(_sum(rows, "interest")),
            "totalInsurance": fmt_amount(_sum(rows, "insurance")),
            "totalCapital": fmt_amount(_sum(rows, "capital")),
            "totalFixedCharges": fmt_amount(_sum(rows, "fixedCharges")),
            "totalPrepayments": fmt_amount(prepayments),
            "totalCommissions": fmt_amount(commissions),
            "totalPaid": fmt_amount(_sum(rows, "total") + prepayments + commissions),
        }


def yearly_subtotals(rows: list[dict]) -> list[dict]:
    """[ALG.YEARLY]: por año calendario del vencimiento; un año sin cuotas no aparece."""
    years: dict[int, list[dict]] = {}
    for row in rows:
        years.setdefault(int(row["dueDate"][:4]), []).append(row)
    with calc_context():
        return [
            {
                "year": year,
                "capital": fmt_amount(_sum(group, "capital")),
                "interest": fmt_amount(_sum(group, "interest")),
                "insurance": fmt_amount(_sum(group, "insurance")),
                "fixedCharges": fmt_amount(_sum(group, "fixedCharges")),
                "prepayments": fmt_amount(_sum(group, "prepayment")),
                "commissions": fmt_amount(_sum(group, "commission")),
                "total": fmt_amount(_sum(group, "total")),
            }
            for year, group in sorted(years.items())
        ]
