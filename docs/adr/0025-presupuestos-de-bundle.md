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
