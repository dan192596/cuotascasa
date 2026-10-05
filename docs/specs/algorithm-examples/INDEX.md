# Ejemplos resueltos de `docs/algorithm.md`

<!-- Escrito por W0-02 con scripts fuera del repo. Después de W0 solo lo cambia Opus (W3-01 o una micro-tarjeta de docs). -->

Copias legibles por máquina de los ejemplos sintéticos de `docs/algorithm.md`. Todo archivo lleva `synthetic: true`
y solo datos sintéticos. Son la verdad común de los dos linajes: el motor (W1-01, W2-03, W2-04, W2-05, W2-07, W3-03)
y el oráculo (W1-02, W2-06). Si un ejemplo y `docs/algorithm.md` se contradicen, gana `docs/algorithm.md` y se escala a Opus.
Los campos usan los nombres de los contratos congelados de W0-03 y W0-04 (sección «Formato»): las tarjetas del motor los
usan tal cual y el oráculo los convierte a su formato de fixtures (`tools/oracle/FORMAT.md`).

- `core/`: ejemplos **sin eventos** (lista de eventos vacía). Son los que reproducen W1-01 y el perfil `core` del oráculo (W1-02).
- `events/`: ejemplos **con eventos**. Los casos de búsqueda por meta y de validación van siempre aquí, aunque no traigan eventos reales: su abono (`Prepayment`) y su saldo reportado (`ReportedBalance`) cuentan en `eventTypes`.

Cada ejemplo lo calculó un script y lo **recalculó otro independiente**, con aritmética racional exacta; ambos viven fuera del repo
(columna «Recalculado»).

## Checklist de [ALG.PENDING]

| Ítem | Qué cubre | Reglas | Ejemplos | Recalculado |
|---|---|---|---|---|
| EX | Ejemplo base de [ALG.EXAMPLE]: calendario sin eventos y sus abonos de ejemplo | [ALG.EXAMPLE](../../algorithm.md#alg-example), [ALG.CONV](../../algorithm.md#alg-conv), [ALG.TERMS](../../algorithm.md#alg-terms), [ALG.LEVEL](../../algorithm.md#alg-level), [ALG.PERIOD.FHA_GT_V1](../../algorithm.md#alg-period-fha-gt-v1), [ALG.PERIOD.SPLIT](../../algorithm.md#alg-period-split), [ALG.LAST](../../algorithm.md#alg-last), [ALG.LAST.FIXED_TERM](../../algorithm.md#alg-last-fixed-term), [ALG.FIXED](../../algorithm.md#alg-fixed), [ALG.DATES](../../algorithm.md#alg-dates), [ALG.PREPAY](../../algorithm.md#alg-prepay), [ALG.PREPAY.REDUCE_TERM](../../algorithm.md#alg-prepay-reduce-term), [ALG.PREPAY.REDUCE_INSTALLMENT](../../algorithm.md#alg-prepay-reduce-installment), [ALG.ADVANCE](../../algorithm.md#alg-advance), [ALG.TERM](../../algorithm.md#alg-term), [ALG.LAST.DERIVED_TERM](../../algorithm.md#alg-last-derived-term), [ALG.METRICS](../../algorithm.md#alg-metrics) | [core/ex00-base-fha.json](core/ex00-base-fha.json), [events/ex00-base-prepayments.json](events/ex00-base-prepayments.json) | sí |
| 1 | Perfil `SIMPLE`, incluida la última cuota con dos componentes. Debe distinguir las lecturas de [ALG.LAST]. | [ALG.PERIOD.SIMPLE](../../algorithm.md#alg-period-simple), [ALG.LAST](../../algorithm.md#alg-last), [ALG.LAST.FIXED_TERM](../../algorithm.md#alg-last-fixed-term), [ALG.PERIOD.FHA_GT_V1](../../algorithm.md#alg-period-fha-gt-v1), [ALG.PERIOD.SPLIT](../../algorithm.md#alg-period-split), [ALG.DATES](../../algorithm.md#alg-dates) | [core/ex01-simple-two-components.json](core/ex01-simple-two-components.json) | sí |
| 2 | `paymentDay` 15, 30 y 31, más `END_OF_MONTH`, cruzando febrero de año bisiesto y no bisiesto. | [ALG.DATES](../../algorithm.md#alg-dates) | [core/ex02-payment-days.json](core/ex02-payment-days.json) | sí |
| 3 | Cada política de `RateChange`, incluido el término derivado y `NegativeAmortizationError`. | [ALG.RATE](../../algorithm.md#alg-rate), [ALG.RATE.RECALC_KEEP_TERM](../../algorithm.md#alg-rate-recalc-keep-term), [ALG.RATE.KEEP_INSTALLMENT](../../algorithm.md#alg-rate-keep-installment), [ALG.RATE.BANK_INSTALLMENT](../../algorithm.md#alg-rate-bank-installment), [ALG.TERM](../../algorithm.md#alg-term), [ALG.LAST.DERIVED_TERM](../../algorithm.md#alg-last-derived-term), [ALG.EVENTS.ORDER](../../algorithm.md#alg-events-order) | [events/ex03-rate-change-policies.json](events/ex03-rate-change-policies.json) | sí |
| 4 | `REDUCE_TERM` en `k = 12` seguido de `RateChange` `RECALC_INSTALLMENT_KEEP_TERM` en `k = 24` (uso del `term` vigente). | [ALG.TERM](../../algorithm.md#alg-term), [ALG.RATE.RECALC_KEEP_TERM](../../algorithm.md#alg-rate-recalc-keep-term), [ALG.PREPAY.REDUCE_TERM](../../algorithm.md#alg-prepay-reduce-term), [ALG.LAST.FIXED_TERM](../../algorithm.md#alg-last-fixed-term), [ALG.ANCHOR](../../algorithm.md#alg-anchor) | [events/ex04-reduce-term-then-recalc.json](events/ex04-reduce-term-then-recalc.json) | sí |
| 5 | `FixedChargeChange` con lista completa, quitando un cargo y con un cargo de `effectiveFrom` futuro. | [ALG.FIXED](../../algorithm.md#alg-fixed), [ALG.FIXEDCHANGE](../../algorithm.md#alg-fixedchange), [ALG.EVENTS.ORDER](../../algorithm.md#alg-events-order) | [core/ex05a-fixed-charge-effective-from.json](core/ex05a-fixed-charge-effective-from.json), [events/ex05b-fixed-charge-change.json](events/ex05b-fixed-charge-change.json) | sí |
| 6 | Comisiones `FLAT` y `PERCENT`, y `payoff` por [ALG.PREPAY.CAP]. | [ALG.PREPAY.COMMISSION](../../algorithm.md#alg-prepay-commission), [ALG.PREPAY.CAP](../../algorithm.md#alg-prepay-cap), [ALG.PREPAY](../../algorithm.md#alg-prepay), [ALG.METRICS](../../algorithm.md#alg-metrics) | [events/ex06-commissions-payoff.json](events/ex06-commissions-payoff.json) | sí |
| 7 | Ancla y `RateChange` en la misma `k`, dos anclas en la misma `k`, y un ancla que sube el saldo en plazo derivado (`NegativeAmortizationError` de [ALG.TERM]). | [ALG.ANCHOR](../../algorithm.md#alg-anchor), [ALG.EVENTS.ORDER](../../algorithm.md#alg-events-order), [ALG.RATE.RECALC_KEEP_TERM](../../algorithm.md#alg-rate-recalc-keep-term), [ALG.TERM](../../algorithm.md#alg-term), [ALG.LAST](../../algorithm.md#alg-last) | [events/ex07-same-k-anchors.json](events/ex07-same-k-anchors.json) | sí |
| 8 | Pago tardío con `installmentNumber`. | [ALG.ACTUAL](../../algorithm.md#alg-actual), [ALG.EVENTS.ANCHOR](../../algorithm.md#alg-events-anchor), [ALG.EVENTS.ORDER](../../algorithm.md#alg-events-order) | [events/ex08-late-actual-payment.json](events/ex08-late-actual-payment.json) | sí |
| 9 | `realDelta` por componente. | [ALG.ACTUAL](../../algorithm.md#alg-actual) | [events/ex09-actual-payment-component-delta.json](events/ex09-actual-payment-component-delta.json) | sí |
| 10 | `cutoffK` con un abono real posterior a un ancla, y error al poner un hipotético en `k ≤ cutoffK`. Además, un escenario que liquida antes de un evento real futuro y lo hereda sin error ([ALG.EVENTS.ANCHOR]). | [ALG.PATHS](../../algorithm.md#alg-paths), [ALG.PATHS.CUTOFF](../../algorithm.md#alg-paths-cutoff), [ALG.ANCHOR](../../algorithm.md#alg-anchor), [ALG.METRICS](../../algorithm.md#alg-metrics), [ALG.EVENTS.ANCHOR](../../algorithm.md#alg-events-anchor) | [events/ex10-cutoff.json](events/ex10-cutoff.json) | sí |
| 11 | Búsqueda por meta: `ALREADY_MET` y `FOUND` (incluido `isPayoff`) para ambas metas, e `INFEASIBLE` para `FINISH_BY` (con `MAX_INSTALLMENT` no existe; ver [ALG.GOAL]). Además, un evento real futuro que las pruebas heredan sin error y un abono posterior a la última cuota del camino base (`InfeasibleGoalError`). | [ALG.GOAL](../../algorithm.md#alg-goal), [ALG.PREPAY.REDUCE_TERM](../../algorithm.md#alg-prepay-reduce-term), [ALG.PREPAY.REDUCE_INSTALLMENT](../../algorithm.md#alg-prepay-reduce-installment), [ALG.METRICS](../../algorithm.md#alg-metrics), [ALG.EVENTS.ANCHOR](../../algorithm.md#alg-events-anchor) | [events/ex11-goal-seek.json](events/ex11-goal-seek.json) | sí |
| 12 | Semáforo `GREEN`, `AMBER` y `RED` en ambos bordes, `INSTALLMENT_MISALIGNMENT`, y un saldo reportado después de la última cuota (`InvalidInputError`). | [ALG.VALIDATE](../../algorithm.md#alg-validate), [ALG.ANCHOR](../../algorithm.md#alg-anchor), [ALG.EVENTS.ANCHOR](../../algorithm.md#alg-events-anchor) | [events/ex12-validation-traffic-light.json](events/ex12-validation-traffic-light.json) | sí |
| 13 | Subtotales anuales y métricas (`interestSaved`, `monthsSaved`, `totalPaid`, `netSaving`). | [ALG.YEARLY](../../algorithm.md#alg-yearly), [ALG.EXAMPLE](../../algorithm.md#alg-example), [ALG.METRICS](../../algorithm.md#alg-metrics), [ALG.PATHS](../../algorithm.md#alg-paths) | [core/ex13a-yearly-subtotals.json](core/ex13a-yearly-subtotals.json), [events/ex13b-metrics.json](events/ex13b-metrics.json) | sí |
| 14 | [ALG.ZERO]: `r = 0`, y `FHA_GT_V1` con `f = 0` (tasas en cero o `insuranceRates = []`) y con `i = 0`. | [ALG.ZERO](../../algorithm.md#alg-zero), [ALG.LEVEL](../../algorithm.md#alg-level), [ALG.PERIOD.FHA_GT_V1](../../algorithm.md#alg-period-fha-gt-v1), [ALG.LAST](../../algorithm.md#alg-last) | [core/ex14-zero-rates.json](core/ex14-zero-rates.json) | sí |
| 15 | Par `firstDueDate`/`paymentDay` inválido (`InvalidInputError`) y válido en febrero bisiesto. | [ALG.DATES](../../algorithm.md#alg-dates) | [core/ex15-due-date-consistency.json](core/ex15-due-date-consistency.json) | sí |
| 16 | Ancla con `installmentNumber` explícito distinto de la cuota que daría su fecha, y evento fuera de rango por número o por fecha ([ALG.EVENTS.ANCHOR]). | [ALG.EVENTS.ANCHOR](../../algorithm.md#alg-events-anchor), [ALG.ANCHOR](../../algorithm.md#alg-anchor) | [events/ex16-explicit-k-anchor.json](events/ex16-explicit-k-anchor.json) | sí |
| 17 | Empate exacto de medio centavo en el cargo de `FHA_GT_V1` ([ALG.CONV], [ALG.PERIOD.FHA_GT_V1]). | [ALG.CONV](../../algorithm.md#alg-conv), [ALG.PERIOD.FHA_GT_V1](../../algorithm.md#alg-period-fha-gt-v1), [ALG.PERIOD.SPLIT](../../algorithm.md#alg-period-split), [ALG.LEVEL](../../algorithm.md#alg-level), [ALG.LAST](../../algorithm.md#alg-last) | [core/ex17-fha-half-cent-tie.json](core/ex17-fha-half-cent-tie.json) | sí |

## Archivos

| Archivo | Conjunto | Eventos | Casos |
|---|---|---|---|
| [core/ex00-base-fha.json](core/ex00-base-fha.json) | core | — | `main` |
| [core/ex01-simple-two-components.json](core/ex01-simple-two-components.json) | core | — | `simple`, `same-terms-fha` |
| [core/ex02-payment-days.json](core/ex02-payment-days.json) | core | — | `day-15`, `day-30`, `day-31`, `end-of-month` |
| [core/ex05a-fixed-charge-effective-from.json](core/ex05a-fixed-charge-effective-from.json) | core | — | `main` |
| [core/ex13a-yearly-subtotals.json](core/ex13a-yearly-subtotals.json) | core | — | `main` |
| [core/ex14-zero-rates.json](core/ex14-zero-rates.json) | core | — | `r-zero`, `fha-f-zero`, `fha-i-zero`, `fha-no-insurance` |
| [core/ex15-due-date-consistency.json](core/ex15-due-date-consistency.json) | core | — | `invalid-eom`, `invalid-day-15`, `invalid-day-30-leap`, `valid-day-31-leap`, `valid-day-30-leap`, `valid-eom-leap` |
| [core/ex17-fha-half-cent-tie.json](core/ex17-fha-half-cent-tie.json) | core | — | `main` |
| [events/ex00-base-prepayments.json](events/ex00-base-prepayments.json) | events | AdvanceInstallments, Prepayment | `reduce-term`, `reduce-installment`, `advance-6`, `advance-6-fixed-term` |
| [events/ex03-rate-change-policies.json](events/ex03-rate-change-policies.json) | events | RateChange | `recalc-keep-term`, `keep-installment`, `bank-installment`, `keep-installment-negative`, `bank-installment-negative` |
| [events/ex04-reduce-term-then-recalc.json](events/ex04-reduce-term-then-recalc.json) | events | Prepayment, RateChange, ReportedBalance | `main`, `anchor-then-recalc-fixed-term` |
| [events/ex05b-fixed-charge-change.json](events/ex05b-fixed-charge-change.json) | events | FixedChargeChange | `main` |
| [events/ex06-commissions-payoff.json](events/ex06-commissions-payoff.json) | events | Prepayment | `flat`, `percent`, `payoff`, `reduce-installment-tiny-balance`, `flat-after-payoff` |
| [events/ex07-same-k-anchors.json](events/ex07-same-k-anchors.json) | events | Prepayment, RateChange, ReportedBalance | `anchor-and-rate`, `anchor-and-rate-derived-term`, `two-anchors-by-date`, `two-anchors-same-date`, `anchor-derived-term-negative` |
| [events/ex08-late-actual-payment.json](events/ex08-late-actual-payment.json) | events | ActualPayment | `late-payment`, `missing-installment-number`, `installment-number-zero` |
| [events/ex09-actual-payment-component-delta.json](events/ex09-actual-payment-component-delta.json) | events | ActualPayment | `main` |
| [events/ex10-cutoff.json](events/ex10-cutoff.json) | events | Prepayment, RateChange, ReportedBalance | `valid-scenario`, `hypothetical-at-cutoff`, `scenario-payoff-before-future-real-event` |
| [events/ex11-goal-seek.json](events/ex11-goal-seek.json) | events | Prepayment, RateChange, ReportedBalance | `finish-by-already-met`, `finish-by-found`, `finish-by-found-payoff`, `finish-by-infeasible`, `max-installment-already-met`, `max-installment-found`, `max-installment-found-payoff`, `goal-before-cutoff`, `finish-by-found-payoff-future-real-change`, `prepayment-after-base-end`, `scenario-base-missing`, `max-installment-negative`, `scenario-base-same-date`, `scenario-base-same-date-payoff` |
| [events/ex12-validation-traffic-light.json](events/ex12-validation-traffic-light.json) | events | ReportedBalance | `green-edge`, `amber-after-green`, `amber-edge-high-balance`, `red-after-amber-high-balance`, `amber-edge-low-balance`, `red-after-amber-low-balance`, `misalignment-previous`, `misalignment-next`, `modeled-with-prior-anchors`, `reported-after-last-installment` |
| [events/ex13b-metrics.json](events/ex13b-metrics.json) | events | Prepayment | `main` |
| [events/ex16-explicit-k-anchor.json](events/ex16-explicit-k-anchor.json) | events | ReportedBalance | `explicit-k`, `explicit-k-above-term`, `date-after-last-installment` |

## Formato de archivo `cuotascasa/algorithm-example@1`

**Nombres.** Las entradas usan los tipos de entrada de `packages/domain` (W0-03): `LoanTerms`, `DomainEvent`, `PathsInput`,
`GoalSeekRequest` y `TemplateValidationRequest`, cuyos eventos coinciden con las cargas de `LoanEvent` de `packages/schema`
(W0-04). `expected` usa los nombres de las salidas del dominio: `Schedule`, `ScheduleRow`, `ScheduleTotals`, `RealDelta`,
`YearlySubtotal`, `ComparisonMetrics`, `GoalSeekResult` y `TemplateValidationResult`. Lo que ninguna función del dominio
devuelve va aparte, en `context`. Un campo opcional que no aplica se omite: nunca vale `null` en las entradas.

Raíz:

| Campo | Tipo | Significado |
|---|---|---|
| `synthetic` | `true` | Marca obligatoria de datos sintéticos (ADR-0015) |
| `schema` | string | Siempre `cuotascasa/algorithm-example@1` |
| `id` | string | Igual al nombre del archivo sin `.json` |
| `title` | string | Descripción en español |
| `pendingItems` | entero[] | Ítems de [ALG.PENDING] que cubre (vacío en el ejemplo base) |
| `sections` | string[] | Ids `ALG.*` que el ejemplo ejercita, sin corchetes |
| `eventTypes` | string[] | Tipos de evento usados, ordenados; vacío = sin eventos |
| `cases` | objeto[] | Casos; cada uno con `id`, `operation`, `description`, sus entradas, `expected` y, si aplica, `context` |

Entradas de un caso, según `operation`:

| `operation` | Entradas | Llamada al dominio (W0-03) |
|---|---|---|
| `buildSchedule` | `terms`, `events` | `buildSchedule(terms, events)`; `realDelta` = `runSchedule(terms, events).realDelta` |
| `buildPaths` | `terms`, `realEvents`, `scenarioEvents` (un `PathsInput`) | `buildPaths(input)`; `metrics` = `compareSchedules(real, scenario)` |
| `goalSeek` | `terms`, `realEvents`, `scenarioEvents` (`null`: sin escenario) y `request` (un `GoalSeekRequest`) | `goalSeek(buildPaths({terms, realEvents, scenarioEvents}), request)` |
| `validateAgainstReportedBalance` | `terms`, `realEvents` y `reported` (un `TemplateValidationRequest`) | `validateAgainstReportedBalance({terms, realEvents, reported})` |

- `terms` (`LoanTerms`, [ALG.TERMS]): `principal`, `termMonths`, `disbursementDate`, `firstDueDate`, `paymentDay`
  (entero 1–31 o `"END_OF_MONTH"`), `currency`, `interestRate`, `insuranceRates` (tasas en orden de arreglo; sin seguros, `[]` o tasas en cero),
  `fixedCharges` (`{label, amount, effectiveFrom}`), `roundingProfile` y `rateType`.
- Eventos (`DomainEvent`): todos con `id`, `type` y `date`, más los campos de su tipo:
  - `RateChange`: `policy`, `interestRate` y/o `insuranceRates` y, solo con `BANK_INSTALLMENT`, `bankInstallment` (cuota nivelada informada por el banco).
  - `FixedChargeChange`: `fixedCharges` (`[{label, amount}]`, sin `effectiveFrom`: rigen desde la cuota `k`).
  - `Prepayment`: `amount`, `mode` y, solo si hay comisión, `commission` (`{kind: "FLAT", amount}` o `{kind: "PERCENT", rate}`).
  - `AdvanceInstallments`: `count` (N).
  - `ReportedBalance`: `balance` e `installmentNumber` opcional.
  - `ActualPayment`: `installmentNumber` (obligatorio), `total` y `breakdown` opcional con los cuatro componentes
    `capital`, `interest`, `insurance` y `fixedCharges`. `date` es la fecha de pago (`ActualPaymentEvent.date`; la entidad
    de W0-04 la guarda como `paidDate`).
- `request` (`GoalSeekRequest`): `{basePath: "REAL" | "SCENARIO", prepaymentDate, goal}`, con
  `goal = {kind: "FINISH_BY", date}` o `{kind: "MAX_INSTALLMENT", amount}`.
- `reported` (`ReportedBalanceEvent`): `{id, type: "ReportedBalance", date, installmentNumber?, balance}`.

`expected` según `operation`:

- `buildSchedule` (`Schedule`): `installmentCount`, `endDate`, `rows` (filas elegidas, siempre con la última) y `totals`;
  además, si aplican: `realDelta` (solo si hay anclas o pagos con desglose), `yearly` (`yearlySubtotals`, [ALG.YEARLY]) y
  `comparedToNoEvents` (`compareSchedules` de las mismas condiciones sin eventos contra este calendario).
- `buildPaths` (`Paths`): `cutoffK`, `original` (`installmentCount`, `endDate` y `totals`), `real` y `scenario` (como
  `buildSchedule`, sin `realDelta`), `realDelta` (del camino real) y `metrics` (`compareSchedules(real, scenario)`).
- `goalSeek` (`GoalSeekResult`): `{kind: "ALREADY_MET"}`, `{kind: "FOUND", amount, metrics, isPayoff}` o
  `{kind: "INFEASIBLE", payoffAmount, reason}`.
- `validateAgainstReportedBalance` (`TemplateValidationResult`): `k`, `reported`, `modeled`, `realDelta`, `status` y `cause`.
- Un caso que debe fallar trae `expected.error = {type, rule, k?}`: `type` es la clase de [ALG.ERRORS] (el `name` del error
  del dominio), `rule` la regla que lo exige y `k` la cuota, si aplica (`NegativeAmortizationError.k`; en
  `InvalidInputError` e `InfeasibleGoalError`, `details.k`).

Objetos de `expected`:

- Fila (`rows[]`, subconjunto de `ScheduleRow` con las columnas de la fila de los fixtures del oráculo): `k`, `dueDate`,
  `opening`, `level`, `interest`, `insurance` (suma), `insuranceComponents` (por componente, en el orden de `insuranceRates`),
  `capital`, `fixedCharges` (suma vigente), `total` (`capital + interest + insurance + fixedCharges`), `closing`
  (`opening − capital`, antes de la fase 3), `prepayment` (abono aplicado tras el tope), `commission` y `paid`. La apertura
  de la cuota siguiente es `closing − prepayment` (`closingAfterPrepayment` en `ScheduleRow`), salvo re-anclaje.
- `totals` (`ScheduleTotals`): `interest`, `insurance`, `capital`, `fixedCharges`, `prepayments`, `commissions`, `total` y
  `totalPaid = total + prepayments + commissions` ([ALG.METRICS]).
- `realDelta` (`RealDelta`): `perAnchor` (`{eventId, k, reported, projected, realDelta}`, [ALG.ANCHOR]) y `perComponent`
  (`{eventId, k, capital, interest, insurance, fixedCharges}`, [ALG.ACTUAL]), en el orden de [ALG.EVENTS.ORDER].
- `yearly[]` (`YearlySubtotal`): `year`, `capital`, `interest`, `insurance`, `fixedCharges`, `prepayments`, `commissions` y `total`.
- `ComparisonMetrics` (`metrics`, `comparedToNoEvents`): `currency`, `interestSaved`, `monthsSaved`, `baseEndDate`,
  `endDate`, `baseTotalPaid`, `totalPaid` y `netSaving` ([ALG.METRICS]).

`context` (valores que el dominio no devuelve):

- `goalSeek`: `k` (cuota del abono) y `closingK` (saldo que encuentra el abono de la búsqueda: cierre de `k` en el camino
  base menos los abonos del camino base que van antes en `k`; tope de la bisección y `payoffAmount`).
- `validateAgainstReportedBalance`: `modeledPrevious` y `modeledNext` (aperturas modeladas de `k − 1` y `k + 1`) y
  `amberLimit` (`máx(50.00, 0.0002 · Bᵣ)`, sin redondear, escrito con 6 decimales).

Montos y tasas son **strings decimales** (montos con 2 decimales); los enteros JSON solo se usan para conteos
(`termMonths`, `paymentDay`, `k`, `count`, `installmentNumber`, `installmentCount`, `monthsSaved`, `cutoffK`, `year`).

## Reglas de validación

Las comprueba el script de W0-02 y, desde W0-06, el job de CI que valida `docs/specs/algorithm-examples`:

1. Cada ítem de [ALG.PENDING] (y `EX`, el ejemplo base) tiene una fila en el checklist con al menos un ancla de
   `docs/algorithm.md` que existe y al menos un archivo cuyo `pendingItems` incluye el ítem (`EX`: cuyo `sections` cita `ALG.EXAMPLE`).
2. Todo enlace de este índice resuelve: archivos existentes y anclas `<a id="…">` presentes en `docs/algorithm.md`.
3. Todo JSON tiene `synthetic: true`, `schema` e `id` correctos; montos y tasas son strings decimales; no hay números JSON
   con decimales, y los enteros solo aparecen en los campos de conteo.
4. `core/` solo tiene archivos con `eventTypes` vacío; `events/` solo archivos con `eventTypes` no vacío, igual a los tipos que usan sus casos.
5. Cada archivo aparece en «Archivos» con su lista de eventos exacta (`—` si es vacía).
6. Cada id de `sections` está definido en `docs/algorithm.md`.
7. Las entradas usan solo los campos de los contratos congelados: `terms` tiene exactamente los de `LoanTerms`; cada evento,
   los de su tipo en `DomainEvent`, sin campos `null` y con los obligatorios (salvo en un caso que espera un error);
   `commission`, `breakdown`, los cargos de `FixedChargeChange`, `request` y `goal` tienen sus campos exactos.
8. `expected` y `context` tienen exactamente los campos de su `operation` (sección «Formato»), y cada fila, `totals`,
   `realDelta`, `yearly`, `original` y `ComparisonMetrics`, los suyos; las filas de cada calendario terminan en
   `k = installmentCount`, sin repetidas.
