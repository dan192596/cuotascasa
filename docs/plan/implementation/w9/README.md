# Ola W9 · Correcciones del panel multi-rol

**Origen.** El 2026-10-27, un panel de cinco roles revisó el código de `main` (7cc051c, v1.0.0 con la ola W8): Producto/UX, Finanzas, QA, Seguridad y Arquitectura/accesibilidad. Después del debate, cada rol votó los hallazgos de los demás y verificó en el código los graves y los dudosos. Esta ola reúne los errores que el panel confirmó en los niveles 1 y 2 y las tres funcionalidades con más votos. Ningún error se calificó como crítico.

**Fuente de cada tarjeta.** La ficha (`docs/plan/cards/W9-*.md`) define qué se entrega. Esta guía aporta la evidencia: archivo y línea, cómo se reproduce y qué falta decidir. Si la ficha y esta guía se contradicen, manda la ficha. Si alguna de las dos contradice `docs/algorithm.md` o un ADR, detente y escala.

**Datos.** Todos los montos de esta guía son sintéticos.

## Orden y dependencias

```
W9-01 (Opus, contratos) ─┬─> W9-02 (sync) ──┬─> W9-04 (Opus, marcas de borrado)
                         │                  └─> W9-12 (aviso antes de borrar)
                         └─> W9-03 (respaldo) ┴─> W9-04, W9-12
W9-05 (Opus, dictámenes) ─┬─> W9-06 (cifras de ahorro)
                          └─> W9-08 (ancla por fecha) ──┐
W9-07 (fecha «hoy» del motor)                           │
W9-09 (contexto del préstamo) ──────────────────────────┴─> W9-10 (registrar el pago del mes) ─> W9-11 (cambios sin guardar)
Todas ─> W9-13 (Opus, cierre)
```

Pueden empezar en paralelo: W9-01, W9-05, W9-07, W9-09 y W9-14 (Opus; corrige pruebas inestables y no depende de ninguna otra).

## Nivel 1: pérdida de datos o datos que no son lo que el usuario cree

### Sincronizado con cambios pendientes (qa-B1) → W9-01, W9-02

- `SyncSession.pass` hace `local.save` (session/index.ts:118) y luego cifra, `findFile`, `copyFile` y `updateFile` (130-137). Solo después `run()` llama a `local.markSynced(at)` (181).
- `DexieDataStore.markSynced` escribe `pending = []` sin condición (`packages/persistence/src/dexie/store.ts:414-419`). `InMemoryDataStore` hace lo mismo (in-memory-data-store.ts:258).
- Una edición guardada en esa ventana no va en el archivo subido y desaparece del conteo de pendientes. `refreshPending` no la recupera porque sale mientras el estado es `syncing` (drive-sync-service.ts:365-369).
- El registro sigue en el dispositivo con un `updatedAt` mayor, y la siguiente pasada lo sube por LWW. La pérdida real ocurre si el usuario usa «Borrar datos de este dispositivo», que se fía de ese conteo, antes de la siguiente sincronización.
- ADR-0024 solo acepta la ventana entre `read` y `save`, no esta. `session.spec.ts` no prueba ninguna escritura durante la subida.
- **Reproducción:** con el fake de Drive, retrasar `updateFile`. Mientras tanto, escribir un abono. Al terminar, `pendingChanges` vale 0 y `cuotascasa.json` no tiene el abono.
- **Diseño sugerido (lo decide W9-01):** `markSynced(at, uploaded)`, donde `uploaded` son las claves `entity:id` con el `updatedAt` que viajó en el archivo. Solo se limpian las entradas pendientes cuyo `updatedAt` no sea posterior al subido. La alternativa es una instantánea del conjunto pendiente tomada al empezar la pasada, que luego se resta.

### Ahorro por re-anclar el saldo (finanzas-B2) → W9-05, W9-06

- El detalle muestra `compareSchedules(original, real)` bajo «Plan original frente a lo real» (`data/engine/loan-projection.ts:130`; `loan-detail-page.component.ts:301-336`).
- Un `ReportedBalance` re-ancla el saldo sin flujo de dinero ([ALG.ANCHOR]), así que una baja de saldo aparece como meses e interés ahorrados aunque el usuario no haya registrado ningún pago.
- **Ejemplo sintético** (verificado con el motor por el rol Finanzas): Q100,000 a 120 meses, 7 % + 1.26 %, con un ancla en k = 12 de 85,000.00 frente a una apertura proyectada de 93,865.79. Resultado: `monthsSaved = 14`, `interestSaved = 9,000.77` y `netSaving = 17,866.56`, sin ningún abono registrado.
- **Arreglo sugerido por el panel (finanzas-I1):** sin tocar [ALG.METRICS], mostrar aparte el «ajuste por saldos reportados» (la suma de `realDelta.perAnchor`) y una nota que explique que esa parte no viene de un pago. W9-05 decide si basta con la presentación.

### Las marcas de borrado conservan el registro (seguridad-B1) → W9-04

- `remove()` crea la marca como `{ ...existing, updatedAt, deletedAt }` (`packages/persistence/src/dexie/store.ts:595`), así que un préstamo o pago borrado conserva monto, banco y notas.
- `purgeTombstones` solo corre dentro de una sincronización, y con `lastSyncAt === null` devuelve el conjunto intacto (`packages/sync/src/merge/index.ts:84-85`). Sin Drive, las marcas no se purgan nunca.
- `exportAll` incluye las marcas, así que también viajan en el respaldo JSON, incluido el que no va cifrado.
- La combinación solo necesita `id`, `updatedAt`, `updatedByDevice` y `deletedAt`. Quitar la carga útil toca los esquemas de entidades (congelados) y los ADR-0005 y 0008.
- **Reproducción:** sin Drive, crear un préstamo sintético con nota, borrarlo y exportar el respaldo sin cifrar. El archivo contiene el préstamo completo con `deletedAt` no nulo.

## Nivel 2: fallos reales con escenario concreto

### El respaldo se marca antes de descargarse (seguridad-B3) → W9-01, W9-03

- `exportJson()` llama a `store.markBackedUp(exportedAt)` antes de devolver el archivo (`data/backup/provide-backup.ts:199-201`).
- `settings-backup.component.ts` (alrededor de la línea 503) hace `link.click()` y enseguida `URL.revokeObjectURL(url)`, sin agregar el enlace al DOM.
- `features/export/export-support.ts` ya documenta que Safari necesita unos 40 s (`OBJECT_URL_LIFETIME_MS`) para que arranque una descarga grande.
- Si la descarga falla, el contador «Cambios desde el último respaldo» vuelve a 0 y el recordatorio desaparece igual.

### Drive lleno se trata como sesión vencida (qa-B3) → W9-01, W9-02

- `failureOf` (`packages/sync/src/google-drive/provider.ts:52-66`) solo convierte en `NetworkError` los 403 por límite de solicitudes. `storageQuotaExceeded` y `dailyLimitExceeded` terminan como `AuthError`, y la sesión publica `needs-auth`.
- Ajustes muestra entonces «Conectar» (settings-sync.component.ts:317-318). El token es válido, así que la siguiente subida vuelve a fallar: el usuario queda en un ciclo sin saber que la causa es el espacio.
- `SyncErrorCode` está en `packages/sync/src/ports.ts`, que está congelado: el código nuevo lo agrega W9-01.

### La fecha «hoy» del motor no avanza (qa-B2, front-B1, qa-B10) → W9-07

- `this.asOf = computed(() => parseLocalDate(deps.clock().today()))` (`data/engine/engine-facade.ts:62`) no lee ninguna señal, así que se evalúa una vez y queda memorizado hasta recargar.
- De `asOf` dependen la cuota actual, el saldo, el porcentaje pagado, la próxima cuota, `cutoffK`, los totales y el `generatedOn` de las exportaciones.
- El servicio de respaldo sí escucha `visibilitychange` (`data/backup/provide-backup.ts:139`); el motor no.
- La prueba «derived values depend on asOf only» (`loan-projection-service.spec.ts:540`) nunca cambia `asOf`, así que no detecta este error.

### Ancla con número de cuota obligatorio (ux-B3, finanzas-B5) → W9-05, W9-08

- En el paso 4 del asistente, si se escribe un saldo, el número de cuota es obligatorio (`wizard-rules.ts:139-142`).
- En «Datos reales», en cambio, el número de cuota es opcional y se deduce de la fecha con [ALG.EVENTS.ANCHOR].
- Los estados de cuenta suelen dar el saldo **después** del pago, y la app espera el saldo **antes** de pagar la cuota k. Ese desfase produce semáforos ámbar o rojos (INSTALLMENT_MISALIGNMENT) desde el primer uso.
- HU-04 pide el número de cuota de forma literal, así que antes hay que enmendarla (W9-05).

### El ahorro neto incluye el IUSI (finanzas-B1) → W9-05, W9-06

- [ALG.METRICS] define `netSaving = totalPaid(base) − totalPaid(escenario)` «incluyendo los cargos fijos que ya no se pagan». `compareSchedules` lo implementa al pie de la letra (`packages/domain/src/paths/compare.ts:29`).
- El IUSI es un impuesto municipal: no termina al liquidar el préstamo, solo deja de cobrarlo el banco.
- En el ejemplo canónico [ALG.EXAMPLE] con REDUCE_TERM, `netSaving − interestSaved = 7,900.00`, que son 20 cuotas × 395.00 de cargos fijos.
- El código cumple la regla; lo que exagera es la regla. Lo decide W9-05.
- Relacionado (finanzas-B7): la tabla comparativa llama «Interés ahorrado» a una cifra que incluye seguros (`scenarios/compare/compare-model.ts:80`).

### Pantallas de un préstamo sin contexto (ux-B1) → W9-09

- «Datos reales» y «Proyecciones» tienen un h1 fijo, sin el alias del préstamo, sin migas de pan y sin enlace al detalle.
- La tabla muestra el alias, pero no enlaza al detalle, y su mensaje de error dice «Revisa sus datos en el detalle» sin enlace (`schedule/schedule-messages.ts:15`).
- Los títulos de pestaña son genéricos («Datos reales · CuotasCasa»).

### Se pierde lo escrito al salir (ux-B2, front-F1) → W9-11

- No hay `canDeactivate` ni `beforeunload` en `apps/web/src/app`.
- El asistente guarda el borrador solo en memoria y no tiene «Cancelar».
- Afecta también al formulario de eventos reales, a «Editar condiciones» y al editor de escenarios.

### Pruebas inestables que bloquean PRs → W9-14

Se registró el 2026-10-28, después de que fallaran los PR #111 y #112. Ninguna de las tres pruebas falla por un error de la app.

- **Titular de la landing** (`e2e/specs/landing.spec.ts:136`): lee el h1 en un bucle de 800 ms medido con el reloj del runner y exige más de 5 lecturas. En WebKit, en CI, cada lectura tarda más de 130 ms, así que no llega a 6.
- **Barrido del service worker** (`e2e/specs/sweeps/stubs-and-worker.sweep.spec.ts:79`): carga siete rutas de `/app` seguidas y solo al final espera `navigator.serviceWorker.ready`. WebKit cancela el registro si una navegación interrumpe la descarga (está documentado en `core/pwa/provide-app-pwa.ts`), y la espera se queda colgada hasta los 30 s.
- **Transiciones de ruta** (`apps/web/src/app/app.config.spec.ts:68`): `withViewTransitions` guarda la bandera «saltar la primera» en el objeto de opciones que `appConfig` crea una sola vez. Por eso la prueba solo pasa si es el primer router creado en el worker, y falla dentro de `ng test` completo.

## Funcionalidades (las tres más votadas)

| Tarjeta | Funcionalidad | Votos |
|---|---|---|
| W9-12 | Antes de «Borrar datos de este dispositivo», mostrar los cambios sin sincronizar y sin respaldar, con salidas para respaldar o sincronizar primero (qa-F1) | 5 de 5 |
| W9-10 | «Registrar el pago de este mes» con un toque y marcar en lote las cuotas pasadas como pagadas (ux-F1) | 4 |
| W9-08 | Ancla por fecha del estado de cuenta, con selector «saldo antes o después de pagar» (ux-F8) | 4 |

## Fuera de esta ola (registrado para después)

- Hallazgos de menor severidad confirmados por el panel:
  - ancla al alza con amortización negativa sin aviso (finanzas-B3);
  - meta de cuota máxima que solo revisa la cuota k+1 (finanzas-B4);
  - frase del respaldo cifrado sin medidor de fuerza (seguridad-B5);
  - tarjeta de préstamo pagado con próxima cuota (ux-B4);
  - identificadores técnicos y «Δ» en la interfaz (ux-B5);
  - enlace a privacidad dentro de /app (ux-B6);
  - el resto de los hallazgos de nivel bajo.
- Hallazgos que se desprenden de la combinación LWW por registro de ADR-0024: préstamos revividos sin hijos (qa-B5) y subida sin precondición (qa-B4). Para corregirlos hay que enmendar el ADR.
- Funcionalidades votadas que no entraron en el top tres:
  - comparar «reducir plazo» contra «reducir cuota»;
  - prueba de estrés de tasa variable;
  - restaurar desde la copia anterior de Drive;
  - generador de frase;
  - invitación a instalar la PWA;
  - revisar actualizaciones al volver a la app.
