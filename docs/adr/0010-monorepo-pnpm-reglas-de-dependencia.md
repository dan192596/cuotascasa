# ADR-0010: Monorepo pnpm, paquetes y reglas de dependencia

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El proyecto se construye con 72 tarjetas en 8 olas, con hasta unas 6 tarjetas Sonnet en paralelo en worktrees; Opus revisa y fusiona (ADR-0019). La estructura del repo debe lograr:

- **Límites mecánicos:** que el dominio no dependa de Angular, que ninguna feature use Dexie o Google directamente y que la landing no arrastre almacenamiento.
- **Sin choques entre tarjetas paralelas** en las rutas que posee cada una.
- **Dependencias fijadas desde el inicio** y scripts de instalación bloqueados (ADR-0016).
- **Linajes aislados.** Separar el motor TypeScript del oráculo Python (ADR-0014).

## Decisión

1. **Workspace pnpm 10.33** sobre Node 24 y TypeScript ~6.0:

   | Ruta | Contenido |
   |---|---|
   | `packages/domain` | Motor puro |
   | `packages/schema` | zod, respaldo y migraciones |
   | `packages/persistence` | Puertos, memoria, Dexie y suite de contrato |
   | `packages/sync` | Combinación, cifrado, sesión y Drive |
   | `packages/export` | Modelo de reporte y escritores |
   | `apps/web` | Angular 22: `core`, `public`, `features/*`, `data`, `ui` |
   | `tools/conformance` | Arnés de conformidad |
   | `e2e` | Playwright |

   `tools/oracle` (Python 3.13, solo biblioteca estándar en ejecución) queda **fuera** del grafo de pnpm.
2. **Paquetes internos consumidos en TypeScript fuente (JIT)**, sin paso de compilación propio. Una prueba de concepto verificó el esquema. Cada paquete expone *subpaths* en `package.json`, por ejemplo `@cuotascasa/persistence/memory|dexie|contract`, `@cuotascasa/sync/crypto|session|google-drive|testing` y `@cuotascasa/export/model|csv|excel|pdf`, con `sideEffects: false`. Dentro de la app no hay archivos `index.ts` agregadores.
3. **Catálogos de pnpm** con versiones exactas de **todas** las dependencias previstas, fijadas en W0-01, incluidas las de solo pruebas:
   - los manifiestos solo usan `catalog:`, y `tools/catalog-check` lo verifica;
   - ninguna tarjeta agrega, actualiza ni quita dependencias;
   - Renovate propone actualizaciones con una antigüedad mínima de publicación, y Opus las fusiona.
4. **`.npmrc`:**
   - scripts de ciclo de vida bloqueados, salvo una lista permitida (`onlyBuiltDependencies`);
   - `engine-strict`;
   - *peers* estrictos;
   - instalación siempre con `--frozen-lockfile`.
5. **Reglas de dependencia impuestas por ESLint** (`eslint-plugin-boundaries` más `no-restricted-imports`). La matriz de abajo es la **única definición**: `eslint.config.mjs` (W0-01) la implementa tal cual y `CLAUDE.md` («Reglas de dependencia») la copia sin cambios. Cada área puede importar su propio código y lo que dice su fila; **todo lo demás está prohibido**. Si una tarjeta necesita un import que la matriz no permite, se detiene y escala a Opus; no lo resuelve en su tarjeta.

   **Paquetes**

   | Área | Puede importar |
   |---|---|
   | `packages/domain` | `decimal.js`, solo bajo `src/money/**` (las pruebas del paquete, `*.spec.ts`, `*.test-d.ts` y `test/`, pueden importarlo desde cualquier directorio) |
   | `packages/schema` | `zod` |
   | `packages/persistence` | `@cuotascasa/schema`; `dexie` solo bajo `src/dexie` |
   | `packages/sync` | `@cuotascasa/schema`; los tipos de `@types/google.accounts` solo bajo `src/google-drive` |
   | `packages/export` | `@cuotascasa/domain`; `write-excel-file` solo bajo `src/excel`; `jspdf` y `jspdf-autotable` solo bajo `src/pdf` |
   | `tools/conformance` | La API pública de `@cuotascasa/domain` y el esquema de fixtures de `@cuotascasa/schema` |
   | `e2e` | `@cuotascasa/sync/testing` (los fakes de Google) y `@cuotascasa/schema/testing` |

   **App (`apps/web/src/app`)**

   | Área | Puede importar |
   |---|---|
   | `ui/*` | `@cuotascasa/domain` (tipos y helpers de dinero y fechas) |
   | `core/*` | `ui/*` y otros `core/*`; los tipos y errores de `@cuotascasa/domain`; **solo tipos y tokens** de `data/api.ts` y `data/tokens.ts` (por ejemplo, `core/theme` usa `SettingsStore` y `core/storage-health` implementa `StorageHealth`); `@angular/service-worker` solo en `core/pwa` |
   | `public/*` | `@cuotascasa/domain`, `ui/*`, `core/theme` y otros `public/*` (la landing incluye `cc-quick-simulator`) |
   | `features/<f>/*` | Su propia feature (`features/<f>/`); `ui/*`; `@cuotascasa/domain`; `data/api.ts` y `data/tokens.ts`; los esquemas de entidades de `@cuotascasa/schema`, solo para validar DTOs de formularios (W4-12); el componente `cc-safari-banner` de `core/storage-health/` (dashboard, W4-06); el componente `cc-export-menu` de `features/export/` (tabla y comparación, W5-02 y W5-05) |
   | `features/export/*` | Además de lo anterior, `@cuotascasa/export/*`, **solo** con `import()` dinámico o `import type` (W5-06) |
   | `features/scenarios/compare/*` | Además de lo anterior, `chart.js` y `ng2-charts`, cargados detrás de `@defer` (W5-05) |
   | `data/*` | `@cuotascasa/domain`, `@cuotascasa/schema`, `@cuotascasa/persistence/*` y `@cuotascasa/sync/*`. Es el **único** lugar que importa adaptadores (`persistence/memory`, `persistence/dexie`, `sync/crypto`, `sync/session`, `sync/google-drive`); `sync/google-drive` solo con `import()` dinámico (W4-09) |
   | Cableado raíz, de Opus (`main*.ts`, `app.config*.ts`, `app.routes*.ts`, `app-area.routes.ts`) | Los `provide*` y el `AppShell` de `core/*`, `data/provide-app-data.ts` y las rutas de `public/*` y de `features/*/*.routes.ts` (estas, en carga diferida) |

   **Terceros por área**

   - Angular (`core`, `common`, `router`, `forms`), Material y CDK: en todas las áreas de `apps/web`, nunca en `packages/*`.
   - `@angular/service-worker`: solo `core/pwa` y el cableado raíz.
   - `chart.js` y `ng2-charts`: solo `features/scenarios/compare`.
   - `dexie`: solo `packages/persistence/src/dexie`.
   - `write-excel-file`, `jspdf` y `jspdf-autotable`: solo `packages/export`, en los directorios de su fila.
   - `decimal.js`: solo `packages/domain/src/money/**` y las pruebas de `packages/domain` (`*.spec.ts`, `*.test-d.ts` y `test/`). `zod`: solo `packages/schema`.
   - `@fontsource/*` y Tailwind: solo hojas de estilo bajo `apps/web/src/styles/`.
   - Solo en pruebas (`*.spec.ts`, `*.test-d.ts`, `testing/`, `contract/`, `packages/*/test/` y `e2e/`): Vitest, Playwright, `@axe-core/playwright`, `fast-check`, `fake-indexeddb`, `fflate` y `pdfjs-dist`. Las pruebas de un paquete pueden importar cualquier directorio de su propio paquete, y las pruebas de tipos y `packages/domain/test/` pueden nombrar el tipo `Date`.

   **Prohibiciones que conviene tener a la vista** (ya se deducen de la matriz):

   - Ninguna feature ni `public/` importa `dexie`, `@cuotascasa/persistence`, `@cuotascasa/sync`, código de Google ni las implementaciones de `data/` (`data/providers`, `data/stores`, `data/engine`, `data/backup`, `data/sync`).
   - `public/` no importa `data/` ni `features/`. `core/*` no importa `features/` ni las implementaciones de `data/`.
   - Ninguna feature importa otra, salvo `cc-export-menu`. Ninguna feature importa `@cuotascasa/export` de forma estática.
   - Nadie importa `packages/*/src` por ruta relativa: solo por los *subpaths* del paquete.

   `data/api.ts` y `data/tokens.ts` solo importan tipos (`import type`) de los paquetes. Así, que `core/theme` los use no arrastra adaptadores a la landing; el *metafile* de W0-05 y `bundle:check` (W2-12) lo comprueban.
6. **Archivos compartidos congelados.** Toda la configuración (manifiestos, tsconfig, ESLint, lefthook, gitleaks, rutas centrales) es de Opus y figura en `docs/plan/frozen-files.json`. `owns-check` rechaza cualquier cambio fuera de las rutas `owns` de la tarjeta, o a un archivo congelado.

## Alternativas consideradas

- **Un solo proyecto Angular con carpetas.** Los límites no se pueden hacer cumplir y el dominio podría importar Angular sin que nadie lo note. Las tarjetas paralelas chocarían más.
- **Nx.** Es potente, pero pesado: generadores, plugins que suelen ir detrás de las versiones de Angular y una curva de aprendizaje alta. Lo único que se necesita es un workspace y reglas de lint.
- **npm workspaces.** No tiene catálogos y ejecuta por defecto los scripts de instalación de las dependencias. pnpm 10 los bloquea por defecto.
- **Repositorios separados.** Sobrecarga para un proyecto de una persona.
- **Compilar cada paquete a `dist/`.** Más pasos y compilaciones viejas entre worktrees.

## Consecuencias

**Positivas**
- Las violaciones de arquitectura fallan en `pnpm lint`, sin depender de la revisión.
- Adaptadores intercambiables, landing liviana y paralelismo seguro gracias a `owns`.
- Superficie de cadena de suministro acotada y auditable.

**Negativas**
- Hay más configuración inicial, toda concentrada en W0.
- Cualquier dependencia nueva exige una micro-tarjeta de Opus.

**Riesgos**
- **Que alguna herramienta no resuelva bien el TypeScript fuente de los paquetes** (Vitest, esbuild o Angular). Mitigación: la prueba de concepto de W0 y el *pipeline* completo armado antes de cualquier tarjeta.
- **Que las reglas de lint tengan huecos.** Mitigación: pruebas de límites con archivos que deben fallar (W0-06) y `bundle:check` (W2-12).

## Verificación

- `pnpm install --frozen-lockfile` no ejecuta scripts fuera de la lista permitida, y `catalog-check` falla con una versión literal (W0-01).
- `tools/lint-fixtures` (W0-06) tiene, por cada fila de la matriz, un import permitido que pasa y uno prohibido que falla. Pasan, por ejemplo, `cc-safari-banner` en el dashboard, `cc-export-menu` en la tabla, el `import()` dinámico de `@cuotascasa/export` en `features/export` y Chart.js en `features/scenarios/compare`. Fallan Dexie en una feature, `data/` en `public/`, Angular en `domain`, un import estático de `@cuotascasa/export` en una feature, Chart.js fuera de la comparación y una feature que importa otra (W0-06, W3-10).
- `owns-check` corre en cada PR, y en el plan completo ninguno de los 1 606 pares de tarjetas paralelas solapa sus `owns`.
- `bundle:check` prueba que la landing no incluye Dexie, sync, export, Chart.js ni Google.

## Referencias

- `CLAUDE.md`, «Reglas de dependencia»; `docs/plan/waves.md`, «Política de archivos compartidos».
- ADR-0006, ADR-0014, ADR-0016, ADR-0019.
- Tarjetas W0-01 (`eslint.config.mjs`), W0-05, W0-06 (`tools/lint-fixtures`) y W1-10. Las excepciones de la matriz vienen de W3-05, W3-13, W4-06, W4-09, W4-12, W5-02, W5-05 y W5-06.
- Catálogos de pnpm: https://pnpm.io/catalogs

## Enmiendas

- 2026-10-04 (W0-01, decisión D12): `decimal.js` queda restringido a `packages/domain/src/money/**` en código de producción; las pruebas del paquete (`*.spec.ts`, `*.test-d.ts` y `test/`) pueden importarlo desde cualquier directorio. Se precisó la fila de `packages/domain` y la viñeta de terceros de §5; `CLAUDE.md` mantiene la copia idéntica.
