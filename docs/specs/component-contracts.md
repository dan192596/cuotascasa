# Contratos de componentes, páginas y providers de la app

- **Estado:** congelado por W0-05. Solo lo cambia una micro-tarjeta de contrato de Opus (`docs/plan/README.md`, sección 5), que actualiza a la vez este documento y la spec `*.contract.spec.ts` afectada.
- **Fuente de verdad ejecutable:** cada `*.contract.spec.ts` y `apps/web/src/app/app.routes.spec.ts`. Si este documento y una spec difieren, manda la spec y se escala a Opus.
- **Alcance:** las rutas de la spec (sección 9), los componentes `cc-*` que una tarjeta usa y otra implementa, los `provide*()` del cableado raíz y el contrato de datos `data/api.ts` + `data/tokens.ts`.

## 1. Reglas comunes

1. **Componentes:** standalone, `changeDetection: ChangeDetectionStrategy.OnPush` explícito (lint prohíbe `Eager`), selector con prefijo `cc-`, entradas con `input()`/`input.required()` y salidas con `output()`. Sin NgModules ni `@Input()`/`@Output()`.
2. **Ruta y nombre fijos:** la tarjeta dueña reemplaza el contenido del archivo, pero conserva su ruta, el nombre de la clase exportada y su contrato. Nunca edita la spec `*.contract.spec.ts`.
3. **Spec de contrato:** con `reflectComponentType` comprueba el selector, que sea standalone, los nombres de las entradas (todas signals) y de las salidas; con `expectTypeOf` fija sus tipos (compila en `pnpm typecheck` y en `pnpm test`). No renderiza el componente, así que sigue en verde con la implementación real.
4. **Páginas:** el elemento anfitrión de cada componente de página lleva `data-testid="page-<route-id>"` (metadato `host`). Los parámetros de ruta llegan como entradas signal por `withComponentInputBinding()`, con `paramsInheritanceStrategy: 'always'`: `:id` llega como `id` también a las rutas hijas `prestamos/:id/...`.
5. **Stubs inertes (W0-05):** cada stub exporta `CC_STUB = 'CC_STUB:<tarjeta dueña>'`. Los componentes lo ponen en el atributo anfitrión `data-cc-stub`; los `provide*()` registran un `InjectionToken` cuya descripción es el marcador; los servicios inertes lo exponen en `ccStub`. Devuelven valores seguros (listas vacías, `null`, `false`, `'UNVALIDATED'`, `{ state: 'not-configured' }`) y nunca escriben: toda escritura rechaza con `DataError('NOT_IMPLEMENTED', CC_STUB)`. La tarjeta dueña borra el marcador y el `stub.spec.ts` de su directorio al implementarlo; W6-02 comprueba que `dist/` no contiene `CC_STUB`.
6. **Render en pruebas:** `apps/web/src/app/app.routes.spec.ts` renderiza cada página y el shell con los providers reales de `appConfig` y de la ruta `/app`, en jsdom, donde no existen `indexedDB`, `navigator.storage` ni `matchMedia`. Un componente o servicio que use una API del navegador la detecta antes de usarla (por ejemplo `typeof matchMedia === 'function'`) y cae en su valor seguro; nunca lanza al construirse.

## 2. Rutas (spec, sección 9)

El cableado lo congelan `apps/web/src/app/app.routes.ts`, `apps/web/src/app/app-area.routes.ts` y cada `features/*/*.routes.ts`; todas las páginas se cargan en diferido. `app.routes.server.ts` prerenderiza `''` y `'privacidad'`; `'app'`, `'app/**'` y `'**'` se renderizan en el cliente desde `index.csr.html`.

| URL | `data-testid` | Componente (archivo · clase) | Render | Tarjeta dueña |
|---|---|---|---|---|
| `/` | `page-landing` | `apps/web/src/app/public/landing/landing-page.component.ts` · `LandingPageComponent` | Prerender | W4-04 |
| `/privacidad` | `page-privacy` | `apps/web/src/app/public/privacy/privacy-page.component.ts` · `PrivacyPageComponent` (entrada `issuesUrl`) | Prerender | W4-05 |
| `/app` (shell) | `page-app` | `apps/web/src/app/core/shell/app-shell.component.ts` · `AppShellComponent` | Cliente | W3-09 |
| `/app` | `page-dashboard` | `apps/web/src/app/features/dashboard/dashboard-page.component.ts` · `DashboardPageComponent` | Cliente | W4-06 |
| `/app/prestamos` | `page-dashboard` | redirige a `/app`: `{ path: '', pathMatch: 'full', redirectTo: '/app' }` en `apps/web/src/app/features/loans/loans.routes.ts` | Cliente | W0-05 |
| `/app/prestamos/nuevo` | `page-loan-new` | `apps/web/src/app/features/loans/wizard/loan-wizard-page.component.ts` · `LoanWizardPageComponent` | Cliente | W4-07 |
| `/app/prestamos/:id` | `page-loan-detail` | `apps/web/src/app/features/loans/detail/loan-detail-page.component.ts` · `LoanDetailPageComponent` (entrada `id`) | Cliente | W5-01 |
| `/app/prestamos/:id/tabla` | `page-schedule` | `apps/web/src/app/features/schedule/schedule-page.component.ts` · `SchedulePageComponent` (entrada `id`) | Cliente | W5-02 |
| `/app/prestamos/:id/datos-reales` | `page-real-data` | `apps/web/src/app/features/real-data/real-data-page.component.ts` · `RealDataPageComponent` (entrada `id`, **congelado**) | Cliente | W0-05 |
| `/app/prestamos/:id/proyecciones` | `page-scenarios` | `apps/web/src/app/features/scenarios/scenarios-page.component.ts` · `ScenariosPageComponent` (entrada `id`, **congelado**) | Cliente | W0-05 |
| `/app/ajustes` | `page-settings` | `apps/web/src/app/features/settings/settings-page.component.ts` · `SettingsPageComponent` (**congelado**) | Cliente | W0-05 |
| cualquier otra | `page-not-found` | `apps/web/src/app/public/not-found/not-found-page.component.ts` · `NotFoundPageComponent` | Cliente (W2-02 decide el 404 estático, ADR-0022) | W4-05 |

Las tres páginas congeladas solo alojan a sus componentes: `RealDataPageComponent` → `<cc-real-data-timeline [loanId]="id()" />`; `ScenariosPageComponent` → `<cc-scenario-editor [loanId]="id()" />` y `<cc-scenario-compare [loanId]="id()" />`; `SettingsPageComponent` → `<cc-settings-backup />` y `<cc-settings-sync />`. El shell aloja `<cc-safari-banner />`, `<cc-update-prompt />`, `<cc-theme-toggle />` y el `<router-outlet />` dentro de `<main id="contenido">`.

## 3. Componentes `cc-*`

| Selector | Archivo · clase | Entradas | Salidas | Implementa | Lo usa |
|---|---|---|---|---|---|
| `cc-quick-simulator` | `apps/web/src/app/public/simulator/quick-simulator.component.ts` · `QuickSimulatorComponent` | — | — | W4-03 | landing (W4-04) |
| `cc-theme-toggle` | `apps/web/src/app/core/theme/theme-toggle.component.ts` · `ThemeToggleComponent` | — | — | W3-05 | shell (W3-09) |
| `cc-safari-banner` | `apps/web/src/app/core/storage-health/safari-banner.component.ts` · `SafariBannerComponent` | — | — | W3-13 | shell (W3-09) |
| `cc-update-prompt` | `apps/web/src/app/core/pwa/update-prompt.component.ts` · `UpdatePromptComponent` | — | — | W3-14 | shell (W3-09) |
| `cc-export-menu` | `apps/web/src/app/features/export/export-menu.component.ts` · `ExportMenuComponent` | `request: ExportRequest` (requerida) | — | W5-06 | tabla (W5-02), comparación (W5-05) |
| `cc-scenario-editor` | `apps/web/src/app/features/scenarios/editor/scenario-editor.component.ts` · `ScenarioEditorComponent` | `loanId: Uuid` (requerida) | — | W5-04 | `ScenariosPageComponent` |
| `cc-scenario-compare` | `apps/web/src/app/features/scenarios/compare/scenario-compare.component.ts` · `ScenarioCompareComponent` | `loanId: Uuid` (requerida) | — | W5-05 | `ScenariosPageComponent` |
| `cc-settings-backup` | `apps/web/src/app/features/settings/backup/settings-backup.component.ts` · `SettingsBackupComponent` | — | — | W5-07 | `SettingsPageComponent` |
| `cc-settings-sync` | `apps/web/src/app/features/settings/sync/settings-sync.component.ts` · `SettingsSyncComponent` | — | — | W5-08 | `SettingsPageComponent` |
| `cc-real-data-timeline` | `apps/web/src/app/features/real-data/timeline/real-data-timeline.component.ts` · `RealDataTimelineComponent` | `loanId: Uuid` (requerida) | — | W5-03 | `RealDataPageComponent` |
| `cc-event-form` | `apps/web/src/app/features/real-data/forms/event-form.component.ts` · `EventFormComponent` | `kind: EventFormKind` (requerida), `context: EventFormContext` (requerida), `value: EventFormValue \| null` (por defecto `null`) | `submitted: EventFormValue`, `cancelled: void` | W4-12 | timeline (W5-03) |

`Uuid` es el tipo de `@cuotascasa/schema`. El archivo de `cc-export-menu` conserva la raíz `export-menu`: la categoría de `eslint.config.mjs` que deja a la tabla (W5-02) y a la comparación (W5-05) importarlo depende de ese nombre. `cc-safari-banner` solo lo aloja el shell, y `core/*` puede importar `core/*`; su archivo conserva la raíz `safari-banner`, y la categoría `safari-banner` de `eslint.config.mjs` queda sin uso hasta la micro-tarjeta de Opus que la quita.

**Tipos de `cc-export-menu`** (exportados por su archivo; las features anfitrionas los importan de ahí):

```ts
export type ExportRequest =
  | { readonly kind: 'schedule'; readonly input: ScheduleReportInput } // @cuotascasa/export/model
  | { readonly kind: 'comparison'; readonly input: ComparisonReportInput };
```

Las anfitrionas no pueden importar `@cuotascasa/export` (lint): arman la petición con el tipo del menú, por ejemplo `Extract<ExportRequest, { readonly kind: 'schedule' }>['input']`.

**Tipos de `cc-event-form`** (exportados por su archivo):

```ts
export const EVENT_FORM_KINDS = ['ReportedBalance', 'ActualPayment', 'RateChange', 'FixedChargeChange', 'Prepayment', 'AdvanceInstallments'] as const;
export type EventFormKind = (typeof EVENT_FORM_KINDS)[number];
export type EventFormContext = Pick<Loan, 'currency' | 'rateType' | 'disbursementDate' | 'firstDueDate' | 'paymentDay'> & {
  readonly loanId: Uuid;
  readonly endDate: string; // realEndDate del préstamo
};
export type EventFormValue =
  | { readonly entity: 'ReportedBalance'; readonly draft: ReportedBalanceDraft } // data/api.ts
  | { readonly entity: 'ActualPayment'; readonly draft: ActualPaymentDraft }
  | { readonly entity: 'LoanEvent'; readonly draft: LoanEventDraft };
```

Mientras `realEndDate()` es `null`, la anfitriona pasa la `endDate` del plan original: `buildSchedule(toLoanTerms(loan)).endDate`.

## 4. Providers

| Función | Archivo | Dónde se instala | Implementa | Stub inerte |
|---|---|---|---|---|
| `provideAppErrorHandling()` | `apps/web/src/app/core/errors/provide-app-error-handling.ts` | `app.config.ts` | W3-09 | deja el `ErrorHandler` de Angular |
| `provideAppTheme()` | `apps/web/src/app/core/theme/provide-app-theme.ts` | `app.config.ts` | W3-05 | no fija tema: la página sigue al sistema |
| `provideAppPwa()` | `apps/web/src/app/core/pwa/provide-app-pwa.ts` | `app.config.ts` | W3-14 (mecanismo de ADR-0023) | no registra service worker |
| `provideStorageHealth()` | `apps/web/src/app/core/storage-health/provide-storage-health.ts` | ruta `/app` | W3-13 | `STORAGE_HEALTH` con `persisted = null`, `estimate = null`, `safariNonStandalone = false`; `requestPersist()` resuelve `false` sin llamar a `navigator.storage` |
| `provideAppData()` | `apps/web/src/app/data/provide-app-data.ts` (**congelado**) | ruta `/app` | compone los cinco de abajo | — |
| `provideDataStores()` | `apps/web/src/app/data/providers/provide-data-stores.ts` | `provideAppData()` | W3-10: `DATA_STORE`, `CLOCK`, `ID_GENERATOR` | no provee ninguno |
| `provideStores()` | `apps/web/src/app/data/stores/provide-stores.ts` | `provideAppData()` | W3-11: los seis stores | lecturas vacías y listas, escrituras rechazadas |
| `provideEngineFacade()` | `apps/web/src/app/data/engine/provide-engine-facade.ts` | `provideAppData()` | W3-12: `LOAN_PROJECTION_SERVICE` | valores `null`, `UNVALIDATED`, `cutoffK = 0`, sin totales |
| `provideBackup()` | `apps/web/src/app/data/backup/provide-backup.ts` | `provideAppData()` | W4-08: `BACKUP_SERVICE` | `reminderDue = false`, sin respaldo |
| `provideSync()` | `apps/web/src/app/data/sync/provide-sync.ts` | `provideAppData()` | W4-09: `SYNC_SERVICE` | `{ state: 'not-configured' }`, texto «No configurado» |

`app-area.routes.ts` instala `provideAppData()` y `provideStorageHealth()` como `providers` de la ruta lazy de `/app`: nada de `data/` entra al grafo de `/` (prueba de metafile en `apps/web/src/testing/build-output/landing-graph.spec.ts`).

## 5. Contrato de datos

- `apps/web/src/app/data/api.ts`: interfaces `LoansStore` (`create` sin ancla y `createWithAnchor`), `LoanEventsStore`, `ReportedBalancesStore`, `PaymentsStore`, `ScenariosStore` (`activeScenarioId`, `setActiveScenario`), `SettingsStore`, `LoanProjectionService` (`forLoan(loanId)` → `LoanProjection` con los valores derivados de la spec, sección 9, más `cutoffK`, `paidInstallments` y `realDeltaPerAnchor`/`realDeltaPerComponent`), `BackupService` (`reminderDue`), `SyncService`, `StorageHealth` (`requestPersist`); los borradores `*Draft`/`*Update` y `DataError`.
- `apps/web/src/app/data/tokens.ts`: un `InjectionToken` por servicio (`LOANS_STORE`, `LOAN_EVENTS_STORE`, `REPORTED_BALANCES_STORE`, `PAYMENTS_STORE`, `SCENARIOS_STORE`, `SETTINGS_STORE`, `LOAN_PROJECTION_SERVICE`, `BACKUP_SERVICE`, `SYNC_SERVICE`, `STORAGE_HEALTH`).
- Ambos importan de los paquetes **solo** con `import type` (lint y `apps/web/src/app/data/data-boundary.spec.ts`).
- `apps/web/src/app/data/data-layer.tokens.ts` (`DATA_STORE: Promise<DataStore>`, `CLOCK`, `ID_GENERATOR`) es interno de `data/`: la matriz de lint no deja que `features/` ni `core/` lo importen.

Las herramientas de «Proyecciones» (W5-04) trabajan sobre el escenario activo: `forLoan(id).paths()` trae su camino y `goalSeek` lo usa con `basePath: 'SCENARIO'`; si `paths().scenario` es `null` (escenario sin eventos vivos), usa `basePath: 'REAL'`. Para usar otro escenario, el editor primero lo activa con `setActiveScenario`.

`checkRealWrite(loanId, write)` es un ensayo sin escritura: devuelve el error tipado que lanzaría el camino real con ese registro aplicado (HU-10: un `RateChange` que deja la cuota por debajo del cargo financiero se muestra y no se guarda), o `null`. W5-03 lo llama antes de crear o actualizar un registro real.

## 6. Tema, reloj público y constantes de compilación

- **Tema:** `apps/web/src/styles/tokens.css` declara cada token de color con `light-dark()` y `:root { color-scheme: light dark; }`. Para forzar un tema, `ThemeService` (W3-05) pone `data-theme="light"` o `data-theme="dark"` en `<html>`; con «sistema» quita el atributo. `ThemeService` vive en la raíz (`provideAppTheme()` en `app.config.ts`) y nunca ve `SETTINGS_STORE`, que es un provider de la ruta `/app`: lo inyecta `cc-theme-toggle`, dentro del shell, que le pasa al servicio la preferencia guardada y guarda los cambios. En `/` no hay toggle: el tema sigue al sistema y no se escribe nada.
- **Reloj público:** `apps/web/src/app/public/public-clock.ts` exporta `PUBLIC_CLOCK` (`providedIn: 'root'`, `today(): LocalDate` del navegador). El simulador (W4-03) lo usa al interactuar, nunca durante el prerender; las pruebas lo reemplazan.
- **Constantes:** `apps/web/src/environments/build-constants.ts` exporta `GOOGLE_OAUTH_CLIENT_ID` y `ISSUES_URL`, leídas de los `define` `GOOGLE_CLIENT_ID` y `REPOSITORY_ISSUES_URL` de `angular.json` (`''` por defecto). El deploy (W3-17) los reemplaza con `ng build --define`. `public/` no puede importar `environments/` (lint): `app.routes.ts` pasa `ISSUES_URL` a `/privacidad` como dato de ruta `issuesUrl`, y `withComponentInputBinding()` lo entrega a la entrada `issuesUrl` de `PrivacyPageComponent` (también en el prerender).
