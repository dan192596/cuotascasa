# Formato del oráculo: fixtures, perfiles, CLI y esquema privado

- **Estado:** congelado en W0-04. Solo lo cambia una micro-tarjeta de contrato de Opus, que actualiza a la vez su espejo ejecutable `packages/schema/src/oracle/fixture.ts`.
- **Lectores:** el linaje del oráculo (W1-02, W2-06, W3-04), los gates de Opus (W2-01, W3-01, W4-01), el arnés de conformidad y `private-compare` (W0-06). El linaje del oráculo no lee `packages/`: este documento le basta.
- **Fuente del cálculo:** `docs/algorithm.md`. Este documento fija formatos y composición; nunca reinterpreta una regla `[ALG.*]`. Si algo de aquí parece contradecir `docs/algorithm.md`, manda el algoritmo y el agente se detiene y pregunta a Opus.
- **Datos:** todo fixture es sintético, generado con semilla, y lleva `synthetic: true`. Ningún valor sale de un préstamo real (ADR-0015).

## 1. Convenciones de valores

| Tipo | Forma | Ejemplo |
|---|---|---|
| Monto | string decimal no negativo con exactamente 2 decimales, sin separador de miles ni símbolo | `"500000.00"` |
| Diferencia | igual, con signo `-` opcional; nunca `"-0.00"` | `"-12.50"` |
| Tasa | string con la fracción anual, con a lo sumo 6 decimales, sin exponente ni `%`. Las tasas de interés generadas llevan exactamente 4 decimales | `"0.0700"`, `"0.0026"` |
| Fecha | `AAAA-MM-DD`, fecha de calendario válida | `"2028-02-29"` |
| Entero | número JSON entero (solo `k`, `termMonths`, `paymentDay` numérico, `installmentNumber`, `count`, `seed`, `loanIndex`, `generatorVersion`, `installments`) | `240` |

Ningún monto ni tasa se escribe como número JSON.

## 2. Contexto decimal

Es el de `[ALG.CONV]`, sin cambios: precisión de 34 dígitos significativos y redondeo `ROUND_HALF_EVEN` para toda operación; `HALF_UP_2` (`ROUND_HALF_UP` a 2 decimales) solo donde el algoritmo lo escribe. En Python, el contexto activo durante cualquier cálculo es `decimal.Context(prec=34, rounding=decimal.ROUND_HALF_EVEN)`, y una prueba lo verifica (W1-02).

## 3. Archivo de fixture

### 3.1 Nombre

- **Id del fixture:** `<perfil>-<NNNN>`, donde `NNNN` es `loanIndex` (1, 2, …) con 4 dígitos y ceros a la izquierda. Ejemplos: `core-0001`, `full-0040`.
- **Archivo:** `DIR/<id-del-fixture>.json`. En el repo, `DIR` es `tools/oracle/fixtures/`.
- Los perfiles válidos son `core` y `full`.

### 3.2 Serialización

UTF-8, `json.dumps(objeto, ensure_ascii=False, indent=2, sort_keys=True)` más un salto de línea final. Las listas conservan el orden que fija este documento. Dos corridas con el mismo perfil, semilla y `GENERATOR_VERSION` producen bytes idénticos.

### 3.3 Estructura

```json
{
  "synthetic": true,
  "id": "full-0013",
  "profile": "full",
  "seed": 20261004,
  "loanIndex": 13,
  "generatorVersion": 1,
  "features": ["core", "anchor"],
  "traits": ["roundingProfile:FHA_GT_V1", "paymentDay:EOM", "currency:GTQ", "lastRow"],
  "inputs": { "terms": { }, "events": [ ] },
  "expected": { "rows": [ ], "anchors": [ ], "payments": [ ], "summary": { } }
}
```

| Campo | Significado |
|---|---|
| `synthetic` | Siempre `true` |
| `id`, `profile`, `loanIndex` | Ver §3.1; `id` debe ser exactamente `<profile>-<loanIndex con 4 dígitos>` |
| `seed` | Semilla del perfil (entero de 0 a 4294967295), la misma del manifiesto |
| `generatorVersion` | `GENERATOR_VERSION` del oráculo que lo generó (§7) |
| `features`, `traits` | Etiquetas de §4, sin repetir, en el orden de las listas de §4 |
| `inputs` | Condiciones y eventos (§3.4). El archivo privado `a-terms.json` tiene exactamente esta forma (§9) |
| `expected` | Resultado del camino real con todos los eventos (§3.5) |

### 3.4 `inputs`

`inputs.terms` tiene exactamente estos campos de `[ALG.TERMS]` (todos salvo `rateType`, que es informativo y no va en los fixtures), con los nombres de la entidad `Loan`:

| Campo | Valor |
|---|---|
| `principal` | Monto > 0 |
| `termMonths` | Entero ≥ 1 |
| `disbursementDate` | Fecha |
| `firstDueDate` | Fecha consistente con `paymentDay` (`[ALG.DATES]`) |
| `paymentDay` | Entero 1–31 o `"END_OF_MONTH"` |
| `currency` | `"GTQ"` o `"USD"` |
| `interestRate` | Tasa |
| `insuranceRates` | Lista de tasas `f₁…f_m`, en orden; puede ser vacía |
| `fixedCharges` | Lista de `{ "label", "amount", "effectiveFrom" }` |
| `roundingProfile` | `"FHA_GT_V1"` o `"SIMPLE"` |

`inputs.events` es una lista de eventos reales. Cada uno tiene `id` (`^[a-z0-9][a-z0-9-]{0,63}$`, único en el fixture; el generador usa `ev-01`, `ev-02`, … en orden de creación) y `type`:

| `type` | Campos | Cuota `k` |
|---|---|---|
| `RateChange` | `date`, `policy` (`RECALC_INSTALLMENT_KEEP_TERM`, `KEEP_INSTALLMENT_ADJUST_TERM` o `BANK_INSTALLMENT`), `interestRate` y/o `insuranceRates` (lista completa nueva), `bankInstallment` solo y siempre con `BANK_INSTALLMENT` | Por fecha |
| `FixedChargeChange` | `date`, `fixedCharges`: la lista completa `[{ "label", "amount" }]` vigente desde `k` (`[ALG.FIXEDCHANGE]`) | Por fecha |
| `Prepayment` | `date`, `amount` (> 0), `mode` (`REDUCE_TERM` o `REDUCE_INSTALLMENT`), `commission` opcional: `{ "kind": "FLAT", "amount" }` o `{ "kind": "PERCENT", "rate" }` | Por fecha |
| `AdvanceInstallments` | `date`, `count` (N ≥ 1) | Por fecha |
| `ReportedBalance` | `date`, `installmentNumber` opcional, `balance` | `installmentNumber` si viene; si no, por fecha |
| `ActualPayment` | `paidDate`, `installmentNumber` (obligatorio), `total`, `breakdown` opcional como un todo: si viene, trae los cuatro componentes `{ "capital", "interest", "insurance", "fixedCharges" }`, nunca uno parcial (`[ALG.ACTUAL]`) | `installmentNumber` |

«Por fecha» es la regla de `[ALG.EVENTS.ANCHOR]`: la primera cuota con vencimiento `≥` la fecha.

**Límites que también exige el espejo TypeScript** (`packages/schema/src/oracle/fixture.ts` y `common.ts`), para que `terms-invalid` coincida en las dos herramientas (§8.3):

- `termMonths`, `installmentNumber` y `count`: enteros de 1 a 1200.
- Como máximo 10 tasas en `insuranceRates` (también dentro de un `RateChange`), 20 elementos en `fixedCharges` (también dentro de un `FixedChargeChange`) y 60 eventos en `inputs.events`.
- `label`: de 1 a 60 caracteres, sin espacios al inicio ni al final (el espejo usa la longitud y `trim()` de JavaScript).
- Tasa: la parte entera es un solo dígito (0 a 9) y la fracción, si existe, tiene de 1 a 6 decimales.
- Monto: de 1 a 13 dígitos enteros, sin ceros a la izquierda (salvo el `0` solo), y exactamente 2 decimales.
- Deben ser mayores que cero: `principal`, el `amount` de un `Prepayment`, `bankInstallment`, el `amount` de una comisión `FLAT`, el `rate` de una comisión `PERCENT` y el `total` de un `ActualPayment`.

### 3.5 `expected`

**`rows`:** una fila por cuota del camino real, `k = 1 … n` sin huecos. Cada fila tiene exactamente estos campos; este orden es también el de las columnas de `a-expected.csv` (§9):

| # | Campo | Definición |
|---|---|---|
| 1 | `k` | Número de cuota |
| 2 | `dueDate` | Vencimiento de `k` (`[ALG.DATES]`) |
| 3 | `opening` | Saldo de apertura de `k`, después del re-anclaje de la fase 0 si lo hay |
| 4 | `level` | Cuota nivelada vigente para `k`, después de la fase 1 |
| 5 | `interest` | Interés de `k` |
| 6 | `insurance` | Seguros porcentuales de `k`; es la suma de `insuranceComponents` |
| 7 | `insuranceComponents` | Un monto por componente vigente, en el orden de `insuranceRates` (`[ALG.PERIOD.SPLIT]` en `FHA_GT_V1`, redondeo por componente en `SIMPLE`); `[]` con `insuranceRates = []` y un `"0.00"` por tasa con tasas en cero (`[ALG.ZERO]`, «Sin seguros»; con `f = 0` no se aplica `[ALG.PERIOD.SPLIT]`) |
| 8 | `capital` | Capital de `k` |
| 9 | `fixedCharges` | Suma de los cargos fijos vigentes en `k` (`[ALG.FIXED]`, `[ALG.FIXEDCHANGE]`) |
| 10 | `prepayment` | Monto aplicado en la fase 3 de `k`: suma de los `Prepayment` y de los `AdvanceInstallments` después del tope `[ALG.PREPAY.CAP]`; `"0.00"` si no hay |
| 11 | `commission` | Suma de las comisiones de la fase 3 de `k` (`[ALG.PREPAY.COMMISSION]`); `"0.00"` si no hay |
| 12 | `total` | `capital + interest + insurance + fixedCharges`; no incluye `prepayment` ni `commission` |
| 13 | `closing` | `opening − capital`, antes de la fase 3. La apertura de `k + 1` es `closing − prepayment`, salvo re-anclaje |
| 14 | `paid` | `true` si existe un `ActualPayment` con `installmentNumber = k` (`[ALG.ACTUAL]`) |

**`anchors`:** una entrada por `ReportedBalance`, en el orden de `inputs.events`: `{ "eventId", "k", "realDelta" }`, con `realDelta = balance − apertura proyectada de k` antes de re-anclar (`[ALG.ANCHOR]`).

**`payments`:** una entrada por `ActualPayment`, en el orden de `inputs.events`: `{ "eventId", "k", "componentDeltas" }`. `componentDeltas` es `null` sin `breakdown`; con él, `{ "capital", "interest", "insurance", "fixedCharges" }` con real − proyectado contra la fila `k` (`[ALG.ACTUAL]`).

**`summary`** (`[ALG.METRICS]`):

| Campo | Definición |
|---|---|
| `installments` | Número de filas `n` |
| `endDate` | `dueDate` de la última fila |
| `totalInterest`, `totalInsurance`, `totalCapital`, `totalFixedCharges` | Suma de la columna respectiva |
| `totalPrepayments`, `totalCommissions` | Suma de `prepayment` y de `commission` |
| `totalPaid` | `Σ total + Σ prepayment + Σ commission` |

## 4. Etiquetas

### 4.1 Etiquetas de función (`features`): deciden qué fixtures se exigen

Un fixture se exige en CI solo cuando todas sus `features` están en `tools/conformance/enforced-features.json` (W0-06). Lista cerrada, en este orden:

1. `core`: todos los fixtures la llevan.
2. `rateChange:RECALC_INSTALLMENT_KEEP_TERM`, 3. `rateChange:KEEP_INSTALLMENT_ADJUST_TERM`, 4. `rateChange:BANK_INSTALLMENT`: hay al menos un `RateChange` con esa política.
5. `fixedChargeChange`: hay al menos un `FixedChargeChange`.
6. `prepayment:REDUCE_TERM`, 7. `prepayment:REDUCE_INSTALLMENT`: hay al menos un `Prepayment` con ese modo. `AdvanceInstallments` no agrega esta etiqueta.
8. `commission:FLAT`, 9. `commission:PERCENT`: hay al menos un `Prepayment` con esa comisión.
10. `payoff`: la última fila tiene `prepayment` mayor que `"0.00"` e igual a su `closing` (liquidación anticipada por `[ALG.PREPAY.CAP]`).
11. `advance`: hay al menos un `AdvanceInstallments`.
12. `anchor`: hay al menos un `ReportedBalance`.
13. `actualPayment`: hay al menos un `ActualPayment`.

### 4.2 Etiquetas de rasgo (`traits`): solo miden cobertura

Lista cerrada, en este orden. Todo fixture lleva exactamente una de cada grupo 1–2, 3–4 y 5–6.

1. `roundingProfile:FHA_GT_V1`, 2. `roundingProfile:SIMPLE`: el perfil de `inputs.terms`.
3. `paymentDay:numeric`, 4. `paymentDay:EOM`: `paymentDay` entero o `"END_OF_MONTH"`.
5. `currency:GTQ`, 6. `currency:USD`: la moneda.
7. `lastRow`: el `total` de la última fila es distinto de `level + fixedCharges` de esa fila, o el préstamo termina antes de `termMonths` (`installments < termMonths`).
8. `latePayment`: hay un `ActualPayment` cuyo `paidDate` es posterior al `dueDate` de su `installmentNumber`.
9. `explicitKAnchor`: hay un `ReportedBalance` con `installmentNumber` distinto de la cuota que daría su `date` por `[ALG.EVENTS.ANCHOR]`, calculada con la secuencia de vencimientos de `[ALG.DATES]`.
10. `sameKAnchors`: hay dos o más `ReportedBalance` con la misma cuota efectiva `k`.
11. `zeroRate`: `r = 0`, es decir, `interestRate` y todos los elementos de `insuranceRates` valen cero.
12. `zeroInsurance`: perfil `FHA_GT_V1`, `f = 0` (sin componentes o todos en cero) e `interestRate` mayor que cero. Cuando `r = 0` aplica `zeroRate` y no esta.

## 5. Manifiesto

`DIR/manifest.json`, con la misma serialización de §3.2:

```json
{
  "synthetic": true,
  "profiles": {
    "core": { "count": 15, "generatorVersion": 1, "seed": 20261004 }
  }
}
```

- Una entrada por perfil comprometido, con su `seed`, su `count` exacto (§6) y el `generatorVersion` con que se generó.
- Los archivos de un perfil son exactamente `DIR/<perfil>-0001.json … DIR/<perfil>-<count>.json`; el arnés los deriva de aquí.
- Las semillas las eligen los gates de Opus (W2-01 para `core`, W3-01 para `full`).

## 6. Perfiles

### 6.1 Sub-semilla por préstamo

Cada préstamo usa su propio generador: `random.Random(subseed)`, con

```
subseed = int.from_bytes(sha256(f"{perfil}:{seed}:{loanIndex}".encode("utf-8")).digest()[:8], "big")
```

Así, agregar un perfil o un préstamo nunca cambia los bytes de otro. El orden de los sorteos dentro de un préstamo lo fija el generador; cambiarlo cambia bytes y obliga a subir `GENERATOR_VERSION` (§7).

### 6.2 Sorteos comunes

«Uniforme en centavos [a, b]» es `rng.randint(a × 100, b × 100)` formateado con 2 decimales; «uniforme en [a, b]» sobre enteros es `rng.randint(a, b)`; «uno de» es `rng.choice`.

| Valor | Regla |
|---|---|
| `principal` GTQ | Uniforme en centavos [150000.00, 2500000.00] |
| `principal` USD | Uniforme en centavos [20000.00, 330000.00] |
| `interestRate` | Uno de los 23 valores `0.0540, 0.0560, …, 0.0980` (5.4 % a 9.8 % en pasos de 0.2 puntos), con 4 decimales. Excepciones: los casos `zeroRate` usan `"0.0000"` |
| `termMonths` | `12 × años`, con años uniforme en [5, 30] |
| `firstDueDate` | Año uniforme en [2024, 2030] y mes uniforme en [1, 12]; inicio «bisiesto»: febrero de 2028. El día sigue `[ALG.DATES]`: último día del mes con `END_OF_MONTH`, o `min(d, días del mes)` con `paymentDay = d` |
| `disbursementDate` | Día 1 del mes anterior al de `firstDueDate` |
| Seguros `FHA` | `["0.01", "0.0026"]` |
| Seguros `NONE` | `[]` |
| Cargos (`label`) | `IUSI`, `Seguro de daños` y `Seguro adicional`; en las listas siempre en ese orden |
| Cargos `F0` | `[]` |
| Cargos `F1` | `[IUSI]` |
| Cargos `F2` | `[IUSI, Seguro de daños]` |
| Montos de cargos GTQ | `IUSI` uniforme en centavos [25.00, 600.00]; `Seguro de daños` [15.00, 250.00]; `Seguro adicional` [10.00, 100.00] |
| Montos de cargos USD | `IUSI` [3.00, 80.00]; `Seguro de daños` [2.00, 35.00]; `Seguro adicional` [1.50, 15.00] |
| `effectiveFrom` | `firstDueDate`, salvo el cargo futuro de F05 |

### 6.3 Perfil `core`: 15 préstamos, sin eventos

Todos llevan solo la función `core` y `inputs.events = []`.

| Préstamo | Perfil | Seguros | `paymentDay` | Moneda | Inicio | Cargos |
|---|---|---|---|---|---|---|
| C01 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 |
| C02 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F1 |
| C03 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F0 |
| C04 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | bisiesto | F2 |
| C05 | FHA_GT_V1 | FHA | END_OF_MONTH | USD | sorteado | F2 |
| C06 | FHA_GT_V1 | FHA | 15 | GTQ | sorteado | F2 |
| C07 | FHA_GT_V1 | FHA | 31 | GTQ | bisiesto | F1 |
| C08 | FHA_GT_V1 | FHA | 30 | GTQ | sorteado | F2 |
| C09 | FHA_GT_V1 | FHA | END_OF_MONTH | USD | sorteado | F0 |
| C10 | FHA_GT_V1 | FHA | 1 | GTQ | sorteado | F2 |
| C11 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 |
| C12 | SIMPLE | FHA | END_OF_MONTH | GTQ | sorteado | F2 |
| C13 | SIMPLE | NONE | 28 | GTQ | sorteado | F1 |
| C14 | SIMPLE | FHA | 15 | USD | bisiesto | F0 |
| C15 | SIMPLE | NONE | END_OF_MONTH | GTQ | sorteado | F2 |

`loanIndex` es el número del préstamo (C01 → `core-0001`). Totales: 11 `FHA_GT_V1` y 4 `SIMPLE`; 9 `END_OF_MONTH` y 6 numéricos; 12 GTQ y 3 USD; 3 inicios bisiestos.

### 6.4 Perfil `full`: 40 préstamos

`full` usa sus propias sub-semillas y nunca altera los bytes de `core`.

**Ubicación de los eventos.**
- La cuota del primer evento, `k₁`, es uniforme en [6, `min(48, termMonths − 36)`].
- Un segundo evento va en `k₂ = k₁ + j`, con `j` uniforme en [6, 12]; un tercero, en `k₃ = k₂ + j'`, con `j'` uniforme en [1, 12].
- Un evento asociado por fecha que debe caer en `k` lleva `date = dueDate(k) − o` días, con `o` uniforme en [0, 20].
- Si un evento queda en una cuota que no existe o que es la última del calendario vigente en ese punto, el generador vuelve a sortear su cuota con el mismo generador (muestreo por rechazo).

**Recetas.** «Proyectado» significa el camino real calculado con los eventos de clave de orden menor (`[ALG.EVENTS.ORDER]`).

| Receta | Evento generado |
|---|---|
| `RC(política)` | `RateChange` con `interestRate` nuevo = actual ± Δ, Δ uno de {0.0020, 0.0040}, signo uno de {+, −}; si el resultado queda fuera de la grilla de §6.2, se vuelven a sortear Δ y el signo con el mismo generador (muestreo por rechazo). Con `KEEP_INSTALLMENT_ADJUST_TERM` y `BANK_INSTALLMENT`, se vuelve a sortear mientras produzca `NegativeAmortizationError` (`[ALG.RATE]`). Con `BANK_INSTALLMENT`, `bankInstallment` = la `level` de `[ALG.LEVEL]` con la tasa nueva y `m = term − (k − 1)`, más un uniforme en centavos [0.00, 50.00] |
| `FCC(quita)` | Lista `[IUSI]` con el monto vigente de IUSI (quita el seguro de daños) |
| `FCC(futuro)` | Las condiciones agregan `Seguro adicional` con `effectiveFrom = dueDate(k₁ + 6)`; el evento en `k₁` trae `[IUSI, Seguro de daños]` con montos nuevos sorteados, así que el cargo futuro nunca rige |
| `FCC(agrega)` | Condiciones con F1; la lista nueva es `[IUSI (mismo monto), Seguro de daños (monto sorteado)]` |
| `FCC(reprecia)` | Los mismos nombres de F2 con montos nuevos sorteados |
| `PP(modo[, comisión])` | `Prepayment` con `amount` = `rng.randint(⌈c / 100⌉, ⌊c / 5⌋)` centavos, donde `c` es `principal` en centavos (del 1 % al 20 % del principal, redondeado hacia adentro). `FLAT`: monto uniforme en centavos [100.00, 1500.00] en GTQ o [15.00, 200.00] en USD. `PERCENT`: `rate` uno de {`"0.01"`, `"0.02"`, `"0.03"`} |
| `PAYOFF(modo[, comisión])` | Como `PP`, pero con `amount = principal`; el tope `[ALG.PREPAY.CAP]` lo convierte en liquidación |
| `ADV(N)` | `AdvanceInstallments` con `count = N`; `ADV(1–12)` sortea N uniforme en [1, 12] |
| `RB(fecha)` | `ReportedBalance` sin `installmentNumber`; `balance` = apertura proyectada de `k` más un uniforme en centavos [−500.00, 500.00], sin bajar de `"0.00"` |
| `RB(explícita)` | Igual, pero con `installmentNumber = k_fecha + 1`, donde `k_fecha` es la cuota que da su `date`; la cuota efectiva es `k_fecha + 1` y `balance` parte de su apertura proyectada |
| `RB×2(misma k)` | Dos `ReportedBalance` por fecha en la misma `k`, con desfases `o` distintos y deltas sorteados por separado |
| `AP(a tiempo\|tarde, desglose\|sin)` | `ActualPayment` con `installmentNumber = k`; `paidDate = dueDate(k) − o` con `o` en [0, 5] a tiempo, o `dueDate(k) + o` con `o` en [1, 20] tarde. Con desglose: cada componente = el de la fila `k` proyectada más un uniforme en centavos [0.00, 5.00], y `total` = su suma. Sin desglose: `total` = el `total` proyectado más un uniforme en centavos [0.00, 5.00] |

**Composición.**

| Préstamo | Perfil | Seguros | `paymentDay` | Moneda | Inicio | Cargos | Eventos |
|---|---|---|---|---|---|---|---|
| F01 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(RECALC_INSTALLMENT_KEEP_TERM)` en k₁ |
| F02 | FHA_GT_V1 | FHA | 15 | GTQ | sorteado | F2 | `RC(KEEP_INSTALLMENT_ADJUST_TERM)` en k₁ |
| F03 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(BANK_INSTALLMENT)` en k₁ |
| F04 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `FCC(quita)` en k₁ |
| F05 | SIMPLE | FHA | END_OF_MONTH | GTQ | sorteado | F2 + futuro | `FCC(futuro)` en k₁ |
| F06 | FHA_GT_V1 | FHA | END_OF_MONTH | USD | sorteado | F1 | `FCC(agrega)` en k₁ |
| F07 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `PP(REDUCE_TERM)` en k₁ |
| F08 | FHA_GT_V1 | FHA | 30 | GTQ | sorteado | F2 | `PP(REDUCE_INSTALLMENT)` en k₁ |
| F09 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `PP(REDUCE_TERM, FLAT)` en k₁ |
| F10 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `ADV(6)` en k₁ |
| F11 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | bisiesto | F2 | `ADV(1)` en k₁ |
| F12 | SIMPLE | NONE | END_OF_MONTH | GTQ | sorteado | F1 | `ADV(12)` en k₁ |
| F13 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB(fecha)` en k₁ |
| F14 | FHA_GT_V1 | FHA | 31 | GTQ | sorteado | F2 | `RB(explícita)` en k₁ |
| F15 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB×2(misma k)` en k₁ |
| F16 | FHA_GT_V1 | FHA | END_OF_MONTH | USD | sorteado | F2 | `AP(a tiempo, desglose)` en k₁ |
| F17 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `AP(tarde, desglose)` en k₁ |
| F18 | SIMPLE | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `AP(a tiempo, sin)` en k₁ |
| F19 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `PP(REDUCE_TERM)` en k₁; `RC(RECALC_INSTALLMENT_KEEP_TERM)` en k₂ |
| F20 | FHA_GT_V1 | FHA | 15 | GTQ | sorteado | F2 | `RC(KEEP_INSTALLMENT_ADJUST_TERM)` en k₁; `PP(REDUCE_INSTALLMENT, PERCENT)` en k₂ |
| F21 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB(fecha)` en k₁; `RC(BANK_INSTALLMENT)` en k₂ |
| F22 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(RECALC_INSTALLMENT_KEEP_TERM)` en k₁; `FCC(reprecia)` en k₂; `AP(a tiempo, desglose)` en k₃ |
| F23 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(KEEP_INSTALLMENT_ADJUST_TERM)` en k₁; `ADV(1–12)` en k₂ |
| F24 | FHA_GT_V1 | FHA | END_OF_MONTH | USD | sorteado | F2 | `RC(BANK_INSTALLMENT)` en k₁; `PP(REDUCE_TERM, PERCENT)` en k₂ |
| F25 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB(fecha)` y `RC(RECALC_INSTALLMENT_KEEP_TERM)` en la misma k₁ |
| F26 | SIMPLE | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(KEEP_INSTALLMENT_ADJUST_TERM)` en k₁; `RB(explícita)` en k₂ |
| F27 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(BANK_INSTALLMENT)` en k₁; `AP(tarde, sin)` en k₂ |
| F28 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB(fecha)` en k₁; `PAYOFF(REDUCE_TERM)` en k₂ |
| F29 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `PAYOFF(REDUCE_TERM, FLAT)` en k₁ |
| F30 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | bisiesto | F2 | `PAYOFF(REDUCE_INSTALLMENT, PERCENT)` en k₁ |
| F31 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB×2(misma k)` en k₁; `AP(a tiempo, desglose)` en k₂ |
| F32 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RB(explícita)` en k₁; `PP(REDUCE_INSTALLMENT, FLAT)` en k₂ |
| F33 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `FCC(reprecia)` en k₁; `ADV(1–12)` en k₂; `AP(tarde, desglose)` en k₃ |
| F34 | FHA_GT_V1 | FHA | END_OF_MONTH | GTQ | sorteado | F2 | `RC(RECALC_INSTALLMENT_KEEP_TERM)` en k₁; `RB×2(misma k)` en k₂ |
| F35 | FHA_GT_V1 | NONE | END_OF_MONTH | GTQ | sorteado | F0 | Ninguno; `interestRate = "0.0000"` (`zeroRate`) |
| F36 | FHA_GT_V1 | NONE | 31 | GTQ | bisiesto | F1 | Ninguno; `interestRate = "0.0000"` (`zeroRate`) |
| F37 | SIMPLE | NONE | END_OF_MONTH | GTQ | sorteado | F2 | Ninguno; `interestRate = "0.0000"` (`zeroRate`) |
| F38 | FHA_GT_V1 | NONE | END_OF_MONTH | GTQ | sorteado | F2 | Ninguno (`zeroInsurance`) |
| F39 | FHA_GT_V1 | NONE | 30 | GTQ | sorteado | F0 | Ninguno (`zeroInsurance`) |
| F40 | FHA_GT_V1 | NONE | END_OF_MONTH | USD | sorteado | F1 | Ninguno (`zeroInsurance`) |

**Matriz de cobertura que cumple** (la verifica W2-06):

| Elemento | Préstamos | Cuántos |
|---|---|---|
| `RECALC_INSTALLMENT_KEEP_TERM` | F01, F19, F22, F25, F34 | 5 |
| `KEEP_INSTALLMENT_ADJUST_TERM` | F02, F20, F23, F26 | 4 |
| `BANK_INSTALLMENT` | F03, F21, F24, F27 | 4 |
| `FixedChargeChange` | F04, F05, F06, F22, F33 | 5 |
| `Prepayment` `REDUCE_TERM` | F07, F09, F19, F24, F28, F29 | 6 |
| `Prepayment` `REDUCE_INSTALLMENT` | F08, F20, F30, F32 | 4 |
| Comisión `FLAT` | F09, F29, F32 | 3 |
| Comisión `PERCENT` | F20, F24, F30 | 3 |
| `payoff` | F28, F29, F30 | 3 |
| `AdvanceInstallments` | F10, F11, F12, F23, F33 | 5 |
| `ReportedBalance` | F13, F14, F15, F21, F25, F26, F28, F31, F32, F34 | 10 |
| `ActualPayment` | F16, F17, F18, F22, F27, F31, F33 | 7 |
| Cada tipo de evento solo | `RateChange` F01–F03; `FixedChargeChange` F04–F06; `Prepayment` F07–F09; `AdvanceInstallments` F10–F12; `ReportedBalance` F13–F15; `ActualPayment` F16–F18 | 3 por tipo |
| Mezclas (dos o más eventos) | F19–F28, F31–F34 | 14 |
| Liquidación como único evento | F29, F30 | 2 |
| `latePayment` | F17, F27, F33 | 3 |
| `explicitKAnchor` | F14, F26, F32 | 3 |
| `sameKAnchors` | F15, F31, F34 | 3 |
| `zeroRate` | F35, F36, F37 | 3 |
| `zeroInsurance` | F38, F39, F40 | 3 |
| `SIMPLE` | F05, F12, F18, F26, F37 | 5 |
| `paymentDay` numérico | F02, F08, F14, F20, F36, F39 | 6 |
| USD | F06, F16, F24, F40 | 4 |
| Inicio bisiesto | F11, F30, F36 | 3 |
| `lastRow` | Calculado (§4.2); W2-06 verifica que sean al menos 3 | ≥ 3 |

## 7. Regla de `generatorVersion`

- `GENERATOR_VERSION` es un entero del paquete `cuotascasa_oracle`; empieza en 1. Cada fixture y cada entrada del manifiesto guardan el valor con que se generaron.
- **Se sube** cuando un cambio del oráculo alteraría los bytes de un perfil ya comprometido: corrección del cálculo, del orden de sorteos, del formato o de una receta.
- **No se sube** al agregar un perfil nuevo (W2-06 agrega `full` sin tocar `core`) ni con cambios que no alteran bytes comprometidos.
- Si el código va por delante del manifiesto, `regenerate` informa `regeneration pending: <perfil>` y no toca ese perfil; el siguiente gate de Opus lo regenera.

## 8. CLI: `python -m cuotascasa_oracle`

Se ejecuta desde `tools/oracle`; las rutas son relativas al directorio de trabajo.

### 8.1 `generate --profile P --seed S --out DIR`

- Escribe `DIR/P-0001.json … DIR/P-<count>.json` según §6 y borra `DIR/P-NNNN.json` con `NNNN` mayor que `count`.
- Combina en `DIR/manifest.json` la entrada de `P` (`seed`, `count`, `generatorVersion`); deja intactas las demás y crea el manifiesto con `synthetic: true` si no existe.
- Un perfil desconocido sale con código 2.

### 8.2 `regenerate --manifest DIR/manifest.json`

- Por cada perfil del manifiesto: si su `generatorVersion` es igual a `GENERATOR_VERSION`, ejecuta `generate` con su semilla y `--out` = el directorio del manifiesto; si es menor, imprime `regeneration pending: <perfil>` y no lo toca; si es mayor, o el perfil no existe en el código, sale con código 2.
- Los perfiles que existen en el código pero no en el manifiesto se ignoran.
- Un manifiesto ilegible o mal formado (JSON inválido, `profiles` que no es objeto, o una entrada con `seed`, `count` o `generatorVersion` que no sea entero) imprime `error: manifest` y sale con código 2 antes de escribir nada. `generate` aplica la misma regla al manifiesto que actualiza.
- CI (`oracle-diff`, W2-01) corre `regenerate` y luego `git diff --exit-code`.

### 8.3 `compare --terms RUTA/a-terms.json --expected RUTA/a-expected.csv`

- Lee los dos archivos del esquema privado (§9), calcula el camino real de `a-terms.json` y lo compara fila por fila con `a-expected.csv`.
- **Filas con diferencia:** se recorren las posiciones `k = 1 … máx(n_esperado, n_calculado)`. Una fila difiere si falta en un lado o si cualquier campo difiere (`insuranceComponents` elemento a elemento; `paid` por igualdad).
- **Diferencia máxima:** el mayor `|esperado − calculado|` entre los campos de monto (`opening`, `level`, `interest`, `insurance`, cada elemento de `insuranceComponents` si ambas listas tienen el mismo largo, `capital`, `fixedCharges`, `prepayment`, `commission`, `total`, `closing`) de las filas presentes en ambos lados; `0.00` si no hay ninguna. Se escribe con 2 decimales.
- **Salida normal:** exactamente estas tres líneas, y nada más:

  ```text
  allRowsMatched: yes|no
  mismatchedRows: <int>
  maxAbsDiff: <d.dd>
  ```

- **Nunca** imprime el total de filas, montos, fechas ni condiciones, ni siquiera en la terminal o en un error.
- **Códigos de salida:** 0 si coinciden todas las filas, 1 si no, 2 ante un error de uso o de formato. Un error imprime una sola línea `error: <código>`, con código `usage`, `terms-invalid`, `csv-header` o `csv-row`, sin valores ni números de fila. Un archivo que falta o no se puede leer da `usage`. Hasta W2-06, un `events` que no sea una lista vacía da `terms-invalid` (el oráculo aún no aplica eventos).

### 8.4 `compare … --log-line --sha <sha> --label <label>`

- `--log-line` exige `--sha` (7 a 40 caracteres hexadecimales en minúscula) y `--label` (`^[a-z]{1,8}$`, por ejemplo `a` para `a-terms.json` y `a-expected.csv`); sin ellos sale con código 2.
- En lugar de las tres líneas imprime solo la línea de la bitácora, con la fecha local de la corrida:

  ```text
  AAAA-MM-DD · oráculo <sha> · préstamo <label> · todas las filas coinciden: sí|no
  ```

  La línea registra solo si coincidieron todas las filas: no lleva `mismatchedRows` ni `maxAbsDiff`, porque en una corrida que falla podrían revelar el plazo real o un monto real (decisión del dueño, 2026-10-09). Las tres líneas de §8.3 no cambian y no salen de la terminal.
- `private-compare` del arnés (W0-06) usa el mismo esquema, la misma salida y la misma línea, con `motor <sha>` en lugar de `oráculo <sha>`.

## 9. Esquema privado: `a-terms.json` y `a-expected.csv`

Solo existen fuera del repo, en `~/.cuotascasa-private/` y con la autorización del dueño (`docs/plan/README.md`, sección 6). Llevan solo números, con nombres genéricos (`a-`, `b-`, …).

**`a-terms.json`:** UTF-8, un objeto con exactamente la forma de `inputs` de un fixture (§3.4): `{ "terms": { … }, "events": [ … ] }`.

**`a-expected.csv`:**
- UTF-8 sin BOM (un BOM se rechaza), separador `,`, fin de línea `\n` (se acepta `\r\n` al leer), sin comillas ni líneas vacías salvo un salto final.
- La primera línea es exactamente:

  ```text
  k,dueDate,opening,level,interest,insurance,insuranceComponents,capital,fixedCharges,prepayment,commission,total,closing,paid
  ```

  Otro encabezado, columnas de más o de menos, o en otro orden, se rechaza (`error: csv-header`).
- Una fila por cuota, en orden de `k`, con los formatos de §1 y §3.5: `k` entero; `dueDate` `AAAA-MM-DD`; montos con 2 decimales, sin separador de miles ni símbolo de moneda; `insuranceComponents` como montos unidos por `;` (vacío si no hay componentes, por ejemplo `416.67;108.33`); `paid` `true` o `false`.

## 10. Entorno de Python

- Python 3.13 (`tools/oracle/.python-version`). En ejecución, solo la biblioteca estándar (`decimal`, `json`, `random`, `hashlib`, `argparse`, `csv`, `pathlib`, `datetime`); nada de terceros ni módulos de red. Las pruebas de W1-02 lo verifican.
- Desarrollo: `pytest` y `ruff`, fijados con hash en `tools/oracle/requirements-dev.txt` e instalados con `pip install --require-hashes`.
- El paquete es `cuotascasa_oracle` (lo crea W1-02) y se ejecuta como `python -m cuotascasa_oracle`, que es lo que invocan los scripts raíz `oracle:gen` y `oracle:diff` (W0-01).

## 11. Ejemplos de `docs/specs/algorithm-examples/`

Usan los nombres del dominio (INDEX.md, «Formato»); el oráculo los convierte al cargarlos y las formas de los fixtures no cambian: `terms.rateType` se descarta; `ActualPayment.date` → `paidDate`; los demás eventos son iguales (§3.4); `expected.rows[]` trae solo algunas filas (siempre la última) con los 14 campos de §3.5; `realDelta.perAnchor[]` `{eventId, k, reported, projected, realDelta}` → `anchors[]` `{eventId, k, realDelta}`; `realDelta.perComponent[]` `{eventId, k, capital, interest, insurance, fixedCharges}` → `payments[]` `{eventId, k, componentDeltas}` (un pago sin desglose da `componentDeltas: null`); `installmentCount`, `endDate` y `totals` → `summary` (`installments`, `endDate`, `totalInterest`, `totalInsurance`, `totalCapital`, `totalFixedCharges`, `totalPrepayments`, `totalCommissions`, `totalPaid`; `totals.total` no tiene campo propio).
