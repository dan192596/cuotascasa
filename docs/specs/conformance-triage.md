# Triage de conformidad (motor ↔ oráculo)

Lo redacta Opus en los gates del oráculo (W3-01, W4-01). Lo lee también el linaje del oráculo (`docs/plan/README.md`, sección 3), así que cada ítem cita solo la regla `[ALG.*]`, el id del fixture, la fila y el campo, y explica qué dice la regla. **Nunca** incluye código, rutas ni nombres internos del motor, ni los valores que calculó el motor.

## Estado

**W3-01 en curso (wip).** El perfil `full` todavía no está comprometido: la búsqueda de semilla quedó detenida (ver la sección «Pendiente»). Este archivo se completa cuando se fije la semilla.

## Pendiente

- Semilla del perfil `full`: ninguna semilla de 20261009 a 20263009 (2001 probadas) dejó cero coincidencias con la denylist privada. Decisión del dueño pendiente.

## Riesgo residual (validación privada no autorizada)

El dueño no autorizó la validación privada (`docs/specs/oracle-validation-log.md`: `2026-10-09 · W3-01 · oráculo a31fc33 · validación privada: no autorizada`). Queda sin cubrir un error común al motor y al oráculo que los ejemplos sintéticos de `docs/algorithm.md` y `docs/specs/algorithm-examples/` no ejerciten: si ambos linajes leen igual de mal una regla `[ALG.*]`, los fixtures y el motor coinciden entre sí y el error pasa la compuerta. W4-01 repite esta anotación mientras no haya autorización, y W7-01 la lleva al checklist del release.
