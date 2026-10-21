# Trazabilidad de v1: requisitos ↔ tarjetas fusionadas ↔ pruebas

<!-- Generado por docs/release/traceability.mjs. No editar a mano: node docs/release/traceability.mjs -->

Fuentes: `docs/plan/plan.json` (tarjetas y requisitos), `docs/plan/traceability.md` (descripciones), los asuntos
de `git log` (merge y número de PR) y `git ls-files` (archivos de prueba bajo los `owns` de cada tarjeta).

Estados: `#N` es el PR que fusionó la tarjeta (las de W0 se fusionaron en local, «sin PR»); «PR de release» es esta
tarjeta (W7-01); «pendiente» es una tarjeta de v1 aún sin fusionar, que figura en `PENDING_RELEASE_CARDS` y debe
quedar vacía antes del tag; «cerrada sin cambios» es una tarjeta que se cerró sin merge. Cada requisito necesita al
menos una tarjeta fusionada (o la de release) con pruebas; lo comprueba `docs/release/release-docs.spec.mjs`.

| Requisito | Descripción | Tarjetas |
|---|---|---|
| R1 | Landing prerenderizada + simulador público (cero red y cero almacenamiento) | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W2-12](../plan/cards/W2-12.md) · #25 · 1 prueba<br>[W4-03](../plan/cards/W4-03.md) · #68 · 7 pruebas<br>[W4-04](../plan/cards/W4-04.md) · #56 · 3 pruebas<br>[W6-01](../plan/cards/W6-01.md) · #89 · 2 pruebas |
| R2 | Página de privacidad | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W4-05](../plan/cards/W4-05.md) · #59 · 4 pruebas<br>[W7-04](../plan/cards/W7-04.md) · #99 · 7 pruebas |
| R3 | Núcleo del motor (cuota nivelada, reparto del cargo, cargos fijos, última cuota, fechas, día de pago) | [W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W0-03](../plan/cards/W0-03.md) · sin PR · 53 pruebas<br>[W1-01](../plan/cards/W1-01.md) · #11 · 7 pruebas<br>[W1-02](../plan/cards/W1-02.md) · #12 · 8 pruebas<br>[W2-13](../plan/cards/W2-13.md) · #22 · 7 pruebas<br>[W3-02](../plan/cards/W3-02.md) · #50 · 2 pruebas<br>[W4-02](../plan/cards/W4-02.md) · #70 · 25 pruebas |
| R4 | Línea de tiempo de eventos (cambio de tasa con 3 políticas, cargos fijos, abonos con modo y comisión, adelantar N, anclas, pagos reales) | [W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W2-03](../plan/cards/W2-03.md) · #19 · 3 pruebas<br>[W2-04](../plan/cards/W2-04.md) · #20 · 3 pruebas<br>[W2-05](../plan/cards/W2-05.md) · #18 · 5 pruebas<br>[W2-06](../plan/cards/W2-06.md) · #24 · 8 pruebas<br>[W3-02](../plan/cards/W3-02.md) · #50 · 2 pruebas<br>[W4-02](../plan/cards/W4-02.md) · #70 · 25 pruebas<br>[W4-12](../plan/cards/W4-12.md) · #65 · 3 pruebas<br>[W5-03](../plan/cards/W5-03.md) · #80 · 4 pruebas |
| R5 | Tres caminos + métricas de comparación | [W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W2-05](../plan/cards/W2-05.md) · #18 · 5 pruebas<br>[W3-12](../plan/cards/W3-12.md) · #42 · 4 pruebas<br>[W4-02](../plan/cards/W4-02.md) · #70 · 25 pruebas<br>[W5-01](../plan/cards/W5-01.md) · #77 · 5 pruebas<br>[W5-05](../plan/cards/W5-05.md) · #82 · 7 pruebas |
| R6 | Búsqueda por meta | [W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W3-03](../plan/cards/W3-03.md) · #51 · 3 pruebas<br>[W4-02](../plan/cards/W4-02.md) · #70 · 25 pruebas<br>[W5-04](../plan/cards/W5-04.md) · #85 · 4 pruebas |
| R7 | Validación de plantilla contra saldo real | [W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W2-07](../plan/cards/W2-07.md) · #16 · 2 pruebas<br>[W3-12](../plan/cards/W3-12.md) · #42 · 4 pruebas<br>[W4-07](../plan/cards/W4-07.md) · #67 · 4 pruebas |
| R8 | Plantillas (FHA Guatemala v1, Hipotecario simple) con copia editable | [W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W2-07](../plan/cards/W2-07.md) · #16 · 2 pruebas<br>[W4-07](../plan/cards/W4-07.md) · #67 · 4 pruebas |
| R9 | Modelo de datos + esquemas zod | [W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W1-03](../plan/cards/W1-03.md) · #8 · 4 pruebas |
| R10 | Puerto de persistencia + adaptadores memoria y Dexie + suite de contrato + persist() | [W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W1-04](../plan/cards/W1-04.md) · #6 · 1 prueba<br>[W1-05](../plan/cards/W1-05.md) · #9 · 2 pruebas<br>[W3-10](../plan/cards/W3-10.md) · #34 · 1 prueba<br>[W3-11](../plan/cards/W3-11.md) · #36 · 1 prueba<br>[W3-13](../plan/cards/W3-13.md) · #37 · 4 pruebas<br>[W5-07](../plan/cards/W5-07.md) · #79 · 4 pruebas |
| R11 | Respaldo JSON con migraciones, vista previa, instantánea, deshacer y cifrado opcional | [W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W1-03](../plan/cards/W1-03.md) · #8 · 4 pruebas<br>[W1-07](../plan/cards/W1-07.md) · #13 · 5 pruebas<br>[W4-08](../plan/cards/W4-08.md) · #60 · 3 pruebas<br>[W5-07](../plan/cards/W5-07.md) · #79 · 4 pruebas<br>[W6-01](../plan/cards/W6-01.md) · #89 · 2 pruebas<br>[W7-03](../plan/cards/W7-03.md) · #98 · 8 pruebas |
| R12 | Sincronización con Google Drive (merge, borrados, copia previa, estado offline, revocar, cifrado con frase, clave por dispositivo, cambiar frase) | [W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W1-06](../plan/cards/W1-06.md) · #3 · 2 pruebas<br>[W1-07](../plan/cards/W1-07.md) · #13 · 5 pruebas<br>[W1-08](../plan/cards/W1-08.md) · #14 · 0 pruebas<br>[W2-08](../plan/cards/W2-08.md) · #21 · 1 prueba<br>[W2-09](../plan/cards/W2-09.md) · #28 · 3 pruebas<br>[W3-18](../plan/cards/W3-18.md) · #43 · 0 pruebas<br>[W4-09](../plan/cards/W4-09.md) · #71 · 4 pruebas<br>[W5-08](../plan/cards/W5-08.md) · #84 · 4 pruebas<br>[W6-04](../plan/cards/W6-04.md) · #88 · 0 pruebas<br>[W7-03](../plan/cards/W7-03.md) · #98 · 8 pruebas<br>[W7-04](../plan/cards/W7-04.md) · #99 · 7 pruebas |
| R13 | Dashboard | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W3-08](../plan/cards/W3-08.md) · #38 · 7 pruebas<br>[W3-09](../plan/cards/W3-09.md) · #41 · 3 pruebas<br>[W3-12](../plan/cards/W3-12.md) · #42 · 4 pruebas<br>[W4-06](../plan/cards/W4-06.md) · #64 · 3 pruebas |
| R14 | Asistente de alta + edición + archivar/eliminar | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W3-11](../plan/cards/W3-11.md) · #36 · 1 prueba<br>[W4-07](../plan/cards/W4-07.md) · #67 · 4 pruebas<br>[W5-01](../plan/cards/W5-01.md) · #77 · 5 pruebas |
| R15 | Tabla de amortización (vistas, Real Δ, subtotales anuales, teclado, abono en celda al escenario) | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W3-07](../plan/cards/W3-07.md) · #32 · 1 prueba<br>[W5-02](../plan/cards/W5-02.md) · #87 · 4 pruebas |
| R16 | Pantalla de datos reales | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W4-12](../plan/cards/W4-12.md) · #65 · 3 pruebas<br>[W5-03](../plan/cards/W5-03.md) · #80 · 4 pruebas |
| R17 | Proyecciones + comparación + gráfica | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W5-04](../plan/cards/W5-04.md) · #85 · 4 pruebas<br>[W5-05](../plan/cards/W5-05.md) · #82 · 7 pruebas |
| R18 | Ajustes (recordatorios de respaldo, import/export, Drive, frase, persistencia, aviso Safari) | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W3-13](../plan/cards/W3-13.md) · #37 · 4 pruebas<br>[W4-06](../plan/cards/W4-06.md) · #64 · 3 pruebas<br>[W4-08](../plan/cards/W4-08.md) · #60 · 3 pruebas<br>[W5-07](../plan/cards/W5-07.md) · #79 · 4 pruebas<br>[W5-08](../plan/cards/W5-08.md) · #84 · 4 pruebas<br>[W6-02](../plan/cards/W6-02.md) · #91 · 3 pruebas<br>[W7-04](../plan/cards/W7-04.md) · #99 · 7 pruebas |
| R19 | Exportar Excel/CSV/PDF (carga diferida) | [W0-03](../plan/cards/W0-03.md) · sin PR · 53 pruebas<br>[W2-12](../plan/cards/W2-12.md) · #25 · 1 prueba<br>[W3-15](../plan/cards/W3-15.md) · #40 · 2 pruebas<br>[W4-10](../plan/cards/W4-10.md) · #55 · 1 prueba<br>[W4-11](../plan/cards/W4-11.md) · #54 · 1 prueba<br>[W5-06](../plan/cards/W5-06.md) · #83 · 2 pruebas<br>[W6-01](../plan/cards/W6-01.md) · #89 · 2 pruebas |
| R20 | PWA offline + aviso de actualización | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W2-02](../plan/cards/W2-02.md) · #23 · 3 pruebas<br>[W3-14](../plan/cards/W3-14.md) · #46 · 9 pruebas |
| R21 | Sistema de diseño (fuentes autoalojadas, tokens claro/oscuro, Material compacto, pipes es-GT, accesibilidad AA) | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W3-05](../plan/cards/W3-05.md) · #33 · 6 pruebas<br>[W3-06](../plan/cards/W3-06.md) · #35 · 4 pruebas<br>[W3-07](../plan/cards/W3-07.md) · #32 · 1 prueba<br>[W3-08](../plan/cards/W3-08.md) · #38 · 7 pruebas<br>[W3-09](../plan/cards/W3-09.md) · #41 · 3 pruebas<br>[W4-03](../plan/cards/W4-03.md) · #68 · 7 pruebas<br>[W4-04](../plan/cards/W4-04.md) · #56 · 3 pruebas<br>[W6-02](../plan/cards/W6-02.md) · #91 · 3 pruebas |
| R22 | Seguridad (CSP, Trusted Types, política de dependencias) | [W0-01](../plan/cards/W0-01.md) · sin PR · 10 pruebas<br>[W0-06](../plan/cards/W0-06.md) · sin PR · 12 pruebas<br>[W1-07](../plan/cards/W1-07.md) · #13 · 5 pruebas<br>[W1-08](../plan/cards/W1-08.md) · #14 · 0 pruebas<br>[W1-09](../plan/cards/W1-09.md) · #10 · 4 pruebas<br>[W1-10](../plan/cards/W1-10.md) · #7 · 9 pruebas<br>[W2-02](../plan/cards/W2-02.md) · #23 · 3 pruebas<br>[W2-09](../plan/cards/W2-09.md) · #28 · 3 pruebas<br>[W2-10](../plan/cards/W2-10.md) · #29 · 3 pruebas<br>[W3-16](../plan/cards/W3-16.md) · #47 · 0 pruebas<br>[W6-02](../plan/cards/W6-02.md) · #91 · 3 pruebas<br>[W7-01](../plan/cards/W7-01.md) · PR de release · 1 prueba |
| R23 | Higiene de repo público (gitleaks, gitignore, denylist local, noreply, push protection, client ID al compilar) | [W0-01](../plan/cards/W0-01.md) · sin PR · 10 pruebas<br>[W0-06](../plan/cards/W0-06.md) · sin PR · 12 pruebas<br>[W1-10](../plan/cards/W1-10.md) · #7 · 9 pruebas<br>[W2-01](../plan/cards/W2-01.md) · #17 · 0 pruebas<br>[W3-17](../plan/cards/W3-17.md) · #49 · 2 pruebas<br>[W7-01](../plan/cards/W7-01.md) · PR de release · 1 prueba<br>[W7-02](../plan/cards/W7-02.md) · #97 · 3 pruebas |
| R24 | Infraestructura de pruebas (oráculo, fixtures sintéticos, diff en CI, propiedades, contrato, e2e Chromium+WebKit, axe, presupuestos, owns-check) | [W0-01](../plan/cards/W0-01.md) · sin PR · 10 pruebas<br>[W0-02](../plan/cards/W0-02.md) · sin PR · 0 pruebas<br>[W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W0-06](../plan/cards/W0-06.md) · sin PR · 12 pruebas<br>[W1-02](../plan/cards/W1-02.md) · #12 · 8 pruebas<br>[W1-03](../plan/cards/W1-03.md) · #8 · 4 pruebas<br>[W1-04](../plan/cards/W1-04.md) · #6 · 1 prueba<br>[W1-06](../plan/cards/W1-06.md) · #3 · 2 pruebas<br>[W2-01](../plan/cards/W2-01.md) · #17 · 0 pruebas<br>[W2-06](../plan/cards/W2-06.md) · #24 · 8 pruebas<br>[W2-11](../plan/cards/W2-11.md) · #27 · 5 pruebas<br>[W2-12](../plan/cards/W2-12.md) · #25 · 1 prueba<br>[W2-13](../plan/cards/W2-13.md) · #22 · 7 pruebas<br>[W3-01](../plan/cards/W3-01.md) · #48 · 0 pruebas<br>[W3-02](../plan/cards/W3-02.md) · #50 · 2 pruebas<br>[W3-04](../plan/cards/W3-04.md) · cerrada sin cambios<br>[W3-16](../plan/cards/W3-16.md) · #47 · 0 pruebas<br>[W4-01](../plan/cards/W4-01.md) · #57 · 0 pruebas<br>[W4-02](../plan/cards/W4-02.md) · #70 · 25 pruebas<br>[W6-01](../plan/cards/W6-01.md) · #89 · 2 pruebas<br>[W6-02](../plan/cards/W6-02.md) · #91 · 3 pruebas<br>[W7-02](../plan/cards/W7-02.md) · #97 · 3 pruebas |
| R25 | CI/CD + despliegue en Cloudflare con rewrites acotados y 404 | [W0-05](../plan/cards/W0-05.md) · sin PR · 115 pruebas<br>[W0-06](../plan/cards/W0-06.md) · sin PR · 12 pruebas<br>[W1-09](../plan/cards/W1-09.md) · #10 · 4 pruebas<br>[W2-02](../plan/cards/W2-02.md) · #23 · 3 pruebas<br>[W3-16](../plan/cards/W3-16.md) · #47 · 0 pruebas<br>[W3-17](../plan/cards/W3-17.md) · #49 · 2 pruebas<br>[W4-05](../plan/cards/W4-05.md) · #59 · 4 pruebas<br>[W6-04](../plan/cards/W6-04.md) · #88 · 0 pruebas<br>[W7-01](../plan/cards/W7-01.md) · PR de release · 1 prueba |
| R26 | Documentación (README bilingüe, modelo de amenazas, guía de Google Cloud, checklist manual de Drive, ADRs al día) | [W3-18](../plan/cards/W3-18.md) · #43 · 0 pruebas<br>[W6-03](../plan/cards/W6-03.md) · #90 · 0 pruebas<br>[W6-04](../plan/cards/W6-04.md) · #88 · 0 pruebas<br>[W7-01](../plan/cards/W7-01.md) · PR de release · 1 prueba |
| R27 | Multimoneda por préstamo GTQ/USD sin mezclar; totales por moneda | [W0-03](../plan/cards/W0-03.md) · sin PR · 53 pruebas<br>[W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W1-01](../plan/cards/W1-01.md) · #11 · 7 pruebas<br>[W2-05](../plan/cards/W2-05.md) · #18 · 5 pruebas<br>[W3-06](../plan/cards/W3-06.md) · #35 · 4 pruebas<br>[W3-11](../plan/cards/W3-11.md) · #36 · 1 prueba<br>[W3-12](../plan/cards/W3-12.md) · #42 · 4 pruebas<br>[W3-15](../plan/cards/W3-15.md) · #40 · 2 pruebas<br>[W4-06](../plan/cards/W4-06.md) · #64 · 3 pruebas<br>[W4-07](../plan/cards/W4-07.md) · #67 · 4 pruebas<br>[W4-10](../plan/cards/W4-10.md) · #55 · 1 prueba |
| R28 | Estado del préstamo activo/pagado/archivado | [W0-04](../plan/cards/W0-04.md) · sin PR · 39 pruebas<br>[W3-11](../plan/cards/W3-11.md) · #36 · 1 prueba<br>[W3-12](../plan/cards/W3-12.md) · #42 · 4 pruebas<br>[W4-06](../plan/cards/W4-06.md) · #64 · 3 pruebas<br>[W5-01](../plan/cards/W5-01.md) · #77 · 5 pruebas |

## Pruebas por tarjeta

Solo las tarjetas fusionadas y la de release.

### W0-01

- `tools/catalog-check/check.spec.ts`
- `tools/hygiene/ci/ci-workflow.spec.ts`
- `tools/hygiene/ci/noreply-range.spec.ts`
- `tools/hygiene/ci/synthetic-flag-ci.spec.ts`
- `tools/hygiene/commit-msg.spec.ts`
- `tools/hygiene/denylist.spec.ts`
- `tools/hygiene/gitignore.spec.ts`
- `tools/hygiene/noreply.spec.ts`
- `tools/hygiene/renovate.spec.ts`
- `tools/hygiene/synthetic-flag.spec.ts`

### W0-03

- `packages/domain/src/dates/local-date.spec.ts`
- `packages/domain/src/dates/payment-day.spec.ts`
- `packages/domain/src/engine-context.spec.ts`
- `packages/domain/src/events/actual-payment/actual-payment.spec.ts`
- `packages/domain/src/events/advance-installments/advance-installments.spec.ts`
- `packages/domain/src/events/fixed-charge-change/fixed-charge-change.spec.ts`
- `packages/domain/src/events/prepayment/examples.spec.ts`
- `packages/domain/src/events/prepayment/prepayment.spec.ts`
- `packages/domain/src/events/rate-change/no-own-formulas.spec.ts`
- `packages/domain/src/events/rate-change/rate-change.spec.ts`
- `packages/domain/src/events/registry.spec.ts`
- `packages/domain/src/events/reported-balance/reported-balance.spec.ts`
- `packages/domain/src/goal-seek/goal-seek.spec.ts`
- `packages/domain/src/goal-seek/properties.spec.ts`
- `packages/domain/src/goal-seek/throw-band.spec.ts`
- `packages/domain/src/index.spec.ts`
- `packages/domain/src/money/arithmetic.spec.ts`
- `packages/domain/src/money/decimal-config.spec.ts`
- `packages/domain/src/money/money.spec.ts`
- `packages/domain/src/money/rate.spec.ts`
- `packages/domain/src/paths/build-paths.spec.ts`
- `packages/domain/src/paths/compare.spec.ts`
- `packages/domain/src/paths/examples.spec.ts`
- `packages/domain/src/schedule/amounts.spec.ts`
- `packages/domain/src/schedule/examples.spec.ts`
- `packages/domain/src/schedule/level.spec.ts`
- `packages/domain/src/schedule/loop.spec.ts`
- `packages/domain/src/schedule/project.spec.ts`
- `packages/domain/src/schedule/properties.spec.ts`
- `packages/domain/src/schedule/yearly.spec.ts`
- `packages/domain/src/stub.spec.ts`
- `packages/domain/src/templates/templates.spec.ts`
- `packages/domain/src/types/events.spec.ts`
- `packages/domain/src/types/loan.spec.ts`
- `packages/domain/src/types/primitives.spec.ts`
- `packages/domain/src/types/schedule.spec.ts`
- `packages/domain/src/validation/validation.spec.ts`
- `packages/domain/test/contracts/decimal-isolation.spec.ts`
- `packages/domain/test/contracts/engine.test-d.ts`
- `packages/domain/test/contracts/events.test-d.ts`
- `packages/domain/test/contracts/forwarding.spec.ts`
- `packages/domain/test/contracts/loan.test-d.ts`
- `packages/domain/test/contracts/primitives.test-d.ts`
- `packages/domain/test/contracts/public-api.test-d.ts`
- `packages/domain/test/contracts/schedule.test-d.ts`
- `packages/domain/test/properties/invariants.spec.ts`
- `packages/domain/test/properties/quarantine.spec.ts`
- `packages/export/src/csv/csv.spec.ts`
- `packages/export/src/excel/excel.spec.ts`
- `packages/export/src/model/model.spec.ts`
- `packages/export/src/pdf/pdf.spec.ts`
- `packages/export/src/report-model.spec.ts`
- `packages/export/src/report-model.test-d.ts`

### W0-04

- `packages/persistence/src/contract/contract.spec.ts`
- `packages/persistence/src/contract/index.spec.ts`
- `packages/persistence/src/contract/registry.spec.ts`
- `packages/persistence/src/dexie/contract.spec.ts`
- `packages/persistence/src/dexie/store.spec.ts`
- `packages/persistence/src/memory/memory.spec.ts`
- `packages/persistence/src/ports.spec.ts`
- `packages/schema/src/backup/backup.spec.ts`
- `packages/schema/src/codec/codec.spec.ts`
- `packages/schema/src/codec/fixtures.spec.ts`
- `packages/schema/src/common.spec.ts`
- `packages/schema/src/entities/actual-payment.spec.ts`
- `packages/schema/src/entities/loan-event.spec.ts`
- `packages/schema/src/entities/loan.spec.ts`
- `packages/schema/src/entities/registry.spec.ts`
- `packages/schema/src/entities/reported-balance.spec.ts`
- `packages/schema/src/entities/scenario.spec.ts`
- `packages/schema/src/entities/settings.spec.ts`
- `packages/schema/src/errors.spec.ts`
- `packages/schema/src/index.spec.ts`
- `packages/schema/src/jitless.spec.ts`
- `packages/schema/src/migrations/migrations.spec.ts`
- `packages/schema/src/oracle/fixture.spec.ts`
- `packages/schema/src/testing/arbitraries.spec.ts`
- `packages/sync/src/crypto/base64url.spec.ts`
- `packages/sync/src/crypto/crypto.browser.spec.ts`
- `packages/sync/src/crypto/crypto.spec.ts`
- `packages/sync/src/crypto/key-store.spec.ts`
- `packages/sync/src/crypto/repo-scan.spec.ts`
- `packages/sync/src/google-drive/gis-loader.spec.ts`
- `packages/sync/src/google-drive/provider.edge.spec.ts`
- `packages/sync/src/google-drive/provider.spec.ts`
- `packages/sync/src/merge/merge.spec.ts`
- `packages/sync/src/merge/purge.spec.ts`
- `packages/sync/src/ports.spec.ts`
- `packages/sync/src/session/session.spec.ts`
- `packages/sync/src/testing/drive-fake.spec.ts`
- `packages/sync/src/testing/gis-fake.spec.ts`
- `packages/sync/src/testing/index.spec.ts`

### W0-05

- `apps/web/src/app/_patterns/signal-forms-control/digits-input.component.spec.ts`
- `apps/web/src/app/_patterns/signal-store/notes-store.spec.ts`
- `apps/web/src/app/_patterns/two-step-form/two-step-form.component.spec.ts`
- `apps/web/src/app/_patterns/zoneless-component/installment-counter.component.spec.ts`
- `apps/web/src/app/app.config.spec.ts`
- `apps/web/src/app/app.routes.spec.ts`
- `apps/web/src/app/core/errors/app-error-handler.spec.ts`
- `apps/web/src/app/core/errors/error-toast.component.spec.ts`
- `apps/web/src/app/core/pwa/app-url.spec.ts`
- `apps/web/src/app/core/pwa/ngsw.dist.spec.ts`
- `apps/web/src/app/core/pwa/provide-app-pwa.spec.ts`
- `apps/web/src/app/core/pwa/pwa-runtime.spec.ts`
- `apps/web/src/app/core/pwa/pwa-update.service.spec.ts`
- `apps/web/src/app/core/pwa/sw-registrar.spec.ts`
- `apps/web/src/app/core/pwa/update-prompt.component.spec.ts`
- `apps/web/src/app/core/pwa/update-prompt.contract.spec.ts`
- `apps/web/src/app/core/shell/app-shell.component.spec.ts`
- `apps/web/src/app/core/storage-health/safari-banner.component.spec.ts`
- `apps/web/src/app/core/storage-health/safari-banner.contract.spec.ts`
- `apps/web/src/app/core/storage-health/safari-detect.spec.ts`
- `apps/web/src/app/core/storage-health/storage-health.service.spec.ts`
- `apps/web/src/app/core/theme/theme-toggle.component.spec.ts`
- `apps/web/src/app/core/theme/theme-toggle.contract.spec.ts`
- `apps/web/src/app/core/theme/theme.service.spec.ts`
- `apps/web/src/app/data/api.spec.ts`
- `apps/web/src/app/data/backup/backup-size-cap.spec.ts`
- `apps/web/src/app/data/backup/backup-state.spec.ts`
- `apps/web/src/app/data/backup/provide-backup.spec.ts`
- `apps/web/src/app/data/data-boundary.spec.ts`
- `apps/web/src/app/data/device/preload.spec.ts`
- `apps/web/src/app/data/device/provide-device-data.spec.ts`
- `apps/web/src/app/data/engine/derive.spec.ts`
- `apps/web/src/app/data/engine/loan-projection-service.spec.ts`
- `apps/web/src/app/data/engine/map-entities.spec.ts`
- `apps/web/src/app/data/engine/provide-engine-facade.spec.ts`
- `apps/web/src/app/data/provide-app-data.spec.ts`
- `apps/web/src/app/data/providers/provide-data-stores.spec.ts`
- `apps/web/src/app/data/stores/stores.spec.ts`
- `apps/web/src/app/data/sync/drive-sync-service.spec.ts`
- `apps/web/src/app/data/sync/local-dataset.spec.ts`
- `apps/web/src/app/data/sync/provide-sync.spec.ts`
- `apps/web/src/app/data/sync/sync-status-text.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard-model.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard-page.component.spec.ts`
- `apps/web/src/app/features/export/export-menu.component.spec.ts`
- `apps/web/src/app/features/export/export-menu.contract.spec.ts`
- `apps/web/src/app/features/loans/detail/delete-loan-dialog.component.spec.ts`
- `apps/web/src/app/features/loans/detail/loan-detail-model.spec.ts`
- `apps/web/src/app/features/loans/detail/loan-detail-page.component.spec.ts`
- `apps/web/src/app/features/loans/detail/loan-edit-form.component.spec.ts`
- `apps/web/src/app/features/loans/wizard/loan-wizard-page.component.spec.ts`
- `apps/web/src/app/features/loans/wizard/wizard-model.spec.ts`
- `apps/web/src/app/features/loans/wizard/wizard-rules.spec.ts`
- `apps/web/src/app/features/real-data/forms/event-form.component.spec.ts`
- `apps/web/src/app/features/real-data/forms/event-form.contract.spec.ts`
- `apps/web/src/app/features/real-data/forms/event-form.logic.spec.ts`
- `apps/web/src/app/features/real-data/timeline/real-data-timeline.component.spec.ts`
- `apps/web/src/app/features/real-data/timeline/real-data-timeline.contract.spec.ts`
- `apps/web/src/app/features/real-data/timeline/timeline-model.spec.ts`
- `apps/web/src/app/features/scenarios/compare/chart-palette.spec.ts`
- `apps/web/src/app/features/scenarios/compare/chart-series.spec.ts`
- `apps/web/src/app/features/scenarios/compare/compare-model.spec.ts`
- `apps/web/src/app/features/scenarios/compare/compare-sources.spec.ts`
- `apps/web/src/app/features/scenarios/compare/scenario-compare.component.spec.ts`
- `apps/web/src/app/features/scenarios/compare/scenario-compare.contract.spec.ts`
- `apps/web/src/app/features/scenarios/editor/scenario-editor.component.spec.ts`
- `apps/web/src/app/features/scenarios/editor/scenario-editor.contract.spec.ts`
- `apps/web/src/app/features/scenarios/editor/scenario-editor.logic.spec.ts`
- `apps/web/src/app/features/schedule/scenario-abono.spec.ts`
- `apps/web/src/app/features/schedule/schedule-model.spec.ts`
- `apps/web/src/app/features/schedule/schedule-page.component.spec.ts`
- `apps/web/src/app/features/settings/backup/backup-model.spec.ts`
- `apps/web/src/app/features/settings/backup/settings-backup.component.spec.ts`
- `apps/web/src/app/features/settings/backup/settings-backup.contract.spec.ts`
- `apps/web/src/app/features/settings/device/settings-device.component.spec.ts`
- `apps/web/src/app/features/settings/sync/passphrase-strength.spec.ts`
- `apps/web/src/app/features/settings/sync/settings-sync.component.spec.ts`
- `apps/web/src/app/features/settings/sync/settings-sync.contract.spec.ts`
- `apps/web/src/app/public/landing/landing-page.component.spec.ts`
- `apps/web/src/app/public/landing/landing.dist.spec.ts`
- `apps/web/src/app/public/not-found/not-found-page.component.spec.ts`
- `apps/web/src/app/public/privacy/privacy-page.component.spec.ts`
- `apps/web/src/app/public/privacy/privacy-page.dist.spec.ts`
- `apps/web/src/app/public/public-clock.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulation.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator-form.component.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator.component.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator.contract.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator.dist.spec.ts`
- `apps/web/src/app/public/simulator/simulator-messages.spec.ts`
- `apps/web/src/app/ui/feedback/announcer.service.spec.ts`
- `apps/web/src/app/ui/feedback/banner.component.spec.ts`
- `apps/web/src/app/ui/feedback/confirm-dialog.component.spec.ts`
- `apps/web/src/app/ui/feedback/empty-state.component.spec.ts`
- `apps/web/src/app/ui/feedback/status-chip.component.spec.ts`
- `apps/web/src/app/ui/feedback/tokens-only.spec.ts`
- `apps/web/src/app/ui/format/format.spec.ts`
- `apps/web/src/app/ui/format/no-number-on-money.spec.ts`
- `apps/web/src/app/ui/house-meter/house-meter.component.spec.ts`
- `apps/web/src/app/ui/ledger-table/ledger-table.component.spec.ts`
- `apps/web/src/app/ui/money-input/input-parsers.spec.ts`
- `apps/web/src/app/ui/money-input/inputs.spec.ts`
- `apps/web/src/design-contract/tokens.contract.spec.ts`
- `apps/web/src/environments/build-constants.dist.spec.ts`
- `apps/web/src/environments/build-constants.spec.ts`
- `apps/web/src/styles/fonts.dist.spec.ts`
- `apps/web/src/styles/no-hardcoded-colors.spec.ts`
- `apps/web/src/styles/tokens.spec.ts`
- `apps/web/src/testing/build-output/build-output.spec.ts`
- `apps/web/src/testing/build-output/landing-graph.spec.ts`
- `apps/web/src/testing/build-output/root-config.spec.ts`
- `apps/web/src/testing/doc-checks/angular-patterns-doc.spec.ts`
- `apps/web/src/testing/doc-checks/component-contracts-doc.spec.ts`
- `apps/web/src/testing/doc-checks/design-palette-doc.spec.ts`
- `apps/web/src/testing/doc-checks/privacy-requirements-doc.spec.ts`

### W0-06

- `.github/scripts/test_check_algorithm_examples.py`
- `.github/scripts/test_codeowners.py`
- `tools/conformance/src/engine-adapter.spec.ts`
- `tools/conformance/src/harness/conformance.spec.ts`
- `tools/conformance/src/harness/harness.spec.ts`
- `tools/conformance/src/money.spec.ts`
- `tools/conformance/src/private-compare/cli.spec.ts`
- `tools/conformance/src/private-compare/private-compare.spec.ts`
- `tools/lint-fixtures/boundaries.spec.ts`
- `tools/owns-check/check.spec.ts`
- `tools/owns-check/lib.spec.ts`
- `tools/plan/test_render_plan.py`

### W1-01

- `packages/domain/src/schedule/amounts.spec.ts`
- `packages/domain/src/schedule/examples.spec.ts`
- `packages/domain/src/schedule/level.spec.ts`
- `packages/domain/src/schedule/loop.spec.ts`
- `packages/domain/src/schedule/project.spec.ts`
- `packages/domain/src/schedule/properties.spec.ts`
- `packages/domain/src/schedule/yearly.spec.ts`

### W1-02

- `tools/oracle/tests/test_cli_generate.py`
- `tools/oracle/tests/test_compare.py`
- `tools/oracle/tests/test_context_and_imports.py`
- `tools/oracle/tests/test_event_examples.py`
- `tools/oracle/tests/test_events_engine.py`
- `tools/oracle/tests/test_full_profile.py`
- `tools/oracle/tests/test_generator.py`
- `tools/oracle/tests/test_schedule_examples.py`

### W1-03

- `packages/schema/src/codec/codec.spec.ts`
- `packages/schema/src/codec/fixtures.spec.ts`
- `packages/schema/src/migrations/migrations.spec.ts`
- `packages/schema/src/testing/arbitraries.spec.ts`

### W1-04

- `packages/persistence/src/memory/memory.spec.ts`

### W1-05

- `packages/persistence/src/dexie/contract.spec.ts`
- `packages/persistence/src/dexie/store.spec.ts`

### W1-06

- `packages/sync/src/merge/merge.spec.ts`
- `packages/sync/src/merge/purge.spec.ts`

### W1-07

- `packages/sync/src/crypto/base64url.spec.ts`
- `packages/sync/src/crypto/crypto.browser.spec.ts`
- `packages/sync/src/crypto/crypto.spec.ts`
- `packages/sync/src/crypto/key-store.spec.ts`
- `packages/sync/src/crypto/repo-scan.spec.ts`

### W1-09

- `tools/edge/edge.spec.ts`
- `tools/edge/headers/assertions.spec.mjs`
- `tools/edge/headers/headers.spec.mjs`
- `tools/edge/headers/smoke-csp.spec.mjs`

### W1-10

- `tools/hygiene/ci/ci-workflow.spec.ts`
- `tools/hygiene/ci/noreply-range.spec.ts`
- `tools/hygiene/ci/synthetic-flag-ci.spec.ts`
- `tools/hygiene/commit-msg.spec.ts`
- `tools/hygiene/denylist.spec.ts`
- `tools/hygiene/gitignore.spec.ts`
- `tools/hygiene/noreply.spec.ts`
- `tools/hygiene/renovate.spec.ts`
- `tools/hygiene/synthetic-flag.spec.ts`

### W2-02

- `apps/web/src/testing/build-output/build-output.spec.ts`
- `apps/web/src/testing/build-output/landing-graph.spec.ts`
- `apps/web/src/testing/build-output/root-config.spec.ts`

### W2-03

- `packages/domain/src/events/fixed-charge-change/fixed-charge-change.spec.ts`
- `packages/domain/src/events/rate-change/no-own-formulas.spec.ts`
- `packages/domain/src/events/rate-change/rate-change.spec.ts`

### W2-04

- `packages/domain/src/events/advance-installments/advance-installments.spec.ts`
- `packages/domain/src/events/prepayment/examples.spec.ts`
- `packages/domain/src/events/prepayment/prepayment.spec.ts`

### W2-05

- `packages/domain/src/events/actual-payment/actual-payment.spec.ts`
- `packages/domain/src/events/reported-balance/reported-balance.spec.ts`
- `packages/domain/src/paths/build-paths.spec.ts`
- `packages/domain/src/paths/compare.spec.ts`
- `packages/domain/src/paths/examples.spec.ts`

### W2-06

- `tools/oracle/tests/test_cli_generate.py`
- `tools/oracle/tests/test_compare.py`
- `tools/oracle/tests/test_context_and_imports.py`
- `tools/oracle/tests/test_event_examples.py`
- `tools/oracle/tests/test_events_engine.py`
- `tools/oracle/tests/test_full_profile.py`
- `tools/oracle/tests/test_generator.py`
- `tools/oracle/tests/test_schedule_examples.py`

### W2-07

- `packages/domain/src/templates/templates.spec.ts`
- `packages/domain/src/validation/validation.spec.ts`

### W2-08

- `packages/sync/src/session/session.spec.ts`

### W2-09

- `packages/sync/src/google-drive/gis-loader.spec.ts`
- `packages/sync/src/google-drive/provider.edge.spec.ts`
- `packages/sync/src/google-drive/provider.spec.ts`

### W2-10

- `tools/edge/headers/assertions.spec.mjs`
- `tools/edge/headers/headers.spec.mjs`
- `tools/edge/headers/smoke-csp.spec.mjs`

### W2-11

- `e2e/specs/smoke.spec.ts`
- `e2e/support/google-mock.spec.ts`
- `e2e/support/helpers.spec.ts`
- `e2e/support/network-block.spec.ts`
- `e2e/support/seed-schema.spec.ts`

### W2-12

- `tools/bundle-check/check.spec.ts`

### W2-13

- `packages/domain/src/schedule/amounts.spec.ts`
- `packages/domain/src/schedule/examples.spec.ts`
- `packages/domain/src/schedule/level.spec.ts`
- `packages/domain/src/schedule/loop.spec.ts`
- `packages/domain/src/schedule/project.spec.ts`
- `packages/domain/src/schedule/properties.spec.ts`
- `packages/domain/src/schedule/yearly.spec.ts`

### W3-02

- `packages/domain/test/properties/invariants.spec.ts`
- `packages/domain/test/properties/quarantine.spec.ts`

### W3-03

- `packages/domain/src/goal-seek/goal-seek.spec.ts`
- `packages/domain/src/goal-seek/properties.spec.ts`
- `packages/domain/src/goal-seek/throw-band.spec.ts`

### W3-05

- `apps/web/src/app/core/theme/theme-toggle.component.spec.ts`
- `apps/web/src/app/core/theme/theme-toggle.contract.spec.ts`
- `apps/web/src/app/core/theme/theme.service.spec.ts`
- `apps/web/src/styles/fonts.dist.spec.ts`
- `apps/web/src/styles/no-hardcoded-colors.spec.ts`
- `apps/web/src/styles/tokens.spec.ts`

### W3-06

- `apps/web/src/app/ui/format/format.spec.ts`
- `apps/web/src/app/ui/format/no-number-on-money.spec.ts`
- `apps/web/src/app/ui/money-input/input-parsers.spec.ts`
- `apps/web/src/app/ui/money-input/inputs.spec.ts`

### W3-07

- `apps/web/src/app/ui/ledger-table/ledger-table.component.spec.ts`

### W3-08

- `apps/web/src/app/ui/feedback/announcer.service.spec.ts`
- `apps/web/src/app/ui/feedback/banner.component.spec.ts`
- `apps/web/src/app/ui/feedback/confirm-dialog.component.spec.ts`
- `apps/web/src/app/ui/feedback/empty-state.component.spec.ts`
- `apps/web/src/app/ui/feedback/status-chip.component.spec.ts`
- `apps/web/src/app/ui/feedback/tokens-only.spec.ts`
- `apps/web/src/app/ui/house-meter/house-meter.component.spec.ts`

### W3-09

- `apps/web/src/app/core/errors/app-error-handler.spec.ts`
- `apps/web/src/app/core/errors/error-toast.component.spec.ts`
- `apps/web/src/app/core/shell/app-shell.component.spec.ts`

### W3-10

- `apps/web/src/app/data/providers/provide-data-stores.spec.ts`

### W3-11

- `apps/web/src/app/data/stores/stores.spec.ts`

### W3-12

- `apps/web/src/app/data/engine/derive.spec.ts`
- `apps/web/src/app/data/engine/loan-projection-service.spec.ts`
- `apps/web/src/app/data/engine/map-entities.spec.ts`
- `apps/web/src/app/data/engine/provide-engine-facade.spec.ts`

### W3-13

- `apps/web/src/app/core/storage-health/safari-banner.component.spec.ts`
- `apps/web/src/app/core/storage-health/safari-banner.contract.spec.ts`
- `apps/web/src/app/core/storage-health/safari-detect.spec.ts`
- `apps/web/src/app/core/storage-health/storage-health.service.spec.ts`

### W3-14

- `apps/web/src/app/core/pwa/app-url.spec.ts`
- `apps/web/src/app/core/pwa/ngsw.dist.spec.ts`
- `apps/web/src/app/core/pwa/provide-app-pwa.spec.ts`
- `apps/web/src/app/core/pwa/pwa-runtime.spec.ts`
- `apps/web/src/app/core/pwa/pwa-update.service.spec.ts`
- `apps/web/src/app/core/pwa/sw-registrar.spec.ts`
- `apps/web/src/app/core/pwa/update-prompt.component.spec.ts`
- `apps/web/src/app/core/pwa/update-prompt.contract.spec.ts`
- `e2e/specs/pwa.spec.ts`

### W3-15

- `packages/export/src/csv/csv.spec.ts`
- `packages/export/src/model/model.spec.ts`

### W3-17

- `apps/web/src/environments/build-constants.dist.spec.ts`
- `apps/web/src/environments/build-constants.spec.ts`

### W4-02

- `packages/domain/src/events/actual-payment/actual-payment.spec.ts`
- `packages/domain/src/events/advance-installments/advance-installments.spec.ts`
- `packages/domain/src/events/fixed-charge-change/fixed-charge-change.spec.ts`
- `packages/domain/src/events/prepayment/examples.spec.ts`
- `packages/domain/src/events/prepayment/prepayment.spec.ts`
- `packages/domain/src/events/rate-change/no-own-formulas.spec.ts`
- `packages/domain/src/events/rate-change/rate-change.spec.ts`
- `packages/domain/src/events/reported-balance/reported-balance.spec.ts`
- `packages/domain/src/goal-seek/goal-seek.spec.ts`
- `packages/domain/src/goal-seek/properties.spec.ts`
- `packages/domain/src/goal-seek/throw-band.spec.ts`
- `packages/domain/src/paths/build-paths.spec.ts`
- `packages/domain/src/paths/compare.spec.ts`
- `packages/domain/src/paths/examples.spec.ts`
- `packages/domain/src/schedule/amounts.spec.ts`
- `packages/domain/src/schedule/examples.spec.ts`
- `packages/domain/src/schedule/level.spec.ts`
- `packages/domain/src/schedule/loop.spec.ts`
- `packages/domain/src/schedule/project.spec.ts`
- `packages/domain/src/schedule/properties.spec.ts`
- `packages/domain/src/schedule/yearly.spec.ts`
- `packages/domain/src/templates/templates.spec.ts`
- `packages/domain/src/validation/validation.spec.ts`
- `packages/domain/test/properties/invariants.spec.ts`
- `packages/domain/test/properties/quarantine.spec.ts`

### W4-03

- `apps/web/src/app/public/simulator/quick-simulation.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator-form.component.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator.component.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator.contract.spec.ts`
- `apps/web/src/app/public/simulator/quick-simulator.dist.spec.ts`
- `apps/web/src/app/public/simulator/simulator-messages.spec.ts`
- `e2e/specs/simulator.spec.ts`

### W4-04

- `apps/web/src/app/public/landing/landing-page.component.spec.ts`
- `apps/web/src/app/public/landing/landing.dist.spec.ts`
- `e2e/specs/landing.spec.ts`

### W4-05

- `apps/web/src/app/public/not-found/not-found-page.component.spec.ts`
- `apps/web/src/app/public/privacy/privacy-page.component.spec.ts`
- `apps/web/src/app/public/privacy/privacy-page.dist.spec.ts`
- `e2e/specs/privacy.spec.ts`

### W4-06

- `apps/web/src/app/features/dashboard/dashboard-model.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard-page.component.spec.ts`
- `e2e/specs/dashboard.spec.ts`

### W4-07

- `apps/web/src/app/features/loans/wizard/loan-wizard-page.component.spec.ts`
- `apps/web/src/app/features/loans/wizard/wizard-model.spec.ts`
- `apps/web/src/app/features/loans/wizard/wizard-rules.spec.ts`
- `e2e/specs/loan-wizard.spec.ts`

### W4-08

- `apps/web/src/app/data/backup/backup-size-cap.spec.ts`
- `apps/web/src/app/data/backup/backup-state.spec.ts`
- `apps/web/src/app/data/backup/provide-backup.spec.ts`

### W4-09

- `apps/web/src/app/data/sync/drive-sync-service.spec.ts`
- `apps/web/src/app/data/sync/local-dataset.spec.ts`
- `apps/web/src/app/data/sync/provide-sync.spec.ts`
- `apps/web/src/app/data/sync/sync-status-text.spec.ts`

### W4-10

- `packages/export/src/excel/excel.spec.ts`

### W4-11

- `packages/export/src/pdf/pdf.spec.ts`

### W4-12

- `apps/web/src/app/features/real-data/forms/event-form.component.spec.ts`
- `apps/web/src/app/features/real-data/forms/event-form.contract.spec.ts`
- `apps/web/src/app/features/real-data/forms/event-form.logic.spec.ts`

### W5-01

- `apps/web/src/app/features/loans/detail/delete-loan-dialog.component.spec.ts`
- `apps/web/src/app/features/loans/detail/loan-detail-model.spec.ts`
- `apps/web/src/app/features/loans/detail/loan-detail-page.component.spec.ts`
- `apps/web/src/app/features/loans/detail/loan-edit-form.component.spec.ts`
- `e2e/specs/loan-detail.spec.ts`

### W5-02

- `apps/web/src/app/features/schedule/scenario-abono.spec.ts`
- `apps/web/src/app/features/schedule/schedule-model.spec.ts`
- `apps/web/src/app/features/schedule/schedule-page.component.spec.ts`
- `e2e/specs/schedule.spec.ts`

### W5-03

- `apps/web/src/app/features/real-data/timeline/real-data-timeline.component.spec.ts`
- `apps/web/src/app/features/real-data/timeline/real-data-timeline.contract.spec.ts`
- `apps/web/src/app/features/real-data/timeline/timeline-model.spec.ts`
- `e2e/specs/real-data.spec.ts`

### W5-04

- `apps/web/src/app/features/scenarios/editor/scenario-editor.component.spec.ts`
- `apps/web/src/app/features/scenarios/editor/scenario-editor.contract.spec.ts`
- `apps/web/src/app/features/scenarios/editor/scenario-editor.logic.spec.ts`
- `e2e/specs/scenarios.spec.ts`

### W5-05

- `apps/web/src/app/features/scenarios/compare/chart-palette.spec.ts`
- `apps/web/src/app/features/scenarios/compare/chart-series.spec.ts`
- `apps/web/src/app/features/scenarios/compare/compare-model.spec.ts`
- `apps/web/src/app/features/scenarios/compare/compare-sources.spec.ts`
- `apps/web/src/app/features/scenarios/compare/scenario-compare.component.spec.ts`
- `apps/web/src/app/features/scenarios/compare/scenario-compare.contract.spec.ts`
- `e2e/specs/scenario-compare.spec.ts`

### W5-06

- `apps/web/src/app/features/export/export-menu.component.spec.ts`
- `apps/web/src/app/features/export/export-menu.contract.spec.ts`

### W5-07

- `apps/web/src/app/features/settings/backup/backup-model.spec.ts`
- `apps/web/src/app/features/settings/backup/settings-backup.component.spec.ts`
- `apps/web/src/app/features/settings/backup/settings-backup.contract.spec.ts`
- `e2e/specs/settings-backup.spec.ts`

### W5-08

- `apps/web/src/app/features/settings/sync/passphrase-strength.spec.ts`
- `apps/web/src/app/features/settings/sync/settings-sync.component.spec.ts`
- `apps/web/src/app/features/settings/sync/settings-sync.contract.spec.ts`
- `e2e/specs/settings-sync.spec.ts`

### W6-01

- `e2e/specs/journeys/cross-feature.spec.ts`
- `e2e/specs/journeys/exports.spec.ts`

### W6-02

- `e2e/specs/sweeps/a11y-csp.sweep.spec.ts`
- `e2e/specs/sweeps/safari-banner.sweep.spec.ts`
- `e2e/specs/sweeps/stubs-and-worker.sweep.spec.ts`

### W7-01

- `docs/release/release-docs.spec.mjs`

### W7-02

- `tools/hygiene/ci/ci-workflow.spec.ts`
- `tools/hygiene/ci/noreply-range.spec.ts`
- `tools/hygiene/ci/synthetic-flag-ci.spec.ts`

### W7-03

- `apps/web/src/app/data/backup/backup-size-cap.spec.ts`
- `apps/web/src/app/data/backup/backup-state.spec.ts`
- `apps/web/src/app/data/backup/provide-backup.spec.ts`
- `apps/web/src/app/data/sync/drive-sync-service.spec.ts`
- `apps/web/src/app/data/sync/local-dataset.spec.ts`
- `apps/web/src/app/data/sync/provide-sync.spec.ts`
- `apps/web/src/app/data/sync/sync-status-text.spec.ts`
- `packages/sync/src/google-drive/provider.spec.ts`

### W7-04

- `apps/web/src/app/data/device/preload.spec.ts`
- `apps/web/src/app/data/device/provide-device-data.spec.ts`
- `apps/web/src/app/features/settings/device/settings-device.component.spec.ts`
- `apps/web/src/app/public/privacy/privacy-page.component.spec.ts`
- `apps/web/src/app/public/privacy/privacy-page.dist.spec.ts`
- `e2e/specs/settings-device.spec.ts`
- `e2e/specs/sweeps/stubs-and-worker.sweep.spec.ts`
