# Glosario ES ↔ EN

El código usa **inglés**, la interfaz **español (Guatemala)** y la documentación **español**. Este glosario es la referencia obligatoria para nombrar cosas. Si un término no está aquí, se agrega antes de usarlo.

| Español (UI / docs) | Inglés (código) | Definición |
|---|---|---|
| Préstamo / crédito | `Loan` | Un financiamiento con sus condiciones originales y su línea de tiempo de eventos |
| Alias / nombre del préstamo | `name` | Nombre que el usuario le da (ej. "Casa A"); en la UI se rotula «Alias» |
| Banco | `bank` | Texto libre con el nombre del banco; nunca se publica en el repo con datos reales |
| Nota | `note` | Texto libre opcional en `ReportedBalance`, `ActualPayment` y `LoanEvent` |
| Monto / capital inicial | `principal` | Monto desembolsado |
| Plazo | `termMonths` / `term` | `termMonths`: cuotas pactadas en el contrato. `term`: plazo vigente ([ALG.TERM]); en plazo fijo es un dato (baja en N al adelantar cuotas, [ALG.ADVANCE]) y en plazo derivado resulta de simular |
| Desembolso / liquidación | `disbursementDate` | Fecha en que el banco entregó el dinero |
| Cuota | `Installment` | Pago periódico; también la fila de la tabla de amortización |
| Cuota nivelada | `level` / `levelPayment` | Capital + interés + seguros porcentuales, constante (método francés) |
| Cuota total | `total` | Cuota nivelada + cargos fijos |
| Saldo (a capital) | `balance` | Capital pendiente; `opening` (antes de pagar) y `closing` (después) |
| Interés | `interest` | Parte del cargo financiero correspondiente a la tasa de interés |
| Seguro FHA / seguro de hipoteca | `mortgageInsurance` | Prima FHA del 1 % anual sobre saldo |
| Desgravamen | `lifeInsurance` | Seguro de vida del deudor, 0.26 % anual sobre saldo en FHA |
| Seguros porcentuales | `insurance` / `insuranceRates` | Suma de componentes porcentuales distintos del interés |
| Cargo financiero combinado | `charge` | Interés + seguros porcentuales de un periodo |
| Cargos fijos | `fixedCharges` | Montos mensuales fijos (IUSI, seguro de daños…) |
| IUSI | `iusi` (etiqueta de cargo fijo) | Impuesto Único Sobre Inmuebles |
| Amortización (a capital) | `capital` | Parte de la cuota que reduce el saldo |
| Tabla de amortización | `Schedule` / `ScheduleRow` | Calendario de cuotas |
| Abono (a capital) | `Prepayment` | Pago extraordinario que reduce el saldo |
| Reducir plazo | `REDUCE_TERM` | Abono que mantiene la cuota y acorta el plazo |
| Reducir cuota | `REDUCE_INSTALLMENT` | Abono que mantiene el plazo y baja la cuota |
| Adelantar N cuotas | `AdvanceInstallments` | Abono igual al capital de las próximas N cuotas |
| Comisión por abono | `commission` (`FLAT` / `PERCENT`) | Cargo del banco por abonar; no reduce saldo |
| Cambio de tasa | `RateChange` | Evento de nueva tasa con política de recálculo |
| Recalcular cuota (mantener plazo) | `RECALC_INSTALLMENT_KEEP_TERM` | Política por defecto ante cambio de tasa |
| Mantener cuota (ajustar plazo) | `KEEP_INSTALLMENT_ADJUST_TERM` | Política alternativa |
| Cuota del banco | `BANK_INSTALLMENT` | La cuota nivelada la fija el banco |
| Saldo reportado | `ReportedBalance` | Saldo informado por el banco; ancla del camino real |
| Pago real | `ActualPayment` | Pago efectuado, con desglose opcional |
| Ancla / re-anclaje | `anchor` / `rebase` | Reemplazar el saldo proyectado por el reportado |
| Plan original | `OriginalPlan` (`PathKind.ORIGINAL`) | Calendario solo con condiciones originales |
| Camino real | `RealPath` (`PathKind.REAL`) | Condiciones + eventos reales + anclas |
| Escenario / proyección | `Scenario` (`PathKind.SCENARIO`) | Camino real + eventos hipotéticos |
| Búsqueda por meta | `goalSeek` | Cálculo inverso del abono necesario |
| Plantilla | `Template` | Valores precargados versionados (`fha-gt@1`, `simple@1`) |
| Perfil de redondeo | `RoundingProfile` (`FHA_GT_V1`, `SIMPLE`) | Reglas de redondeo de un banco |
| Diferencia real | `realDelta` | Real − proyectado |
| Interés ahorrado | `interestSaved` | Reducción de interés + seguros |
| Meses ahorrados | `monthsSaved` | Reducción en número de cuotas |
| Total pagado | `totalPaid` | Cuotas + abonos + comisiones |
| Respaldo | `Backup` | Documento JSON versionado exportable |
| Sincronizar | `sync` | Combinar con la copia en Google Drive |
| Frase de cifrado | `passphrase` | Secreto del usuario que deriva la clave de cifrado |
| Marca de borrado | `tombstone` (`deletedAt`) | Borrado lógico hasta sincronizar |
| Moneda | `Currency` (`GTQ`, `USD`) | Quetzal o dólar; nunca se mezclan |
| Tipo de tasa | `rateType` (`FIXED`, `VARIABLE`) | Dato informativo del contrato; el motor no lo usa ([ALG.TERMS]) |
| Plazo vigente | `term` | Número de la última cuota del calendario vigente: en plazo fijo, el dato (la cuota que liquida puede llegar antes); en plazo derivado, por simulación ([ALG.TERM]) |
| Número de cuota | `installmentNumber` / `k` | Cuota a la que se asocia un evento ([ALG.EVENTS.ANCHOR]) |
| Corte | `cutoffK` | Última cuota con dato real; los eventos hipotéticos van después ([ALG.PATHS.CUTOFF]) |
| Liquidación anticipada | `payoff` / `isPayoff` | Abono que cancela todo el saldo |
| Fecha de fin | `endDate` | Vencimiento de la última cuota |
| Ahorro neto | `netSaving` | Diferencia de total pagado entre base y escenario |
| Meta: terminar antes de | `FINISH_BY` | Tipo de meta de la búsqueda por meta (reducir plazo) |
| Meta: cuota máxima | `MAX_INSTALLMENT` | Tipo de meta de la búsqueda por meta (reducir cuota) |
| Resultado de búsqueda | `GoalSeekResult` (`ALREADY_MET`, `FOUND`, `INFEASIBLE`) | Ya cumplida, monto encontrado o inalcanzable |
| Semáforo de validación | `ValidationStatus` (`GREEN`, `AMBER`, `RED`, `UNVALIDATED`) | Verde, ámbar, rojo o sin validar ([ALG.VALIDATE]) |
| Causa de diferencia | `DeltaCause` (`INSTALLMENT_MISALIGNMENT`, `UNKNOWN`, …) | Explicación sugerida de una diferencia ([ALG.VALIDATE]) |
| Comisión fija / porcentual | `FLAT` / `PERCENT` | Tipos de comisión por abono |
| Estado del préstamo | `LoanStatus` (`active`, `paid`, `archived`) | Activo, pagado o archivado |
| Tarjeta | card | Unidad de trabajo para un agente (`docs/plan/cards/`) |
| Ola | wave | Grupo de tarjetas que pueden avanzar en paralelo |
| Vencimiento | `dueDate` | Fecha en que vence una cuota ([ALG.DATES]) |
| Día de pago | `paymentDay` (`1`–`31` o `END_OF_MONTH`) | Regla del día de vencimiento; `END_OF_MONTH` = último día del mes |
| Primer vencimiento | `firstDueDate` | Fecha de vencimiento de la cuota 1 |
| Tasa de interés | `interestRate` (`i`) | Tasa anual de interés, string decimal |
| Tasa periódica | `r` | `(i + f) / 12` ([ALG.TERMS]), sin redondear a centavos: vive en el contexto de 34 dígitos ([ALG.CONV]); la usa [ALG.LEVEL] |
| Cargo financiero | `financialCharge` | `charge` en `FHA_GT_V1`; `interest + Σ insuranceⱼ` en `SIMPLE`. Lo usan la prueba de última cuota ([ALG.LAST]) y las validaciones de amortización negativa ([ALG.RATE.KEEP_INSTALLMENT], [ALG.TERM]) |
| Seguros por componente | `insuranceComponents` | Monto de cada seguro porcentual de una cuota, en el orden de `insuranceRates` |
| Abonos / comisiones (sumados) | `prepayments` / `commissions` | Totales de abonos aplicados y de comisiones |
| Estado tras la cuota k | `PeriodState` | Estado después de pagar la cuota `k`, incluida su fase 3 ([ALG.TERM]) |
| Cuotas restantes | `remainingTerm` | Cuotas `k+1 … última` por simulación ([ALG.TERM]) |
| Capital proyectado | `projectCapital` | Capital de las cuotas `k+1 … k+n` del calendario vigente ([ALG.TERM]) |
| Límite ámbar | `amberLimit` | `máx(50.00, 0.0002 · Bᵣ)`, sin redondear ([ALG.VALIDATE]) |
| Entrada inválida | `InvalidInputError` | Error de validación tipado ([ALG.ERRORS]) |
| Amortización negativa | `NegativeAmortizationError` | La cuota no cubre el cargo financiero ([ALG.ERRORS]) |
| Entrada inválida de la búsqueda por meta | `InfeasibleGoalError` | Escenario faltante, `MAX_INSTALLMENT` negativo, o abono con `k ≤ cutoffK` o después de la última cuota del camino base; nunca una meta inalcanzable ([ALG.ERRORS]) |
| Monedas distintas | `CurrencyMismatchError` | Se comparan calendarios de monedas distintas ([ALG.ERRORS]) |
| Cuota informada por el banco | `bankInstallment` | Cuota nivelada, sin cargos fijos, de un `RateChange` con `BANK_INSTALLMENT` ([ALG.RATE.BANK_INSTALLMENT]) |
| Cuotas a adelantar | `count` | N de `AdvanceInstallments` ([ALG.ADVANCE]) |
| Número de cuotas | `installmentCount` | Filas de un calendario (`Schedule`) |
| Eventos reales / del escenario | `realEvents` / `scenarioEvents` | Entradas de `buildPaths` (`PathsInput`); `scenarioEvents = null`: sin escenario ([ALG.PATHS]) |
| Evento heredado | inherited event | Evento, con o sin `installmentNumber`, que un calendario derivado (el escenario, el camino base `SCENARIO` de la búsqueda por meta, cada prueba de la búsqueda o el modelado de [ALG.VALIDATE]) toma de su camino de origen; no se vuelve a validar su rango ([ALG.EVENTS.ANCHOR], reglas 1 y 3) |
| Cuota fuera de rango | `INSTALLMENT_OUT_OF_RANGE` | Código de `InvalidInputError`: `installmentNumber` menor que 1 o después de la última cuota del calendario, o evento posterior a la última cuota ([ALG.EVENTS.ANCHOR]); el abono de la búsqueda usa `PREPAYMENT_AFTER_END` de `InfeasibleGoalError` |
| Modo del plazo | `termMode` (`FIXED`, `DERIVED`) | Si `term` es un dato o resulta de simular ([ALG.TERM]); lo guarda `PeriodState` |
| Opciones de un calendario derivado | `ScheduleOptions` (`inheritedEvents`, `goalPrepayment`) | Cuarto parámetro de `buildSchedule`/`runSchedule`: los eventos heredados de su camino de origen, cuyo rango no se revalida (regla 3 de [ALG.EVENTS.ANCHOR]), y el abono de una prueba de la búsqueda por meta, que va después de los eventos de la fase 3 del camino base con su misma fecha ([ALG.GOAL]) |
| Saldo tras el abono | `closingAfterPrepayment` | Cierre de la cuota después de sus abonos de la fase 3; es la apertura de la cuota siguiente, salvo re-anclaje |
| Tipo de seguro | `InsuranceKind` (`mortgageInsurance`, `lifeInsurance`, `other`) | Clase de un componente de `insuranceRates` en una plantilla: seguro de hipoteca, desgravamen u otro seguro porcentual ([ALG.TEMPLATES]) |
| Solicitud de búsqueda por meta | `GoalSeekRequest` (`basePath`, `prepaymentDate`, `goal`) | Camino base, fecha del abono y meta (`kind` con `date` o `amount`) ([ALG.GOAL]) |
| Saldo reportado / proyectado / modelado | `reported` / `projected` / `modeled` | Campos de la diferencia real por ancla ([ALG.ANCHOR]) y de la validación ([ALG.VALIDATE]) |
| Diferencia real por ancla / por componente | `perAnchor` / `perComponent` | Listas de `RealDelta` ([ALG.ANCHOR], [ALG.ACTUAL]) |
| Fin / total pagado de la base | `baseEndDate` / `baseTotalPaid` | Campos de `ComparisonMetrics` para la base ([ALG.METRICS]) |
| Ejemplo resuelto | algorithm example (`docs/specs/algorithm-examples/`) | Copia JSON sintética de un ejemplo de `docs/algorithm.md` |

## Identificadores de sección `[ALG.*]`

Cada id de `docs/algorithm.md` se arma con estos tokens, separados por puntos (`[ALG.RATE.KEEP_INSTALLMENT]` = algoritmo · cambio de tasa · mantener cuota).

| Token | Español | Inglés (código) |
|---|---|---|
| `ALG` | Algoritmo (prefijo de toda regla) | algorithm |
| `ACTUAL` | Pago real | `ActualPayment` |
| `ADVANCE` | Adelantar N cuotas | `AdvanceInstallments` |
| `ANCHOR` | Ancla, y cuota de aplicación de un evento | `anchor` / `installmentNumber` |
| `BANK_INSTALLMENT` | Cuota del banco | `BANK_INSTALLMENT` |
| `CAP` | Tope del abono al saldo | cap |
| `COMMISSION` | Comisión por abono | `commission` |
| `CONV` | Convenciones numéricas | numeric conventions (`decimal-config`) |
| `CUTOFF` | Corte | `cutoffK` |
| `DATES` | Fechas de vencimiento | `dueDate` |
| `DERIVED_TERM` | Plazo derivado | derived term |
| `ERRORS` | Errores tipados | `DomainError` |
| `EVENTS` | Eventos | `DomainEvent` |
| `EXAMPLE` | Ejemplo resuelto | worked example |
| `FHA_GT_V1` | Perfil FHA Guatemala v1 | `FHA_GT_V1` |
| `FIXED` | Cargos fijos | `fixedCharges` |
| `FIXEDCHANGE` | Cambio de cargos fijos | `FixedChargeChange` |
| `FIXED_TERM` | Plazo fijo | fixed term |
| `GOAL` | Búsqueda por meta | `goalSeek` |
| `KEEP_INSTALLMENT` | Mantener cuota (ajustar plazo) | `KEEP_INSTALLMENT_ADJUST_TERM` |
| `LAST` | Última cuota | last row |
| `LEVEL` | Cuota nivelada | `level` / `levelPayment` |
| `METRICS` | Métricas de comparación | `ComparisonMetrics` |
| `ORDER` | Orden total de eventos | order key |
| `PATHS` | Caminos | `Paths` / `PathKind` |
| `PENDING` | Ejemplos resueltos de W0-02 (lista de pendientes ya cubierta) | worked-example checklist |
| `PERIOD` | Cálculo de un periodo | period |
| `PREPAY` | Abono a capital | `Prepayment` |
| `RATE` | Cambio de tasa | `RateChange` |
| `RECALC_KEEP_TERM` | Recalcular cuota (mantener plazo) | `RECALC_INSTALLMENT_KEEP_TERM` |
| `REDUCE_INSTALLMENT` | Reducir cuota | `REDUCE_INSTALLMENT` |
| `REDUCE_TERM` | Reducir plazo | `REDUCE_TERM` |
| `SIMPLE` | Perfil simple | `SIMPLE` |
| `SPLIT` | Reparto del seguro entre componentes | split |
| `TEMPLATES` | Plantillas | `Template` |
| `TERM` | Plazo vigente | `term` |
| `TERMS` | Condiciones del préstamo | `LoanTerms` |
| `VALIDATE` | Validación contra un saldo real | `validateAgainstReportedBalance` |
| `YEARLY` | Subtotales anuales | `yearlySubtotals` / `YearlySubtotal` |
| `ZERO` | Tasas en cero | zero rates |
