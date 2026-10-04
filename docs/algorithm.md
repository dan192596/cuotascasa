# Especificación del algoritmo de cálculo

> **Fuente única de verdad** del motor (`packages/domain`) y del oráculo de referencia (`tools/oracle`).
> Ambas implementaciones se escriben **solo** a partir de este documento, por linajes de agentes distintos.
> Cada regla tiene un identificador estable `[ALG.*]` que el código, las pruebas y los fixtures citan.
> En caso de contradicción entre documentos, **este documento gana** (ver precedencia en `CLAUDE.md`).
>
> **Estado:** v1 de planificación (2026-10-04). La tarjeta **W0-02** la completa con un ejemplo sintético resuelto
> por regla (`docs/specs/algorithm-examples/`), según la lista de [ALG.PENDING]. Después de W0 solo la modifica Opus,
> y cada cambio obliga a regenerar el oráculo.
>
> **Validación:** el perfil `FHA_GT_V1` reprodujo **al centavo todas las filas, incluidos los totales**, de una tabla
> de amortización bancaria real. La validación fue privada (2026-10-04) y se hizo fuera del repositorio.
> **Ningún dato real aparece en este repositorio.** Todos los números de este documento son sintéticos.

---

## [ALG.CONV] Convenciones numéricas

- **Contexto decimal:** precisión de **34 dígitos significativos** y redondeo intermedio **`ROUND_HALF_EVEN`**. Se aplica a toda operación que no sea un `HALF_UP_2` explícito:
  - Python: `decimal` con `prec = 34` (su modo por defecto ya es `ROUND_HALF_EVEN`).
  - TypeScript: `Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN })`.
- **`HALF_UP_2(x)`:** redondeo a 2 decimales, mitad lejos de cero (`ROUND_HALF_UP`): 0.005 → 0.01 y −0.005 → −0.01. Es el **único** redondeo a centavos y ocurre **solo** donde esta especificación escribe `HALF_UP_2`. Los demás valores intermedios quedan en el contexto de 34 dígitos.
- **Potencias:** `(1 + r)^(−m)` se calcula como `1 / P`, con `P = (1 + r)^m` por exponenciación entera en el contexto decimal.
- **Montos:** strings decimales con 2 decimales (`"500000.00"`) en todas las fronteras (JSON, almacenamiento, UI). Nunca `number` de JavaScript.
- **Tasas:** strings decimales anuales (`"0.07"` = 7 %, `"0.0126"` = 1.26 %).
- **Fechas:** `LocalDate` con formato `AAAA-MM-DD`, sin hora ni zona. Nunca `Date` dentro del dominio. El dominio **no** usa la fecha de hoy; quien necesite "hoy" lo recibe de la capa de datos (`Clock.today()`).
- **Base de interés:** mensual 30/360. El cargo de un periodo no depende del día real de pago.

## [ALG.TERMS] Condiciones de un préstamo

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

## [ALG.TERM] Plazo vigente (variable de estado)

`term` es el **número de la última cuota del calendario vigente**. Empieza en `termMonths`, y un plazo puede estar en uno de dos modos:

- **Fijo:** `term` es un dato. Lo usan el plan original, `REDUCE_INSTALLMENT` y `RECALC_INSTALLMENT_KEEP_TERM`.
- **Derivado:** `term` se recalcula **por simulación**. Desde el estado actual se aplica [ALG.PERIOD] con `level` fijo hasta la cuota que cumple [ALG.LAST.DERIVED_TERM]. Nunca se usan fórmulas logarítmicas. Lo usan `REDUCE_TERM`, `AdvanceInstallments`, `KEEP_INSTALLMENT_ADJUST_TERM` y `BANK_INSTALLMENT`.

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

## [ALG.DATES] Fechas de vencimiento

- La cuota `k` (1-indexada) vence en el mes `firstDueDate + (k − 1)` meses.
- Con `END_OF_MONTH`, vence el último día de ese mes.
- Con `paymentDay = d`, vence el día `min(d, días del mes)`. Ejemplo: `d = 31` en febrero da 28, o 29 en año bisiesto.
- **Consistencia:** el día de `firstDueDate` debe coincidir con la regla de `paymentDay` para su propio mes. Ejemplos de pares inválidos: `END_OF_MONTH` con `2027-03-15`, o `paymentDay = 15` con `2027-03-10`. Ante un par inválido se lanza `InvalidInputError`, y la UI re-deriva el día al cambiar `paymentDay`.

## [ALG.ZERO] Tasas en cero

- **Si `r = 0`** (todas las tasas en cero): `level = HALF_UP_2(B / m)`, `charge = interest = insurance = 0` y `capital = level`. La última cuota liquida el saldo.
- **Perfil `FHA_GT_V1` con `f = 0`:** `interest = charge`, `insurance = 0` y no se aplica [ALG.PERIOD.SPLIT].
- **Perfil `FHA_GT_V1` con `i = 0` y `f > 0`:** la fórmula general da `interest = 0` e `insurance = charge`.
- Nunca se divide entre cero. Las implementaciones deben tratar estos casos antes de aplicar las fórmulas generales.

## [ALG.LEVEL] Cuota nivelada

```
P     = (1 + r)^m
level = HALF_UP_2( B · r / (1 − 1/P) )
```

`B` es el saldo y `m` el número de cuotas restantes del plazo fijo. Al inicio, `B = principal` y `m = termMonths`.
La cuota nivelada cubre capital + interés + seguros porcentuales. **No incluye cargos fijos.**

## [ALG.PERIOD.FHA_GT_V1] Cálculo de un periodo, perfil `FHA_GT_V1`

Para una cuota que no es la última, con saldo de apertura `B`:

```
charge    = HALF_UP_2( B · r )                  # cargo financiero combinado
interest  = HALF_UP_2( charge · i / (i + f) )   # reparto proporcional
insurance = charge − interest                   # el residuo va a seguros
capital   = level − charge
closing   = B − capital
total     = capital + interest + insurance + Σ cargos fijos vigentes
```

## [ALG.PERIOD.SPLIT] Reparto de `insurance` entre componentes

Para los componentes `f₁…f_m`, en orden de arreglo:

```
insⱼ = HALF_UP_2( insurance · fⱼ / f )    para j < m
ins_m = insurance − Σ_{j<m} insⱼ          (el último recibe el residuo)
```

Aplica en el perfil `FHA_GT_V1`, tanto en cuotas normales como en la última. Con un solo componente, `ins₁ = insurance`.

## [ALG.PERIOD.SIMPLE] Cálculo de un periodo, perfil `SIMPLE`

```
interest   = HALF_UP_2( B · i / 12 )
insuranceⱼ = HALF_UP_2( B · fⱼ / 12 )      (cada componente redondeado por separado)
capital    = level − interest − Σ insuranceⱼ
```

## [ALG.LAST] Última cuota

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

- **[ALG.LAST.FIXED_TERM] Plazo fijo:** la cuota número `term`. Si antes ocurre que `level − financialCharge ≥ B`, esa cuota liquida antes.
- **[ALG.LAST.DERIVED_TERM] Plazo derivado:** la primera cuota donde `level − financialCharge ≥ B`.

## [ALG.FIXED] Cargos fijos

- Un cargo con `effectiveFrom = d` se suma al `total` de toda cuota cuyo vencimiento sea `≥ d`, hasta que un `FixedChargeChange` lo reemplace.
- Los cargos fijos **no** afectan el saldo, la cuota nivelada ni el interés.

---

## [ALG.EVENTS] Eventos

Un préstamo es una **línea de tiempo**: las condiciones originales más eventos fechados.

**[ALG.EVENTS.ANCHOR] Cuota de aplicación `k`:**

1. Si el evento trae `installmentNumber`, **ese número manda**: `k = installmentNumber`, y la fecha queda como dato informativo. Se valida que `1 ≤ k ≤ term` vigente; si no, se lanza un error de validación tipado.
2. Si no lo trae, `k` es la **primera cuota con vencimiento `≥` fecha del evento**.

`ActualPayment` exige `installmentNumber`; la UI lo sugiere a partir de la fecha y es editable, lo que cubre los pagos tardíos. `ReportedBalance` lo admite como opcional. Los demás eventos se asocian por fecha.

**[ALG.EVENTS.ORDER] Orden total.** Los eventos se ordenan por la clave `(k, fase, fecha, rangoDeTipo, id)`:

| Fase | Eventos (rangoDeTipo) | Efecto |
|---|---|---|
| 0 | `ReportedBalance` | Calcula `realDelta` contra el saldo de apertura proyectado de `k` y luego **re-ancla** ese saldo. Si hay varias anclas en la misma `k`, todas reportan su `realDelta` contra la apertura proyectada y re-ancla la de fecha mayor (empate: `id` mayor) |
| 1 | `RateChange` (0), luego `FixedChargeChange` (1) | Afectan el cálculo de la cuota `k`, sobre el saldo ya anclado |
| 2 | — | Se calcula la cuota `k` |
| 3 | `Prepayment` (0), luego `AdvanceInstallments` (1) | Se aplican después de pagar la cuota `k`, en orden de fecha y luego de rango |
| 4 | `ActualPayment` | Solo comparación |

### [ALG.RATE] Cambio de tasa (`RateChange`)

Nuevas tasas `i'` y/o `fⱼ'` desde la cuota `k` (inclusive), con saldo de apertura `B`. Tiene tres políticas:

- **[ALG.RATE.RECALC_KEEP_TERM]** Política **`RECALC_INSTALLMENT_KEEP_TERM`** (por defecto): `level` según [ALG.LEVEL] con `r'` y `m = term − (k − 1)`, usando el `term` vigente de [ALG.TERM]. El plazo queda **fijo**.
- **[ALG.RATE.KEEP_INSTALLMENT]** Política **`KEEP_INSTALLMENT_ADJUST_TERM`**: `level` no cambia y el plazo queda **derivado**. Si `level − HALF_UP_2(B·r') ≤ 0`, se lanza `NegativeAmortizationError`.
- **[ALG.RATE.BANK_INSTALLMENT]** Política **`BANK_INSTALLMENT`**: `level` es el valor informado (cuota nivelada, sin cargos fijos). El plazo queda **derivado** y aplica la misma validación de amortización negativa.

### [ALG.FIXEDCHANGE] Cambio de cargos fijos (`FixedChargeChange`)

Trae la **lista completa** de cargos fijos vigentes desde la cuota `k`. Todos los cargos anteriores dejan de aplicarse, incluidos los de `effectiveFrom` futuro definidos en las condiciones. Para quitar un cargo, se envía la lista sin él.

### [ALG.PREPAY] Abono a capital (`Prepayment`)

Se aplica **inmediatamente después de pagar la cuota `k`** (fase 3), así que reduce el interés desde la cuota `k + 1`.

- **[ALG.PREPAY.CAP]** El abono se recorta a `min(amount, closing_k)`. Si iguala el saldo, el préstamo termina en la cuota `k` (liquidación anticipada, `payoff`).
- **[ALG.PREPAY.REDUCE_TERM]** Modo `REDUCE_TERM`: `level` no cambia y el plazo queda derivado.
- **[ALG.PREPAY.REDUCE_INSTALLMENT]** Modo `REDUCE_INSTALLMENT`: `level` según [ALG.LEVEL] con `B'` (saldo después del abono) y `m = term − k`. El plazo queda fijo.
- **[ALG.PREPAY.COMMISSION]** Comisión opcional:
  - `FLAT`: un monto fijo.
  - `PERCENT`: `HALF_UP_2(abono aplicado · tasa)`.

  La comisión **no** reduce el saldo y se suma a `totalPaid`.

### [ALG.ADVANCE] Adelantar N cuotas (`AdvanceInstallments`)

- **Monto:** `projectCapital(state, N)`, el capital de las cuotas `k+1 … k+N` del calendario **vigente justo antes del evento**.
- **Aplicación:** se aplica como `Prepayment` con `REDUCE_TERM`. Se recorta igual que [ALG.PREPAY.CAP].
- **Propiedad:** si no hay eventos posteriores, el resto del calendario es idéntico al vigente desde la cuota `k+N+1`, y `monthsSaved = N` exactamente.

### [ALG.ANCHOR] Saldo reportado (`ReportedBalance`)

- Registra `Bᵣ`, el saldo que informó el banco como **saldo de apertura de la cuota `k`**, es decir, antes de pagarla.
- En la fase 0 se calcula **`realDelta = Bᵣ − apertura proyectada de k`** en el camino real, antes de re-anclar.
- **Re-anclaje:** la apertura de la cuota `k` pasa a ser `Bᵣ`. `level` y el modo del plazo no cambian, y la última cuota absorbe la diferencia según [ALG.LAST].
- `reportedRate` y `totalInstallment`, si existen, son **informativos** en v1. Se muestran, pero no alteran el cálculo.

### [ALG.ACTUAL] Pago real (`ActualPayment`)

- **Solo compara** (fase 4): marca la cuota `k` como pagada y, si trae desglose, calcula `realDelta` por componente (real − proyectado).
- **No altera** el camino. El anclaje solo ocurre con `ReportedBalance`.

---

## [ALG.PATHS] Los tres caminos

| Camino | Composición |
|---|---|
| **Plan original** | Solo las condiciones originales, sin eventos |
| **Camino real** | Condiciones + eventos reales + anclas `ReportedBalance` |
| **Escenario** | Camino real + eventos hipotéticos del escenario |

**[ALG.PATHS.CUTOFF] Corte.**
- `cutoffK` es el máximo `k` (según [ALG.EVENTS.ANCHOR]) entre los `ReportedBalance`, `ActualPayment`, `Prepayment` reales y `AdvanceInstallments` reales. Si no hay ninguno, vale 0.
- Los `RateChange` y `FixedChargeChange` reales **no** mueven el corte; pueden estar fechados en el futuro.
- Un evento hipotético con `k ≤ cutoffK` lanza un **error de validación tipado**.
- La comparación es por número de cuota. La fecha de hoy no interviene.

## [ALG.METRICS] Métricas de comparación

Todas comparan un escenario contra su **base**. Por defecto la base es el camino real sin eventos hipotéticos.

- **`interestSaved`** = Σ(`interest` + seguros) de la base − lo mismo del escenario.
- **`monthsSaved`** = número de cuotas de la base − número de cuotas del escenario.
- **`endDate`** = vencimiento de la última cuota.
- **`totalPaid`** = Σ `total` + Σ abonos + Σ comisiones.
- **`netSaving`** = `totalPaid` de la base − `totalPaid` del escenario. Incluye los cargos fijos que ya no se pagan y descuenta las comisiones.

## [ALG.YEARLY] Subtotales anuales

Se agrupa por **año calendario del vencimiento**, sumando `capital`, `interest`, seguros, cargos fijos, abonos y `total`.

## [ALG.GOAL] Búsqueda por meta

**Entrada:**
- Un camino base (real o escenario).
- Una fecha de abono `d`, que lo asocia a la cuota `k` según [ALG.EVENTS.ANCHOR]. Se exige `k > cutoffK`; si no, error de validación tipado.
- Una meta, de dos tipos posibles:
  - **`FINISH_BY(fecha)`**, con modo `REDUCE_TERM`. La meta se cumple si `endDate ≤ fecha`.
  - **`MAX_INSTALLMENT(valor)`**, con modo `REDUCE_INSTALLMENT`. La meta se cumple si el `total` de la cuota `k+1` es `≤ valor`. La liquidación total en `k` (no existe la cuota `k+1`) **cuenta como cumplida**.

**Método:**
- Bisección sobre centavos enteros en `[1, closing_k × 100]`. La meta es monótona respecto del monto.
- La búsqueda **no aplica comisión**. Si el usuario agrega una comisión al abono resultante, las métricas se recalculan.

**Resultado:** `GoalSeekResult` (nunca se lanza excepción por una meta inalcanzable):
- **`ALREADY_MET`:** la meta ya se cumple con monto 0.
- **`FOUND{ amount, metrics, isPayoff }`:** el **mínimo** monto, al centavo, que cumple la meta; con un centavo menos ya no se cumple. `isPayoff` indica que el monto liquida el préstamo.
- **`INFEASIBLE{ payoffAmount, reason }`:** ni liquidando en `k` se cumple. Pasa, por ejemplo, con `FINISH_BY` cuando la fecha es anterior al vencimiento de `k` (`reason = GOAL_DATE_BEFORE_PREPAYMENT`).

`InfeasibleGoalError` queda reservado para entradas inválidas (meta mal formada).

## [ALG.VALIDATE] Validación de plantilla contra un saldo real

- **Diferencia:** `realDelta = Bᵣ − apertura modelada de k`, con el mismo signo que [ALG.ANCHOR].
  - **Modelado:** el camino real calculado **conservando solo las anclas con `k' < k`**. Se excluyen todas las anclas de la misma `k` y de cuotas posteriores. Así coincide con la fase 0 de [ALG.EVENTS.ORDER], donde todas las anclas de una misma `k` se comparan contra la misma apertura proyectada. En el asistente de alta coincide con el plan original.
- **Semáforo**, en unidades de la moneda del préstamo:
  - **`GREEN`:** `|realDelta| ≤ 1.00`.
  - **`AMBER`:** `|realDelta| ≤ máx(50.00, 0.0002 · Bᵣ)`.
  - **`RED`:** cualquier otra diferencia.
- **Causa** (determinista en v1):
  - Si es `GREEN`, no hay causa.
  - `INSTALLMENT_MISALIGNMENT` si `Bᵣ` está a ≤ 1.00 de la apertura modelada de `k−1` o de `k+1`.
  - Si no, `UNKNOWN`.
  - `RATE_MISMATCH`, `INSURANCE_RATE_MISMATCH`, `ROUNDING_PROFILE` y `MISSING_EVENT` quedan **reservadas** (no se emiten en v1).

## [ALG.TEMPLATES] Plantillas (versionadas en código)

| Plantilla | Componentes | Perfil | Día de pago | `rateType` |
|---|---|---|---|---|
| `fha-gt@1` "FHA Guatemala v1" | Interés (lo ingresa el usuario) + seguro de hipoteca FHA `0.01` + desgravamen `0.0026` | `FHA_GT_V1` | `END_OF_MONTH` | `VARIABLE` |
| `simple@1` "Hipotecario simple" | Solo interés | `SIMPLE` | Lo elige el usuario | Lo elige el usuario |

**[ALG.TEMPLATES.FIXED]** Los cargos fijos pueden derivarse como `cuota total del banco − level`. El usuario los nombra y los puede editar.
El préstamo guarda una **copia** de los valores de la plantilla (`templateRef = {id, version}`). Cambiar la plantilla después no altera préstamos existentes.

---

## [ALG.EXAMPLE] Ejemplo resuelto sintético

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

## [ALG.PENDING] Ejemplos que agrega W0-02

Cada ejemplo se agrega a `docs/specs/algorithm-examples/` con `synthetic: true`, id de sección y strings decimales:

1. Perfil `SIMPLE`, incluida la última cuota con dos componentes. Debe distinguir las lecturas de [ALG.LAST].
2. `paymentDay` 15, 30 y 31, más `END_OF_MONTH`, cruzando febrero de año bisiesto y no bisiesto.
3. Cada política de `RateChange`, incluido el término derivado y `NegativeAmortizationError`.
4. `REDUCE_TERM` en `k = 12` seguido de `RateChange` `RECALC_INSTALLMENT_KEEP_TERM` en `k = 24` (uso del `term` vigente).
5. `FixedChargeChange` con lista completa, quitando un cargo y con un cargo de `effectiveFrom` futuro.
6. Comisiones `FLAT` y `PERCENT`, y `payoff` por [ALG.PREPAY.CAP].
7. Ancla y `RateChange` en la misma `k`, y dos anclas en la misma `k`.
8. Pago tardío con `installmentNumber`.
9. `realDelta` por componente.
10. `cutoffK` con un abono real posterior a un ancla, y error al poner un hipotético en `k ≤ cutoffK`.
11. Búsqueda por meta: `ALREADY_MET`, `FOUND` (incluido `isPayoff`) e `INFEASIBLE`, para ambas metas.
12. Semáforo `GREEN`, `AMBER` y `RED` en ambos bordes, e `INSTALLMENT_MISALIGNMENT`.
13. Subtotales anuales y métricas (`interestSaved`, `monthsSaved`, `totalPaid`, `netSaving`).
14. [ALG.ZERO]: `r = 0`, y `FHA_GT_V1` con `f = 0` y con `i = 0`.
15. Par `firstDueDate`/`paymentDay` inválido (`InvalidInputError`) y válido en febrero bisiesto.
16. Ancla con `installmentNumber` explícito distinto de la cuota que daría su fecha.

Los ejemplos con eventos van en archivos JSON separados de los ejemplos sin eventos. El oráculo `core` y W1-01 solo reproducen los ejemplos sin eventos.
