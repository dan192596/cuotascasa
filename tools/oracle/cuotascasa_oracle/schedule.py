"""Camino real sin eventos: [ALG.LEVEL], [ALG.PERIOD.*], [ALG.LAST*], [ALG.FIXED], [ALG.ZERO]."""

from __future__ import annotations

from decimal import Decimal

from . import dates
from .errors import InvalidInputError
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


def _normal_period(terms: Terms, balance: Decimal, level: Decimal):
    """Cuota «como normal»: devuelve (financialCharge, interest, components)."""
    i = terms.interest_rate
    rates = terms.insurance_rates
    f = sum(rates, ZERO)
    if terms.rounding_profile == "SIMPLE":
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


def _last_period(terms: Terms, balance: Decimal):
    """[ALG.LAST]: devuelve (interest, components)."""
    i = terms.interest_rate
    rates = terms.insurance_rates
    interest = half_up_2((balance * i) / TWELVE)
    if terms.rounding_profile == "SIMPLE":
        return interest, [half_up_2((balance * rate) / TWELVE) for rate in rates]
    f = sum(rates, ZERO)
    insurance = half_up_2((balance * f) / TWELVE)
    return interest, _split_insurance(insurance, rates, f)


def build_schedule(raw_terms: dict, events: object = ()) -> dict:
    """Calendario del camino real sin eventos. Devuelve {rows, anchors, payments, summary}."""
    if isinstance(events, tuple) and not events:
        events = []
    if not isinstance(events, list) or events:
        # Fuera del alcance de W1-02 (los eventos llegan con W2-06).
        raise InvalidInputError("ALG.EVENTS", "eventos fuera del alcance de este perfil")
    terms = parse_terms(raw_terms)
    with calc_context():
        return _build(terms)


def _build(terms: Terms) -> dict:
    term = terms.term_months
    f = sum(terms.insurance_rates, ZERO)
    level = level_installment(terms.principal, terms.interest_rate + f, term)
    balance = terms.principal
    rows: list[dict] = []
    k = 0
    while True:
        k += 1
        due = dates.due_date(terms.first_due_date, terms.payment_day, k)
        fixed = sum((c.amount for c in terms.fixed_charges if c.effective_from <= due), ZERO)
        fixed = half_up_2(fixed)
        charge, interest, parts = _normal_period(terms, balance, level)
        if k == term or level - charge >= balance:
            capital = balance
            interest, parts = _last_period(terms, balance)
            last = True
        else:
            capital = level - charge
            last = False
        insurance = sum(parts, ZERO)
        total = capital + interest + insurance + fixed
        rows.append(
            {
                "k": k,
                "dueDate": due.isoformat(),
                "opening": fmt_amount(balance),
                "level": fmt_amount(level),
                "interest": fmt_amount(interest),
                "insurance": fmt_amount(insurance),
                "insuranceComponents": [fmt_amount(p) for p in parts],
                "capital": fmt_amount(capital),
                "fixedCharges": fmt_amount(fixed),
                "prepayment": "0.00",
                "commission": "0.00",
                "total": fmt_amount(total),
                "closing": fmt_amount(balance - capital),
                "paid": False,
            }
        )
        balance -= capital
        if last:
            break
    return {"rows": rows, "anchors": [], "payments": [], "summary": summarize(rows)}


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
