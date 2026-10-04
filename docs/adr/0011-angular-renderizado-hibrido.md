# ADR-0011: Angular 22 y renderizado híbrido estático

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

CuotasCasa no tiene backend (ADR-0001) y se publica como archivos estáticos en Cloudflare (ADR-0002). Tiene dos superficies con necesidades opuestas:

- **Pública** (`/`, `/privacidad`): presentación, simulador rápido sin cuenta y política de privacidad. Debe cargar rápido, servir HTML real a buscadores y a la revisión de la pantalla de consentimiento de Google (que exige página principal y política públicas) y no usar red ni almacenamiento.
- **App** (`/app/**`): depende de IndexedDB, del reloj del dispositivo y de Google Identity Services. Solo tiene sentido en el navegador.

El dueño pidió Angular. La versión estable al 2026-10-04 es la 22.2: zoneless y OnPush por defecto, Signal Forms y `resource`/`httpResource` estables, Vitest 5 como runner y builder esbuild/Vite. El código lo escriben sobre todo agentes Sonnet, cuyo conocimiento de APIs tan recientes puede estar desactualizado.

## Decisión

1. **Angular 22.2** con TypeScript ~6.0 y Node 24, dentro del monorepo pnpm (ADR-0010).
2. **Estilo obligatorio:** componentes standalone, signals, zoneless (sin `zone.js`), OnPush, Signal Forms y control de flujo `@if`/`@for`/`@defer`. Quedan prohibidos los NgModules, `*ngIf`/`*ngFor` y los `index.ts` agregadores dentro de la app.
3. **SSR solo en compilación**, con `outputMode: 'static'`:
   - `''` y `'privacidad'` se prerenderizan y se hidratan;
   - `'app/**'` se renderiza en el cliente a partir de `index.csr.html`;
   - `'**'` produce la página 404 (detalle en ADR-0022).

   En producción no hay servidor Node.
4. **Rutas:** `/`, `/privacidad`, `/app`, `/app/prestamos/nuevo`, `/app/prestamos/:id`, `/app/prestamos/:id/tabla`, `/app/prestamos/:id/datos-reales`, `/app/prestamos/:id/proyecciones` y `/app/ajustes`. El archivo central de rutas y `app-area.routes.ts` son solo de Opus.
5. **La frontera de datos es una ruta lazy.** `app-area.routes.ts` carga el shell de la app con los providers de ruta `provideAppData()` y `provideStorageHealth()`. Así Dexie, sync y export nunca entran al grafo de la landing, que se mantiene sin almacenamiento. Cada feature expone su propio `*.routes.ts` lazy.
6. **Locale `es-GT`** registrado como `LOCALE_ID`; los formatos pasan por los pipes de `ui/` (ADR-0012).
7. **Librerías de UI:** Angular Material/CDK 22 y Tailwind v4 (ADR-0012). Chart.js 4 con ng2-charts se carga de forma diferida. PrimeNG 22 se descarta porque dejó de ser MIT y exige clave de licencia.
8. **Patrones dorados** congelados en W0-05 (`apps/web/src/app/_patterns/` y `docs/specs/angular-patterns.md`): control personalizado de Signal Forms, formulario de dos pasos con mensajes en español, prueba de componente zoneless y prueba de store de signals. Los agentes los copian en lugar de improvisar.

## Alternativas consideradas

- **SPA pura sin prerender.** `/` llega vacío: peor primer render y peor indexación de la página que Google revisa. Descartada.
- **SSR con servidor en tiempo de ejecución.** Exige un runtime, más costo y más superficie de ataque para contenido que no cambia. Descartada.
- **Prerenderizar también `/app`.** No aporta (todo depende de IndexedDB) y arriesga ejecutar código de datos durante el build. Descartada.
- **Angular con `zone.js` y NgModules.** Estilo heredado, más peso y contrario a los valores por defecto de v22. Descartada.
- **Otro framework (React, Svelte, Astro).** El dueño pidió Angular; no se evaluó a fondo.

## Consecuencias

**Positivas**
- La landing es HTML estático liviano, sin JavaScript de datos ni de Google.
- Un solo framework y un solo build para ambas superficies.
- Zoneless y OnPush ayudan a que la tabla de cientos de filas responda bien.

**Negativas**
- Stack muy reciente (Angular 22.2, TS 6, Vitest 5): hay pocos ejemplos de terceros.
- El prerender puede emitir scripts inline que chocan con una CSP estricta. Se resuelve en ADR-0021.

**Riesgos**
- Huecos en Signal Forms o en el SSR zoneless. Mitigación: W0 arma todo el toolchain y congela los patrones antes de la primera tarjeta Sonnet, con versiones fijadas exactas.
- Que la semántica de rewrites del hosting no sea la esperada. Mitigación: spike W1-09 y ADR-0022.

## Verificación

- **W0-05:**
  - `pnpm build` emite `index.html`, `privacidad/index.html`, `index.csr.html` y el JSON de estadísticas.
  - Una prueba del router visita cada ruta y encuentra `data-testid='page-<route-id>'`.
  - Un grep prueba que el build no contiene `zone.js`, y la regla de lint `prefer-on-push` está activa.
  - Una prueba sobre el metafile confirma que la landing no incluye `app-area.routes.ts`, Dexie ni `@cuotascasa/sync`.
- **W2-12:** `bundle-check` en CI, con módulos prohibidos y presupuesto gzip para la landing.
- **W1-09 y W2-11:** `edge:check` y e2e de humo sobre el build de producción.

## Referencias

- ADR-0001, ADR-0002, ADR-0010, ADR-0012, ADR-0016, ADR-0017, ADR-0021, ADR-0022, ADR-0023.
- Tarjetas W0-05, W1-09, W2-02 y W2-12.
- `docs/specs/angular-patterns.md`.
