# ADR-0025: Presupuestos de bundle de la landing y de /app

Estado: Aceptado

Fecha: 2026-10-16

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

`bundle-check` (W2-12) medía un presupuesto gzip solo para la landing, de 90 kB. En main medía 85.8 kB. El simulador rápido (W4-03) usa Signal Forms con `[formField]` y los controles `cc-money-input` y `cc-rate-input`, y lo carga en diferido con `import()`. Aun así, la landing subió a 92.4 kB.

La investigación con el metafile de esbuild mostró la causa. esbuild separa los chunks por archivo y no por función, y Angular core se publica en pocos archivos FESM grandes que comparten todas las entradas. Si cualquier chunk diferido usa una función de core, esa función termina en el chunk de core compartido. `main` importa ese chunk de forma estática. Por eso el límite diferido no aísla ese costo: un formulario de `/app` con `[formField]` produce el mismo crecimiento en la landing (unos 4 kB, con unos 6.5 kB en total sobre main). Ni `@defer`, ni `loadComponent`, ni desactivar el optimizador de chunks lo cambian.

## Decisión

1. El presupuesto de la landing pasa a **95 kB gzip** (97 280 B). El margen absorbe el runtime de formularios que comparten todas las features. Lo propio de la landing debe seguir siendo pequeño y diferido.
2. `/app` inicial (shell y dashboard) tiene presupuesto por primera vez: **240 kB gzip** (245 760 B). Hoy mide unos 216 kB.
3. Si un PR sube la landing más de 1 kB, debe explicarlo en su descripción con el diff del metafile.
4. No se vetan APIs de Angular (`[formField]`, `model()`, `output()`, `@let`) para ahorrar bytes. Contradiría los patrones del sistema de diseño (ADR-0012).

## Alternativas consideradas

- **Simulador sin `[formField]`.** Cabría bajo 90 kB por menos de 0.4 kB, pero sería menos idiomático y W4-07 (asistente de préstamo) lo anularía al traer el mismo código de core.
- **Vetar APIs de core en toda la app.** No es realista y empeora el código de todas las features.
- **Hidratación incremental.** No cambia el reparto de chunks de esbuild.

## Consecuencias

- La landing pesa unos 6 kB más que antes de W4-03. Es un costo único que comparten todas las features que usan formularios.
- Los presupuestos se revisan en W7-01 junto con el release.

## Enmienda (2026-10-16): techo de 104 kB y vetos por paquete

Al medir juntas las tres tarjetas de W4 que usan formularios y plantillas nuevas (simulador W4-03, dashboard W4-06 y asistente W4-07), la landing llega a 96.92 kB. Cada una por separado cabe en 95 kB. El metafile muestra que el grafo inicial de la landing no contiene ningún byte de dominio, `ui/`, `@angular/forms`, zod ni schema. Todo el crecimiento es Angular core izado (+22.7 kB raw), más el host estático del simulador (3.7 kB gzip) y una costura más de chunk que comprime algo peor. Un solo `@defer` en cualquier página de `/app` añade además ~1.1 kB.

1. El presupuesto de la landing pasa a **104 kB gzip** (106 496 B). Deja unos 7 kB para las APIs de core que usen W5 y W6 (`@defer`, gráficas y exportación siguen siendo diferidas de verdad).
2. Para que el techo más alto no oculte regresiones reales, el grafo inicial de la landing **prohíbe** dominio, `decimal.js`, `@angular/forms`, zod, schema y `ui/` (además de lo que ya prohibía). Si alguno entra, `bundle:check` falla aunque el tamaño quepa. El crecimiento de core queda como el único aceptado.

