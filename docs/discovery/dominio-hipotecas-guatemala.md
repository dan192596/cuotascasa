# Dominio: préstamos de vivienda FHA en Guatemala

Fecha: 2026-10-04 · Alimenta: [`../algorithm.md`](../algorithm.md), ADR-0004, ADR-0005

> Solo hechos públicos y valores sintéticos. No hay montos, tasas, fechas ni nombres de bancos del dueño. Las menciones a
> bancos describen prácticas generales y no identifican a ninguno.

## 1. Qué es un préstamo FHA

El **FHA** (Instituto de Fomento de Hipotecas Aseguradas) no presta dinero: **asegura** préstamos hipotecarios que otorgan
entidades aprobadas, como los bancos. El deudor paga la prima de ese seguro dentro de su cuota. Para la app, esto
significa que la cuota tiene más componentes que el interés.

## 2. Componentes de la cuota

| Componente | Cómo se calcula | Entra en la cuota nivelada | Nombre en código |
|---|---|---|---|
| Interés | Tasa anual del contrato sobre el saldo, mensual 30/360 | Sí | `interest` |
| Seguro de hipoteca FHA | **1 % anual sobre saldo** (Reglamento del FHA, art. 19, literal b) | Sí | `mortgageInsurance` |
| Desgravamen (vida, invalidez, desempleo) | **0.26 % anual sobre saldo**; antes 0.20 % (vigente desde noviembre de 2016) | Sí | `lifeInsurance` |
| IUSI | Monto mensual fijo, cuando el banco lo recauda con la cuota | No (cargo fijo) | `fixedCharges` (`iusi`) |
| Seguro de daños (incendio, terremoto) | Monto mensual fijo | No (cargo fijo) | `fixedCharges` |

### 2.1 Tasa combinada

Los bancos suman las primas porcentuales a la tasa de interés y calculan **una sola cuota nivelada** (método francés)
con esa tasa combinada. Un banco lo anuncia así: *tasa 6 % + 1 % + 0.26 % = 7.26 % variable*. En la notación de
`algorithm.md`: `r = (i + f) / 12`, con `f = 0.01 + 0.0026 = 0.0126` en la plantilla `fha-gt@1`.

### 2.2 Cargos fijos

El IUSI y el seguro de daños **no dependen del saldo** y no forman parte de la cuota nivelada. El banco los suma aparte.
Por eso la app los obtiene así: `cargos fijos = cuota total del banco − cuota nivelada` (`[ALG.TEMPLATES.FIXED]`). El
usuario los nombra, los reparte y los puede editar. Cambian con el tiempo (avalúo, renovación de póliza), así que cada
cambio es un evento `FixedChargeChange` con fecha.

### 2.3 IVA

- El **interés bancario está exento** de IVA.
- Las **primas de seguro están gravadas** con IVA del 12 % (Ley del IVA, Decreto 27-92).
- La app **no desglosa IVA** en v1. Los cargos fijos se derivan del total que cobra el banco, así que ya incluyen lo que
  corresponda. El algoritmo reprodujo una tabla bancaria real sin un componente de IVA aparte.

## 3. Cómo se reparte cada pago

Lo que se dedujo y se validó en privado (detalle normativo en `[ALG.PERIOD.FHA_GT_V1]`):

1. Se calcula **un cargo financiero combinado** sobre el saldo inicial con la tasa combinada y se redondea a centavos.
2. Ese cargo se reparte **en proporción** entre interés y seguros; el interés se redondea y el residuo va al seguro.
3. El **capital** es la cuota nivelada menos el cargo.
4. La **última cuota** liquida el saldo restante y por eso puede quedar un poco mayor o menor que las demás (`[ALG.LAST]`).

Otros hallazgos de calendario:

- El interés es **mensual 30/360**: no cambia por pagar unos días antes o después.
- Un pago hecho al inicio del mes se aplica a la cuota de ese mes.
- La plantilla FHA vence el **último día del mes** (`END_OF_MONTH`); también se admite un día fijo, que se ajusta en meses
  cortos (`[ALG.DATES]`).

## 4. Redondeo por banco

- El perfil `FHA_GT_V1` reprodujo **al centavo** todas las filas de una tabla de amortización bancaria real, incluidos los
  totales.
- Distintos bancos pueden redondear de forma ligeramente distinta: sobre el mismo algoritmo, los saldos pueden diferir en
  pocos centavos.
- **Consecuencias de diseño:**
  - perfiles de redondeo por banco (`FHA_GT_V1`, `SIMPLE`);
  - cada saldo real registrado **re-ancla** el camino real, así que las diferencias de redondeo no se acumulan;
  - un semáforo compara lo modelado con un saldo real al dar de alta el préstamo (`[ALG.VALIDATE]`);
  - el asistente de calibración completo queda para la fase 2.

## 5. Tasas variables

- Los anuncios de productos FHA, como el de 2.1, usan **tasa variable**: el contrato fija una tasa inicial y permite
  revisarla.
- La referencia del mercado es la **tasa líder de política monetaria** del Banco de Guatemala. Se revisó su historial
  reciente; está en **3.50 % desde el 18 de febrero de 2026**. La transmisión a las tasas de préstamos es **lenta**: un
  cambio de la tasa líder no se refleja de inmediato ni en la misma magnitud.
- El FHA publica una **tasa de referencia ponderada** de los préstamos que asegura.
- **No hay regulación pública** que diga si, tras un cambio de tasa, el banco debe mantener el plazo o la cuota. Por eso
  `RateChange` tiene tres políticas: recalcular la cuota manteniendo el plazo (por defecto), mantener la cuota y ajustar
  el plazo, o usar la cuota que informe el banco (`[ALG.RATE]`).
- La **Ley de Interés Preferencial** subsidia tasas por tramos; **no se modela en v1**.

**Diseño resultante:** la tasa no es un campo fijo del préstamo sino un **historial con fechas de vigencia**. El préstamo
guarda además el **tipo de tasa** (`rateType`: `FIXED` o `VARIABLE`), un dato informativo del contrato: el motor solo usa
la tasa original y los eventos `RateChange`, y con `FIXED` la app muestra una advertencia si se registra un cambio de tasa.

## 6. Abonos a capital

Prácticas observadas, en términos generales:

- Es práctica común que el deudor pueda **abonar en cualquier momento** y pedir que se **reduzca la cuota o el plazo**.
- Algunos productos hipotecarios cobran una **comisión por abono**.
- El abono se aplica **justo después de pagar su cuota**, así que reduce el interés desde la cuota siguiente. En el
  modelo, su cuota es la primera con vencimiento igual o posterior a la fecha del abono (`[ALG.EVENTS.ANCHOR]`): con día
  de pago 15, un abono del día 20 queda en la cuota del 15 del mes siguiente.

**Diseño resultante:**

- `Prepayment` con modo `REDUCE_TERM` o `REDUCE_INSTALLMENT` y comisión opcional `FLAT` o `PERCENT` (`[ALG.PREPAY]`);
- `AdvanceInstallments` (adelantar N cuotas), que es como suelen pensarlo los deudores (`[ALG.ADVANCE]`);
- búsqueda por meta: cuánto abonar para terminar antes de una fecha o bajar la cuota a un monto (`[ALG.GOAL]`);
- los abonos recurrentes quedan para la fase 2.

## 7. Cómo informan los bancos

Lo que entrega cada banco varía, así que la app no depende de una fuente en particular:

| Fuente | Qué trae | Cómo se usa en la app |
|---|---|---|
| Correo mensual (algunos bancos) | Saldo, cuota, fecha y a veces la tasa | `ReportedBalance` (ancla) y, si cambia la tasa, `RateChange` |
| Banca virtual (según el banco) | Desglose de cada pago: capital, interés, seguros y cargos | `ActualPayment` con desglose, para la columna Real Δ |
| Tabla de amortización oficial | Calendario completo al desembolso | Validación del algoritmo (en privado) |
| Contrato | Monto, plazo, tasa inicial, tipo de tasa, día de pago, condiciones de abono | Asistente de alta |

Hallazgos que cambiaron el diseño:

- El saldo de los correos es el **saldo antes de pagar la cuota de ese mes**, así que se registra como saldo de apertura
  de esa cuota (`[ALG.ANCHOR]`).
- **No todos los bancos envían correos**, así que leer correos no cubre todos los casos. Se descartó y se optó por registrar a
  mano, con formularios cortos.
- Para préstamos **ya en curso**, el alta pide las condiciones originales y el **saldo real actual como ancla**, en lugar
  de reconstruir todo el historial.

## 8. Ejemplo sintético

Tomado de `[ALG.EXAMPLE]`. Préstamo de **Q 500,000.00** a **240 meses**, interés **7 %**, primas **1 % + 0.26 %**, primera
cuota el 28/02/2025 (fin de mes), cargos fijos IUSI **Q 350.00** y seguro de daños **Q 45.00**:

- Cuota nivelada **Q 4,263.47**; cuota total **Q 4,658.47**.
- Cuota 1: interés Q 2,916.67, seguro Q 525.00, capital Q 821.80.
- Abono de **Q 20,000.00** después de la cuota 12:
  - **reducir plazo:** 220 cuotas e interés + seguro ahorrado de **Q 69,172.80**;
  - **reducir cuota:** nueva cuota nivelada **Q 4,089.36** y ahorro de **Q 19,694.91**.
- Adelantar 6 cuotas después de la cuota 12: abono de **Q 5,446.87** y **234** cuotas.

El ejemplo muestra el hallazgo práctico central: con el mismo abono, reducir plazo ahorra mucho más interés que reducir
cuota.

## 9. Fuera de alcance de v1

- Mora y recargos.
- Subsidio de la Ley de Interés Preferencial.
- Desglose de IVA.
- Interés por los días entre el desembolso y la primera cuota (`disbursementDate` es informativa).
- Abonos recurrentes automáticos.
- Asistente de calibración del perfil de redondeo.

## 10. Preguntas abiertas

- Qué política aplica cada banco ante un cambio de tasa. La app pide al usuario elegirla y usa por defecto mantener el
  plazo.
- Si el banco recalcula la cuota tras un abono de forma automática o solo a solicitud. La app deja elegir el modo en
  cada abono.
- Las reglas exactas de redondeo de los bancos que no coinciden al centavo con `FHA_GT_V1`. Por ahora el ancla absorbe la diferencia; la calibración llega en la
  fase 2.

## Fuentes

- FHA Guatemala: Reglamento del FHA, art. 19, literal b (prima del 1 %), y estados financieros publicados:
  <https://www.fha.gob.gt/>.
- Banco de Guatemala, tasa líder de política monetaria (historial y vigente): <https://www.banguat.gob.gt/>.
- Congreso de la República de Guatemala, *Ley del Impuesto al Valor Agregado*, Decreto 27-92.
- Publicidad de productos FHA y condiciones generales publicadas por bancos guatemaltecos (consultadas el 2026-10-04; no
  se citan por nombre para no identificar al dueño).
