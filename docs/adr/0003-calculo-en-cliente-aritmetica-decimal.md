# ADR-0003: Cálculo en el cliente con dominio TypeScript puro y aritmética decimal

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El valor central de CuotasCasa es reproducir la tabla del banco **al centavo** y proyectar escenarios sobre ella. Sin backend (ADR-0001), todo cálculo ocurre en el navegador. Hay varias restricciones:

- **Exactitud decimal.** El `number` de JavaScript es binario de punto flotante: `0.1 + 0.2 ≠ 0.3`. En cientos de periodos encadenados (360 en un préstamo a 30 años), esos errores cambian centavos.
- **Fechas sin zona.** Guatemala está en UTC-6. Un `Date` creado a partir de `"2025-02-28"` se interpreta como medianoche UTC y puede mostrarse como el día anterior.
- **Un oráculo independiente.** El motor debe coincidir con un oráculo en Python escrito por otro linaje de agentes (ADR-0014). Ambos lados necesitan el mismo contexto decimal.
- **Reutilización.** El mismo motor sirve al simulador público de la landing, a la app y a la exportación.

## Decisión

1. **`packages/domain` es TypeScript puro.** Funciones puras, sin Angular, sin I/O y sin estado global. La única dependencia es decimal.js. Expone `buildSchedule`, `buildPaths`, `compareSchedules`, `yearlySubtotals`, `goalSeek`, las plantillas, la validación y los helpers de dinero y fechas.
2. **Aritmética decimal con decimal.js.** Contexto de 34 dígitos significativos con redondeo intermedio `ROUND_HALF_EVEN`, igual al módulo `decimal` de Python (`[ALG.CONV]`); se aplica a toda operación que no sea un `HALF_UP_2` explícito. El **único redondeo a centavos** es `HALF_UP_2` (2 decimales, mitad lejos de cero) y solo ocurre donde `docs/algorithm.md` lo escribe. La tasa periódica `r` va sin `HALF_UP_2`: queda en el contexto de 34 dígitos.
3. **Dinero y tasas como strings decimales** en todas las fronteras (JSON, almacenamiento, UI), con tipos marcados (*branded*) `Money` y `Rate`. Nunca `number`.
4. **Fechas como `LocalDate` `AAAA-MM-DD`.** Prohibido usar `Date` dentro del dominio. La aritmética de meses y el último día del mes viven en `dates/`.
5. **Implementado por Opus en W0-03.** `money/` (incluye `decimal-config.ts`) y `dates/` son contratos congelados.
6. **Única conversión a `number`:** el escritor de Excel, con una prueba de ida y vuelta (ADR-0013). El formato de pantalla trabaja sobre strings en los pipes de `ui/`.
7. **Errores de dominio tipados**, con la jerarquía `DomainError`: `CurrencyMismatchError`, `NegativeAmortizationError`, errores de validación tipados, etc. Una meta inviable no es un error: `[ALG.GOAL]` devuelve `INFEASIBLE`.

## Alternativas consideradas

- **`number` con redondeo al final.** Es simple, pero acumula error binario y no garantiza coincidir al centavo con el banco ni con el oráculo.
- **Centavos enteros (`bigint`).** Sirve para montos, pero las tasas, la potencia `(1 + r)^(−m)` y el reparto proporcional del cargo necesitan fracciones. Habría que escribir una aritmética de punto fijo propia, que es justo el código más riesgoso.
- **big.js.** Es más liviano, pero su precisión se configura en decimales y no en dígitos significativos, lo que complica igualar el contexto de Python.
- **Dinero.js.** Está orientado a montos y monedas, no a cálculo financiero con tasas y potencias.
- **Cálculo en servidor o Python en el navegador (WASM).** No hay servidor, y un intérprete en WASM pesa megabytes y complica la CSP.

## Consecuencias

**Positivas**
- Resultados deterministas y reproducibles, verificables contra el oráculo al centavo.
- El motor es fácil de probar (fast-check, ejemplos por regla) y de reutilizar en el simulador público sin cargar Angular de más.
- Las fechas no tienen errores de zona horaria.

**Negativas**
- decimal.js agrega peso al bundle y es más lento que `number`. Para unos cientos de filas por camino es aceptable. La búsqueda por meta hace del orden de 30 iteraciones de bisección sobre un calendario completo, y la fachada del motor memoriza las proyecciones (W3-12).
- Los agentes deben respetar convenciones estrictas, que el linter refuerza.

**Riesgos**
- Que decimal.js y el `decimal` de Python diverjan en el orden de operaciones o en el contexto. Mitigación: el contexto está fijado en `algorithm.md` y `money/` es de Opus. Ambos lados verifican el contexto en sus pruebas.
- Que se cuele un `number` en dinero por accidente. Mitigación: tipos marcados, reglas de lint y conversión confinada al escritor de Excel.

## Verificación

- **Lint (W0-01):**
  - `domain` solo importa decimal.js;
  - prohibidos `Date` y `new Date` en `packages/domain`;
  - prohibidos `parseFloat`, `Number` y `+` unario sobre identificadores de dinero.
- **Ejemplos por regla:** W1-01 reproduce fila por fila los de `docs/specs/algorithm-examples/`, y la cobertura de `domain` es ≥ 95 %.
- **Conformidad:** coincide con el oráculo al centavo en cada fila y resumen (W2-13, W4-02).
- **Invariantes con fast-check (W3-02):**
  - el capital suma el principal;
  - el saldo nunca es negativo ni crece.
- **Exportación:** prueba de ida y vuelta de montos en el escritor de Excel (W4-10).

## Referencias

- `docs/algorithm.md`, `[ALG.CONV]`.
- ADR-0001, ADR-0004, ADR-0013, ADR-0014.
- decimal.js: https://mikemcl.github.io/decimal.js/
