# Bitácora de validación del oráculo

Registro de las compuertas del oráculo (`docs/plan/README.md`, sección 6; ADR-0014 y ADR-0015). Cada gate deja una línea.

**Reglas de esta bitácora.** Nunca registra montos, tasas, fechas de préstamos, plazos ni el total de filas de ningún préstamo. Si la validación privada está autorizada, cada corrida se anota solo con la línea que imprime `--log-line` (`tools/oracle/FORMAT.md`, sección 8.4). Si no lo está, el gate anota `validación privada: no autorizada` y el riesgo residual.

## Autorizaciones del dueño

Ninguna. A la fecha de W2-01 (2026-10-09) el dueño no autorizó la carpeta privada ni la validación privada, así que no existe `~/.cuotascasa-private/` y no se corrió ninguna comparación privada.

## Registro

2026-10-09 · W2-01 · oráculo eed3bb7 · validación privada: no autorizada

## Riesgo residual

- **Qué queda sin cubrir:** un error común al motor TypeScript y al oráculo Python que los ejemplos sintéticos no cubran. Los dos se escriben desde `docs/algorithm.md`; si ambos leen igual de mal una regla `[ALG.*]` y ningún ejemplo la ejercita, los fixtures y el motor coinciden entre sí y el error pasa la compuerta.
- **Contra qué se validó W2-01:** solo contra los ejemplos sintéticos de `docs/algorithm.md` y `docs/specs/algorithm-examples/`, que las pruebas del oráculo (W1-02) reproducen. El perfil `core` (`tools/oracle/fixtures/`, semilla y conteo en `manifest.json`) sale de ese mismo oráculo, sin ninguna otra fuente de datos.
- **Seguimiento:** W3-01 y W4-01 repiten esta línea mientras no haya autorización; desde W3-01 el riesgo se anota también en `docs/specs/conformance-triage.md`, y W7-01 lo repite en el checklist del release.
