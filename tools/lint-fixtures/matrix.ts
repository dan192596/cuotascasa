/**
 * Lint-boundary proofs (ADR-0010 §5, «Verificación»): for every row of the dependency matrix, imports that must pass
 * and imports that must fail with exactly the boundary rule. The files are virtual: boundaries.spec.ts lints each
 * `code` with ESLint as if it lived at `filePath`; every imported target is a real file of the repo after W0.
 */

/** The only rule a failing fixture may report. */
export const BOUNDARY_RULE = 'boundaries/dependencies';

export interface LintFixture {
  /** Virtual path inside apps/web/src, packages, e2e or tools/conformance; it never exists on disk. */
  readonly filePath: string;
  readonly code: string;
}

export interface LintFixtureRow {
  /** Exact first-column text of the ADR-0010 §5 table row, or the label of a «Terceros por área» bullet. */
  readonly area: string;
  readonly pass: readonly LintFixture[];
  readonly fail: readonly LintFixture[];
}

const APP = 'apps/web/src/app';

/** The two tables of ADR-0010 §5 («Paquetes» and «App»), one row each, in the ADR order. */
export const MATRIX_ROWS: readonly LintFixtureRow[] = [
  {
    area: '`packages/domain`',
    pass: [
      {
        filePath: 'packages/domain/src/money/lint-fixture.ts',
        code: "import { Decimal } from 'decimal.js';\nexport const fixture = new Decimal(1);\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/domain/src/money/lint-fixture.ts',
        code: "import { Injectable } from '@angular/core';\nexport const fixture = Injectable;\n",
      },
    ],
  },
  {
    area: '`packages/schema`',
    pass: [
      {
        filePath: 'packages/schema/src/entities/lint-fixture.ts',
        code: "import { z } from 'zod';\nexport const fixture = z.string();\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/schema/src/entities/lint-fixture.ts',
        code: "import { Decimal } from 'decimal.js';\nexport const fixture = Decimal;\n",
      },
    ],
  },
  {
    area: '`packages/persistence`',
    pass: [
      {
        filePath: 'packages/persistence/src/dexie/lint-fixture.ts',
        code: "import Dexie from 'dexie';\nimport type { Loan } from '@cuotascasa/schema';\nexport type Fixture = [typeof Dexie, Loan];\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/persistence/src/memory/lint-fixture.ts',
        code: "import Dexie from 'dexie';\nexport const fixture = Dexie;\n",
      },
    ],
  },
  {
    area: '`packages/sync`',
    pass: [
      {
        filePath: 'packages/sync/src/google-drive/lint-fixture.ts',
        code: "import type {} from '@types/google.accounts';\nimport type { Loan } from '@cuotascasa/schema';\nexport type Fixture = Loan;\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/sync/src/session/lint-fixture.ts',
        code: "import type {} from '@types/google.accounts';\nexport type Fixture = string;\n",
      },
    ],
  },
  {
    area: '`packages/export`',
    pass: [
      {
        filePath: 'packages/export/src/pdf/lint-fixture.ts',
        code: "import { jsPDF } from 'jspdf';\nimport type { Money } from '@cuotascasa/domain';\nexport type Fixture = [typeof jsPDF, Money];\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/export/src/csv/lint-fixture.ts',
        code: "import writeXlsxFile from 'write-excel-file';\nexport const fixture = writeXlsxFile;\n",
      },
    ],
  },
  {
    area: '`tools/conformance`',
    pass: [
      {
        filePath: 'tools/conformance/src/lint-fixture.ts',
        code: "import { readFileSync } from 'node:fs';\nimport { DomainError } from '@cuotascasa/domain';\nimport { fixtureSchema } from '@cuotascasa/schema';\nexport const fixture = [readFileSync, DomainError, fixtureSchema];\n",
      },
    ],
    fail: [
      {
        filePath: 'tools/conformance/src/lint-fixture.ts',
        code: "import type { DataStore } from '@cuotascasa/persistence';\nexport type Fixture = DataStore;\n",
      },
    ],
  },
  {
    area: '`e2e`',
    pass: [
      {
        filePath: 'e2e/specs/lint-fixture.spec.ts',
        code: "import { test } from '@playwright/test';\nimport { createDriveFake } from '@cuotascasa/sync/testing';\nimport { entityArbitraries } from '@cuotascasa/schema/testing';\nexport const fixture = [test, createDriveFake, entityArbitraries];\n",
      },
    ],
    fail: [
      {
        filePath: 'e2e/specs/lint-fixture.spec.ts',
        code: "import { deriveKey } from '@cuotascasa/sync/crypto';\nexport const fixture = deriveKey;\n",
      },
    ],
  },
  {
    area: '`ui/*`',
    pass: [
      {
        filePath: `${APP}/ui/format/lint-fixture.ts`,
        code: "import { parseMoney } from '@cuotascasa/domain';\nexport const fixture = parseMoney;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/ui/format/lint-fixture.ts`,
        code: "import type { LoansStore } from '../../data/api.ts';\nexport type Fixture = LoansStore;\n",
      },
    ],
  },
  {
    // Known limit (docs/plan/implementation/w0/README.md, «Pendientes»): the «only types and *Error» rule for the
    // domain does not see a namespace import (`import * as domain from '@cuotascasa/domain'`) or a dynamic import() of
    // the domain from core/*; both pass lint today. An Opus micro-card on eslint.config.mjs closes it.
    area: '`core/*`',
    pass: [
      {
        filePath: `${APP}/core/errors/lint-fixture.ts`,
        code: "import { DomainError } from '@cuotascasa/domain';\nimport { LOANS_STORE } from '../../data/tokens.ts';\nimport type { SettingsStore } from '../../data/api.ts';\nimport { provideAppTheme } from '../theme/provide-app-theme.ts';\nexport const fixture = [DomainError, LOANS_STORE, provideAppTheme];\nexport type Fixture = SettingsStore;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/core/errors/lint-fixture.ts`,
        code: "import { provideAppData } from '../../data/provide-app-data.ts';\nexport const fixture = provideAppData;\n",
      },
    ],
  },
  {
    area: '`public/*`',
    pass: [
      {
        filePath: `${APP}/public/landing/lint-fixture.ts`,
        code: "import { parseMoney } from '@cuotascasa/domain';\nimport { ThemeToggleComponent } from '../../core/theme/theme-toggle.component.ts';\nimport { PUBLIC_CLOCK } from '../public-clock.ts';\nexport const fixture = [parseMoney, ThemeToggleComponent, PUBLIC_CLOCK];\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/public/landing/lint-fixture.ts`,
        code: "import type { LoansStore } from '../../data/api.ts';\nexport type Fixture = LoansStore;\n",
      },
    ],
  },
  {
    area: '`features/<f>/*`',
    pass: [
      {
        filePath: `${APP}/features/dashboard/lint-fixture.ts`,
        code: "import { loanSchema } from '@cuotascasa/schema';\nimport { LOANS_STORE } from '../../data/tokens.ts';\nimport { SafariBannerComponent } from '../../core/storage-health/safari-banner.component.ts';\nexport const fixture = [loanSchema, LOANS_STORE, SafariBannerComponent];\n",
      },
      {
        filePath: `${APP}/features/schedule/lint-fixture.ts`,
        code: "import { ExportMenuComponent } from '../export/export-menu.component.ts';\nexport const fixture = ExportMenuComponent;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/features/loans/wizard/lint-fixture.ts`,
        code: "import Dexie from 'dexie';\nexport const fixture = Dexie;\n",
      },
      {
        filePath: `${APP}/features/loans/detail/lint-fixture.ts`,
        code: "import { ScenarioEditorComponent } from '../../scenarios/editor/scenario-editor.component.ts';\nexport const fixture = ScenarioEditorComponent;\n",
      },
    ],
  },
  {
    area: '`features/export/*`',
    pass: [
      {
        filePath: `${APP}/features/export/lint-fixture.ts`,
        code: "import type { ReportModel } from '@cuotascasa/export';\nexport const load = () => import('@cuotascasa/export/csv');\nexport type Fixture = ReportModel;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/features/export/lint-fixture.ts`,
        code: "import { csvWriter } from '@cuotascasa/export/csv';\nexport const fixture = csvWriter;\n",
      },
    ],
  },
  {
    area: '`features/scenarios/compare/*`',
    pass: [
      {
        filePath: `${APP}/features/scenarios/compare/lint-fixture.ts`,
        code: "import { Chart } from 'chart.js';\nimport { BaseChartDirective } from 'ng2-charts';\nexport const fixture = [Chart, BaseChartDirective];\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/features/scenarios/editor/lint-fixture.ts`,
        code: "import { Chart } from 'chart.js';\nexport const fixture = Chart;\n",
      },
    ],
  },
  {
    area: '`data/*`',
    pass: [
      {
        filePath: `${APP}/data/providers/lint-fixture.ts`,
        code: "import { loanSchema } from '@cuotascasa/schema';\nimport { createDexieDataStore } from '@cuotascasa/persistence/dexie';\nimport { createInMemoryDataStore } from '@cuotascasa/persistence/memory';\nimport { deriveKey } from '@cuotascasa/sync/crypto';\nimport { GOOGLE_OAUTH_CLIENT_ID } from '../../../environments/build-constants.ts';\nexport const loadDrive = () => import('@cuotascasa/sync/google-drive');\nexport const fixture = [loanSchema, createDexieDataStore, createInMemoryDataStore, deriveKey, GOOGLE_OAUTH_CLIENT_ID];\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/data/sync/lint-fixture.ts`,
        code: "import { createGoogleDriveProvider } from '@cuotascasa/sync/google-drive';\nexport const fixture = createGoogleDriveProvider;\n",
      },
    ],
  },
  {
    area: 'Cableado raíz, de Opus (`main*.ts`, `app.config*.ts`, `app.routes*.ts`, `app-area.routes.ts`)',
    pass: [
      {
        filePath: `${APP}/app-lint-fixture.ts`,
        code: "import { provideAppData } from './data/provide-app-data.ts';\nimport { provideAppTheme } from './core/theme/provide-app-theme.ts';\nexport const loadDashboard = () => import('./features/dashboard/dashboard.routes.ts').then((m) => m.DASHBOARD_ROUTES);\nexport const fixture = [provideAppData, provideAppTheme];\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/app-lint-fixture.ts`,
        code: "import { DASHBOARD_ROUTES } from './features/dashboard/dashboard.routes.ts';\nexport const fixture = DASHBOARD_ROUTES;\n",
      },
    ],
  },
];

/** The «Terceros por área» bullets of ADR-0010 §5 that constrain TypeScript imports. */
export const THIRD_PARTY_ROWS: readonly LintFixtureRow[] = [
  {
    area: 'Angular (`core`, `common`, `router`, `forms`), Material y CDK',
    pass: [
      {
        filePath: `${APP}/features/settings/lint-fixture.ts`,
        code: "import { inject } from '@angular/core';\nimport { Router } from '@angular/router';\nexport const fixture = () => inject(Router);\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/export/src/model/lint-fixture.ts',
        code: "import { formatNumber } from '@angular/common';\nexport const fixture = formatNumber;\n",
      },
    ],
  },
  {
    area: '`@angular/service-worker`',
    pass: [
      {
        filePath: `${APP}/core/pwa/lint-fixture.ts`,
        code: "import { provideServiceWorker } from '@angular/service-worker';\nexport const fixture = provideServiceWorker;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/core/theme/lint-fixture.ts`,
        code: "import { provideServiceWorker } from '@angular/service-worker';\nexport const fixture = provideServiceWorker;\n",
      },
    ],
  },
  {
    area: '`chart.js` y `ng2-charts`',
    pass: [
      {
        filePath: `${APP}/features/scenarios/compare/lint-fixture.ts`,
        code: "import { BaseChartDirective } from 'ng2-charts';\nexport const fixture = BaseChartDirective;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/public/landing/lint-fixture.ts`,
        code: "import { Chart } from 'chart.js';\nexport const fixture = Chart;\n",
      },
    ],
  },
  {
    area: '`dexie`',
    pass: [
      {
        filePath: 'packages/persistence/src/dexie/lint-fixture.ts',
        code: "import Dexie from 'dexie';\nexport const fixture = Dexie;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/data/providers/lint-fixture.ts`,
        code: "import Dexie from 'dexie';\nexport const fixture = Dexie;\n",
      },
    ],
  },
  {
    area: '`write-excel-file`, `jspdf` y `jspdf-autotable`',
    pass: [
      {
        filePath: 'packages/export/src/excel/lint-fixture.ts',
        code: "import writeXlsxFile from 'write-excel-file';\nexport const fixture = writeXlsxFile;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/features/export/lint-fixture.ts`,
        code: "import { jsPDF } from 'jspdf';\nexport const fixture = jsPDF;\n",
      },
    ],
  },
  {
    area: '`decimal.js`',
    pass: [
      {
        filePath: 'packages/domain/src/money/lint-fixture.ts',
        code: "import { Decimal } from 'decimal.js';\nexport const fixture = Decimal;\n",
      },
    ],
    fail: [
      {
        filePath: `${APP}/data/engine/lint-fixture.ts`,
        code: "import { Decimal } from 'decimal.js';\nexport const fixture = Decimal;\n",
      },
    ],
  },
  {
    area: 'Solo en pruebas (`*.spec.ts`, `*.test-d.ts`, `testing/`, `contract/`, `packages/*/test/` y `e2e/`)',
    pass: [
      {
        filePath: 'packages/domain/src/money/lint-fixture.spec.ts',
        code: "import { expect, it } from 'vitest';\nimport fc from 'fast-check';\nit('runs', () => {\n  expect(fc).toBeDefined();\n});\n",
      },
    ],
    fail: [
      {
        filePath: 'packages/domain/src/money/lint-fixture.ts',
        code: "import fc from 'fast-check';\nexport const fixture = fc;\n",
      },
    ],
  },
];

/** «Terceros por área» bullets that only constrain stylesheets: ESLint does not lint them. */
export const NOT_LINTABLE_THIRD_PARTY = ['`@fontsource/*` y Tailwind'];
