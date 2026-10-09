"""Errores tipados del oráculo ([ALG.ERRORS])."""

from __future__ import annotations


class OracleError(Exception):
    """Base de los errores del oráculo."""


class InvalidInputError(OracleError):
    """Entrada mal formada o inconsistente; `rule` es el id de la regla sin corchetes.

    `k` es la cuota del error, si aplica (`details.k` en el dominio).
    """

    def __init__(self, rule: str, message: str = "", *, k: int | None = None) -> None:
        super().__init__(f"{rule}: {message}" if message else rule)
        self.rule = rule
        self.k = k


class NegativeAmortizationError(OracleError):
    """Amortización nula o negativa ([ALG.TERM], [ALG.RATE.KEEP_INSTALLMENT], …) en la cuota `k`."""

    def __init__(self, rule: str, k: int) -> None:
        super().__init__(f"{rule}: k={k}")
        self.rule = rule
        self.k = k
