# Triage de conformidad (motor ↔ oráculo)

Lo redacta Opus en los gates del oráculo (W3-01, W4-01). Lo lee también el linaje del oráculo (`docs/plan/README.md`, sección 3), así que cada ítem cita solo la regla `[ALG.*]`, el id del fixture, la fila y el campo, y explica qué dice la regla. **Nunca** incluye código, rutas ni nombres internos del motor, ni los valores que calculó el motor.

Clasificaciones posibles: **error del motor** (W4-02), **error del oráculo** (W3-04) o **ambigüedad de `algorithm.md`** (la corrige Opus en el gate y la aplican los dos linajes).

## W3-01 (2026-10-09)

**Fixtures.** `tools/oracle/fixtures/manifest.json`: `core` (15, semilla 20261119) y `full` (40, semilla 20261027), ambos con `generatorVersion` 1 y generados con el oráculo del commit `a31fc33`. `core` no cambió. La semilla de `full` es la primera, en orden ascendente desde 20261009, sin coincidencias con la denylist privada (19 intentos).

**Corrida.** El arnés corrió en local con **todas** las etiquetas habilitadas sobre los 55 fixtures: 55 coinciden al centavo en cada fila, campo, resumen, ancla y pago; 0 fixtures con diferencias y 0 fixtures rechazados por el esquema. En CI, `full` sigue pendiente (solo `core` está en `enforced-features.json`); W4-02 agrega las etiquetas.

**Revisión a mano** (cálculo independiente escrito solo desde `docs/algorithm.md`, comparando cada fila y campo):

| Fixture | Qué ejercita | Reglas | Resultado |
|---|---|---|---|
| `full-0003` | `RateChange` `BANK_INSTALLMENT` en la cuota 20 | [ALG.EVENTS.ANCHOR], [ALG.RATE.BANK_INSTALLMENT], [ALG.TERM], [ALG.LAST.DERIVED_TERM], [ALG.PERIOD.SPLIT] | Coinciden las 156 filas: `level` de la fila 20 = `bankInstallment` y plazo derivado hasta la última |
| `full-0030` | Liquidación con `Prepayment` `REDUCE_INSTALLMENT` y comisión `PERCENT` en la cuota 39 | [ALG.PREPAY.CAP], [ALG.PREPAY.COMMISSION], [ALG.METRICS] | Coinciden las 39 filas; `prepayment` = cierre de la fila 39, `commission` = `HALF_UP_2(abono · 0.03)` y `totalPaid` del resumen |
| `full-0031` | Dos `ReportedBalance` en la cuota 48 y un `ActualPayment` con desglose en la 59 | [ALG.EVENTS.ORDER] (fase 0), [ALG.ANCHOR], [ALG.LAST.FIXED_TERM], [ALG.ACTUAL] | Coinciden las 264 filas; ambas anclas reportan `realDelta` contra la misma apertura proyectada, re-ancla la de fecha mayor, y `componentDeltas` y `paid` de la fila 59 coinciden |

### Ítems

| # | Familia | Regla | Fixture / fila / campo | Qué dice la regla | Clasificación | Tarjeta |
|---|---|---|---|---|---|---|
| 1 | Validación de plantilla con calendario modelado que no amortiza | [ALG.VALIDATE] | Ningún fixture: la validación está fuera del alcance del oráculo (`tools/oracle/FORMAT.md` §11) | El calendario modelado de un ancla conserva los eventos reales posteriores pero no las anclas de su `k` ni las posteriores, así que puede no amortizar aunque el camino real sí. La regla no decía qué semáforo dar. Dictamen de Opus, ya escrito en [ALG.VALIDATE]: ese saldo reportado queda `UNVALIDATED`, con causa nula, sin apertura modelada ni `realDelta` de validación; el error no se propaga y el préstamo se sigue calculando | Ambigüedad de `algorithm.md` (corregida) | W4-02 la aplica a la validación de plantilla. W3-04: no aplica mientras el oráculo no cubra la validación (FORMAT §11); si su alcance la incluyera, la refleja igual |

No hay ítems del lado del oráculo para W3-04.

### División de W4-02

Familias del lado del motor: 0 por discrepancias de fixtures y 1 por la ambigüedad corregida (ítem 1). Son menos de 5, así que **W4-02 no se divide**.

### Seguimiento fuera de este triage

Los ejemplos de los dos dictámenes de W2 en [ALG.TERM] y [ALG.ADVANCE] (`RECALC_INSTALLMENT_KEEP_TERM` con plazo derivado y ancla al alza en la misma `k`; `AdvanceInstallments` con proyección negativa) los agrega una micro-tarjeta de Opus al cierre de W3, que posee `docs/specs/algorithm-examples/` y la prueba de conteo del oráculo.

## Riesgo residual (validación privada no autorizada)

El dueño no autorizó la validación privada (`docs/specs/oracle-validation-log.md`: `2026-10-09 · W3-01 · oráculo a31fc33 · validación privada: no autorizada`). Queda sin cubrir un error común al motor y al oráculo que los ejemplos sintéticos de `docs/algorithm.md` y `docs/specs/algorithm-examples/` no ejerciten: si ambos linajes leen igual de mal una regla `[ALG.*]`, los fixtures y el motor coinciden entre sí y el error pasa la compuerta. W4-01 repite esta anotación mientras no haya autorización, y W7-01 la lleva al checklist del release.
