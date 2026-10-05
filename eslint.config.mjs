// ESLint flat config for CuotasCasa.
// The dependency rules implement the ADR-0010 §5 matrix (docs/adr/0010-monorepo-pnpm-reglas-de-dependencia.md),
// which is their single definition: every area may import its own code plus its row; everything else is disallowed.
import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

const APP = 'apps/web/src/app';

/** Area → path. Order matters: the first matching descriptor wins, so nested areas come first. */
const ELEMENTS = [
  { type: 'persistence-dexie', pattern: 'packages/persistence/src/dexie' },
  { type: 'persistence', pattern: 'packages/persistence' },
  { type: 'sync-google-drive', pattern: 'packages/sync/src/google-drive' },
  { type: 'sync', pattern: 'packages/sync' },
  { type: 'export-excel', pattern: 'packages/export/src/excel' },
  { type: 'export-pdf', pattern: 'packages/export/src/pdf' },
  { type: 'export', pattern: 'packages/export' },
  { type: 'schema', pattern: 'packages/schema' },
  { type: 'domain', pattern: 'packages/domain' },
  { type: 'conformance', pattern: 'tools/conformance' },
  { type: 'e2e', pattern: 'e2e' },
  { type: 'ui', pattern: `${APP}/ui` },
  { type: 'core-pwa', pattern: `${APP}/core/pwa` },
  { type: 'core-theme', pattern: `${APP}/core/theme` },
  { type: 'core-storage-health', pattern: `${APP}/core/storage-health` },
  { type: 'core', pattern: `${APP}/core/*`, capture: ['name'] },
  { type: 'public', pattern: `${APP}/public` },
  { type: 'feature', pattern: `${APP}/features/*`, capture: ['feature'] },
  { type: 'data', pattern: `${APP}/data` },
  { type: 'environments', pattern: 'apps/web/src/environments' },
  { type: 'web', pattern: 'apps/web/src' },
].map((element) => ({ ...element, partialMatch: false }));

/** File categories used to narrow a row of the matrix to specific files. */
const FILES = [
  {
    category: 'test',
    pattern: [
      '**/*.spec.ts',
      '**/*.test-d.ts',
      'packages/*/test/**',
      '**/testing/**',
      '**/contract/**',
      'e2e/**',
      '**/vitest.config.{ts,mts}',
    ],
  },
  { category: 'root-wiring', pattern: ['apps/web/src/main*.ts', `${APP}/app*.ts`] },
  { category: 'data-api', pattern: `${APP}/data/api.ts` },
  { category: 'data-tokens', pattern: `${APP}/data/tokens.ts` },
  { category: 'data-provide', pattern: `${APP}/data/provide-app-data.ts` },
  { category: 'feature-routes', pattern: `${APP}/features/*/*.routes.ts` },
  { category: 'chart-host', pattern: `${APP}/features/scenarios/compare/**` },
  { category: 'export-menu', pattern: `${APP}/features/export/**/*export-menu*` },
  { category: 'safari-banner', pattern: `${APP}/core/storage-health/**/*safari-banner*` },
];

const PACKAGES = [
  'domain',
  'schema',
  'persistence',
  'persistence-dexie',
  'sync',
  'sync-google-drive',
  'export',
  'export-excel',
  'export-pdf',
];
const APP_AREAS = ['ui', 'core*', 'public', 'feature', 'data', 'environments', 'web'];
const ANGULAR = [
  '@angular/core',
  '@angular/common',
  '@angular/forms',
  '@angular/router',
  '@angular/platform-browser',
  '@angular/material',
  '@angular/cdk',
];
const TEST_ONLY = [
  'vitest',
  '@vitest/*',
  'playwright',
  '@playwright/test',
  '@axe-core/playwright',
  'fast-check',
  'fake-indexeddb',
  'fflate',
  'pdfjs-dist',
];

const external = (source) => ({ module: { origin: 'external', source } });
const area = (type, captured) => ({ element: captured ? { type, captured } : { type } });
const viaPackage = (type, source, extra = {}) => ({ to: area(type), dependency: { source, ...extra } });

const POLICIES = [
  // Test-only libraries and Node core modules: only from test files (*.spec.ts, *.test-d.ts, testing/, contract/,
  // packages/*/test/, e2e/ and vitest configs).
  {
    from: { file: { categories: 'test' } },
    allow: [
      { to: external(TEST_ONLY) },
      { to: { module: { origin: 'core' } } },
      viaPackage('schema', '@cuotascasa/schema/testing'),
      viaPackage('sync', '@cuotascasa/sync/testing'),
    ],
  },
  // Tests may import every directory of their own package, adapters and writers included: it is their own code.
  { from: { ...area('persistence'), file: { categories: 'test' } }, allow: { to: area('persistence-dexie') } },
  { from: { ...area('sync'), file: { categories: 'test' } }, allow: { to: area('sync-google-drive') } },
  { from: { ...area('export'), file: { categories: 'test' } }, allow: { to: area(['export-excel', 'export-pdf']) } },
  {
    // A writer's tests may also import the sibling writer: excel/ and pdf/ are both directories of the export package.
    from: { ...area(['export-excel', 'export-pdf']), file: { categories: 'test' } },
    allow: { to: area(['export-excel', 'export-pdf']) },
  },
  // Packages.
  { from: area('domain'), allow: { to: external('decimal.js') } },
  { from: area('schema'), allow: { to: external('zod') } },
  { from: area('persistence'), allow: viaPackage('schema', '@cuotascasa/schema') },
  {
    from: area('persistence-dexie'),
    allow: [{ to: area('persistence') }, viaPackage('schema', '@cuotascasa/schema'), { to: external('dexie') }],
  },
  { from: area('sync'), allow: viaPackage('schema', '@cuotascasa/schema') },
  {
    from: area('sync-google-drive'),
    allow: [
      { to: area('sync') },
      viaPackage('schema', '@cuotascasa/schema'),
      { to: external('@types/google.accounts'), dependency: { kind: 'type' } },
    ],
  },
  { from: area('export'), allow: viaPackage('domain', '@cuotascasa/domain') },
  {
    from: area('export-excel'),
    allow: [{ to: area('export') }, viaPackage('domain', '@cuotascasa/domain'), { to: external('write-excel-file') }],
  },
  {
    from: area('export-pdf'),
    allow: [
      { to: area('export') },
      viaPackage('domain', '@cuotascasa/domain'),
      { to: external(['jspdf', 'jspdf-autotable']) },
    ],
  },
  {
    from: area('conformance'),
    allow: [
      viaPackage('domain', '@cuotascasa/domain'),
      viaPackage('schema', '@cuotascasa/schema'),
      { to: { module: { origin: 'core' } } },
    ],
  },
  {
    from: area('e2e'),
    allow: [viaPackage('sync', '@cuotascasa/sync/testing'), viaPackage('schema', '@cuotascasa/schema/testing')],
  },
  // App (apps/web/src/app). Angular, Material and CDK are allowed in every app area.
  { from: area(APP_AREAS), allow: { to: external(ANGULAR) } },
  { from: area('ui'), allow: viaPackage('domain', '@cuotascasa/domain') },
  {
    from: area('core*'),
    allow: [
      { to: area('ui') },
      { to: area('core*') },
      viaPackage('domain', '@cuotascasa/domain'),
      { to: { ...area('data'), file: { categories: 'data-api' } }, dependency: { kind: 'type' } },
      { to: { ...area('data'), file: { categories: 'data-tokens' } } },
    ],
  },
  {
    // core/* takes only types and errors (names ending in "Error") from the domain.
    from: area('core*'),
    disallow: { to: area('domain'), dependency: { kind: 'value', specifiers: '!*Error' } },
  },
  { from: area('core-pwa'), allow: { to: external('@angular/service-worker') } },
  {
    from: area('public'),
    allow: [viaPackage('domain', '@cuotascasa/domain'), { to: area('ui') }, { to: area('core-theme') }],
  },
  {
    from: area('feature'),
    allow: [
      { to: area('ui') },
      viaPackage('domain', '@cuotascasa/domain'),
      { to: { ...area('data'), file: { categories: ['data-api', 'data-tokens'] } } },
      viaPackage('schema', '@cuotascasa/schema'),
      { to: { ...area('core-storage-health'), file: { categories: 'safari-banner' } } },
      { to: { ...area('feature', { feature: 'export' }), file: { categories: 'export-menu' } } },
    ],
  },
  {
    from: area('feature', { feature: 'export' }),
    allow: [
      viaPackage(['export', 'export-excel', 'export-pdf'], '@cuotascasa/export{,/**}', { kind: 'type' }),
      viaPackage(['export', 'export-excel', 'export-pdf'], '@cuotascasa/export{,/**}', { nodeKind: 'dynamic-import' }),
    ],
  },
  {
    from: { ...area('feature', { feature: 'scenarios' }), file: { categories: 'chart-host' } },
    allow: { to: external(['chart.js', 'ng2-charts']) },
  },
  {
    from: area('data'),
    allow: [
      viaPackage('domain', '@cuotascasa/domain'),
      viaPackage('schema', '@cuotascasa/schema'),
      viaPackage(['persistence', 'persistence-dexie'], '@cuotascasa/persistence{,/**}'),
      viaPackage('sync', ['@cuotascasa/sync', '@cuotascasa/sync/{crypto,session}']),
      viaPackage('sync-google-drive', '@cuotascasa/sync/google-drive', { kind: 'type' }),
      viaPackage('sync-google-drive', '@cuotascasa/sync/google-drive', { nodeKind: 'dynamic-import' }),
      { to: area('environments') },
    ],
  },
  {
    // data/api.ts and data/tokens.ts import only types from the packages.
    from: { ...area('data'), file: { categories: ['data-api', 'data-tokens'] } },
    disallow: { to: area(PACKAGES), dependency: { kind: 'value' } },
  },
  {
    from: { ...area('web'), file: { categories: 'root-wiring' } },
    allow: [
      { to: area('core*') },
      { to: { ...area('data'), file: { categories: 'data-provide' } } },
      { to: area('public') },
      {
        to: { ...area('feature'), file: { categories: 'feature-routes' } },
        dependency: { nodeKind: 'dynamic-import' },
      },
      { to: area('environments') },
      { to: external(['@angular/platform-server', '@angular/ssr', '@angular/service-worker']) },
    ],
  },
];

// parseFloat / Number / unary + over money identifiers (ADR-0003). Names follow docs/glossary.md.
const MONEY_NAME =
  '/^(principal|balance|opening|closing|interest|insurance|charge|capital|level|total|amount|commission|payoff|totalPaid|interestSaved|netSaving|realDelta|money)$|(Amount|Balance|Principal|Interest|Insurance|Charge|Capital|Total|Commission|Payment|Money)$/';
const MONEY_MESSAGE = 'Money is a decimal string: never convert it with parseFloat, Number or unary + (ADR-0003).';
const MONEY_SELECTORS = [
  `CallExpression[callee.name=/^(Number|parseFloat|parseInt)$/][arguments.0.name=${MONEY_NAME}]`,
  `CallExpression[callee.name=/^(Number|parseFloat|parseInt)$/][arguments.0.property.name=${MONEY_NAME}]`,
  `CallExpression[callee.object.name='Number'][callee.property.name=/^(parseFloat|parseInt)$/][arguments.0.name=${MONEY_NAME}]`,
  `CallExpression[callee.object.name='Number'][callee.property.name=/^(parseFloat|parseInt)$/][arguments.0.property.name=${MONEY_NAME}]`,
  `UnaryExpression[operator='+'][argument.name=${MONEY_NAME}]`,
  `UnaryExpression[operator='+'][argument.property.name=${MONEY_NAME}]`,
].map((selector) => ({ selector, message: MONEY_MESSAGE }));
const ANGULAR_SELECTORS = [
  { selector: "Decorator[expression.callee.name='NgModule']", message: 'No NgModules: standalone only (ADR-0011).' },
  {
    selector: 'MemberExpression[property.name=/^bypassSecurityTrust/]',
    message: 'Never bypass Angular sanitization (ADR-0016).',
  },
];
const INDEX_SELECTOR = {
  selector: 'Program',
  message: 'No index.ts aggregators inside the app; import the file directly (ADR-0011).',
};

// decimal.js is imported only by the money module, which owns the decimal context (ADR-0003, plan decision D12); the
// rest of the domain's production code goes through it, while the domain's tests may import it from any directory.
// `no-restricted-imports` covers import and export declarations; dynamic import() has its own selector because the
// core rule does not look at it.
const DECIMAL_MESSAGE =
  'Import decimal.js only under packages/domain/src/money/; elsewhere in the domain use the money module (ADR-0003).';
const DECIMAL_IMPORT_PATTERN = { regex: '^decimal\\.js($|/)', message: DECIMAL_MESSAGE };
const DECIMAL_DYNAMIC_IMPORT = {
  selector: 'ImportExpression[source.value=/^decimal\\.js($|\\x2f)/]',
  message: DECIMAL_MESSAGE,
};

export default defineConfig(
  includeIgnoreFile(fileURLToPath(new URL('./.gitignore', import.meta.url))),
  globalIgnores(['tools/oracle/**', 'tools/lint-fixtures/**']),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['apps/web/src/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'cc', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'cc', style: 'camelCase' }],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-standalone': 'error',
    },
  },
  {
    files: ['apps/web/src/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: { '@angular-eslint/template/prefer-control-flow': 'error' },
  },
  {
    files: ['apps/web/src/**/*.ts', 'packages/**/*.ts', 'tools/conformance/**/*.ts', 'e2e/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': ELEMENTS,
      'boundaries/files': FILES,
      'boundaries/legacy-templates': false,
      'import/resolver': { typescript: { project: fileURLToPath(new URL('./tsconfig.base.json', import.meta.url)) } },
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', checkAllOrigins: true, policies: POLICIES }],
    },
  },
  {
    files: ['packages/**/*.ts', 'apps/web/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...MONEY_SELECTORS] },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Use LocalDate (YYYY-MM-DD) in packages/domain (ADR-0003).' },
      ],
      '@typescript-eslint/no-restricted-types': [
        'error',
        { types: { Date: { message: 'Use LocalDate (YYYY-MM-DD) in packages/domain (ADR-0003).' } } },
      ],
    },
  },
  {
    // Type tests and domain test support may name Date, e.g. to prove that the contracts reject it.
    files: ['packages/domain/test/**/*.ts', 'packages/**/*.test-d.ts'],
    rules: { 'no-restricted-globals': 'off', '@typescript-eslint/no-restricted-types': 'off' },
  },
  {
    // decimal.js stays inside the money module; this block restates the money selectors because a later
    // `no-restricted-syntax` entry replaces the earlier one instead of merging with it.
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [DECIMAL_IMPORT_PATTERN] }],
      'no-restricted-syntax': ['error', ...MONEY_SELECTORS, DECIMAL_DYNAMIC_IMPORT],
    },
  },
  {
    // The money module and the domain's tests may import decimal.js from any directory: the restriction is for
    // production code. Nothing else is exempt, not even testing/ or contract/ directories inside the domain.
    files: [
      'packages/domain/src/money/**/*.ts',
      'packages/domain/**/*.spec.ts',
      'packages/domain/**/*.test-d.ts',
      'packages/domain/test/**/*.ts',
    ],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': ['error', ...MONEY_SELECTORS] },
  },
  {
    files: ['apps/web/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...MONEY_SELECTORS, ...ANGULAR_SELECTORS] },
  },
  {
    files: [`${APP}/**/index.ts`],
    rules: { 'no-restricted-syntax': ['error', ...MONEY_SELECTORS, ...ANGULAR_SELECTORS, INDEX_SELECTOR] },
  },
  {
    // ADR-0003 §6: the Excel writer is the only place where money becomes a JS number.
    files: ['packages/export/src/excel/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
