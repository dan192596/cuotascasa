# ADR-0005: Modelo de datos: solo entradas del usuario y campos para sincronizar

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El motor (ADR-0003, ADR-0004) calcula tablas a partir de las condiciones de un préstamo y sus eventos fechados. Los datos viven en IndexedDB (ADR-0006), se respaldan en JSON (ADR-0007) y se combinan con Drive desde varios dispositivos (ADR-0008). Eso exige:

- **Ids globales.** Deben poder crearse sin coordinación entre dispositivos.
- **Resolver conflictos por registro:** saber cuándo y desde qué dispositivo cambió cada uno.
- **Borrados que se propaguen** sin «resucitar» al sincronizar.
- **Un formato sin errores binarios ni de zona horaria**, para montos y fechas.
- **Estabilidad:** mejorar una plantilla no debe alterar préstamos existentes.

## Decisión

1. **Se guardan solo las entradas del usuario.** Las tablas, los caminos, las métricas y los subtotales se calculan bajo demanda y **nunca se persisten**.
2. **Registro base** común a todas las entidades: `id` (UUID de `crypto.randomUUID()`), `createdAt`, `updatedAt`, `updatedByDevice` y `deletedAt` (nulo o fecha).
   - `updatedAt` es monótono por dispositivo: aunque el reloj se repita o retroceda, nunca baja.
   - Un borrado es una **marca de borrado** (`deletedAt`), no un borrado físico. Las marcas se purgan según la regla de purga de ADR-0008, decisión 4, que es la única fórmula; ADR-0024 la cita.
3. **Entidades:**
   - **`Loan`:** `name` (nombre libre; rótulo «Alias» en la UI), `bank` (texto libre, sin lista de bancos precargada en el código, ADR-0015; rótulo «Banco»), condiciones originales (`[ALG.TERMS]`, con `interestRate` como tasa original del contrato; los cambios posteriores son `RateChange`) y estado `active`, `paid` o `archived`. Guarda `templateRef = {id, version}` junto a una **copia** de los valores de la plantilla. La `currency` (`GTQ` o `USD`) se puede corregir mientras el préstamo no tenga registros hijos sin borrar (`LoanEvent`, `ReportedBalance`, `ActualPayment` o `Scenario`). Desde el primero es **inmutable**, y un intento de cambiarla devuelve un error tipado. Un préstamo creado con ancla nace con un `ReportedBalance`, así que su moneda es inmutable desde la creación. Además registra el **tipo de tasa** `rateType` (`FIXED` o `VARIABLE`), un dato informativo del contrato: el motor no lo usa, porque la tasa sale de `interestRate` y de los eventos `RateChange`; con `FIXED`, registrar un `RateChange` muestra una advertencia pero no lo impide.
   - **`LoanEvent`:** eventos reales de cuatro tipos: `RateChange` con su política, `FixedChargeChange`, `Prepayment` con modo y comisión, y `AdvanceInstallments`, con `date` y `note` opcional. `FixedChargeChange` lleva la lista **completa** de cargos vigentes desde su cuota `k`: todos los anteriores dejan de regir, incluidos los de fecha futura (`[ALG.FIXEDCHANGE]`).
   - **`ReportedBalance`:** saldo informado por el banco, antes de pagar su cuota `k`. Es el ancla del camino real. Lleva `date`, y `installmentNumber` es **opcional**: sin él, la cuota es la primera con vencimiento `≥ date` (`[ALG.EVENTS.ANCHOR]`). `totalInstallment` y `reportedRate` son opcionales e **informativos**: el motor no los usa, y un cambio de tasa se registra como `RateChange`. Admite `note` opcional.
   - **`ActualPayment`:** pago efectuado, con `paidDate`, desglose opcional y `note` opcional. `installmentNumber` es **obligatorio** en el esquema; la UI lo sugiere a partir de `paidDate` y el usuario lo puede cambiar (`[ALG.EVENTS.ANCHOR]`).
   - **Cuota explícita:** cuando un registro trae `installmentNumber`, el dominio valida `1 ≤ k ≤` plazo vigente (`[ALG.TERM]`) y, si no se cumple, devuelve un error de validación tipado. El orden dentro de una cuota lo fija `[ALG.EVENTS.ORDER]`.
   - **`Scenario`:** nombre y eventos hipotéticos de un préstamo. Cada evento debe caer en una cuota posterior al corte `[ALG.PATHS.CUTOFF]` de `docs/algorithm.md`; si no, el dominio devuelve un error de validación tipado. Hay un escenario activo por préstamo.
   - **`Settings`:** separada en campos **sincronizados** y campos **locales del dispositivo**. Los locales nunca se combinan.
4. **Tipos de valores:**
   - Montos y tasas: strings decimales (`"500000.00"`, `"0.07"`).
   - Fechas: `AAAA-MM-DD`.
   - Marcas de tiempo (`createdAt`, `updatedAt`, `deletedAt`): instantes comparables entre dispositivos; su formato exacto lo fija el esquema de W0-04.
5. **Plantillas en código** (`fha-gt@1`, `simple@1`). El préstamo conserva su copia, así que publicar `fha-gt@2` no cambia préstamos existentes.
6. **Sin datos de identidad.** El modelo no pide número de préstamo, número de cuenta, nombre del titular ni documentos: no hacen falta para calcular.
7. Los esquemas zod de `packages/schema` (W0-04) son la definición ejecutable de este modelo y quedan congelados después de W0.

## Alternativas consideradas

- **Persistir las tablas calculadas.** Duplica datos, queda desactualizado al corregir el motor y agranda la copia sincronizada.
- **Log de eventos inmutable (*event sourcing* completo).** La línea de tiempo sí usa eventos, pero cada uno es un registro editable. Un log inmutable complicaría corregir errores de captura y la sincronización, sin beneficio claro para un usuario.
- **`number` y `Date`.** Error binario y desfase de un día en UTC-6 (ADR-0003).
- **Borrado físico.** El registro reaparecería desde otro dispositivo.
- **Referenciar la plantilla sin copiarla.** Un cambio de plantilla alteraría en silencio préstamos existentes.
- **Derivar «fija o variable» de la presencia de eventos `RateChange`.** No distingue un préstamo de tasa fija de uno variable que todavía no ha cambiado, y el dueño pidió registrar el tipo de tasa.

## Consecuencias

**Positivas**
- Una sola fuente de verdad, sin datos derivados que mantener; una corrección del motor se refleja de inmediato.
- Respaldos pequeños y sincronización por registro bien definida.
- Las monedas nunca se mezclan: los totales del dashboard se agrupan por moneda.

**Negativas**
- Corregir el algoritmo puede cambiar proyecciones que el usuario ya vio. Los saldos reales re-anclados limitan el efecto en el camino real.
- Las marcas de borrado ocupan espacio hasta la purga.

**Riesgos**
- **Reloj desajustado** entre dispositivos. Mitigación: sellado monótono, desempate determinista por `updatedByDevice` y la copia previa en Drive (ADR-0008, ADR-0024).
- **Resurrección:** un dispositivo que no sincronizó en más de 90 días puede revivir registros ya purgados. Riesgo residual documentado en ADR-0024.

## Verificación

- Cada esquema zod parsea su ejemplo sintético y rechaza un monto `number` y una fecha `Date` (W0-04). El esquema de `Loan` exige `rateType` con valor `FIXED` o `VARIABLE`. El de `ActualPayment` rechaza un registro sin `installmentNumber`, y el de `ReportedBalance` acepta uno sin él.
- Un `installmentNumber` fuera de `1 … plazo vigente` devuelve un error de validación tipado (W2-05). Un `FixedChargeChange` deja sin efecto los cargos anteriores, también los de fecha futura (W2-03).
- El paso 2 del asistente captura `rateType` (W4-07), y el formulario de cambio de tasa advierte cuando el préstamo es `FIXED` (W4-12).
- Toda entidad arbitraria de fast-check pasa su esquema (W1-03).
- `updatedAt` crece estrictamente por dispositivo aunque el reloj inyectado se repita o retroceda (W1-04).
- Cambiar la moneda de un préstamo con registros hijos devuelve un error tipado; sin hijos, el cambio se guarda (W3-11).
- Un evento hipotético con cuota `k ≤ cutoffK` devuelve el error tipado de `[ALG.PATHS.CUTOFF]` (W2-05).
- La combinación respeta las marcas de borrado y nunca toca los campos locales de `Settings` (W1-06). La purga cumple la regla de ADR-0008 en sus bordes (W1-06, W2-08).

## Referencias

- ADR-0003, ADR-0004, ADR-0006, ADR-0007, ADR-0008, ADR-0024.
- `docs/glossary.md`, `docs/algorithm.md` (`[ALG.TERMS]`, `[ALG.TERM]`, `[ALG.EVENTS]`, `[ALG.EVENTS.ANCHOR]`, `[ALG.EVENTS.ORDER]`, `[ALG.FIXEDCHANGE]`, `[ALG.PATHS.CUTOFF]`, `[ALG.TEMPLATES]`).
- Tarjetas W0-04, W1-03 y W1-06.
