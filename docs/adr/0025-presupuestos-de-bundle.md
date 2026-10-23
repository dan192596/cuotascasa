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

## Enmienda (2026-10-16): `/app` inicial a 200 kB

Al cerrar W4, `/app` inicial medía 236.34 kB de 240. El metafile mostró dos fugas:

1. **zod completo, con las traducciones de todos los idiomas.** Eran 290 kB raw y el 41 % de `/app`. `packages/schema` importaba `import { z } from 'zod'`: `z` es un namespace (`export * as z`), y al cruzar chunks esbuild materializa todos sus miembros. Se corrige con la forma que recomienda zod v4, `import * as z from 'zod'`.
2. **El cifrado de `sync/crypto` cargado al inicio.** El servicio de respaldo lo importaba de forma estática. Ahora lo carga con `import()` solo al cifrar o descifrar.

Con los dos arreglos, `/app` inicial mide 167.64 kB. Decisión:

- El presupuesto de `/app` inicial baja a **200 kB gzip** (204 800 B). Deja margen para W5 y W6, y detecta pronto una regresión como esta.
- El grafo inicial de `/app` prohíbe:
  - las traducciones de zod distintas de `en`;
  - `sync/crypto`;
  - `dexie`.


## Enmienda (2026-10-16): `Announcer` sin el CDK y el CDK vetado en los grafos iniciales

Al medir la unión de las tarjetas de W5, la landing llegaba a unos 101.8 kB de 104. El metafile mostró que el servicio `Announcer` de `ui/feedback` usaba `LiveAnnouncer` de `@angular/cdk/a11y`, que arrastra el sanitizador de HTML de Angular al chunk de core compartido que carga la landing (el mismo mecanismo del contexto de este ADR).

1. `Announcer` ya no usa `LiveAnnouncer`: escribe con `textContent` en dos regiones `aria-live` propias, una cortés y otra asertiva, ocultas a la vista (PR #81).
2. El grafo inicial de la landing **prohíbe** todo `@angular/cdk`, y el de `/app` prohíbe `@angular/cdk/a11y`. Si alguno entra, `bundle:check` falla aunque el tamaño quepa. El CDK sigue permitido en chunks diferidos (por ejemplo, el diálogo de confirmación).

Medidas gzip de la unión de W5:

| Grafo inicial | Antes del PR #81 | Después del PR #81 | Al cierre de W5 (main) | Presupuesto |
|---|---|---|---|---|
| Landing | ~101.8 kB | ~99.3 kB | 99.29 kB | 104 kB |
| `/app` | — | ~175 kB | 172.90 kB | 200 kB |

Los presupuestos no cambian. Se revisan en W7-01 con el release, como dice la decisión.

## Enmienda (2026-10-22): techo de 110 kB por la identidad Mercado

Tras W8-06, la landing en la identidad Mercado (ADR-0026) medía unos 103.8 kB gzip de 104. El crecimiento es código propio del diseño aprobado de la landing (mosaico, movimiento, tarjetas apiladas y, con W8-07, el cuadro de 240 cuotas). Ningún paquete vetado entró al grafo inicial: `bundle:check` sigue sin violaciones.

- El dueño aprobó el 2026-10-22 subir el presupuesto de la landing a **110 kB gzip** (112 640 B) en `tools/bundle-check/config.json`.
- Todos los vetos de los dos grafos siguen iguales. El presupuesto de `/app` inicial no cambia (200 kB).
- Las filas del ejemplo de W8-07 (`LANDING_EXAMPLE_ROWS`) y el comportamiento del cuadro viven en un chunk diferido; el grafo inicial solo lleva el resumen generado, sin el motor, sin `decimal.js` y sin `ui/`.

| Grafo inicial | Tras W8-06 | Tras W8-07 | Presupuesto |
|---|---|---|---|
| Landing | 103.78 kB | 106.26 kB | 110 kB |
| `/app` | 175.84 kB | 175.79 kB | 200 kB |
