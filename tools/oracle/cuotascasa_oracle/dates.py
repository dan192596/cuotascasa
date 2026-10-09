"""Vencimientos de [ALG.DATES] con fechas de calendario puras."""

from __future__ import annotations

import calendar
from datetime import date

from .errors import InvalidInputError

END_OF_MONTH = "END_OF_MONTH"


def parse_date(text: object) -> date:
    """AAAA-MM-DD estricto."""
    if not isinstance(text, str) or len(text) != 10 or text[4] != "-" or text[7] != "-":
        raise InvalidInputError("ALG.TERMS", "fecha inválida")
    try:
        return date(int(text[0:4]), int(text[5:7]), int(text[8:10]))
    except ValueError as error:
        raise InvalidInputError("ALG.TERMS", "fecha inválida") from error


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _day_for(year: int, month: int, payment_day: int | str) -> int:
    last = days_in_month(year, month)
    if payment_day == END_OF_MONTH:
        return last
    return min(int(payment_day), last)


def check_consistency(first_due: date, payment_day: int | str) -> None:
    """El día de firstDueDate debe cumplir la regla de paymentDay en su propio mes."""
    if first_due.day != _day_for(first_due.year, first_due.month, payment_day):
        raise InvalidInputError("ALG.DATES", "firstDueDate no coincide con paymentDay")


def due_date(first_due: date, payment_day: int | str, k: int) -> date:
    """Vencimiento de la cuota k (1-indexada)."""
    month_index = first_due.year * 12 + (first_due.month - 1) + (k - 1)
    year, month = divmod(month_index, 12)
    month += 1
    return date(year, month, _day_for(year, month, payment_day))
