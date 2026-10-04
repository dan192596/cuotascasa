# Glosario ES ↔ EN

El código usa **inglés**, la interfaz **español (Guatemala)** y la documentación **español**. Este glosario es la referencia obligatoria para nombrar cosas. Si un término no está aquí, se agrega antes de usarlo.

| Español (UI / docs) | Inglés (código) | Definición |
|---|---|---|
| Préstamo / crédito | `Loan` | Un financiamiento con sus condiciones originales y su línea de tiempo de eventos |
| Alias / nombre del préstamo | `name` | Nombre que el usuario le da (ej. "Casa A"); en la UI se rotula «Alias» |
| Banco | `bank` | Texto libre con el nombre del banco; nunca se publica en el repo con datos reales |
| Nota | `note` | Texto libre opcional en `ReportedBalance`, `ActualPayment` y `LoanEvent` |
| Monto / capital inicial | `principal` | Monto desembolsado |
| Plazo | `termMonths` / `term` | Número de cuotas pactadas (plazo fijo) o resultante (plazo derivado) |
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
| Plazo vigente | `term` | Número de la última cuota del calendario vigente; fijo o derivado ([ALG.TERM]) |
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
