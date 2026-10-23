# ADR-0026: Identidad «Mercado»: paleta, tipografía, forma y movimiento

Estado: Aceptado

Fecha: 2026-10-22

Decisores: dueño del proyecto + Claude (Opus)

Enmienda a: ADR-0012, decisiones 1, 2, 4 y 8.

## Contexto

Al dueño la landing le parece poco llamativa para quien llega por primera vez, y quiere que todo el producto se vea moderno. Tomó como referencia la composición, las transiciones y el movimiento de los sitios de la galería de GSAP, no sus colores. Tras comparar cuatro direcciones, siete paletas y cinco composiciones, eligió la identidad «Mercado», descrita en `docs/specs/2026-10-22-identidad-mercado-design.md` y en el prototipo `docs/specs/mercado/prototipo-landing.html`.

Lo que hace confiable a CuotasCasa no cambia: los cálculos, los datos, la privacidad, la accesibilidad (WCAG 2.2 AA), la CSP (ADR-0021) y los presupuestos de bundle (ADR-0025).

## Decisión

### 1. Paleta

1. La paleta «Mercado» reemplaza a «tinta sobre papel»: blanco, negro, fucsia, turquesa y amarillo de los textiles guatemaltecos, como bloques planos, con versión clara y oscura. La versión congelada, con valores y contraste, es `docs/specs/design-palette.md`, aprobada por el dueño el 2026-10-22.
2. Se agregan seis tokens temáticos: `--cc-color-saving` (turquesa), `--cc-color-highlight` (amarillo), `--cc-color-on-color` (texto sobre turquesa y amarillo), `--cc-color-soft` (agua), `--cc-color-block` (bloque negro) y `--cc-color-on-block` (texto sobre el bloque). Los tokens existentes conservan su nombre y cambian de valor según su rol: papel = fondo y `--cc-color-accent` = fucsia.
3. Se agregan tokens compartidos de forma y movimiento: `--cc-radius-block` (18 px), `--cc-radius-pill`, `--cc-ease-out` (`cubic-bezier(0.2, 0.9, 0.1, 1)`) y `--cc-duration-fast`, `--cc-duration-base` y `--cc-duration-slow` (180, 320 y 560 ms).
4. En oscuro, los bloques negros pasan a una superficie elevada (`--cc-color-block`) con un borde de 1 px en `--cc-color-rule`, para que no desaparezcan sobre el fondo.
5. Los valores solo se ajustan en luminosidad y saturación dentro del mismo tono. Si un par no llega a AA ni así, se escala al dueño.

### 2. Semántica de color (enmienda la decisión 4 de ADR-0012)

- **Fucsia = ya es tuyo y acción principal.** El capital pagado (medidor de la casa, cuadro de cuotas, barras de capital), el botón primario y los enlaces destacados. Reemplaza «verde = ya es tuyo».
- **Turquesa = lo que te ahorras** con un abono o un escenario (cuotas eliminadas, intereses ahorrados). Antes iba en tinta.
- **Verde, ámbar y rojo, solo semáforo y errores.** Verde = «coincide» con el banco; ámbar = diferencia pequeña; rojo = diferencia grande y errores.
- El texto sobre fucsia va en papel; sobre turquesa y amarillo, en `--cc-color-on-color` (negro); sobre el bloque negro, en `--cc-color-on-block`.
- El color nunca es la única señal (regla vigente).

### 3. Tipografía y forma (enmienda las decisiones 1 y 8 de ADR-0012)

- **Bricolage Grotesque** para todo el texto: titulares en peso 800 con interletrado negativo y `text-wrap: balance`, texto corrido en 400 y rótulos en 600. **JetBrains Mono** sigue en cifras y tablas, con `tabular-nums`.
- **Source Serif 4 sale del producto** y su paquete se retira del catálogo.
- Las fuentes siguen autoalojadas, en subconjunto latino y solo woff2. Bricolage se sirve desde `@fontsource-variable/bricolage-grotesque` (un archivo variable para los pesos 400 a 800), fijado en el catálogo de pnpm; el dueño aprobó la dependencia el 2026-10-22. Las reglas que hablan de `@fontsource/*` aplican igual a `@fontsource-variable/*`: solo hojas de estilo bajo `apps/web/src/styles/`.
- **Bloques:** esquinas de 18 px en tarjetas y bloques, botones en píldora, color plano sin degradados y un separador de 8 px entre bloques. El patrón de rombos es un detalle ocasional, nunca detrás de texto.
- Angular Material y Tailwind siguen (ADR-0012, decisión 7), remapeados a los tokens: `primary` = fucsia y `tertiary` = turquesa.

### 4. Landing (enmienda la decisión 2 de ADR-0012)

El hero de `/` deja de ser la casa y pasa a ser el **mosaico de bloques** del prototipo, con el titular «Calcula tus cuotas, *mes a mes*.», seguido del cuadro de 240 cuotas con su control deslizante, las tarjetas que se apilan, los contadores del ejemplo, el simulador rápido y el pie. El medidor de la casa sigue en el panel de `/app`. Las cifras del ejemplo las calcula `@cuotascasa/domain` al compilar, de modo que aparecen en el HTML prerenderizado y el motor no entra en el bundle de la landing.

### 5. Movimiento

1. **Sin librerías de animación.** Se usa CSS (transiciones, `@keyframes`, `animation-timeline`), la View Transitions API del router de Angular y JavaScript propio pequeño.
2. **Reducir movimiento.** Con `prefers-reduced-motion: reduce`, todo movimiento decorativo se apaga, incluido el que maneja JavaScript, y cada elemento aparece en su estado final. Las transiciones entre pantallas se vuelven un corte directo.
3. **La página está completa en reposo.** Ningún texto ni cifra espera a una animación, a un `IntersectionObserver` o a la hidratación. Los contadores animan caracteres de una cadena ya formateada; nunca interpolan montos.
4. **Ninguna animación retrasa una acción:** si el usuario hace clic o escribe antes de que termine, la app responde igual. Excepción acotada, la transición entre pantallas: mientras corre, el navegador recibe los toques sobre la captura de la vista y no sobre la página. Por eso el deslizamiento de la raíz dura `--cc-duration-fast` (180 ms, fuera del rango del punto 5 a propósito; la tarjeta que se transforma en el encabezado conserva el morph del navegador) y un `pointerdown` durante la transición la salta al instante. **Residuo aceptado:** una pulsación dentro de esa ventana corta termina la transición en vez de activar lo que había debajo; la siguiente ya llega a su destino. Teclado y lectores de pantalla no se ven afectados.
5. **Tiempos:** microinteracciones de 150 a 300 ms; entradas y transiciones de pantalla de 300 a 600 ms; nada pasa de 1 s. Una sola curva, `--cc-ease-out`.
6. **En `/app`:** transiciones entre pantallas (con la tarjeta de un préstamo que se transforma en el encabezado de su detalle), entradas escalonadas en el panel, medidor que se llena de fucsia la primera vez, destello de la fila del mes actual y de las celdas que cambian, líneas de la gráfica que se dibujan, marca animada al guardar y respuesta de botones al pasar y al presionar. La tabla de amortización no anima filas.
7. **Solo en la landing:** cursor propio (nunca en pantallas táctiles), títulos que se descifran, tarjetas apiladas y botón que sigue al cursor. En la app distraerían.

## Alternativas consideradas

- **Mantener «tinta sobre papel» y solo agregar movimiento.** No resuelve que la landing se vea poco llamativa.
- **GSAP u otra librería de animación.** Suma peso a una landing que ya está cerca de su presupuesto y no hace falta para los efectos elegidos.
- **Bricolage en archivos estáticos por peso.** Tres archivos en vez de uno; el variable cubre 400 a 800 en una sola descarga.
- **Conservar Source Serif 4 para los titulares.** Choca con la composición de bloques que eligió el dueño.

## Consecuencias

**Positivas**
- Identidad llamativa y coherente entre la landing y la app, con modo oscuro de primera clase.
- Una familia menos para el texto: el build pasa de cuatro a tres archivos woff2.

**Negativas**
- El significado de `--cc-color-accent`, `--cc-color-positive` y `--cc-color-positive-fill` cambia sin cambiar su nombre. Los componentes que los usan con el significado anterior (medidor, aviso, chip de estado, línea de tiempo y landing) se migran en W8-03 a W8-06.
- El turquesa no sirve para texto normal sobre fondo claro: solo para bloques, rellenos, bordes y titulares muy grandes.

**Riesgos**
- El fucsia como texto queda cerca del mínimo sobre mes-actual (unos 4.6:1). Mitigación: la matriz de `tokens.spec.ts` y `design-palette-doc.spec.ts` lo prueba en cada `pnpm test`.
- El movimiento puede romper la accesibilidad o los presupuestos. Mitigación: pruebas e2e con movimiento reducido y sin JavaScript, axe en claro y en oscuro, y `bundle:check`.

## Verificación

- **W8-01:** `tokens.spec.ts` y `design-palette-doc.spec.ts` prueban la matriz WCAG en ambos temas; `tokens.contract.spec.ts` prueba los nombres; `fonts.dist.spec.ts` exige un woff2 de Bricolage, dos de JetBrains Mono y ninguno de Source Serif 4.
- **W8-02 a W8-07:** pruebas e2e de movimiento reducido, de JavaScript apagado, de pantallas táctiles y de navegación rápida durante una transición.
- **W8-08:** barrido axe de todas las pantallas en claro y en oscuro, y `bundle:check` en verde.

## Referencias

- ADR-0012 (sistema de diseño), ADR-0021 (CSP), ADR-0025 (presupuestos de bundle).
- `docs/specs/2026-10-22-identidad-mercado-design.md`, `docs/specs/mercado/prototipo-landing.html`, `docs/specs/design-palette.md`.
- `docs/plan/implementation/w8/README.md` (tarjetas W8-01 a W8-08).
