# Paleta «Mercado» (blanco, negro, fucsia, turquesa y amarillo)

**Aprobada por el dueño:** 2026-10-22

- **Estado:** congelada. Reemplaza la paleta «tinta sobre papel» (aprobada el 2026-10-06). Cambiarla exige actualizar ADR-0026 en una tarjeta de Opus.
- **Origen:** `docs/specs/2026-10-22-identidad-mercado-design.md` (sección 4) y el prototipo `docs/specs/mercado/prototipo-landing.html`. W8-01 ajustó la luminosidad de tres valores, sin cambiar el tono, para cumplir la matriz de contraste (ver «Ajustes de W8-01»).
- **Quién la usa:** `apps/web/src/styles/tokens.css` declara estos valores como `light-dark(<claro>, <oscuro>)`, con los nombres congelados en `apps/web/src/design-contract/token-names.json`. `tokens.spec.ts` repite la prueba de contraste sobre los tokens.

## Roles, tokens y valores

| Rol | Token | Uso | Claro | Oscuro |
|---|---|---|---|---|
| papel | `--cc-color-paper` | Fondo de página y texto sobre fucsia | `#FFFFFF` | `#141414` |
| superficie | `--cc-color-surface` | Tarjetas, diálogos y encabezado fijo de la tabla | `#FFFFFF` | `#1E1E1E` |
| banda | `--cc-color-band` | Renglones alternos de la tabla y filas de subtotal | `#F5F5F3` | `#1A1A1A` |
| mes-actual | `--cc-color-current-month` | Fondo de la fila del mes en curso | `#FFF4D1` | `#3A3116` |
| renglón | `--cc-color-rule` | Líneas decorativas y borde de los bloques negros en oscuro | `#E6E6E6` | `#2E2E2E` |
| borde-control | `--cc-color-control-border` | Bordes de campos, contorno del medidor y foco | `#767676` | `#8C8C8C` |
| tinta | `--cc-color-ink` | Texto principal y cifras | `#151515` | `#F5F5F5` |
| tinta-2 | `--cc-color-ink-muted` | Texto secundario, rótulos y ayudas | `#4A4A4A` | `#B5B5B5` |
| fucsia | `--cc-color-accent` | Acción principal, enlaces destacados y «ya es tuyo» (capital pagado) | `#CF236B` | `#FF649D` |
| verde | `--cc-color-positive` | Semáforo «coincide» (texto e ícono) | `#2D6A3E` | `#82C796` |
| verde-relleno | `--cc-color-positive-fill` | Semáforo «coincide» (gráfico) | `#4E8B5F` | `#5FA874` |
| ámbar | `--cc-color-warning` | Diferencias pequeñas (texto e ícono) | `#875A00` | `#E6B85C` |
| rojo | `--cc-color-danger` | Diferencias grandes y errores (texto e ícono) | `#A12830` | `#F28C8C` |
| turquesa | `--cc-color-saving` | Lo que te ahorras con un abono o un escenario; interruptores activos | `#009999` | `#2ED3D3` |
| amarillo | `--cc-color-highlight` | Resaltado, control deslizante y bloques | `#FFC736` | `#FFC736` |
| sobre-color | `--cc-color-on-color` | Texto sobre turquesa y sobre amarillo | `#151515` | `#151515` |
| agua | `--cc-color-soft` | Superficies suaves: tablero del cuadro de cuotas y bandas de la landing | `#E0F6F6` | `#0F2A2A` |
| bloque | `--cc-color-block` | Bloque negro (en oscuro, superficie elevada con borde de renglón) | `#151515` | `#262626` |
| sobre-bloque | `--cc-color-on-block` | Texto sobre el bloque negro | `#FFFFFF` | `#F5F5F5` |

`--cc-color-positive-fill` es un token de reserva: su nombre está congelado en el contrato y ningún componente lo usa después de W8.

## Contraste verificado (WCAG 2.2)

Lo recalculan `apps/web/src/testing/doc-checks/design-palette-doc.spec.ts` sobre esta tabla y `apps/web/src/styles/tokens.spec.ts` sobre `tokens.css`, en cada `pnpm test`.

| Pares | Mínimo | Peor caso en claro | Peor caso en oscuro |
|---|---|---|---|
| tinta, tinta-2, fucsia, verde, ámbar y rojo como texto sobre papel, superficie, banda y mes-actual | 4.5:1 | 4.66:1 (fucsia sobre mes-actual) | 4.64:1 (fucsia sobre mes-actual) |
| borde-control y verde-relleno sobre papel, superficie, banda y mes-actual | 3:1 | 3.69:1 (verde-relleno sobre mes-actual) | 3.83:1 (borde-control sobre mes-actual) |
| fucsia y turquesa como gráfico sobre papel, superficie, banda y agua | 3:1 | 3.11:1 (turquesa sobre agua) | 5.46:1 (fucsia sobre agua) |
| papel sobre fucsia (botón primario y selección) | 4.5:1 | 5.11:1 | 6.63:1 |
| sobre-color sobre turquesa y sobre amarillo | 4.5:1 | 5.23:1 (sobre turquesa) | 9.89:1 (sobre turquesa) |
| sobre-bloque sobre bloque | 4.5:1 | 18.26:1 | 13.88:1 |
| fucsia y tinta-2 como texto sobre agua | 4.5:1 | 4.55:1 (fucsia sobre agua) | 5.46:1 (fucsia sobre agua) |
| amarillo como texto sobre bloque | 4.5:1 | 11.72:1 | 9.71:1 |

El renglón es decorativo (1.25:1 sobre papel en claro y 1.36:1 en oscuro). En oscuro, el bloque negro se separa del fondo por su borde de renglón, no por el color (1.22:1).

### Ajustes de W8-01

Los valores de partida del spec no pasaban la matriz en tres casos. Se movió solo la luminosidad (HSL), con el mismo tono:

| Token | Tema | Spec → final | Motivo |
|---|---|---|---|
| `--cc-color-accent` | claro | `#D6246E` → `#CF236B` | Como texto daba 4.41:1 sobre mes-actual y 4.44:1 sobre banda |
| `--cc-color-accent` | oscuro | `#FF5C98` → `#FF649D` | Como texto daba 4.44:1 sobre mes-actual |
| `--cc-color-saving` | claro | `#00A6A6` → `#009999` | Como gráfico daba 2.67:1 sobre agua, 2.75:1 sobre banda y 2.998:1 (por debajo de 3:1, sin redondear) sobre papel |

## Reglas de uso

- El color nunca es la única señal: el semáforo lleva texto («Coincide», «Diferencia pequeña», «Diferencia grande») e ícono (●, ▲, ■), y el ahorro lleva su rótulo.
- **Fucsia = ya es tuyo y acción principal.** El capital pagado (medidor de la casa, cuadro de cuotas, barras de capital), el botón primario y los enlaces destacados van en fucsia.
- **Turquesa = lo que te ahorras** con un abono o un escenario (cuotas eliminadas, intereses ahorrados). El turquesa no sirve para texto normal sobre fondo claro: solo para bloques, rellenos, bordes o titulares muy grandes.
- **Verde, ámbar y rojo solo para el semáforo y los errores.** Verde = «coincide» con el banco; nunca para capital pagado ni para ahorro. Rojo solo para diferencias grandes y errores; un Real Δ pequeño y negativo va en ámbar.
- El texto sobre fucsia va en papel. El texto sobre turquesa y sobre amarillo va en sobre-color (negro), nunca en blanco (unos 3:1). El texto sobre el bloque negro va en sobre-bloque.
- Ningún texto va sobre verde-relleno: el porcentaje del medidor va fuera de la casa.
- En oscuro, los bloques negros usan bloque con un borde de 1 px en renglón, para que no desaparezcan sobre el fondo.
- Bloques de color plano, sin degradados ni sombras marcadas: las tarjetas se separan con borde, superficie y el separador de 8 px entre bloques.
