# Paleta base «tinta sobre papel» (libreta bancaria)

**Aprobada por el dueño:** 2026-10-06

- **Estado:** congelada por W0-05. Cambiarla exige actualizar ADR-0012 en una micro-tarjeta de Opus.
- **Origen:** la propuesta de `docs/discovery/direccion-visual.md` (sección 3), aprobada sin cambios.
- **Quién la usa:** W3-05 copia estos valores a `apps/web/src/styles/tokens.css` como `light-dark(<claro>, <oscuro>)`, con los nombres congelados en `apps/web/src/design-contract/token-names.json`, y repite la prueba de contraste sobre los tokens.

## Roles, tokens y valores

| Rol | Token | Uso | Claro | Oscuro |
|---|---|---|---|---|
| papel | `--cc-color-paper` | Fondo de página | `#FBF8F1` | `#1A1814` |
| superficie | `--cc-color-surface` | Tarjetas, diálogos y encabezado fijo de la tabla | `#FFFDF8` | `#24211C` |
| banda | `--cc-color-band` | Renglones alternos de la tabla y filas de subtotal | `#F3EEE3` | `#201D18` |
| mes-actual | `--cc-color-current-month` | Fondo de la fila del mes en curso | `#FCEFC7` | `#3A3221` |
| renglón | `--cc-color-rule` | Líneas de la tabla (decorativas) | `#DDD5C4` | `#3B362E` |
| borde-control | `--cc-color-control-border` | Bordes de campos, contorno del medidor y foco | `#8C8270` | `#8A8272` |
| tinta | `--cc-color-ink` | Texto principal y cifras | `#1E2733` | `#ECE6DA` |
| tinta-2 | `--cc-color-ink-muted` | Texto secundario, rótulos y ayudas | `#555E6B` | `#ABA496` |
| acento | `--cc-color-accent` | Enlaces, botón primario y selección | `#1D4E89` | `#8FB6EA` |
| verde | `--cc-color-positive` | «Ya es tuyo»: capital pagado y semáforo verde (texto) | `#2D6A3E` | `#82C796` |
| verde-relleno | `--cc-color-positive-fill` | Relleno del medidor de casa | `#4E8B5F` | `#5FA874` |
| ámbar | `--cc-color-warning` | Diferencias pequeñas (texto e ícono) | `#875A00` | `#E6B85C` |
| rojo | `--cc-color-danger` | Diferencias grandes y errores (texto e ícono) | `#A12830` | `#F28C8C` |

## Contraste verificado (WCAG 2.2)

Lo recalcula `apps/web/src/testing/doc-checks/design-palette-doc.spec.ts` en cada `pnpm test`.

| Pares | Mínimo | Peor caso en claro | Peor caso en oscuro |
|---|---|---|---|
| tinta, tinta-2, acento, verde, ámbar y rojo sobre papel, superficie, banda y mes-actual | 4.5:1 | 5.20:1 (ámbar sobre banda) | 5.12:1 (tinta-2 sobre mes-actual) |
| borde-control y verde-relleno sobre papel, superficie, banda y mes-actual | 3:1 | 3.27:1 (borde-control sobre banda) | 3.33:1 (borde-control sobre mes-actual) |
| papel sobre acento (texto del botón primario y de la selección) | 4.5:1 | 7.91:1 | 8.48:1 |

El renglón es decorativo (1.4:1 sobre papel): la fila y la columna ya se distinguen por la alineación y la banda.

## Reglas de uso

- El color nunca es la única señal: el semáforo lleva texto («Coincide», «Diferencia pequeña», «Diferencia grande») e ícono (●, ▲, ■).
- Verde solo para lo que ya es del dueño (capital pagado y coincidencias), nunca para «ahorro proyectado», que va en tinta.
- Rojo solo para diferencias grandes y errores; un Real Δ pequeño y negativo va en ámbar.
- Sin degradados ni sombras marcadas: las tarjetas se separan con borde y superficie.
- El texto sobre acento (botón primario, selección) va en papel, nunca en tinta (1.80:1 en claro). Ningún texto va sobre verde-relleno: el porcentaje del medidor va fuera de la casa.
