# Plan de implementación de la ola W0

> **Para agentes:** sub-skill requerido: `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans`. Cada paso usa casillas `- [ ]` para el seguimiento.

**Objetivo:** dejar el repositorio listo para el trabajo en paralelo. Incluye:
- el workspace con todas las dependencias fijadas;
- los ejemplos del algoritmo cerrados;
- los contratos congelados de dominio, esquema, persistencia y sync;
- el esqueleto Angular con todas las rutas;
- la CI con `owns-check` y el arnés de conformidad.

**Arquitectura:** monorepo pnpm local-first. Lo describen `CLAUDE.md`, ADR-0001 y ADR-0010.

**Tecnologías:** Node 24, pnpm 10.33, TypeScript ~6.0, Angular 22.2, Vitest 5, Playwright 1.63, decimal.js, zod, Dexie 4.4 y Python 3.13 para el oráculo.

**Spec:** [`docs/specs/2026-10-04-cuotascasa-v1-design.md`](../../../specs/2026-10-04-cuotascasa-v1-design.md). Fuentes de verdad: [`docs/algorithm.md`](../../../algorithm.md), [`CLAUDE.md`](../../../../CLAUDE.md) y las tarjetas [`docs/plan/cards/W0-0*.md`](../../cards/).

Los planes de las olas siguientes se escriben **al cerrar cada ola**, contra los contratos que W0 congela ([ADR-0019](../../../adr/0019-proceso-con-agentes.md)).

## Restricciones globales

- **Cero datos reales.** Solo números sintéticos, como los de [ALG.EXAMPLE]. Ninguna ruta absoluta de la máquina ni ningún usuario del sistema en el repo.
- **Rutas:** cada bloque de comandos define `REPO="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"; export WT="$REPO/.worktrees/<ID>"`.
- **Instalación** solo con `pnpm install --frozen-lockfile`. Las versiones se fijan una vez en los catálogos (W0-01), con `pnpm view` en la fecha de ejecución.
- **Commits** convencionales, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, con el correo noreply ya configurado en el repo.
- **W0 lo ejecuta solo Opus, en serie.** Cada tarjeta se fusiona a `main` antes de crear el worktree de la siguiente.

## Orden de ejecución

| Paso | Sección | Depende de | Qué deja listo |
|---|---|---|---|
| 1 | [W0-01](W0-01.md) | — | Workspace, catálogos, ESLint con la matriz de ADR-0010 §5, lefthook, gitleaks, scripts raíz |
| 2 | [W0-02](W0-02.md) | — | `algorithm.md` cerrado, ejemplos en `docs/specs/algorithm-examples/` e `INDEX.md` (el script de cálculo vive fuera del repo) |
| 3 | [W0-03](W0-03.md) | W0-01, W0-02 | Tipos del dominio congelados, dinero y fechas implementados con TDD, registro con stubs y contratos de export |
| 4 | [W0-04](W0-04.md) | W0-01, W0-02 | Esquemas zod, respaldo v1, puertos y suite de contrato, contratos de sync, fakes de Google y `tools/oracle/FORMAT.md` |
| 5 | [W0-05](W0-05.md) | W0-01, W0-03, W0-04 | Angular 22 con SSR estático, rutas lazy, `data/api.ts`, contratos de componentes y Tailwind |
| 6 | [W0-06](W0-06.md) | W0-03, W0-04, W0-05 | CI, `owns-check` con `editableBy`, `frozen_files`, `lint-fixtures`, arnés de conformidad y protecciones |

Los pasos 1 y 2 son independientes entre sí, igual que los pasos 3 y 4. Aun así W0 corre en serie, porque cada tarjeta debe empezar sobre un `main` en verde.

## Prerrequisitos del dueño

| # | Acción | Antes de |
|---|---|---|
| P1 | ✅ Licencia confirmada por el dueño (2026-10-04): **MIT con titular "CuotasCasa contributors"**, sin nombres personales en el repo | W0-01 |
| P2 | Instalar gitleaks (`brew install gitleaks`) | W0-01, Task W0-01.4 |
| P3 | Instalar Python 3.13 (`brew install python@3.13`) | W0-04, Task W0-04.20 (y W1-02) |
| P4 | Al crear el repo en GitHub: secret scanning, push protection y private vulnerability reporting y, en la configuración de correo de GitHub, la opción «Block command line pushes that expose my email». | W0-06, Task W0-06.13 |

## Decisiones de Opus que prevalecen sobre el texto de las secciones

Se tomaron al cerrar la revisión del plan de W0 (2026-10-04). Si una sección dice otra cosa, **manda esta tabla**, y el ejecutor ajusta el paso indicado.

| # | Decisión | Afecta |
|---|---|---|
| D1 | `FixedChargeChange` usa el campo **`fixedCharges`**, que es una lista `{label, amount}` aplicada desde `k`, en dominio, esquema y ejemplos. El dominio renombra `charges`. | W0-03 (`types/events.ts` y sus pruebas) |
| D2 | Un evento sin `installmentNumber` cuya fecha es posterior al último vencimiento lanza `InvalidInputError` con `INSTALLMENT_OUT_OF_RANGE`, regla `ALG.EVENTS.ANCHOR`. Aplica a eventos reales e hipotéticos y nunca se ignora en silencio. | W0-02 (texto de [ALG.EVENTS.ANCHOR] y un ejemplo), W0-03 (mapa código → regla) |
| D3 | La validación de amortización negativa de `KEEP_INSTALLMENT_ADJUST_TERM` y `BANK_INSTALLMENT` usa el `financialCharge` del perfil ([ALG.LAST]). | W0-02 (texto de [ALG.RATE.*]) |
| D4 | La búsqueda por meta con `k ≤ cutoffK` lanza `InfeasibleGoalError('PREPAYMENT_NOT_AFTER_CUTOFF')` con `details.k`, como ya acordaron W0-02 y W0-03. W0-02 ajusta [ALG.GOAL] y [ALG.ERRORS]. | W0-02, W0-03 |
| D5 | El desglose de `ActualPayment` siempre trae los 4 componentes. | W0-02, W0-03, W0-04 (FORMAT §3.4–3.5) |
| D6 | `InfeasibleReason` tiene un solo valor, `GOAL_DATE_BEFORE_PREPAYMENT`, porque liquidar siempre cumple `MAX_INSTALLMENT`. | W0-03 |
| D7 | Los orígenes de `ReportedBalance` salen del enum de W0-04 (`BANK_EMAIL`, `ONLINE_BANKING`, `BANK_SCHEDULE`, `OTHER`). El asistente usa `OTHER` por defecto. Los nombres de campo de W0-04 mandan. | W0-04, W4-07 (ya en `plan.json`) |
| D8 | La fecha de `ActualPayment` se llama `date` en el dominio y `paidDate` en el esquema; la fachada de W3-12 hace la única conversión. | W3-12 |
| D9 | El escenario activo se guarda en `SyncedSettings.activeScenarioByLoan`. Cada evento hipotético embebido lleva su propio `deletedAt`. | W0-04 |
| D10 | `mergeDatasets` y `purgeTombstones` son internos de `@cuotascasa/sync`; `data/` usa el orquestador de sesión. | W0-04, W4-09 |
| D11 | Sin seguros, ambas formas son válidas: `insuranceRates = []`, o tasas en cero con un `"0.00"` por componente. | W0-02, W0-04 |
| D12 | `decimal.js` solo se importa en `packages/domain/src/money/**`. Se agrega una regla `no-restricted-imports` en W0-01.5 con un spot check, y se verifica con el lint de W0-03. Las pruebas del paquete domain (`*.spec.ts`, `*.test-d.ts`, `test/`) están exentas; ADR-0010 §5 y `CLAUDE.md` se enmendaron en W0-01. | W0-01, W0-03 |
| D13 | Umbral de cobertura del 100 % para `packages/domain/src/money/**` y `dates/**` en el `vitest.config.ts` raíz (el fragmento está en el FOR_OPUS de W0-03). | W0-01 |
| D14 | Los scripts `oracle:gen` y `oracle:diff` usan `python3`, y el README del oráculo explica cómo activar el venv. | W0-01, W0-04 |
| D15 | Todo commit de agente termina con la línea `Co-Authored-By`. | W0-01, W0-02 |
| D16 | La verificación de la denylist en W0-02 usa `grep -nH`, para que nunca imprima el término encontrado sin el archivo. | W0-02 |
| D17 | Decisiones de W0-05: <ul><li>`apps/web/.postcssrc.json` es de W0-05 (ya en `plan.json`).</li><li>W3-05 quita el preflight de Tailwind, según ADR-0012 («layout y utilidades»).</li><li>Se mantiene el plugin de Vitest para resolver paquetes en `ng test`.</li><li>Se aprueban los agregados: `data-layer.tokens.ts`, `PUBLIC_CLOCK`, el define `REPOSITORY_ISSUES_URL`, el contexto de `cc-event-form`, `compareScenarios`/`toLoanTerms` y `serviceWorker` + `ngsw-config.json` mínimos.</li></ul> | W0-05, W3-05 |
| D18 | W0-06 congela `data/data-layer.tokens.ts`, el archivo de `PUBLIC_CLOCK` y `apps/web/.postcssrc.json`, con `editableBy: ["W0-05"]`. | W0-06 |
| D19 | Ajustes de W0-06: <ul><li>Se omiten `resolve-ts.ts` y el override `bundler` de `tools/conformance` si `private-compare` corre en Node 24 sin ellos (W0-03 ya usa `nodenext`). Se verifica al ejecutar.</li><li>`matrix.ts` usa la etiqueta nueva «Solo en pruebas (…)» de ADR-0010 §5.</li><li>W0-06.11 vuelve a copiar el `check_examples.py` final de W0-02 (reglas 1 a 8) y sus pruebas.</li><li>El fixture PASS de la fila `decimal.js` de `tools/lint-fixtures/matrix.ts` va bajo `packages/domain/src/money/` (no `dates/`), porque D12 rechaza `dates/`.</li></ul> | W0-06 |
| D20 | Opus agrega la fila de ADR-0024 a `docs/adr/README.md` al fusionar W0-04. | W0-04 |
| D21 | Se aceptan estas decisiones de W0-01: <ul><li>Lecturas de la matriz: `@angular/platform-browser` cuenta como Angular y se prohíbe `bypassSecurityTrust*`.</li><li>Los módulos de Node solo se usan en pruebas, `tools/` y `e2e`.</li><li>`core/*` solo toma del dominio tipos y `*Error`.</li><li>`rxjs` queda fuera del código de la app, porque `toSignal` acepta `Subscribable`.</li><li>`environments` solo se usa desde `data/` y el cableado raíz.</li><li>Guardas en los scripts raíz y allowlist de builds en `pnpm-workspace.yaml`.</li><li>`gitleaks git --pre-commit --staged`.</li><li>Dependencias adicionales de herramientas, aprobadas por Opus.</li></ul> | W0-01 |
| D22 | Hooks: fallan cerrado (`assert_lefthook_installed: true`) y `hygiene-noreply` corre en `commit-msg` (pre-commit se salta en commits vacíos). Orden de merge de cada tarjeta W0: `git merge --squash` → `pnpm install --frozen-lockfile` en `main` → `git commit` → borrar worktree y rama. | Todas las tarjetas W0 |

## Pendientes para olas posteriores

- **Chart.js y ADR-0003 (antes de W5-05).** La gráfica necesita `number`. Recomendación: un único helper de visualización en `features/scenarios/compare`, con su excepción de lint y una enmienda a ADR-0003.
- **Script inline de Beasties en el HTML prerenderizado.** ADR-0021 (W2-02) debe permitirlo con hash.
- **W1-10:** guard de módulo principal con `import.meta.main` (Node ≥ 24.2, ya exigido por `engines`), incluido `tools/hygiene/commit-msg.mjs`; aceptar `Reapply "…"` en commit-msg; pruebas faltantes de commit-msg (borde 100/101 caracteres, salida 2 de la CLI, contenido de `COMMIT_TYPES`, `squash!`/`amend!`); ejecutar el check de `.gitignore` en un `git init` desechable con solo una copia de `.gitignore` (evita que `.gitignore` anidados enmascaren un patrón borrado) y agregar sondeos `x.xls`, `cuotascasa-backup-2026-01-01.json`, `.claude/settings.local.json`, `.env` y un `.pyc` fuera de `__pycache__/`; el check de noreply lee la identidad real (`git var GIT_AUTHOR_IDENT` y `GIT_COMMITTER_IDENT`), no solo `user.email`.
- **W1-09 y W2-10:** los checks de `tools/edge/` se llaman `check*.mjs`; las pruebas `*.spec.*` y `*.test.*` quedan fuera del runner `edge:check`.
- **Micro-tarjetas de Opus** (archivos congelados tras W0-01): endurecer `tools/catalog-check` (`parseArgs` estricto, errores que nombren el manifiesto, `Object.hasOwn`); variantes sintácticas en ESLint (`TSImportType` de `decimal.js`, acceso computado a `bypassSecurityTrust*`, `Number(row['amount'])`); `core/*` «solo tipos y errores» (W0-06 lo registra como límite conocido); `boundaries/no-unknown-files` al agregar un paquete; negación `!` si una tarjeta necesita fixtures `.log`; nombrar `LEFTHOOK=0` como bypass prohibido en `CLAUDE.md`.
- **W6-03:** el README dice «todo fixture JSON» (no «todo fixture») lleva `synthetic: true`.

## Estado de verificación del plan

Cada redactor o corrector **ejecutó su sección en un workspace temporal** fuera del repo, en el orden del plan. Con esa reproducción se comprobó lo siguiente:

- **W0-01:** lint, typecheck y format en verde, 35 pruebas y 65 spot checks de límites.
- **W0-02:** 32 pruebas de los scripts, los 20 archivos de ejemplo con «recomputed: yes» y el ejemplo base idéntico byte a byte a [ALG.EXAMPLE].
- **W0-03:** 190 pruebas, con 100 % de cobertura en `money/` y `dates/`.
- **W0-05:** 78 pruebas de `ng test` y 10 pruebas del build.
- **W0-06:** 44 pruebas del arnés de conformidad.

Además:

- Una revisión cruzada verificó que las interfaces consumidas existen con el mismo nombre y tipo, y que cada criterio de aceptación tiene un paso que lo verifica.
- Las 295 rutas absolutas con el usuario del sistema se reemplazaron por la convención `REPO`/`WT`. El escáner de datos reales da 0.

**Lo que no se ejecutó:** gitleaks (no está instalado; ver P2), Python 3.13 (no está instalado; ver P3) y todo lo que vive en GitHub (CI remoto y protecciones).
