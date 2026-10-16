# Bitácora de validación del oráculo

Registro de las compuertas del oráculo (`docs/plan/README.md`, sección 6; ADR-0014 y ADR-0015). Cada gate deja una línea.

**Reglas de esta bitácora.** Nunca registra montos, tasas, fechas de préstamos, plazos ni el total de filas de ningún préstamo. Si la validación privada está autorizada, cada corrida se anota solo con la línea que imprime `--log-line` (`tools/oracle/FORMAT.md`, sección 8.4). Si no lo está, el gate anota `validación privada: no autorizada` y el riesgo residual.

## Autorizaciones del dueño

Ninguna. A la fecha de W2-01 (2026-10-09) el dueño no autorizó la carpeta privada ni la validación privada, así que no existe `~/.cuotascasa-private/` y no se corrió ninguna comparación privada. En W3-01 (2026-10-09) el dueño la volvió a negar en el chat: tampoco se creó la carpeta ni se corrió ninguna comparación privada. En W4-01 (2026-10-16) el dueño la volvió a negar: no se creó la carpeta ni se tocó ningún dato real. Además pidió que **no se le vuelva a preguntar hasta W7**: la próxima consulta es la del checklist del release (W7-01), y la corrida privada del motor previa al merge de W4-02 se registra como no autorizada sin volver a preguntar.

## Registro

2026-10-09 · W2-01 · oráculo eed3bb7 · validación privada: no autorizada
2026-10-09 · W3-01 · oráculo a31fc33 · validación privada: no autorizada
2026-10-16 · W4-01 · oráculo a31fc33 · validación privada: no autorizada

## Riesgo residual

- **Qué queda sin cubrir:** un error común al motor TypeScript y al oráculo Python que los ejemplos sintéticos no cubran. Los dos se escriben desde `docs/algorithm.md`; si ambos leen igual de mal una regla `[ALG.*]` y ningún ejemplo la ejercita, los fixtures y el motor coinciden entre sí y el error pasa la compuerta.
- **Contra qué se validó W2-01:** solo contra los ejemplos sintéticos de `docs/algorithm.md` y `docs/specs/algorithm-examples/`, que las pruebas del oráculo (W1-02) reproducen. El perfil `core` (`tools/oracle/fixtures/`, semilla y conteo en `manifest.json`) sale de ese mismo oráculo, sin ninguna otra fuente de datos.
- **Contra qué se validó W3-01:** igual que W2-01, solo contra los ejemplos sintéticos; el oráculo validado es el del commit `a31fc33` (último cambio de `tools/oracle/cuotascasa_oracle/`). El mismo riesgo queda anotado en `docs/specs/conformance-triage.md`.
- **Contra qué se validó W4-01:** igual que W3-01, solo contra los ejemplos sintéticos. El oráculo sigue en el commit `a31fc33` (W3-04 cerró sin mantenimiento: el triage de W3-01 no tenía ítems del lado del oráculo), así que `GENERATOR_VERSION` sigue en 1 y regenerar `core` y `full` dio los mismos bytes. El riesgo no cambió y queda anotado también en `docs/specs/conformance-triage.md`.
- **Seguimiento:** W3-01 y W4-01 repitieron esta línea; desde W3-01 el riesgo se anota también en `docs/specs/conformance-triage.md`. La corrida privada del motor previa al merge de W4-02 se anota como no autorizada sin volver a preguntar (pedido del dueño en W4-01), y W7-01 repite el riesgo en el checklist del release, que es donde se vuelve a consultar al dueño.
