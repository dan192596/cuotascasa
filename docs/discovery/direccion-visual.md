# Dirección visual, bocetos y paleta propuesta (fase 2 · UX)

Fecha: 2026-10-04

**Estado:**
- La dirección visual está aprobada (ADR-0012).
- Los bocetos son guía de diseño.
- La paleta es una **propuesta que el dueño todavía no aprueba**: W0-05 se la presenta y, con su aprobación, la congela en `docs/specs/design-palette.md` (sección 3).

> **Regla de datos.** Los números de los bocetos salen del ejemplo sintético de [`../algorithm.md`](../algorithm.md)
> (`[ALG.EXAMPLE]`) o se calculan a partir de él. Si algún valor difiere del algoritmo, manda el algoritmo. Los nombres
> «Préstamo casa» y «Banco A» son genéricos.

**Qué es normativo aquí:**
- La jerarquía, el contenido de cada bloque y las reglas anotadas en los bocetos sirven de guía a las tarjetas de UI. No son especificaciones al píxel.
- El comportamiento lo fijan las historias de usuario ([`historias-de-usuario.md`](historias-de-usuario.md)) y las specs de contrato.
- El orden de precedencia está en ADR-0019 y en [`../plan/README.md`](../plan/README.md).

---

## 1. Direcciones exploradas

| Dirección | Idea | A favor | En contra | Resultado |
|---|---|---|---|---|
| **A · «Libreta bancaria»** | La libreta de ahorro de toda la vida: títulos con serifa, cifras monoespaciadas y tablas rayadas | Las tablas largas se leen bien, las cifras alinean por columna y tiene identidad propia | Puede verse sobria si no hay un punto de color | **Base** |
| **B · «Tu casa se va llenando»** | Una casa que se llena con el porcentaje de capital pagado | Es emotiva, se entiende de un vistazo y luce en un portafolio | Por sí sola no resuelve las tablas densas | **En el dashboard y el hero de la landing** |
| **C · «Excel mejorado»** | Cuadrícula densa con edición directa en celda | Familiar y rápida para probar ideas | Fría y genérica | **Solo la edición en celda**, y solo sobre el escenario activo |

## 2. La elección en una frase

La app se ve como una libreta bancaria (A), con una casa que se llena (B) donde se resume el avance, y con una tabla donde se puede escribir un abono hipotético como en una hoja de cálculo (C).

## 3. Paleta propuesta «tinta sobre papel» (pendiente de aprobación del dueño)

Los nombres de la tabla son **roles**, no los nombres de los tokens. Esos nombres los congela W0-05 en `apps/web/src/design-contract/token-names.json`, y W3-05 asigna los valores.

| Rol | Uso | Claro | Oscuro |
|---|---|---|---|
| papel | Fondo de página | `#FBF8F1` | `#1A1814` |
| superficie | Tarjetas, diálogos y encabezado fijo de la tabla | `#FFFDF8` | `#24211C` |
| banda | Renglones alternos de la tabla y filas de subtotal | `#F3EEE3` | `#201D18` |
| mes-actual | Fondo de la fila del mes en curso | `#FCEFC7` | `#3A3221` |
| renglón | Líneas de la tabla (decorativas) | `#DDD5C4` | `#3B362E` |
| borde-control | Bordes de campos, contorno del medidor y foco | `#8C8270` | `#8A8272` |
| tinta | Texto principal y cifras | `#1E2733` | `#ECE6DA` |
| tinta-2 | Texto secundario, rótulos y ayudas | `#555E6B` | `#ABA496` |
| acento | Enlaces, botón primario y selección | `#1D4E89` | `#8FB6EA` |
| verde | «Ya es tuyo»: capital pagado y semáforo verde (texto) | `#2D6A3E` | `#82C796` |
| verde-relleno | Relleno del medidor de casa | `#4E8B5F` | `#5FA874` |
| ámbar | Diferencias pequeñas (texto e ícono) | `#875A00` | `#E6B85C` |
| rojo | Diferencias grandes y errores (texto e ícono) | `#A12830` | `#F28C8C` |

**Contraste verificado** con la fórmula de luminancia relativa de WCAG 2.2:

| Pares | Mínimo exigido | Peor caso en claro | Peor caso en oscuro |
|---|---|---|---|
| tinta, tinta-2, acento, verde, ámbar y rojo sobre papel, superficie, banda y mes-actual | 4.5:1 | 5.20:1 (ámbar sobre banda) | 5.12:1 (tinta-2 sobre mes-actual) |
| borde-control y verde-relleno sobre papel, superficie y banda | 3:1 | 3.27:1 (borde-control sobre banda) | 4.21:1 (borde-control sobre superficie) |

El renglón es decorativo (1.4:1 sobre papel). La fila y la columna ya se distinguen por la alineación y por la banda, así que no necesita llegar a 3:1. W3-05 repite estas cuentas con su prueba automática de contraste.

**Reglas de uso:**
- El color nunca es la única señal. El semáforo lleva texto («Coincide», «Diferencia pequeña», «Diferencia grande») y un ícono (●, ▲, ■).
- Verde solo para lo que ya es del dueño: capital pagado y coincidencias. Nunca para «ahorro proyectado», que es una hipótesis y va en tinta.
- Rojo solo para diferencias grandes y errores, no para montos negativos que son normales (por ejemplo, un Real Δ pequeño y negativo va en ámbar).
- Sin degradados ni sombras marcadas: el papel es plano y las tarjetas se separan con borde y superficie.

## 4. Bocetos

Los bocetos están a ancho de escritorio (≥ 1280 px). En móvil, los bloques se apilan en una columna y la tabla se desplaza en horizontal con las columnas «#» y «Vence» fijas (ADR-0012).

**Leyenda:** `[ … ]` es un campo editable, `( )` y `(•)` son opciones, `▾` es un selector, `▶` marca la fila del mes actual, `██` es el relleno del medidor de casa y `‾‾` el piso de la casa.

### 4.1 Landing `/`: hero «tu casa se va llenando» y simulador (HU-01, R1; W4-03 y W4-04)

```text
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ CuotasCasa                                                   Privacidad    Abrir la app →  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                            │
│  Tu casa se va llenando,                                                                   │
│  cuota a cuota.                                   ┌────────── Simulador rápido ──────────┐ │
│                                                   │ Plantilla   FHA Guatemala v1         │ │
│         /\                                        │ Monto       Q [ 500,000.00 ]         │ │
│        /  \       Modela tu préstamo FHA,         │ Tasa anual    [ 7.00 ] % + 1.26 %    │ │
│       /    \      prueba abonos a capital         │ Plazo         [ 20 ] años            │ │
│      /      \     y compara con lo que            │ ───────────────────────────────────  │ │
│     |        |    dice tu banco.                  │ Cuota nivelada            Q 4,263.47 │ │
│     |████████|                                    │                                      │ │
│     |████████|    Tus datos se quedan en tu       │ + Probar un abono                    │ │
│      ‾‾‾‾‾‾‾‾     navegador. Sin cuenta.          │   Monto Q [ 20,000.00 ] tras la      │ │
│  capital pagado (ilustrativo)                     │   cuota [ 12 ]                       │ │
│                                                   │   (•) Reducir plazo ( ) Reducir cuota│ │
│  [ Empezar en la app ]                            │ Intereses y seguro ahorrados         │ │
│  Cómo cuidamos tus datos                          │                          Q 69,172.80 │ │
│                                                   │ Meses ahorrados                   20 │ │
│                                                   │ Nuevo fin                 31/05/2043 │ │
│                                                   └──────────────────────────────────────┘ │
│                                                                                            │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Código abierto · Repositorio · Sin analítica ni cookies de rastreo                         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- La casa del hero es un SVG que se llena una vez al cargar. Con `prefers-reduced-motion` aparece llena y sin animación.
- El rótulo dice «capital pagado» para que no se confunda con el valor del inmueble.
- Los resultados del simulador se anuncian en una sola región `aria-live` cortés, con retardo.
- `/` no hace peticiones de red ni escribe almacenamiento (R1).

### 4.2 Dashboard `/app`: tarjeta de préstamo (HU-06, R13; W4-06)

```text
  Mis préstamos                          Mostrar: [ Activos ▾ ]      Drive: sincronizado hace 2 h
  Saldo total en quetzales  Q 489,756.31 · en dólares —              Último respaldo: hace 3 días

  ┌─ Préstamo casa · Banco A ─────────────────────────── Activo ─┐
  │                                                              │
  │       /\         Saldo                   Q 489,756.31        │
  │      /  \        Próxima cuota           Q 4,658.47          │
  │     /    \                               vence 28/02/2026    │
  │    |      |      Fin estimado            31/01/2045          │
  │    |▁▁▁▁▁▁|      Validación              ● Coincide          │
  │     ‾‾‾‾‾‾                                                   │
  │    2.0 % capital pagado                                      │
  │                                                              │
  │    Tabla · Datos reales · Proyecciones                       │
  └──────────────────────────────────────────────────────────────┘
```

- Corresponde al ejemplo sintético después de la cuota 12 y sin abono: saldo `489756.31`; capital pagado `10243.69`, es decir 2.0 % de `500000.00`.
- Los totales van por moneda y nunca se suman quetzales con dólares (R27).
- Sin préstamos, el lugar de las tarjetas lo ocupan las tres acciones de primer uso: crear un préstamo, restaurar un respaldo o conectar Drive.

### 4.3 Tabla libreta `/app/prestamos/:id/tabla` (HU-07 y HU-17, R15; W5-02)

Vista de escenario con un abono hipotético de Q 20,000.00 escrito en la celda de la cuota 12 (reducir plazo). El corte es `cutoffK = 11` (`[ALG.PATHS.CUTOFF]`): el registro real de mayor cuota es un saldo reportado antes de pagar la cuota 11.

```text
 Préstamo casa · Tabla de amortización (montos en Q)
 Vista: ( ) Plan original  ( ) Real  (•) Escenario [ Borrador ▾ ]                    [ Exportar ▾ ]
┌─────┬────────────┬──────────────┬──────────┬────────┬──────────┬────────┬──────────┬──────────────┬───────────┬──────────┐
│  #  │ Vence      │ Saldo inicial│  Interés │ Seguro │  Capital │  Fijos │    Total │  Saldo final │     Abono │   Real Δ │
├─────┼────────────┼──────────────┼──────────┼────────┼──────────┼────────┼──────────┼──────────────┼───────────┼──────────┤
│   1 │ 28/02/2025 │   500,000.00 │ 2,916.67 │ 525.00 │   821.80 │ 395.00 │ 4,658.47 │   499,178.20 │           │          │
│   2 │ 31/03/2025 │   499,178.20 │ 2,911.87 │ 524.14 │   827.46 │ 395.00 │ 4,658.47 │   498,350.74 │           │          │
│   … │            │              │          │        │          │        │          │              │           │          │
│  11 │ 31/12/2025 │   491,522.68 │ 2,867.21 │ 516.10 │   880.16 │ 395.00 │ 4,658.47 │   490,642.52 │           │ 0.00 ●   │
├─────┴────────────┼──────────────┼──────────┼────────┼──────────┼────────┼──────────┼──────────────┼───────────┼──────────┤
│ Subtotal 2025    │              │31,814.14 │5,726.55│ 9,357.48 │4,345.00│51,243.17 │              │      0.00 │          │
├─────┬────────────┼──────────────┼──────────┼────────┼──────────┼────────┼──────────┼──────────────┼───────────┼──────────┤
│  12 │ 31/01/2026 │   490,642.52 │ 2,862.08 │ 515.18 │   886.21 │ 395.00 │ 4,658.47 │   489,756.31 │[20,000.00]│          │
│  13 │ 28/02/2026 │   469,756.31 │ 2,740.25 │ 493.24 │ 1,029.98 │ 395.00 │ 4,658.47 │   468,726.33 │ [       ] │          │
│   … │            │              │          │        │          │        │          │              │           │          │
│▶ 21 │ 31/10/2026 │   (fila del mes actual: fondo mes-actual y marca ▶)                            │ [       ] │          │
│   … │            │              │          │        │          │        │          │              │           │          │
│ 220 │ 31/05/2043 │       355.93 │      …   │    …   │   355.93 │ 395.00 │      …   │         0.00 │           │          │
└─────┴────────────┴──────────────┴──────────┴────────┴──────────┴────────┴──────────┴──────────────┴───────────┴──────────┘
 Escenario «Borrador» frente al camino real: 220 cuotas · fin 31/05/2043 · intereses y seguro ahorrados Q 69,172.80
```

- Los vencimientos siguen `[ALG.DATES]` con `firstDueDate = 2025-02-28` y `END_OF_MONTH`: la cuota `k` vence el último día del mes `2025-02 + (k − 1)`. Así, la cuota 11 vence el 31/12/2025, la 12 el 31/01/2026, la 13 el 28/02/2026, la 21 el 31/10/2026 y la 220 el 31/05/2043; el subtotal 2025 cierra tras la cuota 11.
- Las cifras van alineadas a la derecha, con dígitos tabulares. Por espacio, el boceto omite el símbolo de moneda en las celdas; el formato real lo dan los pipes de `ui/` (W3-06).
- Las filas con `k ≤ cutoffK` (cuotas 1 a 11, `[ALG.PATHS.CUTOFF]`) no se editan. La celda «Abono» solo existe a partir de la cuota 12.
- Escribir un abono crea o cambia un evento del **escenario activo**, nunca de los datos reales. La tabla y el resumen se recalculan al confirmar.
- Real Δ solo aparece en filas con saldo reportado, con el ícono y el texto del semáforo.
- El subtotal anual va después de la última cuota de cada año calendario y suma lo que indica `[ALG.YEARLY]`.
- El encabezado queda fijo al desplazarse. Con el teclado, las flechas mueven la celda activa, Enter edita y Escape cancela.

### 4.4 Asistente `/app/prestamos/nuevo`: pasos 3 y 4 (HU-03, HU-04 y HU-05, R7, R8 y R14; W4-07)

```text
  Nuevo préstamo
  ① Plantilla y banco ── ② Condiciones ── ❸ Cargos fijos ── ④ Ancla y validación

  ┌─ Paso 3 · Cargos fijos ──────────────────────────────────────────────┐
  │ Cuota total que cobra el banco     Q [ 4,658.47 ]                    │
  │ Cuota nivelada (calculada)         Q   4,263.47                      │
  │ ──────────────────────────────────────────────────                   │
  │ Cargos fijos                       Q     395.00                      │
  │   IUSI                             Q [   350.00 ]                    │
  │   Seguro de daños                  Q [    45.00 ]                    │
  │   + Agregar concepto                                                 │
  │                                                                      │
  │ [ ← Atrás ]                                       [ Siguiente → ]    │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─ Paso 4 · Ancla y validación ────────────────────────────────────────┐
  │ Saldo que informa el banco          Q [ 491,522.68 ]                 │
  │ antes de pagar la cuota             [ 11 ▾ ]  (vence 31/12/2025)     │
  │ ──────────────────────────────────────────────────                   │
  │ Saldo modelado                      Q   491,522.68                   │
  │ Diferencia                          Q         0.00   ● Coincide      │
  │                                                                      │
  │ [ ← Atrás ]                                    [ Guardar préstamo ]  │
  └──────────────────────────────────────────────────────────────────────┘
```

- Los cargos fijos se recalculan al instante como cuota total menos cuota nivelada. Un resultado negativo muestra un error que sugiere revisar la tasa o el plazo.
- Con una diferencia en ámbar o rojo, el semáforo muestra la causa sugerida y el botón sigue activo: el dueño puede guardar y el saldo queda como ancla (HU-04). Los textos de cada causa están en la spec (sección 9, «Asistente») y en HU-04.
- Un paso inválido no deja avanzar y muestra los mensajes en español junto a cada campo. Regresar conserva lo escrito.

## 5. Medidor de casa

```text
   0 %           2 %           50 %          100 %
    /\            /\            /\            /\
   /  \          /  \          /  \          /██\
  |    |        |    |        |████|        |████|
  |    |        |▁▁▁▁|        |████|        |████|
   ‾‾‾‾          ‾‾‾‾          ‾‾‾‾          ‾‾‾‾
```

- El relleno sube desde el piso en proporción al capital pagado sobre el principal, con verde-relleno y el contorno en borde-control.
- El rótulo visible y el texto alternativo dicen «N % capital pagado».
- Un préstamo pagado muestra la casa llena y el estado «Pagado».

## Referencias

- ADR-0012 (sistema de diseño), ADR-0013 (exportación coherente con la pantalla) y ADR-0016 (sin fuentes ni recursos externos).
- Spec de diseño, sección 9.
- [`historias-de-usuario.md`](historias-de-usuario.md): HU-01, HU-03 a HU-07 y HU-17.
- Tarjetas W0-05 (paleta y nombres de tokens), W3-05 (valores de los tokens), W3-07 y W3-08 (tabla y medidor), W4-03, W4-04, W4-06, W4-07 y W5-02.
