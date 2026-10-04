# CuotasCasa: guía para agentes

App web **local-first** para modelar cuotas de préstamos de vivienda en Guatemala (fórmula FHA), proyectar abonos a capital
y comparar lo proyectado con lo real. No se conecta a bancos ni mueve dinero. No hay backend: los datos viven en el
navegador (IndexedDB) y, opcionalmente, en una copia **cifrada** en el Google Drive del usuario. Repo **público** (portafolio).

**Estado:** la planificación está completa. La construcción va por olas de tarjetas (`docs/plan/`).

## Reglas absolutas (romperlas bloquea el merge)

1. **Cero datos reales.** Ningún monto, tasa, fecha, número de préstamo, PDF, captura, correo ni dato personal real, en código, pruebas, docs, commits o PRs. Solo **datos sintéticos** (fixtures con `synthetic: true`).
2. **Cero secretos** en el repo. El ID de cliente de Google se inyecta al compilar.
3. **Solo tocas tus archivos.** Cada tarjeta declara `owns`. Los archivos congelados (`docs/plan/frozen-files.json`) y compartidos son de Opus.
4. **No agregas dependencias.** Todas están fijadas en los catálogos de pnpm (W0-01). Si necesitas una, pídela.
5. **Dinero y fechas:** nunca `number` para dinero (strings decimales + decimal.js) y nunca `Date` en `packages/domain` (usa `LocalDate` `AAAA-MM-DD`).
6. **El algoritmo no se interpreta: se lee.** `docs/algorithm.md` es la fuente única de verdad, con reglas `[ALG.*]`. Si algo es ambiguo, **detente y pregunta a Opus**; no adivines.
7. **Ante la duda, escala.** Para un archivo compartido, un contrato, una dependencia o una decisión de diseño, detente, reporta y espera una micro-tarjeta de Opus.

**Precedencia ante contradicciones:** `docs/algorithm.md` > ADR aceptado > spec > historias de usuario > texto de la tarjeta. Si dos fuentes se contradicen, **detente y escala citando ambas**; no elijas tú.

## Dónde está cada cosa

| Necesito… | Ver |
|---|---|
| Qué se construye y por qué | `docs/specs/2026-10-04-cuotascasa-v1-design.md` |
| Decisiones de arquitectura | `docs/adr/` (índice en `docs/adr/README.md`) |
| Cómo se calcula todo | `docs/algorithm.md` + `docs/specs/algorithm-examples/` |
| Nombres ES ↔ EN | `docs/glossary.md` |
| Mi tarea | `docs/plan/cards/<ID>.md` |
| Olas, dependencias, contratos congelados | `docs/plan/waves.md`, `docs/plan/plan.json` |
| Cómo ejecutar tarjetas, revisión y merge | `docs/plan/README.md` |
| Comportamiento esperado de cada pantalla | `docs/discovery/historias-de-usuario.md` (HU ↔ R) |
| Bocetos, dirección visual y paleta | `docs/discovery/direccion-visual.md` |
| Hallazgos de descubrimiento e investigación | `docs/discovery/` |

## Arquitectura en breve

- **`packages/domain`:** motor de cálculo en TypeScript puro (decimal.js). Sin Angular, sin I/O, funciones puras.
- **`packages/schema`:** esquemas zod de entidades y del respaldo, migraciones de versión y DTOs.
- **`packages/persistence`:** puertos de repositorio, adaptador en memoria, adaptador Dexie (IndexedDB) y suite de contrato común.
- **`packages/sync`:** combinación LWW por registro con marcas de borrado (pura), puerto `SyncProvider`, proveedor Google Drive (`appDataFolder`) y sobre cifrado (AES-256-GCM + PBKDF2).
- **`packages/export`:** modelo de reporte y escritores CSV, Excel y PDF (se cargan al exportar).
- **`apps/web`** (Angular 22):
  - `core/`: shell, providers, tema y errores.
  - `public/`: landing, simulador y privacidad; prerenderizado, **cero red y cero almacenamiento**.
  - `features/`: dashboard, loans, schedule, real-data, scenarios, export y settings, cada una con su `*.routes.ts` lazy.
  - `data/`: el **único** lugar que conecta Angular con persistence y sync.
  - `ui/`: componentes de diseño.
- **`tools/oracle`:** oráculo de referencia en Python, independiente del motor, que genera los fixtures sintéticos.
- **`e2e/`:** Playwright contra el build de producción con las cabeceras reales.

**Reglas de dependencia.** Copia literal de la matriz de ADR-0010 §5, que es la única definición; `eslint.config.mjs` la implementa tal cual. Cada área puede importar su propio código y lo de su fila. Todo lo demás está prohibido: si necesitas otro import, detente y escala.

**Paquetes**

| Área | Puede importar |
|---|---|
| `packages/domain` | `decimal.js` |
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
- `decimal.js`: solo `packages/domain`. `zod`: solo `packages/schema`.
- `@fontsource/*` y Tailwind: solo hojas de estilo bajo `apps/web/src/styles/`.
- Solo en pruebas (`*.spec.ts`, `testing/`, `contract/` y `e2e/`): Vitest, Playwright, `@axe-core/playwright`, `fast-check`, `fake-indexeddb`, `fflate` y `pdfjs-dist`.

**Prohibiciones que conviene tener a la vista** (ya se deducen de la matriz):

- Ninguna feature ni `public/` importa `dexie`, `@cuotascasa/persistence`, `@cuotascasa/sync`, código de Google ni las implementaciones de `data/` (`data/providers`, `data/stores`, `data/engine`, `data/backup`, `data/sync`).
- `public/` no importa `data/` ni `features/`. `core/*` no importa `features/` ni las implementaciones de `data/`.
- Ninguna feature importa otra, salvo `cc-export-menu`. Ninguna feature importa `@cuotascasa/export` de forma estática.
- Nadie importa `packages/*/src` por ruta relativa: solo por los *subpaths* del paquete.

`data/api.ts` y `data/tokens.ts` solo importan tipos (`import type`) de los paquetes. Así, que `core/theme` los use no arrastra adaptadores a la landing; el *metafile* de W0-05 y `bundle:check` (W2-12) lo comprueban.

## Convenciones

- **Idioma:** identificadores en **inglés**, textos de UI en **español (es-GT)**, docs para humanos en **español**. Las tarjetas y specs para agentes pueden estar en inglés. Usa siempre el glosario.
- **Angular 22:** standalone, signals, zoneless, OnPush, Signal Forms, `@if/@for/@defer`. Sin NgModules, sin `*ngIf`/`*ngFor` y sin archivos `index.ts` agregadores dentro de la app (los paquetes exponen subpaths en `package.json`).
- **TypeScript estricto.** Nada de `any`. Errores de dominio tipados (jerarquía `DomainError`).
- **Formato:** `Q 1,234.56`, `US$ 1,234.56` y fechas `dd/mm/aaaa`, siempre vía los pipes de `ui/`.
- **Pruebas:** Vitest junto al código (`*.spec.ts`), TDD para lógica, fast-check para invariantes, cobertura ≥ 95 % en `domain`, `schema` y `sync`. E2E con Playwright.
- **Commits:** convencionales (`feat(domain): …`), firmados con el correo noreply ya configurado en el repo.
- **Accesibilidad:** contraste AA, todo operable con teclado, resultados anunciados a lectores de pantalla.

## Flujo de trabajo por tarjetas

1. Opus crea el worktree: `git worktree add .worktrees/<ID> -b card/<ID>-<slug> main`, con las dependencias de la tarjeta ya fusionadas en `main`.
2. El agente lee `CLAUDE.md`, `docs/plan/README.md` y su tarjeta, y trabaja **solo** en ese worktree y en sus `owns`.
3. En desarrollo se usa el adaptador **en memoria** por defecto, así que ningún worktree comparte estado.
4. Instala solo con `pnpm install --frozen-lockfile`; nunca uses `pnpm install` sin esa bandera.
5. **Si te bloqueas:** haz commit `wip(<ID>): …` en tu rama y termina con un bloque **«PREGUNTAS PARA OPUS»** que diga archivo o regla, opciones e impacto. No saltes hooks: `--no-verify` solo se permite en el linaje del oráculo y se declara en el PR.
6. Termina con todos los criterios de aceptación cumplidos y `pnpm lint && pnpm typecheck && pnpm test` en verde, y abre un PR con checklist y salida de comandos.
7. Opus revisa y hace merge en orden de dependencias. Las olas se ejecutan en **lotes de ≤ 6 tarjetas Sonnet en paralelo**.

## Comandos

Los define W0-01; hasta entonces no existen.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
pnpm oracle:gen && pnpm oracle:diff
pnpm owns:check
```

## Fuera de alcance de v1

- Cuentas, login, MFA, rol admin, invitaciones y compartir en vivo: es la **fase multiusuario diferida**, con el diseño Supabase archivado en ADR-0020.
- Abonos recurrentes automáticos, asistente de calibración y conexión con bancos.
- Cifrado de IndexedDB local; se cifran solo la copia en Drive y el respaldo, si el usuario elige.
