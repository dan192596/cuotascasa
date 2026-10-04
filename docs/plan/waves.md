# Olas y tarjetas

<!-- Generado por tools/plan/render_plan.py desde docs/plan/plan.json. No editar a mano. -->

Detalle de cada tarjeta en `cards/`. Cada ola se ejecuta en lotes de ≤ 6 tarjetas Sonnet en paralelo.

## W0 · Foundation and frozen contracts (Opus-only)

Give parallel agents a repo they cannot collide in: algorithm.md completed with a worked synthetic example per rule and a frozen decimal context; a workspace that pins every dependency; frozen package contracts with Opus-implemented money/date primitives, the persistence contract suite and the Google fakes; an Angular skeleton with every route as a lazy stub, inert provider stubs and frozen component contracts; CI with owns-check, frozen files and an Opus-written conformance harness; GitHub push protection on before the first public push.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W0-01](cards/W0-01.md) | opus | M | — | Workspace, toolchain, dependency policy and hygiene baseline |
| [W0-02](cards/W0-02.md) | opus | M | — | Algorithm spec readiness gate: worked examples, decimal context, closed definitions |
| [W0-03](cards/W0-03.md) | opus | L | W0-01, W0-02 | Domain contracts with Opus-implemented money/date primitives, plus export contracts |
| [W0-04](cards/W0-04.md) | opus | L | W0-01, W0-02 | Schema, persistence contract suite, sync contracts with shared Google fakes, oracle format |
| [W0-05](cards/W0-05.md) | opus | L | W0-01, W0-03, W0-04 | Angular 22 skeleton: static SSR, lazy route stubs, inert provider stubs, frozen component contracts, golden patterns |
| [W0-06](cards/W0-06.md) | opus | M | W0-03, W0-04, W0-05 | CI, owns-check with frozen and append-only files, lint-boundary proofs, Opus conformance harness, repo protections |

## W1 · Prove the hard core

Attack the highest-uncertainty pieces in parallel on frozen contracts: the engine schedule core and an independent oracle written from algorithm.md only, the backup codec, both persistence adapters against the Opus contract suite, the sync merge, crypto (Opus), a CSP/Trusted Types/GIS evidence spike, the Cloudflare routing baseline, and repo-hygiene hooks before any fixture is committed.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W1-01](cards/W1-01.md) | sonnet | M | W0-06 | Engine schedule core: level payment, period loop, rounding profiles, shared helpers |
| [W1-02](cards/W1-02.md) | sonnet | L | W0-06 | Independent Python oracle: core algorithm, profile-based seeded generator, private compare CLI |
| [W1-03](cards/W1-03.md) | sonnet | M | W0-06 | Backup codec, pure version migrations, schema arbitraries |
| [W1-04](cards/W1-04.md) | sonnet | S | W0-06 | In-memory DataStore adapter |
| [W1-05](cards/W1-05.md) | sonnet | M | W0-06 | Dexie 4.4 adapter passing the persistence contract suite |
| [W1-06](cards/W1-06.md) | sonnet | M | W0-06 | Sync merge and tombstone purge (pure) |
| [W1-07](cards/W1-07.md) | opus | M | W0-06 | Crypto envelope and non-extractable per-device key store (security-critical) |
| [W1-08](cards/W1-08.md) | sonnet | M | W0-06 | Spike: CSP + Trusted Types + Google Identity Services evidence matrix |
| [W1-09](cards/W1-09.md) | sonnet | M | W0-06 | Spike to baseline: Cloudflare Workers static assets, scoped rewrites, 404, edge-check harness |
| [W1-10](cards/W1-10.md) | sonnet | S | W0-06 | Public-repo hygiene hooks and Renovate policy |

## W2 · Engine events, sync pipeline, edge/security baseline, first oracle proof

Two short Opus gates open the wave (oracle validation plus core fixtures; spike decisions applied). Then, in parallel: every engine event family and the three paths, the oracle extended to all events without touching the committed core profile, core conformance to the cent, templates and validation, the sync orchestrator and Drive provider on the shared fakes, final per-route headers, the e2e harness and the bundle rules.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W2-01](cards/W2-01.md) | opus | S | W1-02, W1-10 | Opus gate #1: private oracle validation, core fixtures with manifest, CI oracle-diff and conformance jobs |
| [W2-02](cards/W2-02.md) | opus | S | W1-08, W1-09 | Opus gate: CSP/Trusted Types and service-worker decisions (ADR-0021, ADR-0023) applied to shared Angular config |
| [W2-03](cards/W2-03.md) | sonnet | M | W1-01 | Engine events: RateChange (3 policies) and FixedChargeChange |
| [W2-04](cards/W2-04.md) | sonnet | M | W1-01 | Engine events: Prepayment (modes, commission, payoff cap) and AdvanceInstallments |
| [W2-05](cards/W2-05.md) | sonnet | L | W1-01 | Engine: reported-balance anchors, actual payments, three paths, comparison metrics |
| [W2-06](cards/W2-06.md) | sonnet | L | W1-02, W2-01 | Oracle: every event type and the 'full' (~40 loans) profile, core profile untouched |
| [W2-07](cards/W2-07.md) | sonnet | M | W1-01 | Templates (FHA Guatemala v1, Hipotecario simple) and validation against a real balance |
| [W2-08](cards/W2-08.md) | sonnet | M | W1-06, W1-07 | Sync session orchestrator (download -> decrypt -> merge -> purge -> save -> encrypt -> upload) |
| [W2-09](cards/W2-09.md) | sonnet | M | W2-02 | Google Drive SyncProvider (GIS token model, appDataFolder) |
| [W2-10](cards/W2-10.md) | sonnet | M | W2-02 | Final per-route security headers (CSP, Trusted Types, HSTS) |
| [W2-11](cards/W2-11.md) | sonnet | M | W2-02, W1-05 | E2E infrastructure: production build behind wrangler, Chromium + WebKit, axe, probes, Google mock, seeding |
| [W2-12](cards/W2-12.md) | sonnet | S | W2-02 | Bundle composition and budget check (esbuild metafile) |
| [W2-13](cards/W2-13.md) | sonnet | M | W1-01, W2-01 | Core conformance to the cent and core engine fixes |

## W3 · Lock engine correctness + app foundations

Opus commits the full fixture set and triages every discrepancy; the oracle lineage fixes oracle-side items; engine property tests (with a visible quarantine) and goal-seek land. In parallel: design system, UI primitives, shell and errors, data providers, stores and engine facade, storage health, PWA, report model + CSV, the Google Cloud guide, and the Opus CI gates and live Cloudflare deploy.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W3-01](cards/W3-01.md) | opus | M | W2-06, W2-03, W2-04, W2-05, W2-07, W2-13 | Opus gate #2: full fixtures, private re-validation, conformance triage |
| [W3-02](cards/W3-02.md) | sonnet | M | W3-01, W2-03, W2-04, W2-05, W2-13 | Engine property tests (fast-check) with a visible quarantine |
| [W3-03](cards/W3-03.md) | sonnet | M | W3-01, W2-04, W2-05 | Goal-seek: finish-by-date / max-installment, bisection to the cent |
| [W3-04](cards/W3-04.md) | sonnet | S | W3-01 | Oracle maintenance per Opus triage |
| [W3-05](cards/W3-05.md) | sonnet | M | W0-06 | Design system foundations: tokens light/dark, self-hosted fonts, Material M3 compact, Tailwind v4, theme service |
| [W3-06](cards/W3-06.md) | sonnet | M | W0-06 | UI formatting primitives: es-GT money/date/percent pipes, money and date inputs |
| [W3-07](cards/W3-07.md) | sonnet | L | W0-06 | UI ledger table component (libreta style, keyboard grid, editable cells) |
| [W3-08](cards/W3-08.md) | sonnet | M | W0-06 | UI house meter and feedback components (status chip, empty state, banner, confirm, announcer) |
| [W3-09](cards/W3-09.md) | sonnet | M | W2-02 | App shell, navigation and global error handling |
| [W3-10](cards/W3-10.md) | sonnet | S | W1-04, W1-05 | Data layer: adapter providers, clock, ids and device id |
| [W3-11](cards/W3-11.md) | sonnet | M | W1-04 | Data layer: signal stores |
| [W3-12](cards/W3-12.md) | sonnet | M | W2-05, W2-07 | Data layer: engine facade (entities -> domain -> memoized projections) |
| [W3-13](cards/W3-13.md) | sonnet | S | W0-06 | Storage health: Safari ITP banner and persistence status |
| [W3-14](cards/W3-14.md) | sonnet | M | W2-02, W2-11 | PWA: service worker limited to /app per ADR-0023, manifest, update prompt |
| [W3-15](cards/W3-15.md) | sonnet | M | W1-01 | Export: report model and CSV writer |
| [W3-16](cards/W3-16.md) | opus | S | W2-01, W2-10, W2-11, W2-12 | Opus integration: CI gates for e2e, edge, bundle and audit |
| [W3-17](cards/W3-17.md) | opus | M | W2-02, W2-10 | Opus integration: Cloudflare deploy pipeline and build-time Google client ID |
| [W3-18](cards/W3-18.md) | sonnet | S | W2-02 | Google Cloud setup guide (OAuth client, consent screen, domains) |

## W4 · Engine fully conformant + public surface + first app features

An Opus gate regenerates fixtures after oracle maintenance; one engine-lineage card makes every fixture pass to the cent and empties the property quarantine. In parallel: the prerendered public surface (simulator, landing, privacy, 404), the dashboard and loan wizard, the backup and sync services, the Excel and PDF writers, and the pure real-data event forms.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W4-01](cards/W4-01.md) | opus | S | W3-01, W3-04 | Opus gate #3: post-maintenance regeneration and re-validation |
| [W4-02](cards/W4-02.md) | sonnet | L | W4-01, W2-13, W3-02, W3-03 | Engine full conformance (all fixtures) and discrepancy fixes |
| [W4-03](cards/W4-03.md) | sonnet | M | W3-05, W3-06, W2-04, W2-05, W2-11, W2-12 | Public quick simulator (domain-only, zero network and zero storage) |
| [W4-04](cards/W4-04.md) | sonnet | M | W3-05, W3-08, W2-11, W2-12 | Landing page (prerendered hero 'tu casa se va llenando') |
| [W4-05](cards/W4-05.md) | sonnet | S | W3-05, W2-02, W2-11 | Privacy policy page and 404 page |
| [W4-06](cards/W4-06.md) | sonnet | L | W3-06, W3-08, W3-09, W3-10, W3-11, W3-12, W3-13, W2-11 | Dashboard: loan cards with house meter, per-currency totals, status filter, sync/backup status, empty state |
| [W4-07](cards/W4-07.md) | sonnet | L | W3-06, W3-08, W3-10, W3-11, W3-12, W2-07, W2-11 | Loan creation wizard (4 steps) and e2e page object |
| [W4-08](cards/W4-08.md) | sonnet | M | W1-03, W1-07, W3-11 | Data layer: backup service (export/import with migrations, preview, snapshot, undo, encryption) |
| [W4-09](cards/W4-09.md) | sonnet | M | W1-07, W2-08, W2-09, W3-11, W3-17 | Data layer: sync service (lazy Drive provider, passphrase, status) |
| [W4-10](cards/W4-10.md) | sonnet | M | W3-15 | Export: Excel writer (write-excel-file) |
| [W4-11](cards/W4-11.md) | sonnet | M | W3-15 | Export: PDF writer (jsPDF >= 4.2.1 + autotable) |
| [W4-12](cards/W4-12.md) | sonnet | M | W3-06, W3-08 | Real-data event forms (pure, per event family) |

## W5 · Feature screens

Deliver the remaining screens on the proven engine and data layer, each card owning its directory and its own e2e spec: loan detail, ledger table with in-cell scenario abono, real-data timeline, scenario editor with tools, comparison with lazy chart, export menu, and settings for backup and sync.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W5-01](cards/W5-01.md) | sonnet | M | W4-07, W3-08, W3-11, W3-12 | Loan detail: summary, edit, archive/unarchive, mark paid, delete |
| [W5-02](cards/W5-02.md) | sonnet | L | W3-07, W3-10, W3-11, W3-12, W4-07 | Amortization ledger table: views, Real delta, yearly subtotals, keyboard, in-cell scenario abono |
| [W5-03](cards/W5-03.md) | sonnet | M | W4-12, W3-11, W3-12, W4-07 | Real-data timeline with forms, Real delta and inline errors |
| [W5-04](cards/W5-04.md) | sonnet | L | W3-03, W3-11, W3-12, W4-07 | Scenarios editor: CRUD, active scenario, tools (abono, advance N, goal-seek) |
| [W5-05](cards/W5-05.md) | sonnet | M | W3-11, W3-12, W4-07 | Scenario comparison (up to 3) and lazy balance-over-time chart |
| [W5-06](cards/W5-06.md) | sonnet | M | W3-15, W4-10, W4-11 | Export UI: lazy Excel/CSV/PDF menu for table and comparison |
| [W5-07](cards/W5-07.md) | sonnet | M | W4-08, W3-13, W2-11 | Settings: backup status, reminders, JSON import/export (plain/encrypted), storage persistence |
| [W5-08](cards/W5-08.md) | sonnet | M | W4-09, W2-11 | Settings: Google Drive connect/sync/disconnect and passphrase setup/change |

## W6 · Cross-feature journeys, sweeps, documentation

Prove the whole product end to end on Chromium and WebKit under production headers (journeys and export bytes), sweep accessibility, CSP/Trusted Types and leftover stubs across every route in both themes, and write the bilingual README, threat model and operator guides.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W6-01](cards/W6-01.md) | sonnet | M | W3-14, W3-16, W4-03, W4-04, W4-05, W4-06, W5-01, W5-02, W5-03, W5-04, W5-05, W5-06, W5-07, W5-08 | Cross-feature E2E journeys including exports under production headers |
| [W6-02](cards/W6-02.md) | sonnet | M | W3-14, W3-16, W4-03, W4-04, W4-05, W4-06, W5-01, W5-02, W5-03, W5-04, W5-05, W5-06, W5-07, W5-08 | Accessibility, CSP/Trusted Types, Safari-banner and stub-leftover sweeps |
| [W6-03](cards/W6-03.md) | sonnet | M | W3-17, W4-09, W2-10, W4-02 | Bilingual README and threat model |
| [W6-04](cards/W6-04.md) | sonnet | S | W3-17, W4-09, W3-18 | Operator guides: manual Drive test checklist and Cloudflare deploy/rollback |

## W7 · Release

Final security and hygiene review on the deployed site, owner-assisted manual Drive verification, traceability matrix, ADRs brought current, spikes retired, v1.0.0.

| Tarjeta | Ejecutor | Tamaño | Depende de | Título |
|---|---|---|---|---|
| [W7-01](cards/W7-01.md) | opus | M | W6-01, W6-02, W6-03, W6-04, W4-02 | Security and release review, manual Drive verification, traceability, ADR currency, v1.0.0 |

## Contratos congelados en W0

W0 freezes the files below. After W0 any card may read them but none may edit them: docs/plan/frozen-files.json lists them, each entry with editableBy: [card ids], and owns-check rejects an edit by any other card even when the file sits inside a directory the card owns. Changing one takes an Opus contract-change micro-card (registered in docs/plan/plan.json, with the views, cards.json and frozen-files.json regenerated on a branch opus/register-<ID> before the card branch is created), a broadcast to in-flight cards and a rebase.

W0-01, toolchain:
(1) pnpm-workspace.yaml catalogs pinning every planned dependency, including the test-only readers fflate and pdfjs-dist and @types/google.accounts; pnpm-lock.yaml; .npmrc (lifecycle scripts blocked except an allowlist).
(2) Every package.json (root, packages/domain, schema, persistence, sync, export, apps/web, e2e, tools/conformance) with catalog: references, the root scripts and the final subpath exports (@cuotascasa/persistence/memory|dexie|contract, @cuotascasa/sync/crypto|session|google-drive|testing, @cuotascasa/export/model|csv|excel|pdf, @cuotascasa/schema/testing).
(3) tsconfig.base.json path aliases, eslint.config.mjs (boundaries exactly as the ADR-0010 §5 matrix, Date ban in domain, ban on number arithmetic for money), lefthook.yml, .gitleaks.toml, .gitignore.

W0-02, spec:
(4) docs/algorithm.md with stable section ids. It fixes the decimal context [ALG.CONV] (precision 34, ROUND_HALF_EVEN, cents only via HALF_UP_2; r unrounded) and every event semantic, including the derived term [ALG.TERM], anchor re-base and the total order [ALG.EVENTS.ORDER]. It gives closed definitions of Real delta, interestSaved, monthsSaved, netSaving, endDate, totalPaid and yearly subtotals (calendar year of dueDate), plus goal-seek outcomes, the numeric traffic-light thresholds, the closed causes enum and the 'Hipotecario simple' values. Also docs/glossary.md.
(5) docs/specs/algorithm-examples/*.json + INDEX.md: one synthetic worked example for every item of [ALG.PENDING] in docs/algorithm.md, all mapped by INDEX.md; examples with events go in separate JSON files from event-free ones. These are the shared ground truth for both the engine lineage and the oracle lineage.

W0-03, domain and export:
(6) packages/domain/src/types/primitives.ts: branded Money and Rate (decimal strings), LocalDate ('YYYY-MM-DD'), Currency 'GTQ'|'USD', DomainError hierarchy.
(7) types/loan.ts: LoanTerms (principal, termMonths, disbursementDate, firstDueDate, paymentDay number|'END_OF_MONTH', currency, percentage components, fixed charges with effectiveFrom, RoundingProfile 'FHA_GT_V1'|'SIMPLE') and Template {id, version, values}.
(8) types/events.ts: the DomainEvent union (RateChange with its 3 policies, FixedChargeChange, Prepayment with mode and commission, AdvanceInstallments, ReportedBalance, ActualPayment) and the frozen total order key [ALG.EVENTS.ORDER] (k, phase, date, typeRank, id).
(9) types/schedule.ts: ScheduleRow (with a 'paid' flag), Schedule, PathKind, Paths (with cutoffK and realDelta per anchor and per component), ComparisonMetrics (incl. netSaving), YearlySubtotal, GoalSeekRequest, GoalSeekResult (ALREADY_MET | FOUND{amount, metrics, isPayoff} | INFEASIBLE{payoffAmount, reason}, [ALG.GOAL]), TemplateValidationResult.
(10) types/engine.ts: PeriodState per [ALG.TERM] (state after paying installment k including phase 3: balance, i, insuranceRates[], level, roundingProfile, k, term mode and term), EventHandler<T>, EngineContext with an injectable registry and the shared helper signatures levelPayment(B, r, m), remainingTerm(state: PeriodState) and projectCapital(state, n).
(11) events/registry.ts, mapping each event type to its card-owned dir; types not yet implemented map to stubs that throw NotImplementedError('<card id>').
(12) index.ts, the public API: buildSchedule, buildPaths, compareSchedules, yearlySubtotals, goalSeek, listTemplates, instantiateTemplate, deriveFixedCharges, validateAgainstReportedBalance, levelPayment, percentToRate/rateToPercent, money/date helpers.
(13) money/ (incl. decimal-config.ts) and dates/, implemented and tested by Opus.
(14) packages/export/src/report-model.ts (ReportModel, ReportWriter, ExportFormat) and index.ts.

W0-04, schema, persistence, sync and oracle format:
(15) packages/schema/src/:
- common.ts: BaseRecord with id, createdAt, updatedAt, updatedByDevice, deletedAt.
- entities/{loan, loan-event, reported-balance, actual-payment, scenario, settings}.ts: the single source of field names (e.g. Loan.name, Loan.bank; LoanEvent.date, ReportedBalance.date, ActualPayment.paidDate; optional note on ReportedBalance, ActualPayment and LoanEvent), status active|paid|archived, required rateType 'FIXED'|'VARIABLE', templateRef plus copied values, currency locked while any non-deleted LoanEvent, ReportedBalance, ActualPayment or Scenario exists, synced vs device-local settings.
- backup/v1.ts and backup/types.ts: BackupDocument v1 (root accepts synthetic: z.literal(true).optional()), LATEST_VERSION, ImportPreview, BackupError codes.
- oracle/fixture.ts: fixture and manifest schema (synthetic: true literal, profile, seed, generatorVersion, feature tags vs trait tags, incl. lastRow, latePayment, explicitKAnchor, sameKAnchors, zeroRate and zeroInsurance).
- index.ts.
(16) packages/persistence/src/:
- ports.ts: Repository<T>; DataStore with transaction, exportAll incl. tombstones, replaceAll, snapshots, async post-commit subscribe, pendingChanges/markSynced, changesSinceBackup/markBackedUp and meta; Clock with today(): LocalDate (device local time); IdGenerator.
- contract/: the Opus-written runDataStoreContract suite, with list order (createdAt, id).
(17) packages/sync/src/:
- ports.ts: SyncProvider, RemoteFile, LocalDataset, KeyStore, EncryptedEnvelopeV1, SyncStatus, SyncError codes, MergeStats, RecordOrderKey (a tombstone wins a full tie), separate mergeDatasets and purgeTombstones signatures, typed Drive v3 subset.
- testing/drive-fake.ts and testing/gis-fake.ts.
(18) docs/specs/drive-api-subset.md and docs/adr/0024-sync-merge-order.md.
(19) tools/oracle/FORMAT.md (incl. profile composition, trait tags, fixture file naming, the generate/regenerate CLI, the three-line compare output, the --log-line format and the private schema for compare and private-compare), pyproject.toml, .python-version, requirements-dev.txt.

W0-05, Angular:
(20) angular.json, apps/web/src/main*.ts, index.html, app.config.ts, app.config.server.ts, app.routes.ts, app.routes.server.ts and app-area.routes.ts. Of these, angular.json, app.config.ts, app.routes.server.ts and app-area.routes.ts are edited only by the Opus card W2-02.
(21) Every features/*/*.routes.ts, plus the page shells of the split routes: scenarios-page, settings-page and real-data-page. loans.routes.ts maps nuevo to wizard/ and :id to detail/.
(22) data/api.ts, data/tokens.ts, data/provide-app-data.ts. They define LoansStore with create (no anchor) and createWithAnchor, LoanEventsStore, ReportedBalancesStore, PaymentsStore, ScenariosStore with activeScenarioId, SettingsStore, LoanProjectionService with the spec §9 derived values plus cutoffK, per-row paid flags and realDelta per anchor and per component, BackupService with reminderDue, SyncService and StorageHealth with requestPersist. data/api.ts and data/tokens.ts use only import type from packages.
(23) docs/specs/component-contracts.md and one *.contract.spec.ts per cc-* component: cc-quick-simulator, cc-theme-toggle, cc-safari-banner, cc-update-prompt, cc-export-menu, cc-scenario-editor, cc-scenario-compare, cc-settings-backup, cc-settings-sync, cc-real-data-timeline, cc-event-form. Also the rule that every page root keeps data-testid='page-<route-id>'.
(24) apps/web/src/design-contract/: token-names.json and tokens.contract.spec.ts. The token values belong to W3-05.
(25) apps/web/src/app/_patterns/ with docs/specs/angular-patterns.md, plus docs/specs/design-palette.md (frozen after the owner approves the docs/discovery/direccion-visual.md proposal; approval date recorded) and docs/specs/privacy-requirements.md.
(26) apps/web/src/environments/build-constants.ts: the GOOGLE_CLIENT_ID define, changed only by W3-17.

W0-06, process:
(27) docs/plan/cards.json and docs/plan/frozen-files.json (each entry with editableBy: [card ids]), both generated by tools/plan/render_plan.py from docs/plan/plan.json (frozen-files.json from its structured top-level 'frozen_files' section).
(28) tools/owns-check/ rules: frozen files, append-only files, exempt prefixes.
(29) tools/conformance/src/: the harness, the fixture-id grep check and the private-compare CLI.
(30) The initial .github/ workflows. After W0 they are edited only by the Opus cards W2-01, W3-16 and W3-17.

Stub semantics:
- Package stubs throw NotImplementedError('<card id>'). Each stub dir holds a stub.spec.ts, which its owning card deletes when it implements the dir.
- App-level provide* functions and cc-* components are inert: they return safe defaults, keep the page testid and export a CC_STUB marker. W6-02 proves no marker remains in the production build.

## Política de archivos compartidos

Opus-only shared files are everything W0 froze (listed in wave0_contracts and mirrored in docs/plan/frozen-files.json):
- Root and package config: root and every package.json, pnpm-workspace.yaml, pnpm-lock.yaml, .npmrc, .nvmrc, every tsconfig*.json, eslint.config.mjs, the prettier config, the vitest configs, lefthook.yml, .gitleaks.toml, .gitignore.
- Angular wiring: angular.json, apps/web/src/main*.ts, index.html, app.config*.ts, app.routes*.ts, app-area.routes.ts, every *.routes.ts and page shell.
- App contracts: data/api.ts, data/tokens.ts, data/provide-app-data.ts, the component contract specs, design-contract/, _patterns/.
- Engine and verification: packages/domain/src/money/ and dates/, tools/conformance/src/.
- Process and spec: everything under .github/, docs/plan/, CLAUDE.md, docs/algorithm.md, docs/glossary.md, docs/specs/algorithm-examples/.

Rules:
(1) Shared-file changes. A card that needs one stops and asks. Opus then lands a small integration card with its own id, registered in docs/plan/plan.json, with the views, cards.json and frozen-files.json regenerated on a branch opus/register-<ID> before the card branch is created, and merges it before the requesting card continues. The planned Opus gates and integrations are W2-01, W2-02, W3-01, W3-16, W3-17 and W4-01.
(2) Dependencies. No card adds, upgrades or removes one: W0-01 pinned every planned dependency, including the test-only readers. Renovate PRs come from renovate/ branches, are exempt from owns-check, and are reviewed and merged by Opus.
(3) owns-check. It fails a card PR that:
- touches a path outside the card's owns;
- touches any frozen file, even inside a directory the card owns, unless the card is listed in that entry's editableBy;
- makes a non-append change to an append-only file (tools/conformance/enforced-features.json may only gain tags);
- uses an unknown card id.
Each docs/plan/frozen-files.json entry carries editableBy: [card ids]; owns-check allows an edit only by those cards (planned: W2-01, W2-02, W3-01, W3-16, W3-17 and any registered Opus micro-card).
Cards with no transitive dependency between them never share an owns path; this was checked mechanically on the whole plan. A later card takes over a path only when it transitively depends on every earlier owner: W2-13 and then W4-02 take over engine dirs, W2-06 and then W3-04 take over oracle code, and W2-01, W3-01 and W4-01 own the fixtures in turn, and W2-02 takes over ADR-0022 from W1-09.
(4) Imports. A card imports another card's code only through that package's or directory's public exports, and read-only.
(5) Same-wave dependencies. They are allowed only on the short Opus gate or integration cards that open a wave (W2-01, W2-02, W3-01, W4-01). W0 runs as a serial, Opus-only sequence.
(6) Implicit definition of done for every card:
- CI green: lint, typecheck, unit, build, owns-check, gitleaks and audit, plus the conformance, oracle-diff, e2e, edge and bundle gates as they land;
- TDD for logic, and contract specs green;
- only synthetic data, flagged synthetic: true;
- conventional commits from a noreply email, on branch card/<id>-<slug> in worktree .worktrees/<id>;
- Opus review, with merges in dependency order.
(7) Docs. Cards edit only the docs in their owns. ADR numbers 0021–0024 are reserved (0021 and 0023 by W2-02, 0022 drafted by W1-09 and accepted/amended by W2-02, 0024 by W0-04); the next free number is 0025. algorithm.md changes only through Opus (in W3-01 or an on-demand docs micro-card) and is always followed by oracle regeneration.
(8) Lineage isolation. Oracle cards (W1-02, W2-06, W3-04 and any oracle micro-card) run in a git sparse-checkout worktree limited to docs/algorithm.md, docs/glossary.md, docs/specs/algorithm-examples/, docs/specs/conformance-triage.md and tools/oracle/, plus the root loose files, docs/plan/README.md and the card's own docs/plan/cards/<ID>.md (exact command in docs/plan/README.md §3 step 3); they never run pnpm. Engine cards never read tools/oracle/ code; they see fixtures only through the Opus-frozen conformance harness. Opus triages each discrepancy before anyone edits code.
(9) Real loan data. It never enters the repo, CI logs, PRs, issues, screenshots or artifacts. Only Opus touches the real bank table, outside the repo and only if the owner's explicit authorization (date and scope) is recorded in docs/specs/oracle-validation-log.md, using compare tools that print only all rows matched (yes/no), the mismatched-row count and the max diff, never the total row count or any term.
(10) Throughput. Run at most about 6 Sonnet worktrees at once, picking the highest-risk ready cards first, so Opus review keeps up. Defects found late become small fix cards with explicit owns, registered in docs/plan/plan.json, with the views, cards.json and frozen-files.json regenerated on a branch opus/register-<ID> before the card branch is created.

## Riesgos del plan

- Common-mode error: engine and oracle misread algorithm.md the same way. Mitigation: W0-02 worked examples per rule, separate lineages with a sparse-checkout worktree for the oracle, Opus private validation against the real bank table at every gate (W2-01, W3-01, W4-01) and a private TS-engine run before W4-02 merges, both only with the owner's recorded authorization (otherwise the residual risk is logged).
- Engine/oracle discrepancies take longer to resolve than planned. Mitigation: enforced-features keeps CI green; the comparator is Opus-frozen; Opus triages each discrepancy (W3-01) before code changes; oracle and engine fixes are owned (W3-04, W4-02); W4-02 is split by family if there are more than 5; on-demand micro-cards cover late findings.
- Decimal precision or operation-order divergence between decimal.js and Python decimal. Mitigation: the context is frozen in algorithm.md, money/ is implemented by Opus in W0, and both sides assert the context in tests.
- Google Identity Services may be incompatible with Trusted Types or a strict CSP, and Angular prerender may emit inline scripts. Mitigation: W1-08 evidence matrix with automated negative checks, Opus decision in ADR-0021 (fallback: TT report-only on /app; autoCsp or post-build hashes written only into _headers).
- Cloudflare static-assets semantics (rewrite precedence, trailing slash, 404) may differ from expectations. Mitigation: W1-09 spike on wrangler dev --local, edge:check locally and against the live subdomain from W3-17 onward.
- A service worker or adapter code reaching '/' would break the zero-storage landing. Mitigation: data providers in the lazy app-area route, ADR-0023 registration only inside /app, bundle-check forbidding dexie/sync/export in the landing graph, and e2e assertions in W3-14 and W6-02.
- Non-extractable CryptoKey persistence and WebCrypto differ across engines. Mitigation: W1-07 KeyStore tests in Vitest browser mode on Chromium and WebKit; PBKDF2 600k uses a test-only iteration override with the production constant asserted.
- Clock skew and resurrection after the 90-day purge undermine last-writer-wins. Mitigation: monotonic per-device stamping, deterministic tie-break, prev-copy backup, documented as residual risk in ADR-0024 and the threat model.
- Safari ITP can wipe local data after 7 days without visits. Mitigation: persistent banner, backup reminders (>30 days or >20 changes), persist() request and Drive sync; data loss cannot be fully prevented.
- Bleeding-edge stack (Angular 22.2 Signal Forms and zoneless SSR, TS 6, Vitest 5) may have gaps or stale model knowledge. Mitigation: W0 builds the whole toolchain and freezes golden patterns before any card starts; exact pins; Renovate with a minimum release age.
- Inert app-level stubs could hide an unimplemented provider until late. Mitigation: CC_STUB marker checked in W6-02, plus per-feature e2e specs against real services.
- The e2e seeding helper is coupled to the Dexie schema v1. Mitigation: it reads the exported DEXIE_SCHEMA_V1 constant; a schema bump requires an Opus micro-card that updates the helper.
- Contract drift across 72 cards. Mitigation: frozen files enforced by owns-check, contract specs per component, data-testid page contract, contract-change micro-card protocol, merges in dependency order.
- Opus review and merge throughput becomes the bottleneck (72 cards, 14 Opus cards). Mitigation: cap of about 6 concurrent Sonnet worktrees, small Opus gates, acceptance criteria verifiable in CI.
- Real loan data leaking into the public repo through fixtures, logs, screenshots or artifacts. Mitigation: hooks (denylist outside the repo, synthetic-flag, noreply) land in W1-10 before the first fixture, push protection is on from W0-06, compare tools print only all-rows-matched, the mismatched-row count and the max diff, and artifacts are kept only on failure and are synthetic.
- Money precision regressions through accidental JS number use. Mitigation: branded types, lint bans, string-only formatting in ui/format, and number conversion confined to the Excel writer with a round-trip test.
- Google OAuth consent publishing or verification delays block real Drive use. Mitigation: privacy page in W4-05, Google Cloud guide in W3-18, owner actions tracked and re-verified in W7-01.

## Fundamento

**Base.** The final plan starts from 'riesgo', which all three reviewers rated best. It had the fewest owns collisions and was the only design that kept '/' storage-free: data providers live in a lazily loaded app-area route, and the service worker is scoped to /app. It also:
- puts hygiene hooks before the first fixture;
- runs the CSP/GIS and Cloudflare spikes before implementation;
- injects the client ID with --define, so ngsw hashes stay valid;
- gates conformance with enforced-features.

**Grafts from 'paralelo':**
- Opus implements money/ and dates/ in W0. The riskiest rounding code and the decimal context are not left to Sonnet, and the engine core card gets smaller.
- Root provider calls go to stub functions in card-owned dirs (error handling, theme, PWA, storage health), so mid-build integration is rare.
- The persistence contract suite is frozen in W0, which lets the Dexie adapter move to W1 alongside the memory adapter.
- Feature dirs are split into subdirs.

**Grafts from 'rebanada':**
- owns-check rejects frozen files even inside owned dirs, and exempts non-card branches.
- A traceability matrix gates the release.

**Fixes for every high and medium review item:**
- Oracle-diff deadlock: committed profiles are listed in manifest.json with per-loan sub-seeds. W2-06 must leave 'core' byte-identical. A generatorVersion rule turns a deliberate oracle change into 'regeneration pending' until the next Opus gate.
- Property-test deadlock: W3-02 keeps a visible quarantine, which W4-02 empties because it owns that dir.
- No owner for core fixes in W2-W3: W2-13 owns schedule/ and turns on 'core'.
- No owner for oracle fixes after W2: W3-01 triages every discrepancy, W3-04 fixes the oracle-side items, and W4-01 regenerates.
- Conflict of interest in conformance:
  - Opus writes the comparator in W0 and it stays frozen.
  - enforced-features is append-only.
  - Fixture ids are banned from src.
  - Every fix cites algorithm.md.
  - W4-02 is split by family if needed.
- Private validation against the real bank table is conditional: at W2-01, W3-01, W4-01 and before W4-02 merges it runs only if the owner's explicit authorization (date and scope) is recorded in docs/specs/oracle-validation-log.md; otherwise the gate logs 'validación privada: no autorizada' and records the residual risk (from W3-01 also in conformance-triage.md). Log lines never carry the total row count or any loan term.
- Missing spec inputs: W0-02 adds a worked example per rule, the decimal context, and closed definitions (thresholds, causes, metrics, yearly subtotals).
- Missing root integration, define default, manifest link and stats JSON: all handled in W0-05.
- Stub tests breaking when stubs are replaced: the data-testid page contract.
- Drive mock divergence: one Opus fake is shared by the provider tests and the e2e.
- Export e2e without a host page: moved to the W6-01 journeys.
- Spike decisions: Opus writes ADR-0021 and ADR-0023 in W2-02 from Sonnet's evidence.
- Engine formulas: EngineContext helpers keep event cards from re-implementing them.
- Merge semantics: ADR-0024 defines the total order, separates purge, and documents resurrection after purge.
- Missing test readers: pinned in W0.
- Angular 22 APIs: golden patterns are frozen in W0.
- Oversized cards: the engine core, the data layer and the real-data screen are split.
- Late protections: push protection plus the README/SECURITY stub move to W0, and the Google Cloud guide to W3.

**Parallelism.** It comes from frozen contracts, inert stubs, per-feature route files and per-feature e2e specs. W1 has 10 cards ready at once; they run in batches of ≤ 6 Sonnet. W2-W5 each have 8-15 cards ready at once behind at most one or two short Opus gates, also run in batches of ≤ 6 Sonnet.

**Validation.** A script confirmed:
- every card id is unique;
- none of the 1,606 parallel card pairs has overlapping owns;
- R1-R28 are all covered;
- the release card depends on every other card.
