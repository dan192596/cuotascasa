# Identidad «Mercado»: nueva paleta, tipografía y movimiento para la landing y la app

- **Fecha:** 2026-10-22
- **Estado:** borrador para aprobación del dueño
- **Reemplaza:** la paleta «tinta sobre papel» (`docs/specs/design-palette.md`, aprobada el 2026-10-06) y las decisiones 1, 4 y 8 de ADR-0012 en lo que toca a color, tipografía y movimiento.
- **Prototipo de referencia:** `docs/specs/mercado/prototipo-landing.html` (la «propuesta 2 · Bloques» con el cuadro de 240 cuotas). Se abre en cualquier navegador. Sus cifras salen de un préstamo inventado y se calculan con `number`, solo para la maqueta.

## 1. Intención

Al dueño la landing actual le parece poco llamativa para quien llega por primera vez, y quiere que todo el producto se vea moderno. Sus referencias son los sitios de la galería de GSAP (gsap.com/showcase). De ellos le interesan la composición, las transiciones y el movimiento, no los colores. Tras comparar cuatro direcciones, siete paletas y cinco composiciones, eligió:

- la **paleta «Mercado»**: blanco, negro, fucsia, turquesa y amarillo de los textiles guatemaltecos, usados como bloques planos, con una **versión oscura** para la landing y para la app;
- la **tipografía Bricolage Grotesque** para textos y títulos, con JetBrains Mono para las cifras;
- la **composición «Bloques»** para la landing, más el **cuadro de 240 cuotas** con su control deslizante;
- llevar a la app el mismo lenguaje: transiciones entre pantallas y movimiento que se sienta actual.

Lo que no cambia es lo que hace confiable a CuotasCasa: los cálculos, los datos, la privacidad y la accesibilidad.

## 2. Metas, no metas y anti-metas

**Metas**

1. La landing reproduce la composición y el movimiento del prototipo, con datos calculados por el motor real.
2. La landing y la app usan Mercado claro y Mercado oscuro, con el selector Sistema · Claro · Oscuro que ya existe (en `/` sigue al sistema, como hoy).
3. Toda la interfaz pasa a Bricolage Grotesque, y las cifras siguen en JetBrains Mono con `tabular-nums`.
4. La app gana transiciones entre pantallas y microinteracciones (sección 6) que la hacen sentir moderna.

**No metas**

- Funciones nuevas, cambios de cálculo, de datos, de sincronización o de exportación.
- Rediseñar los flujos: las pantallas conservan sus pasos, campos y textos, salvo lo que diga este documento.
- 3D, WebGL, video, imágenes fotográficas o una pantalla de carga con contador.

**Anti-metas** (si pasa algo de esto, el trabajo falló aunque «funcione»)

- Que una animación retrase una acción: si el usuario hace clic o escribe antes de que termine, la app responde igual.
- Que algún texto o elemento gráfico quede por debajo de WCAG 2.2 AA, en claro o en oscuro.
- Que la landing haga una petición de red o escriba almacenamiento (R1), o que rompa los presupuestos de bundle de ADR-0025.
- Que la tabla de amortización (hasta 360 filas) se vuelva lenta.
- Que el fucsia o el turquesa se confundan con el semáforo de validación.
- Que se agregue GSAP o cualquier otra librería de animación.

**Textos.** El dueño aprobó el 2026-10-22 los textos del prototipo (tarjetas, «240 cuotas. Muévelas.», rótulos de los contadores y el bloque «Sin cuenta…»), salvo el titular, que cambia a «Calcula tus cuotas, mes a mes.».

## 3. Restricciones

- **Sin librerías de animación.** El movimiento se hace con CSS (transiciones, `@keyframes`, `animation-timeline` donde aplique), la View Transitions API mediante el router de Angular y JavaScript propio pequeño.
- **Reducir movimiento.** Con `prefers-reduced-motion: reduce`, todo movimiento decorativo se apaga y cada elemento aparece en su estado final. Las transiciones entre pantallas se vuelven un corte directo.
- **La página está completa en reposo.** Nada importante espera a una animación o a un `IntersectionObserver` para verse: las animaciones parten de un estado visible o terminan muy rápido, y los contadores muestran su valor final si el script no corre.
- **Presupuestos (ADR-0025).** La landing usa unos 99 de sus 104 kB gzip y tiene vetado en su grafo inicial el dominio, `decimal.js`, `ui/`, `@angular/forms`, zod, schema y todo `@angular/cdk`. `/app` inicial tiene 200 kB. Lo nuevo de la landing que necesite el motor o `ui/` se carga en diferido, como hoy el simulador rápido.
- **CSP y Trusted Types (ADR-0021)** sin cambios: nada de estilos o scripts inyectados desde fuera. Los `style` en línea siguen permitidos (`style-src 'unsafe-inline'`).
- **Dinero:** nunca `number` para cantidades (regla 5 de `CLAUDE.md`). El prototipo usa `number`; la versión real usa el motor y los pipes de `ui/`.
- **Fuentes autoalojadas (ADR-0012, decisión 8).** El dueño aprobó el 2026-10-22 agregar el paquete `@fontsource` de Bricolage Grotesque al catálogo de pnpm. Solo el subconjunto latino y solo woff2, como las fuentes actuales. Si se puede, se usa la versión variable (un archivo para todos los pesos).
- **Nombres de tokens congelados** (`apps/web/src/design-contract/token-names.json`). Se pueden agregar tokens y cambiar valores; renombrar o quitar exige actualizar el contrato y sus pruebas en la misma tarjeta de Opus.

## 4. Paleta Mercado

### 4.1 Base (claro)

| Color | Valor | Uso |
|---|---|---|
| blanco | `#FFFFFF` | Fondo de página |
| negro | `#151515` | Texto principal, cifras, botones oscuros, bloques negros |
| fucsia | `#D6246E` | Acento principal: botón primario, enlaces destacados, **capital pagado** |
| turquesa | `#00A6A6` | Acento secundario: interruptores activos, «lo que te ahorras» con un abono |
| amarillo | `#FFC736` | Resaltado: control deslizante, llamados a la acción secundarios, bloques |
| agua | `#E0F6F6` | Superficies suaves: tablero del cuadro de 240 cuotas, bandas |
| gris | `#4A4A4A` | Texto secundario |

Reglas de contraste ya comprobadas en la investigación: el texto sobre turquesa y sobre amarillo va en **negro**, nunca en blanco (blanco sobre turquesa da unos 3:1). Sobre fucsia, el texto va en blanco (unos 4.9:1). El turquesa sobre blanco no sirve para texto normal; solo para bloques, rellenos, bordes o titulares muy grandes.

### 4.2 Oscuro

El dueño pidió una versión oscura para la landing y la app. Valores de partida, a verificar con la prueba de contraste:

| Color | Claro | Oscuro (inicial) |
|---|---|---|
| fondo | `#FFFFFF` | `#141414` |
| superficie | `#FFFFFF` con borde | `#1E1E1E` |
| agua | `#E0F6F6` | `#0F2A2A` |
| texto | `#151515` | `#F5F5F5` |
| texto secundario | `#4A4A4A` | `#B5B5B5` |
| fucsia | `#D6246E` | `#FF5C98` |
| turquesa | `#00A6A6` | `#2ED3D3` |
| amarillo | `#FFC736` | `#FFC736` |

El constructor puede mover luminosidad y saturación dentro del mismo tono hasta cumplir AA. No puede cambiar el tono. Si un par no llega a AA ni así, se detiene y lo escala.

### 4.3 Colores con significado

- **El semáforo de validación** (coincide, diferencia pequeña, diferencia grande) y los **errores** conservan verde, ámbar y rojo. Hoy son `--cc-color-positive`, `--cc-color-warning` y `--cc-color-danger`. Sus valores pueden ajustarse para convivir con Mercado, pero siguen siendo verde, ámbar y rojo, con texto e ícono como hoy.
- **«Ya es tuyo» pasa a fucsia.** El capital pagado (medidor de la casa, cuadro de 240 cuotas, barras de capital) usa fucsia. Esto reemplaza la regla «verde = ya es tuyo» de ADR-0012, decisión 4. El verde queda solo para «coincide» con el banco.
- **Turquesa = lo que te ahorras** con un abono o un escenario (cuotas eliminadas, intereses ahorrados). Antes iba en tinta.
- El color nunca es la única señal (regla vigente).

### 4.4 Tokens

Se agrega un juego de tokens con nombres de rol, por ejemplo `--cc-color-brand`, `--cc-color-brand-ink` (texto sobre fucsia), `--cc-color-saving`, `--cc-color-highlight` y `--cc-color-soft`. Los tokens existentes cambian de valor según su rol: papel = fondo, acento = fucsia, `positive-fill` deja de usarse en el medidor. Los nombres exactos los decide la tarjeta de Opus que toca el contrato. Todos se declaran con `light-dark()` como hoy, y `docs/specs/design-palette.md` se reescribe con la tabla nueva y su prueba de contraste (`design-palette-doc.spec.ts`).

## 5. Tipografía y forma

- **Bricolage Grotesque** para todo el texto. Titulares en peso 800, con interletrado negativo (alrededor de −0.045em en los grandes) y `text-wrap: balance`. Texto corrido en 400 y rótulos en 600.
- **JetBrains Mono** para cifras, tablas y rótulos técnicos, con `tabular-nums`.
- **Source Serif 4** sale del producto y su paquete se retira del catálogo.
- **Bloques:** esquinas de 18 px en tarjetas y bloques, y botones en píldora. Bloques de color plano sin degradados. El separador de 8 px entre bloques es parte del estilo.
- **Patrón de rombos** (ver el prototipo) como detalle ocasional, nunca detrás de texto.
- **Angular Material y Tailwind** siguen (ADR-0012, decisión 7). Su tema se remapea a los tokens nuevos.

## 6. Movimiento

### 6.1 Landing `/`

Se construye a partir del prototipo. Las secciones, en orden:

1. **Barra superior:** marca, «Cómo funciona», «Privacidad» y «Abrir la app».
2. **Mosaico inicial:** bloque titular «Calcula tus cuotas, *mes a mes*.» (elegido por el dueño, enfocado en el cálculo; «mes a mes» va en fucsia), bloque fucsia con la cuota nivelada del ejemplo, bloque amarillo «Q», bloque de rombos turquesa, bloque negro «Sin cuenta…» y bloque llamado a la acción. Al cargar, los bloques caen y se acomodan escalonados.
3. **Cuadro de 240 cuotas:** 240 cuadros, uno por cuota, con un control deslizante que se arrastra con el mouse o el dedo y se mueve con el teclado (flechas, Shift+flecha por año, Inicio y Fin). A un lado van el saldo, el capital pagado y la fecha, y un interruptor «Sin abono / + Q 50,000 en la cuota 60» que marca en turquesa las cuotas que se ahorran. Al entrar en pantalla, el control corre solo de la cuota 1 a la 60, una vez. El préstamo de ejemplo es el del prototipo (Q 500,000, 240 meses, 7.00 % más los seguros de la plantilla FHA Guatemala v1) y **todas las cifras las calcula el motor** (`@cuotascasa/domain`), al compilar (sección 7).
4. **Tarjetas que se apilan:** «Tu cuota», «Abonos», «Tu banco» y «Tus datos», en fucsia, turquesa, amarillo y negro. Se quedan fijas al hacer scroll y la de abajo se encoge un poco cuando la siguiente la cubre.
5. **Cifras del ejemplo:** cuatro contadores (cuotas, abono, meses menos y ahorro) que suben al entrar en pantalla.
6. **Simulador rápido:** el de hoy (W4-03), con el estilo nuevo. Lo exige R1 / HU-01; el prototipo no lo trae.
7. **Pie** con los textos de hoy.

Además, en computadoras con mouse, un **cursor propio** que crece sobre enlaces, botones y el control (se apaga en pantallas táctiles) y **títulos que se «descifran»** letra por letra al entrar en pantalla.

### 6.2 App `/app`

| Lugar | Movimiento |
|---|---|
| Cambio de pantalla | View Transitions del router de Angular (`withViewTransitions`): las pantallas entran con un deslizamiento corto. La tarjeta de un préstamo en el panel se transforma en el encabezado de su detalle y vuelve a su lugar al regresar (elemento compartido con `view-transition-name` por préstamo). |
| Panel | Las tarjetas entran escalonadas. El medidor de la casa se llena de fucsia la primera vez que aparece. Los totales cuentan desde cero. |
| Asistente de nuevo préstamo | Los pasos avanzan y retroceden con un deslizamiento. |
| Tabla de amortización | Sin animar filas. La fila del mes actual destella una vez al abrir. Al cambiar de escenario, las celdas que cambian destellan en su color. |
| Proyecciones | Las líneas de la gráfica se dibujan al entrar (animación de Chart.js, hoy `animation: false`). El selector de escenarios se desliza como el interruptor del cuadro de 240 cuotas. |
| Guardar y avisos | Al guardar aparece una marca animada. Los avisos entran desde abajo. |
| Botones y controles | Respuesta al pasar y al presionar (escala o desplazamiento corto). |
| Estado vacío del panel | Composición de bloques como el mosaico de la landing. |

**Solo en la landing:** el cursor propio, los títulos que se descifran, las tarjetas que se apilan y el botón que sigue al cursor. En la app distraerían.

**Tiempos.** Las microinteracciones duran entre 150 y 300 ms; las entradas y las transiciones de pantalla, entre 300 y 600 ms; nada pasa de un segundo. Se usa la misma curva de salida en todo el producto (el prototipo usa `cubic-bezier(.2,.9,.1,1)` y variantes).

## 7. Decisiones de Opus tras la revisión del constructor

Estas no las decidió el dueño; las tomó Opus con lo que ya establece el proyecto. El dueño puede cambiarlas al revisar este documento.

1. **Las cifras de ejemplo de la landing se calculan al compilar.** Un paso de build ejecuta `@cuotascasa/domain` sobre el préstamo de ejemplo (sin abono y con el abono) y genera un módulo de datos estáticos: las dos tablas de 240 filas ya formateadas, la cuota, los meses e intereses ahorrados. La landing solo indexa esas tablas. Así las cifras salen del motor, aparecen en el HTML prerenderizado (la página está completa en reposo) y el motor no entra en el bundle de la landing. Una prueba verifica que el módulo coincide con el motor. El simulador rápido sigue cargando el motor en diferido, como hoy.
2. **El abono del interruptor es `REDUCE_TERM`** ([ALG.PREPAY.REDUCE_TERM]): la cuota no cambia y el plazo se acorta, que es lo que cuentan los cuadros turquesa y el contador de meses menos.
3. **Los bloques negros en Mercado oscuro** pasan a una superficie elevada (alrededor de `#262626`) con un borde de 1 px, para que no desaparezcan sobre el fondo `#141414`. Opus muestra una maqueta del oscuro al dueño antes de la primera tarjeta de la landing.
4. **Las pruebas que codifican la identidad anterior** (el hero con la casa, «verde = ya es tuyo» en el medidor, Source Serif en `fonts.dist.spec.ts`, aserciones de color) se actualizan en la misma tarjeta que cambia ese comportamiento. Las congeladas las cambia la tarjeta de Opus del ADR-0026.
5. **La transición de tarjeta a detalle** se usa solo al navegar del panel a un préstamo que está en pantalla, y al volver. En un enlace directo, una recarga o un préstamo que ya no existe, se usa el deslizamiento normal. El encabezado del detalle puede cambiar su maquetación para que la transformación se vea continua: es un cambio de forma, no de flujo.

## 8. Lo que decide el constructor

- Los nombres finales de los tokens nuevos (dentro de la regla de la sección 4.4) y cómo se reparte el trabajo en tarjetas y olas.
- Los ajustes finos de color dentro de cada tono para llegar a AA en oscuro.
- La implementación de cada efecto (CSS, `animation-timeline` o JavaScript), siempre que respete la sección 3 y los presupuestos.
- Cómo se prueba el movimiento (por ejemplo, e2e con movimiento reducido y una prueba de que cada efecto se apaga con él).
- El reparto del contenido de la landing entre el grafo inicial y los chunks diferidos.

## 9. Lo que hay que actualizar

- **ADR nuevo** (ADR-0026, «Identidad Mercado») que enmiende ADR-0012 en las decisiones 1 (tipografía y paleta), 2 (el hero de `/` deja de ser la casa y pasa a ser el mosaico; el medidor de casa sigue en el panel) y 4 (fucsia = ya es tuyo, turquesa = ahorro), y que agregue la política de movimiento de la sección 6.
- `docs/specs/design-palette.md`, `token-names.json`, `tokens.css`, `material-theme.scss` y `fonts.scss`, con sus pruebas.
- `docs/discovery/direccion-visual.md`: una nota que remita a este documento.
- Las pruebas de accesibilidad (axe) en claro y en oscuro, y `bundle:check`, deben seguir en verde.
