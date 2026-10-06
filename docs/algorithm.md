# Especificación del algoritmo de cálculo

> **Fuente única de verdad** del motor (`packages/domain`) y del oráculo de referencia (`tools/oracle`).
> Ambas implementaciones se escriben **solo** a partir de este documento, por linajes de agentes distintos.
> Cada regla tiene un identificador estable `[ALG.*]` que el código, las pruebas y los fixtures citan.
> En caso de contradicción entre documentos, **este documento gana** (ver precedencia en `CLAUDE.md`).
>
> **Estado:** v1 (2026-10-04), completada por **W0-02**: un ejemplo sintético resuelto por cada ítem de [ALG.PENDING]
> en `docs/specs/algorithm-examples/` (índice en `INDEX.md`). Después de W0 solo la modifica Opus,
> y cada cambio obliga a regenerar el oráculo.
>
> **Validación:** el perfil `FHA_GT_V1` reprodujo **al centavo todas las filas, incluidos los totales**, de una tabla
> de amortización bancaria real. La validación fue privada (2026-10-04) y se hizo fuera del repositorio.
> **Ningún dato real aparece en este repositorio.** Todos los números de este documento son sintéticos.

---

## <a id="alg-conv"></a>[ALG.CONV] Convenciones numéricas

- **Contexto decimal:** precisión de **34 dígitos significativos** y redondeo intermedio **`ROUND_HALF_EVEN`**. Se aplica a toda operación que no sea un `HALF_UP_2` explícito:
  - Python: `decimal` con `prec = 34` (su modo por defecto ya es `ROUND_HALF_EVEN`).
  - TypeScript: un clon aislado, `Decimal.clone({ defaults: true, precision: 34, rounding: Decimal.ROUND_HALF_EVEN })` (`money/decimal-config.ts`); nunca `Decimal.set`, que cambia la configuración global (ADR-0003).
- **`HALF_UP_2(x)`:** redondeo a 2 decimales, mitad lejos de cero (`ROUND_HALF_UP`): 0.005 → 0.01 y −0.005 → −0.01. Es el **único** redondeo a centavos y ocurre **solo** donde esta especificación escribe `HALF_UP_2`. Los demás valores intermedios quedan en el contexto de 34 dígitos.
- **Potencias:** `(1 + r)^(−m)` se calcula como `1 / P`, con `P = (1 + r)^m` por exponenciación entera en el contexto decimal.
- **Orden de operaciones:** cada fórmula se evalúa tal como está escrita, de izquierda a derecha, y cada operación se redondea al contexto de 34 dígitos: `B · r / (1 − 1/P)` es `(B · r) / (1 − (1 / P))`; `charge · i / (i + f)` es `(charge · i) / (i + f)`; `insurance · fⱼ / f` es `(insurance · fⱼ) / f`; `B · i / 12` es `(B · i) / 12`; `B · fⱼ / 12` es `(B · fⱼ) / 12`. El cargo de `FHA_GT_V1` se evalúa como `(B · (i + f)) / 12`, nunca como `B` por una `r` ya redondeada al contexto: con `i + f = 0.07` y `B = 1506.00`, `charge = HALF_UP_2(8.785) = 8.79`. Las sumas y restas de montos de 2 decimales son exactas.
- **Montos:** strings decimales con 2 decimales (`"500000.00"`) en todas las fronteras (JSON, almacenamiento, UI). Nunca `number` de JavaScript.
- **Tasas:** strings decimales anuales (`"0.07"` = 7 %, `"0.0126"` = 1.26 %).
- **Fechas:** `LocalDate` con formato `AAAA-MM-DD`, sin hora ni zona. Nunca `Date` dentro del dominio. El dominio **no** usa la fecha de hoy; quien necesite "hoy" lo recibe de la capa de datos (`Clock.today()`).
- **Base de interés:** mensual 30/360. El cargo de un periodo no depende del día real de pago.

## <a id="alg-terms"></a>[ALG.TERMS] Condiciones de un préstamo

| Campo | Significado |
|---|---|
| `principal` | Monto desembolsado (> 0) |
| `termMonths` | Plazo pactado en cuotas (entero ≥ 1) |
| `disbursementDate` | Fecha de desembolso. Informativa: no genera interés extra en v1 |
| `firstDueDate` | Fecha de vencimiento de la cuota 1 |
| `paymentDay` | Día del mes (1–31) o `END_OF_MONTH` |
| `currency` | `GTQ` o `USD`. Nunca se mezclan monedas en un cálculo |
| `interestRate` (`i`) | Tasa de interés anual (≥ 0) |
| `insuranceRates` (`f₁…f_m`) | Componentes porcentuales anuales sobre saldo incluidos en la cuota nivelada, **en orden de arreglo**. FHA: seguro de hipoteca `0.01` y desgravamen `0.0026` |
| `fixedCharges` | Cargos mensuales fijos (IUSI, seguro de daños…), cada uno con `effectiveFrom` |
| `roundingProfile` | `FHA_GT_V1` (por defecto) o `SIMPLE` |
| `rateType` | `FIXED` o `VARIABLE`. **Informativo:** el motor lo ignora, un `RateChange` siempre se permite y la UI solo advierte si es `FIXED` |

`f = Σ fⱼ`. La tasa periódica es **`r = (i + f) / 12`**, sin `HALF_UP_2`.

## <a id="alg-term"></a>[ALG.TERM] Plazo vigente (variable de estado)

`term` es el **número de la última cuota del calendario vigente**. Empieza en `termMonths`, y un plazo puede estar en uno de dos modos:

- **Fijo:** `term` es un dato y no cambia aunque [ALG.LAST.FIXED_TERM] liquide antes (por ejemplo, tras un ancla que baja el saldo); [ALG.RATE.RECALC_KEEP_TERM] y [ALG.PREPAY.REDUCE_INSTALLMENT] usan ese dato. Lo usan el plan original, `REDUCE_INSTALLMENT` y `RECALC_INSTALLMENT_KEEP_TERM`.
- **Derivado:** `term` se recalcula **por simulación**. Desde el estado actual se aplica [ALG.PERIOD.FHA_GT_V1] o [ALG.PERIOD.SIMPLE], según el perfil, con `level` fijo hasta la cuota que cumple [ALG.LAST.DERIVED_TERM]. Nunca se usan fórmulas logarítmicas. Lo usan `REDUCE_TERM`, `KEEP_INSTALLMENT_ADJUST_TERM` y `BANK_INSTALLMENT`; `AdvanceInstallments` conserva el modo que encuentra ([ALG.ADVANCE]).

**Plazo vigente en las fases 1 y 3.** Cuando un `RateChange` `RECALC_INSTALLMENT_KEEP_TERM` de la fase 1 de la cuota `k` necesita el `term` vigente de un plazo derivado, se usa `term = (k − 1) + remainingTerm` del estado tras la cuota `k − 1`, con el saldo de apertura de `k` ya re-anclado por la fase 0 si hubo ancla. En la fase 3, con plazo derivado, `REDUCE_INSTALLMENT` usa `term = k + remainingTerm` del estado tras pagar la cuota `k`, antes de restar ese abono.

**Amortización nula o negativa.** En plazo derivado, si una cuota calculada como normal tiene `level − financialCharge ≤ 0` ([ALG.LAST]), se lanza `NegativeAmortizationError` con la regla [ALG.TERM], porque el plazo no terminaría. En la cuota `k` de un `RateChange` con `KEEP_INSTALLMENT_ADJUST_TERM` o `BANK_INSTALLMENT`, la misma condición se reporta con la regla de la política ([ALG.RATE.KEEP_INSTALLMENT], [ALG.RATE.BANK_INSTALLMENT]). En plazo fijo no se valida: si `level` queda en `0.00` (por ejemplo, tras un abono `REDUCE_INSTALLMENT` que deja un saldo de centavos), esas cuotas tienen capital `0.00` y la cuota `term` liquida el saldo.

**`PeriodState`** es el estado **después de pagar la cuota `k`, incluida su fase 3** (abonos). Contiene:
- `balance`;
- `i` e `insuranceRates[]`;
- `level`;
- `roundingProfile`;
- `k`;
- el modo del plazo (fijo o derivado) y `term`.

Funciones auxiliares de implementación única (W0-03 las declara y W1-01 las implementa):
- **`remainingTerm(state)`:** número de cuotas `k+1 … última`, contado por simulación. En plazo derivado, **`term = k + remainingTerm(state)`**. Ejemplo de [ALG.EXAMPLE]: tras el abono `REDUCE_TERM` en `k = 12`, `remainingTerm = 208` y `term = 220`.
- **`projectCapital(state, n)`:** suma del `capital` de las cuotas `k+1 … k+n` del calendario vigente, por la misma simulación. Ejemplo: tras la cuota 12 sin abono, `projectCapital(state, 6) = 5446.87`.

## <a id="alg-dates"></a>[ALG.DATES] Fechas de vencimiento

- La cuota `k` (1-indexada) vence en el mes `firstDueDate + (k − 1)` meses.
- Con `END_OF_MONTH`, vence el último día de ese mes.
- Con `paymentDay = d`, vence el día `min(d, días del mes)`. Ejemplo: `d = 31` en febrero da 28, o 29 en año bisiesto.
- **Consistencia:** el día de `firstDueDate` debe coincidir con la regla de `paymentDay` para su propio mes. Ejemplos de pares inválidos: `END_OF_MONTH` con `2027-03-15`, o `paymentDay = 15` con `2027-03-10`. Ante un par inválido se lanza `InvalidInputError`, y la UI re-deriva el día al cambiar `paymentDay`.

## <a id="alg-zero"></a>[ALG.ZERO] Tasas en cero

- **Si `r = 0`** (todas las tasas en cero): `level = HALF_UP_2(B / m)`, `charge = interest = insurance = 0` y `capital = level`. La última cuota liquida el saldo.
- **Perfil `FHA_GT_V1` con `f = 0`:** `interest = charge`, `insurance = 0` y no se aplica [ALG.PERIOD.SPLIT].
- **Sin seguros:** `insuranceRates` puede ser `[]` o una lista de tasas en cero. Ambas formas son válidas y dan las mismas cifras; solo cambia `insuranceComponents`, que es `[]` con la lista vacía y lleva un `0.00` por tasa con tasas en cero.
- **Perfil `FHA_GT_V1` con `i = 0` y `f > 0`:** la fórmula general da `interest = 0` e `insurance = charge`.
- Nunca se divide entre cero. Las implementaciones deben tratar estos casos antes de aplicar las fórmulas generales.

## <a id="alg-level"></a>[ALG.LEVEL] Cuota nivelada

```
P     = (1 + r)^m
level = HALF_UP_2( B · r / (1 − 1/P) )
```

`B` es el saldo y `m` el número de cuotas restantes del plazo fijo. Al inicio, `B = principal` y `m = termMonths`.
La cuota nivelada cubre capital + interés + seguros porcentuales. **No incluye cargos fijos.**

## <a id="alg-period-fha-gt-v1"></a>[ALG.PERIOD.FHA_GT_V1] Cálculo de un periodo, perfil `FHA_GT_V1`

Para una cuota que no es la última, con saldo de apertura `B`:

```
charge    = HALF_UP_2( (B · (i + f)) / 12 )     # cargo financiero combinado; nunca B · r ([ALG.CONV])
interest  = HALF_UP_2( charge · i / (i + f) )   # reparto proporcional
insurance = charge − interest                   # el residuo va a seguros
capital   = level − charge
closing   = B − capital
total     = capital + interest + insurance + Σ cargos fijos vigentes
```

## <a id="alg-period-split"></a>[ALG.PERIOD.SPLIT] Reparto de `insurance` entre componentes

Para los componentes `f₁…f_m`, en orden de arreglo:

```
insⱼ = HALF_UP_2( insurance · fⱼ / f )    para j < m
ins_m = insurance − Σ_{j<m} insⱼ          (el último recibe el residuo)
```

Aplica en el perfil `FHA_GT_V1`, tanto en cuotas normales como en la última. Con un solo componente, `ins₁ = insurance`.

## <a id="alg-period-simple"></a>[ALG.PERIOD.SIMPLE] Cálculo de un periodo, perfil `SIMPLE`

```
interest   = HALF_UP_2( B · i / 12 )
insuranceⱼ = HALF_UP_2( B · fⱼ / 12 )      (cada componente redondeado por separado)
capital    = level − interest − Σ insuranceⱼ
```

## <a id="alg-last"></a>[ALG.LAST] Última cuota

En la última cuota:

```
capital   = B                               # liquida el saldo restante
interest  = HALF_UP_2( B · i / 12 )
FHA_GT_V1: insurance = HALF_UP_2( B · f / 12 ), repartido según [ALG.PERIOD.SPLIT]
SIMPLE:    insuranceⱼ = HALF_UP_2( B · fⱼ / 12 ), cada componente
total     = capital + interest + Σ seguros + Σ cargos fijos
```

Por eso la última cuota puede quedar un poco mayor o menor que las demás.

Para decidir cuál es la última se usa **`financialCharge`** de la cuota calculada como normal. En `FHA_GT_V1` es `charge`; en `SIMPLE` es `interest + Σ insuranceⱼ`. Las dos reglas siguientes la usan igual.

- <a id="alg-last-fixed-term"></a>**[ALG.LAST.FIXED_TERM] Plazo fijo:** la cuota número `term`. Si antes ocurre que `level − financialCharge ≥ B`, esa cuota liquida antes.
- <a id="alg-last-derived-term"></a>**[ALG.LAST.DERIVED_TERM] Plazo derivado:** la primera cuota donde `level − financialCharge ≥ B`.

## <a id="alg-fixed"></a>[ALG.FIXED] Cargos fijos

- Un cargo con `effectiveFrom = d` se suma al `total` de toda cuota cuyo vencimiento sea `≥ d`, hasta que un `FixedChargeChange` lo reemplace.
- Los cargos fijos **no** afectan el saldo, la cuota nivelada ni el interés.

---

## <a id="alg-events"></a>[ALG.EVENTS] Eventos

Un préstamo es una **línea de tiempo**: las condiciones originales más eventos fechados.

<a id="alg-events-anchor"></a>**[ALG.EVENTS.ANCHOR] Cuota de aplicación `k`:**

1. Si el evento trae `installmentNumber`, **ese número manda**: `k = installmentNumber`, y la fecha queda como dato informativo. Salvo en eventos heredados (regla 3), se valida que `k ≥ 1` y que `k` no pase de la última cuota del calendario (la que liquida el saldo); si no, se lanza un error de validación tipado.
2. Si no lo trae, `k` es la **primera cuota con vencimiento `≥` fecha del evento**.
3. **Fuera de rango.** Si un evento sin `installmentNumber` cae en una cuota posterior a la última cuota del calendario, se lanza un error de validación tipado con la menor de esas `k`: ningún evento propio del calendario se ignora en silencio. Vale para eventos reales e hipotéticos. Excepción: un calendario derivado no vuelve a validar el rango de ningún evento que hereda, con o sin `installmentNumber` (ni por la regla 1 ni por esta), porque ya se validaron en su camino de origen. El escenario de [ALG.PATHS] hereda los eventos reales; en [ALG.GOAL], el camino base `SCENARIO` hereda los reales y cada prueba de la búsqueda hereda todos los eventos de su camino base. El calendario modelado de [ALG.VALIDATE] hereda todos los eventos reales que conserva. Si los eventos nuevos liquidan o acortan el préstamo, los heredados que quedan después de la última cuota no se aplican. El abono de la búsqueda por meta tiene su propia regla en [ALG.GOAL].

`ActualPayment` exige `installmentNumber`; la UI lo sugiere a partir de la fecha y es editable, lo que cubre los pagos tardíos. `ReportedBalance` lo admite como opcional. Los demás eventos se asocian por fecha.

<a id="alg-events-order"></a>**[ALG.EVENTS.ORDER] Orden total.** Los eventos se ordenan por la clave `(k, fase, fecha, rangoDeTipo, id)`:

| Fase | Eventos (rangoDeTipo) | Efecto |
|---|---|---|
| 0 | `ReportedBalance` | Calcula `realDelta` contra el saldo de apertura proyectado de `k` y luego **re-ancla** ese saldo. Si hay varias anclas en la misma `k`, todas reportan su `realDelta` contra la apertura proyectada y re-ancla la de fecha mayor (empate: `id` mayor) |
| 1 | `RateChange` (0), luego `FixedChargeChange` (1) | Afectan el cálculo de la cuota `k`, sobre el saldo ya anclado |
| 2 | — | Se calcula la cuota `k` |
| 3 | `Prepayment` (0), luego `AdvanceInstallments` (1) | Se aplican después de pagar la cuota `k`, en orden de fecha y luego de rango |
| 4 | `ActualPayment` | Solo comparación |

### <a id="alg-rate"></a>[ALG.RATE] Cambio de tasa (`RateChange`)

Nuevas tasas `i'` y/o `fⱼ'` desde la cuota `k` (inclusive), con saldo de apertura `B`. Tiene tres políticas:

- <a id="alg-rate-recalc-keep-term"></a>**[ALG.RATE.RECALC_KEEP_TERM]** Política **`RECALC_INSTALLMENT_KEEP_TERM`** (por defecto): `level` según [ALG.LEVEL] con `r'` y `m = term − (k − 1)`, usando el `term` vigente de [ALG.TERM]. El plazo queda **fijo**.
- <a id="alg-rate-keep-installment"></a>**[ALG.RATE.KEEP_INSTALLMENT]** Política **`KEEP_INSTALLMENT_ADJUST_TERM`**: `level` no cambia y el plazo queda **derivado**. Si `level − financialCharge ≤ 0`, se lanza `NegativeAmortizationError`; `financialCharge` es el del perfil ([ALG.LAST]), calculado con el saldo `B` de la cuota `k` y las tasas nuevas.
- <a id="alg-rate-bank-installment"></a>**[ALG.RATE.BANK_INSTALLMENT]** Política **`BANK_INSTALLMENT`**: `level` es el valor informado en `bankInstallment` (cuota nivelada, sin cargos fijos). El plazo queda **derivado** y aplica la misma validación de amortización negativa.

### <a id="alg-fixedchange"></a>[ALG.FIXEDCHANGE] Cambio de cargos fijos (`FixedChargeChange`)

Trae la **lista completa** de cargos fijos vigentes desde la cuota `k`. Todos los cargos anteriores dejan de aplicarse, incluidos los de `effectiveFrom` futuro definidos en las condiciones. Para quitar un cargo, se envía la lista sin él. Los cargos de la lista no llevan `effectiveFrom` propio: rigen desde el vencimiento de la cuota `k`.

### <a id="alg-prepay"></a>[ALG.PREPAY] Abono a capital (`Prepayment`)

Se aplica **inmediatamente después de pagar la cuota `k`** (fase 3), así que reduce el interés desde la cuota `k + 1`.

- <a id="alg-prepay-cap"></a>**[ALG.PREPAY.CAP]** El abono se recorta al saldo vigente: `min(amount, closing_k − abonos ya aplicados en k)`. Si iguala ese saldo, el préstamo termina en la cuota `k` (liquidación anticipada, `payoff`). Si el saldo ya es `0.00` (la cuota `k` fue la última, o un abono anterior de la misma `k` liquidó), el abono aplicado es `0.00` y no cobra comisión.
- <a id="alg-prepay-reduce-term"></a>**[ALG.PREPAY.REDUCE_TERM]** Modo `REDUCE_TERM`: `level` no cambia y el plazo queda derivado. Si el calendario tenía plazo fijo y su última cuota era mayor que una normal (`level − financialCharge < B`), un abono muy pequeño no absorbe esa diferencia y el calendario derivado termina una cuota después (`monthsSaved = −1`).
- <a id="alg-prepay-reduce-installment"></a>**[ALG.PREPAY.REDUCE_INSTALLMENT]** Modo `REDUCE_INSTALLMENT`: `level` según [ALG.LEVEL] con `B'` (saldo después del abono) y `m = term − k`. El plazo queda fijo.
- <a id="alg-prepay-commission"></a>**[ALG.PREPAY.COMMISSION]** Comisión opcional:
  - `FLAT`: un monto fijo.
  - `PERCENT`: `HALF_UP_2(abono aplicado · tasa)`.

  La comisión **no** reduce el saldo y se suma a `totalPaid`.

### <a id="alg-advance"></a>[ALG.ADVANCE] Adelantar N cuotas (`AdvanceInstallments`)

- **Monto:** `projectCapital(state, N)`, el capital de las cuotas `k+1 … k+N` del calendario **vigente justo antes del evento**.
- **Aplicación:** se aplica como un abono que se recorta igual que [ALG.PREPAY.CAP]. `level` no cambia y el modo del plazo tampoco: con plazo fijo, `term` baja en `N`; con plazo derivado, sigue derivado.
- **Propiedad:** si no hay eventos posteriores, el resto del calendario es idéntico al vigente desde la cuota `k+N+1`, y `monthsSaved = N` exactamente.

### <a id="alg-anchor"></a>[ALG.ANCHOR] Saldo reportado (`ReportedBalance`)

- Registra `Bᵣ`, el saldo que informó el banco como **saldo de apertura de la cuota `k`**, es decir, antes de pagarla.
- En la fase 0 se calcula **`realDelta = Bᵣ − apertura proyectada de k`** en el camino real, antes de re-anclar.
- **Re-anclaje:** la apertura de la cuota `k` pasa a ser `Bᵣ`. `level` y el modo del plazo no cambian, y la última cuota absorbe la diferencia según [ALG.LAST].
- `reportedRate` y `totalInstallment`, si existen, son **informativos** en v1. Se muestran, pero no alteran el cálculo.

### <a id="alg-actual"></a>[ALG.ACTUAL] Pago real (`ActualPayment`)

- **Solo compara** (fase 4): marca la cuota `k` como pagada y, si trae desglose, calcula `realDelta` por componente (real − proyectado). El pago trae su `total` y un desglose opcional con los cuatro componentes: `capital`, `interest`, `insurance` (suma de seguros) y `fixedCharges` (suma de cargos fijos). `realDelta` se calcula para cada uno, contra la fila `k` del camino real. El `total` del pago no genera `realDelta` en v1.
- **No altera** el camino. El anclaje solo ocurre con `ReportedBalance`.

---

## <a id="alg-paths"></a>[ALG.PATHS] Los tres caminos

| Camino | Composición |
|---|---|
| **Plan original** | Solo las condiciones originales, sin eventos |
| **Camino real** | Condiciones + eventos reales + anclas `ReportedBalance` |
| **Escenario** | Camino real + eventos hipotéticos del escenario |

Los eventos hipotéticos son `RateChange`, `FixedChargeChange`, `Prepayment` y `AdvanceInstallments`; `ReportedBalance` y `ActualPayment` solo son reales.

<a id="alg-paths-cutoff"></a>**[ALG.PATHS.CUTOFF] Corte.**
- `cutoffK` es el máximo `k` (según [ALG.EVENTS.ANCHOR]) entre los `ReportedBalance`, `ActualPayment`, `Prepayment` reales y `AdvanceInstallments` reales. Si no hay ninguno, vale 0.
- Los `RateChange` y `FixedChargeChange` reales **no** mueven el corte; pueden estar fechados en el futuro.
- Un evento hipotético del escenario con `k ≤ cutoffK` lanza un **error de validación tipado**, con la menor de esas `k`. El abono de la búsqueda por meta no es un evento del escenario: su regla está en [ALG.GOAL].
- La comparación es por número de cuota. La fecha de hoy no interviene.

## <a id="alg-metrics"></a>[ALG.METRICS] Métricas de comparación

Todas comparan un escenario contra su **base**. Por defecto la base es el camino real sin eventos hipotéticos.

- **`interestSaved`** = Σ(`interest` + seguros) de la base − lo mismo del escenario.
- **`monthsSaved`** = número de cuotas de la base − número de cuotas del escenario.
- **`endDate`** = vencimiento de la última cuota.
- **`totalPaid`** = Σ `total` + Σ abonos + Σ comisiones.
- **`netSaving`** = `totalPaid` de la base − `totalPaid` del escenario. Incluye los cargos fijos que ya no se pagan y descuenta las comisiones.

## <a id="alg-yearly"></a>[ALG.YEARLY] Subtotales anuales

Se agrupa por **año calendario del vencimiento** (`dueDate`). Por año (`year`) se suman `capital`, `interest`, `insurance` (suma de seguros), `fixedCharges`, `prepayments` (abonos aplicados), `commissions` y `total`; `total` es la suma del `total` de las filas, sin abonos ni comisiones. Un año sin cuotas no aparece.

## <a id="alg-goal"></a>[ALG.GOAL] Búsqueda por meta

**Entrada:**
- Un camino base (real o escenario). La búsqueda parte de los caminos ya construidos ([ALG.PATHS]): sus errores se lanzan antes, y el escenario, si existe, se valida aunque la base sea el camino real. Con `basePath = SCENARIO` y sin escenario (`scenarioEvents = null`), se lanza `InfeasibleGoalError` sin `k`.
- Una fecha de abono `d`, que lo asocia a la cuota `k` según [ALG.EVENTS.ANCHOR]. Se exige `k > cutoffK` y que `k` no pase de la última cuota del camino base; si no, se lanza `InfeasibleGoalError` ([ALG.ERRORS]). En esta sección, `closing_k` es el saldo que encuentra el abono de la búsqueda, es decir, el saldo vigente de [ALG.PREPAY.CAP]: el cierre de la cuota `k` en el camino base menos lo que aplican los `Prepayment` y `AdvanceInstallments` del camino base que [ALG.EVENTS.ORDER] pone antes que él en esa misma `k` (los de fecha anterior o igual a `d`).
- Una meta, de dos tipos posibles:
  - **`FINISH_BY(fecha)`**, con modo `REDUCE_TERM`. La meta se cumple si `endDate ≤ fecha`.
  - **`MAX_INSTALLMENT(valor)`**, con modo `REDUCE_INSTALLMENT`. La meta se cumple si el `total` de la cuota `k+1` es `≤ valor`. La liquidación total en `k` (no existe la cuota `k+1`) **cuenta como cumplida**.
  - Una meta `MAX_INSTALLMENT` con valor negativo está mal formada: se lanza `InfeasibleGoalError` sin `k`. Con `0.00` es válida.

**Método:**
- Bisección sobre centavos enteros en `[1, closing_k × 100]`: con `closing_k`, la prueba liquida en `k`. La meta es monótona respecto del monto.
- La búsqueda **no aplica comisión**. Si el usuario agrega una comisión al abono resultante, las métricas se recalculan.
- Cada prueba agrega al camino base un `Prepayment` con fecha `d`, sin comisión y con el modo de la meta. En [ALG.EVENTS.ORDER] va por su fecha; si empata en fecha con un evento de la fase 3 del camino base, va después de él.

**Resultado:** `GoalSeekResult` (nunca se lanza excepción por una meta inalcanzable):
- **`ALREADY_MET`:** la meta ya se cumple con monto 0.
- **`FOUND{ amount, metrics, isPayoff }`:** el **mínimo** monto, al centavo, que cumple la meta; con un centavo menos ya no se cumple. `isPayoff` indica que el monto liquida el préstamo: `amount = closing_k`.
- **`INFEASIBLE{ payoffAmount, reason }`:** ni liquidando en `k` se cumple; `payoffAmount = closing_k` y `reason = GOAL_DATE_BEFORE_PREPAYMENT`.

**Alcance de `INFEASIBLE`.** Con `FINISH_BY` ocurre si y solo si la fecha meta es anterior al vencimiento de `k`. Con `MAX_INSTALLMENT` nunca ocurre, porque la liquidación en `k` siempre cumple la meta; si la meta es menor que los cargos fijos de la cuota `k+1`, el resultado es `FOUND` con `isPayoff`.

**`metrics` de `FOUND`.** Son las de [ALG.METRICS] del camino base con el abono encontrado, comparado con el mismo camino base sin el abono.

`InfeasibleGoalError` queda reservado para entradas inválidas: escenario faltante o `MAX_INSTALLMENT` negativo (sin `k`), y abono con `k ≤ cutoffK` o después de la última cuota del camino base (con `k`) ([ALG.ERRORS]).

## <a id="alg-validate"></a>[ALG.VALIDATE] Validación de plantilla contra un saldo real

- **Diferencia:** `realDelta = Bᵣ − apertura modelada de k`, con el mismo signo que [ALG.ANCHOR].
  - **Modelado:** el camino real calculado **conservando solo las anclas con `k' < k`**. Se excluyen todas las anclas de la misma `k` y de cuotas posteriores. Hereda todos los eventos reales que conserva, así que no vuelve a validar su rango ([ALG.EVENTS.ANCHOR], regla 3). Así coincide con la fase 0 de [ALG.EVENTS.ORDER], donde todas las anclas de una misma `k` se comparan contra la misma apertura proyectada. En el asistente de alta coincide con el plan original.
  - **Fuera de rango:** si la cuota `k` del saldo reportado no está entre la 1 y la última cuota del calendario modelado, se lanza un error de validación tipado ([ALG.EVENTS.ANCHOR]).
- **Semáforo**, en unidades de la moneda del préstamo:
  - **`GREEN`:** `|realDelta| ≤ 1.00`.
  - **`AMBER`:** `|realDelta| ≤ máx(50.00, 0.0002 · Bᵣ)`. El límite no se redondea ([ALG.CONV]).
  - **`RED`:** cualquier otra diferencia.
- **Causa** (determinista en v1):
  - Si es `GREEN`, no hay causa.
  - `INSTALLMENT_MISALIGNMENT` si `Bᵣ` está a ≤ 1.00 de la apertura modelada de `k−1` o de `k+1`.
  - Si no, `UNKNOWN`.
  - `RATE_MISMATCH`, `INSURANCE_RATE_MISMATCH`, `ROUNDING_PROFILE` y `MISSING_EVENT` quedan **reservadas** (no se emiten en v1).

## <a id="alg-templates"></a>[ALG.TEMPLATES] Plantillas (versionadas en código)

| Plantilla | `interestRate` | `insuranceRates` | `roundingProfile` | `paymentDay` | `rateType` | `fixedCharges` |
|---|---|---|---|---|---|---|
| `fha-gt@1` "FHA Guatemala v1" | La ingresa el usuario | `["0.01", "0.0026"]`: seguro de hipoteca FHA y desgravamen | `FHA_GT_V1` | `END_OF_MONTH` | `VARIABLE` | `[]` |
| `simple@1` "Hipotecario simple" | La ingresa el usuario | `[]`: solo interés | `SIMPLE` | Sin valor precargado: lo elige el usuario | Sin valor precargado: lo elige el usuario | `[]` |

<a id="alg-templates-fixed"></a>**[ALG.TEMPLATES.FIXED]** Los cargos fijos pueden derivarse como `cuota total del banco − level`. El usuario los nombra y los puede editar. Si la diferencia es negativa, se lanza un error de validación tipado.
El préstamo guarda una **copia** de los valores de la plantilla (`templateRef = {id, version}`). Cambiar la plantilla después no altera préstamos existentes.

## <a id="alg-errors"></a>[ALG.ERRORS] Errores tipados

Cuando este documento dice «error de validación tipado», el error es `InvalidInputError`. Lista cerrada de v1:

| Error | Regla | Cuándo |
|---|---|---|
| `InvalidInputError` | [ALG.DATES] | El día de `firstDueDate` no cumple la regla de `paymentDay` en su mes |
| `InvalidInputError` | [ALG.EVENTS.ANCHOR] | `installmentNumber` menor que 1 o después de la última cuota del calendario, `ActualPayment` sin `installmentNumber`, o evento sin `installmentNumber` después de la última cuota (regla 3), incluido el saldo reportado de [ALG.VALIDATE] |
| `InvalidInputError` | [ALG.PATHS.CUTOFF] | Evento hipotético del escenario con `k ≤ cutoffK` |
| `NegativeAmortizationError` | [ALG.RATE.KEEP_INSTALLMENT], [ALG.RATE.BANK_INSTALLMENT] | `level − financialCharge ≤ 0` en la cuota `k` del cambio, con el perfil y las tasas nuevas ([ALG.LAST]) |
| `NegativeAmortizationError` | [ALG.TERM] | Plazo derivado con `level − financialCharge ≤ 0` en una cuota que no es la `k` de un cambio de tasa con esas políticas |
| `InvalidInputError` | [ALG.CONV], [ALG.TERMS], [ALG.EVENTS], [ALG.TEMPLATES], [ALG.TEMPLATES.FIXED] | Entrada mal formada en una frontera, antes de calcular: string decimal, fecha, entero o día de pago inválidos, porcentaje de un total cero, condiciones fuera de los rangos de [ALG.TERMS], evento sin sus campos, plantilla desconocida o cargo fijo derivado negativo. Los ejemplos no los cubren |
| `InfeasibleGoalError` | [ALG.GOAL] | Abono de la búsqueda con `k ≤ cutoffK` o después de la última cuota del camino base (con `k`); `basePath = SCENARIO` sin escenario o `MAX_INSTALLMENT` negativo (sin `k`). Nunca por una meta inalcanzable |
| `CurrencyMismatchError` | [ALG.TERMS] | Comparar calendarios de monedas distintas |

Los ejemplos registran un error esperado como `{"type": <clase>, "rule": <id de la regla, sin corchetes>, "k": <cuota, si aplica>}`. En el dominio, la cuota es `NegativeAmortizationError.k`, o `details.k` de `InvalidInputError` y de `InfeasibleGoalError`.

**Varios errores.** Una entrada con más de un error puede lanzar cualquiera de ellos; ningún ejemplo combina errores. Si varios eventos fallan por la misma regla ([ALG.EVENTS.ANCHOR] o [ALG.PATHS.CUTOFF]), el error lleva la menor de sus `k`.

---

## <a id="alg-example"></a>[ALG.EXAMPLE] Ejemplo resuelto sintético

Copias legibles por máquina: `docs/specs/algorithm-examples/core/ex00-base-fha.json` (sin eventos) y `docs/specs/algorithm-examples/events/ex00-base-prepayments.json` (abonos).

**Datos:** `principal = 500000.00`, `termMonths = 240`, `i = 0.07`, `insuranceRates = [0.01, 0.0026]` (`f = 0.0126`), `firstDueDate = 2025-02-28`, `END_OF_MONTH`, perfil `FHA_GT_V1`, cargos fijos IUSI `350.00` + seguro de daños `45.00`.

**Derivados:** `r = 0.0826/12 = 0.006883333…` y `level = 4263.47`.

| k | Vence | Saldo inicial | Interés | Seguro (FHA + desgr.) | Capital | Fijos | Total | Saldo final |
|---|---|---|---|---|---|---|---|---|
| 1 | 2025-02-28 | 500000.00 | 2916.67 | 525.00 (416.67 + 108.33) | 821.80 | 395.00 | 4658.47 | 499178.20 |
| 2 | 2025-03-31 | 499178.20 | 2911.87 | 524.14 (415.98 + 108.16) | 827.46 | 395.00 | 4658.47 | 498350.74 |
| 3 | 2025-04-30 | 498350.74 | 2907.04 | 523.27 (415.29 + 107.98) | 833.16 | 395.00 | 4658.47 | 497517.58 |
| 6 | 2025-07-31 | 495834.02 | 2892.36 | 520.63 (413.20 + 107.43) | 850.48 | 395.00 | 4658.47 | 494983.54 |
| … | | | | | | | | |
| 240 | 2045-01-31 | 4232.65 | 24.69 | 4.44 (3.52 + 0.92) | 4232.65 | 395.00 | 4656.78 | 0.00 |

**Totales:** interés `443416.24`, seguros `79814.87`, capital `500000.00`, fijos `94800.00`, total pagado `1118031.11`.

**Abonos de ejemplo.** Abono de `20000.00` con fecha 2026-01-15, que se aplica tras la cuota 12 (vence 2026-01-31). El saldo después del abono es `469756.31`.

| Variante | Cuotas | Fin | Interés + seguros | `interestSaved` | `totalPaid` |
|---|---|---|---|---|---|
| Sin abono | 240 | 2045-01-31 | 523231.11 | — | 1118031.11 |
| `REDUCE_TERM` | 220 | 2043-05-31 | 454058.31 | 69172.80 | 1040958.31 |
| `REDUCE_INSTALLMENT` (nueva `level = 4089.36`) | 240 | 2045-01-31 | 503536.20 | 19694.91 | 1098336.20 |

- **`REDUCE_TERM`:** la cuota 13 da interés `2740.25`, seguros `493.24` y capital `1029.98`. La última (220) liquida `355.93`.
- **`REDUCE_INSTALLMENT`:** el plazo sigue fijo ([ALG.LAST.FIXED_TERM]). La cuota 240 liquida `4061.89`, con un total de `4484.84`.
- **`AdvanceInstallments(N = 6)` tras la cuota 12:** monto `5446.87` (capital de las cuotas 13–18), 234 cuotas y fin `2044-07-31`. La apertura de la cuota 13 resultante es igual a la de la cuota 19 original.

---

## <a id="alg-pending"></a>[ALG.PENDING] Ejemplos resueltos de W0-02

W0-02 publicó los ejemplos en `docs/specs/algorithm-examples/`, con `synthetic: true`, ids de sección y strings decimales. `INDEX.md` mapea cada ítem a sus archivos, y cada archivo se recalculó con un cálculo independiente:

1. Perfil `SIMPLE`, incluida la última cuota con dos componentes. Debe distinguir las lecturas de [ALG.LAST].
2. `paymentDay` 15, 30 y 31, más `END_OF_MONTH`, cruzando febrero de año bisiesto y no bisiesto.
3. Cada política de `RateChange`, incluido el término derivado y `NegativeAmortizationError`.
4. `REDUCE_TERM` en `k = 12` seguido de `RateChange` `RECALC_INSTALLMENT_KEEP_TERM` en `k = 24` (uso del `term` vigente).
5. `FixedChargeChange` con lista completa, quitando un cargo y con un cargo de `effectiveFrom` futuro.
6. Comisiones `FLAT` y `PERCENT`, y `payoff` por [ALG.PREPAY.CAP].
7. Ancla y `RateChange` en la misma `k`, dos anclas en la misma `k`, y un ancla que sube el saldo en plazo derivado (`NegativeAmortizationError` de [ALG.TERM]).
8. Pago tardío con `installmentNumber`.
9. `realDelta` por componente.
10. `cutoffK` con un abono real posterior a un ancla, y error al poner un hipotético en `k ≤ cutoffK`. Además, un escenario que liquida antes de un evento real futuro y lo hereda sin error ([ALG.EVENTS.ANCHOR]).
11. Búsqueda por meta: `ALREADY_MET` y `FOUND` (incluido `isPayoff`) para ambas metas, e `INFEASIBLE` para `FINISH_BY` (con `MAX_INSTALLMENT` no existe; ver [ALG.GOAL]). Además, un evento real futuro que las pruebas heredan sin error y un abono posterior a la última cuota del camino base (`InfeasibleGoalError`).
12. Semáforo `GREEN`, `AMBER` y `RED` en ambos bordes, `INSTALLMENT_MISALIGNMENT`, y un saldo reportado después de la última cuota (`InvalidInputError`).
13. Subtotales anuales y métricas (`interestSaved`, `monthsSaved`, `totalPaid`, `netSaving`).
14. [ALG.ZERO]: `r = 0`, y `FHA_GT_V1` con `f = 0` (tasas en cero o `insuranceRates = []`) y con `i = 0`.
15. Par `firstDueDate`/`paymentDay` inválido (`InvalidInputError`) y válido en febrero bisiesto.
16. Ancla con `installmentNumber` explícito distinto de la cuota que daría su fecha, y evento fuera de rango por número o por fecha ([ALG.EVENTS.ANCHOR]).
17. Empate exacto de medio centavo en el cargo de `FHA_GT_V1` ([ALG.CONV], [ALG.PERIOD.FHA_GT_V1]).

Los ejemplos con eventos van en archivos JSON separados de los ejemplos sin eventos. El oráculo `core` y W1-01 solo reproducen los ejemplos sin eventos.
