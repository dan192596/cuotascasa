# ADR-0027: Métricas de ahorro frente a anclas y cargos fijos, y ancla por fecha del estado de cuenta

Estado: Aceptado

Fecha: 2026-10-28

Decisores: Claude (Opus), por delegación de la tarjeta W9-05. El dueño confirmó el valor por defecto «antes» o «después» del dictamen 3 el 2026-10-28.

Enmienda a: spec de diseño v1 (`docs/specs/2026-10-04-cuotascasa-v1-design.md`), sección 9, «Paso 4, ancla y validación»; HU-04, HU-09, HU-13 y HU-16.

## Contexto

El panel multi-rol del 2026-10-27 confirmó tres hallazgos sobre cifras que no dicen lo que el usuario cree (evidencia en `docs/plan/implementation/w9/README.md`). Todos los montos de este ADR son sintéticos.

1. **finanzas-B2. El re-anclaje cuenta como ahorro.** El detalle muestra «Plan original frente a lo real» con `compareSchedules(original, real)`. Un `ReportedBalance` re-ancla el saldo sin flujo de dinero ([ALG.ANCHOR]), así que una baja de saldo aparece como cuotas e interés ahorrados. Ejemplo del panel: Q100,000.00 a 120 meses, 7 % + 1.26 %, sin cargos fijos y con un ancla en `k = 12` de 85,000.00 frente a una apertura proyectada de 93,865.79: `monthsSaved = 14`, `interestSaved = 9,000.77` y `netSaving = 17,866.56`, sin ningún abono.
2. **finanzas-B1. El ahorro neto incluye cargos que siguen después de liquidar.** [ALG.METRICS] define `netSaving` como diferencia de `totalPaid`, «incluyendo los cargos fijos que ya no se pagan». El IUSI es un impuesto municipal: el banco deja de cobrarlo, pero el dueño lo sigue pagando. En [ALG.EXAMPLE] con `REDUCE_TERM`, `netSaving − interestSaved = 7,900.00`, que son 20 cuotas × 395.00 de cargos fijos. Además (finanzas-B7), la tabla comparativa llama «Interés ahorrado» a una cifra que incluye seguros.
3. **ux-B3 y finanzas-B5. El ancla pide el número de cuota.** El paso 4 del asistente exige la cuota del saldo, que es su apertura ([ALG.ANCHOR]). Los estados de cuenta suelen dar el saldo **después** del pago, así que el semáforo sale ámbar o rojo con `INSTALLMENT_MISALIGNMENT` desde el primer uso. HU-04 pide la cuota de forma literal.

El código cumple las reglas: el problema es cómo se presentan. Cambiar [ALG.METRICS], [ALG.ANCHOR] o el esquema obliga a regenerar el oráculo, avisar a los dos linajes y, para un atributo nuevo de `FixedCharge`, enmendar ADR-0005, el respaldo y las migraciones.

## Decisión

**Ninguna regla `[ALG.*]` cambia.** `docs/algorithm.md`, sus ejemplos, el esquema y el oráculo quedan igual. Los tres dictámenes son de presentación y de flujo de la UI.

### 1. El ajuste por saldos reportados va aparte (finanzas-B2)

1. En el detalle del préstamo, la sección «Plan original frente a lo real» agrega la cifra **«Ajuste por saldos reportados»**: la suma de `realDelta` de `realDeltaPerAnchor` ([ALG.ANCHOR]), con su signo y sin redondeo extra. Solo aparece si el préstamo tiene al menos un `ReportedBalance` sin borrar, aunque la suma sea `0.00`.
2. Cuando aparece, la acompaña esta nota, literal: «El ajuste por saldos reportados suma las diferencias entre los saldos que informó el banco y los que proyectaba la app. No viene de pagos registrados, pero sí cambia las cuotas y el ahorro de esta sección.»
3. [ALG.METRICS] no cambia: las cifras de la sección siguen siendo las de `compareSchedules(original, real)`.

En el ejemplo del panel, el ajuste es `−8,865.79`, y el ahorro sin cargos fijos (punto 2) es `17,866.56 = 9,000.77 + 8,865.79`: la nota hace visible que más de la mitad viene del ancla.

### 2. Dos cifras de ahorro, con lo que incluye cada una (finanzas-B1 y B7)

1. Se muestran dos cifras:
   - **«Ahorro neto (incluye cargos fijos)»:** `netSaving` de [ALG.METRICS], sin cambios.
   - **«Ahorro sin cargos fijos»:** `netSaving − (fixedCharges de la base − fixedCharges del escenario)`, con los `totals.fixedCharges` de los dos calendarios comparados, en strings decimales con los helpers de dinero de `@cuotascasa/domain`. Es una cifra de presentación, no una métrica nueva del motor.
2. «Interés ahorrado» pasa a **«Intereses y seguros ahorrados»** en todas las pantallas, porque `interestSaved` suma interés y seguros ([ALG.METRICS]).
3. Dónde aplica:

   | Pantalla | Cifras, en este orden |
   |---|---|
   | Detalle, «Plan original frente a lo real» | «Cuotas ahorradas», «Intereses y seguros ahorrados», «Ahorro sin cargos fijos», «Ahorro neto (incluye cargos fijos)» y, si hay anclas, «Ajuste por saldos reportados» |
   | Comparación de escenarios (filas de la tabla) | «Intereses y seguros ahorrados», «Meses ahorrados», «Ahorro sin cargos fijos», «Ahorro neto (incluye cargos fijos)», «Fecha de fin», «Total pagado» |
   | Editor de escenarios, «Efecto sobre el camino real» | «Intereses y seguros ahorrados», «Meses ahorrados», «Fecha de fin», «Total pagado», «Ahorro sin cargos fijos», «Ahorro neto (incluye cargos fijos)» |
   | Editor de escenarios, resultado de la búsqueda por meta | Igual que hoy, con «Intereses y seguros ahorrados» y «Ahorro neto (incluye cargos fijos)». Sin «Ahorro sin cargos fijos», porque el resultado no trae los calendarios |

4. En el detalle, cuando las dos cifras de ahorro difieren, se agrega esta nota, literal: «El ahorro neto cuenta los cargos fijos de las cuotas que ya no le pagas al banco. Algunos, como el IUSI, se siguen pagando aunque termines el préstamo: por eso también se muestra el ahorro sin cargos fijos.»
5. Las cifras se muestran con su signo, como pide [ALG.METRICS].

Comprobación con [ALG.EXAMPLE], `REDUCE_TERM` frente a la base sin abono: «Ahorro neto (incluye cargos fijos)» = `77,072.80` y «Ahorro sin cargos fijos» = `77,072.80 − 7,900.00 = 69,172.80`. Entre dos caminos con las mismas anclas (escenario frente a real), el capital total es el mismo, así que el ahorro sin cargos fijos es `interestSaved` menos las comisiones de más del escenario.

### 3. El ancla se registra por la fecha del estado de cuenta (ux-B3 y finanzas-B5)

Aplica al paso 4 del asistente y al formulario de saldo reportado de «Datos reales».

1. El formulario pide primero la **fecha del estado de cuenta** y el saldo. Con la regla 2 de [ALG.EVENTS.ANCHOR], deriva `k`, la primera cuota con vencimiento `≥` esa fecha, y lo muestra así: «Corresponde a la cuota N, que vence el dd/mm/aaaa». Los vencimientos no dependen de los eventos ([ALG.DATES]), así que `k` es el mismo en el plan original y en el camino real.
2. Debajo ofrece dos opciones: «Este saldo es antes de pagar esa cuota» y «Este saldo es después de pagarla».
   - Por defecto se marca **«después»** si la fecha coincide con el vencimiento de `k`, y **«antes»** si es anterior. El dueño confirmó esta regla el 2026-10-28. Así, solo con fecha y saldo el formulario se puede guardar sin pedir la cuota.
   - Con «después» se muestra además: «Se guarda como el saldo antes de pagar la cuota N+1».
3. Al guardar, el `ReportedBalance` lleva siempre `installmentNumber` explícito: `k` con «antes» y `k + 1` con «después». La fecha queda guardada como dato informativo (regla 1 de [ALG.EVENTS.ANCHOR]). El modelo guardado no cambia.
4. Si `k + 1` pasa de la última cuota del calendario, el formulario no guarda y muestra: «Después de pagar la última cuota ya no queda saldo. Elige «antes» o revisa la fecha.» Una fecha posterior a la última cuota sigue dando el error de la regla 3.
5. El número de cuota sigue editable como **opción avanzada**. Si el usuario lo escribe, manda: se guarda tal cual, con el sentido de [ALG.ANCHOR] (saldo antes de pagarla), y la elección antes o después no aplica.
6. **Al editar** un registro, el formulario deriva `k` de su fecha: si `installmentNumber` es `k`, marca «antes»; si es `k + 1`, «después»; si es otro número, abre la opción avanzada con ese número. Un registro antiguo sin `installmentNumber` se muestra con «antes», que es lo que ya significaba, y al guardarlo se escribe `k`.
7. La derivación es una sola función pura de la feature, compartida por el asistente y el formulario.

**[ALG.EVENTS.ANCHOR] no necesita un ejemplo nuevo.** La regla 2 ya está cubierta (ítem 16), y pasar a `k + 1` es un paso de la UI que el motor nunca ve, porque recibe un `installmentNumber` explícito. El desfase de una cuota ya lo cubre el ítem 12 (caso `misalignment-next`). Con las aperturas de [ALG.EXAMPLE] (cuota 12: `490,642.52`; cuota 13: `489,756.31`, en `events/ex00-base-prepayments.json`), un estado de cuenta del 2026-01-31 con saldo `489,756.31` deriva `k = 12`. Con «antes», `realDelta = −886.21` y el semáforo es rojo con `INSTALLMENT_MISALIGNMENT`. Con «después» se guarda `installmentNumber = 13`, cuya apertura es `489,756.31`, así que el semáforo es verde.

## Alternativas consideradas

- **Cambiar [ALG.METRICS] para que «Plan original frente a lo real» compare contra el plan con las mismas anclas, o separe el efecto de cada ancla.** Se descartó porque el efecto de un ancla interactúa con los eventos posteriores (cambios de tasa, abonos `REDUCE_INSTALLMENT`), así que la separación no es única. Además, obliga a regenerar el oráculo por un problema de lectura.
- **Atributo «sigue después de liquidar» en `FixedCharge`.** Es preciso, pero cambia un esquema congelado, ADR-0005, el respaldo, la sincronización y el oráculo. Además, la app no sabe qué cargo sigue: lo sabe el dueño. Mostrar las dos cifras le da la misma información sin cambiar datos. Queda como candidato para después de W9.
- **Mostrar solo el ahorro sin cargos fijos.** Se descartó porque esconde el efecto real en lo que se le paga al banco, que también es cierto.
- **Calcular `k + 1` en el motor con un campo nuevo, como `balanceTiming`.** Cambia el esquema y [ALG.ANCHOR] sin ganar nada: `installmentNumber` explícito ya expresa lo mismo.
- **Sin opción por defecto.** Obliga a elegir siempre y rompe el caso de guardar solo con fecha y saldo. La regla por fecha acierta en el caso común y se ve antes de guardar.

## Consecuencias

**Positivas**
- El dueño ve qué parte del «ahorro» viene de un saldo reportado y qué parte del ahorro neto son cargos fijos.
- Un saldo después del pago queda verde desde el primer uso.
- Ni el motor, ni el oráculo, ni el esquema, ni los fixtures cambian.

**Negativas**
- Hay dos cifras de ahorro en lugar de una.
- `ReportedBalance` nuevos siempre llevan `installmentNumber`. Si el dueño cambia después `firstDueDate`, el ancla conserva su cuota y no se mueve con la fecha.

**Riesgos**
- Que el valor por defecto no coincida con un banco que fecha el estado de cuenta el día del vencimiento antes de aplicar el pago. Mitigación: la cuota y la elección se ven antes de guardar, y el semáforo sugiere `INSTALLMENT_MISALIGNMENT`.

## Verificación

- **W9-06** implementa los dictámenes 1 y 2: el modelo del detalle prueba con un préstamo sintético con un saldo reportado menor y sin pagos que el ajuste es la suma de `realDeltaPerAnchor` y que la nota aparece; las pruebas del detalle y de la comparación verifican los textos literales de este ADR.
- **W9-08** implementa el dictamen 3: con solo fecha y saldo se guarda; «antes» guarda `k` y «después» guarda `k + 1`; un saldo «después» de la cuota 12 de [ALG.EXAMPLE] da semáforo verde.
- **W9-13** revisa las pantallas en el barrido de cierre.
- El job `docs` sigue en verde: ninguna regla ni ejemplo cambió.

## Referencias

- ADR-0004 (algoritmo), ADR-0005 (modelo de datos), ADR-0012 (sistema de diseño).
- `docs/algorithm.md`: [ALG.METRICS], [ALG.ANCHOR], [ALG.EVENTS.ANCHOR], [ALG.DATES], [ALG.VALIDATE], [ALG.EXAMPLE].
- `docs/specs/algorithm-examples/events/ex12-validation-traffic-light.json` (caso `misalignment-next`) y `docs/specs/algorithm-examples/events/ex00-base-prepayments.json`.
- `docs/discovery/historias-de-usuario.md`: HU-04, HU-09, HU-13, HU-16.
- `docs/plan/implementation/w9/README.md` y las tarjetas W9-05, W9-06 y W9-08.
