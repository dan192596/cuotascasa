# ADR-0006: Persistencia: puerto de repositorios, Dexie y adaptador en memoria con suite de contrato

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

En la arquitectura local-first (ADR-0001), el almacenamiento principal es el navegador. La persistencia tiene que cumplir varios requisitos:

- **Transacciones** para operaciones compuestas: crear un préstamo con su ancla, o importar un respaldo con instantánea previa.
- **Avisar cambios después del commit**, también entre pestañas.
- **Exportar todo, incluidas las marcas de borrado**, y reemplazarlo en bloque (ADR-0007, ADR-0008).
- **Contadores para el estado de la app:** cambios pendientes de sincronizar y cambios desde el último respaldo.
- **Poder probarse en Node** (Vitest) y permitir que decenas de tarjetas trabajen en paralelo en worktrees sin compartir estado.
- **Dejar la puerta abierta** a un backend futuro (ADR-0020) sin reescribir las features.

## Decisión

1. **Puerto de repositorios en `packages/persistence/src/ports.ts`**, congelado en W0-04:
   - `Repository<T>` y repositorios por entidad;
   - `DataStore` con `transaction`, `exportAll` (con marcas de borrado), `replaceAll`, instantáneas (crear, restaurar, descartar) y `subscribe` asíncrono después del commit;
   - `pendingChanges`/`markSynced` y `changesSinceBackup`/`markBackedUp`;
   - metadatos `deviceId`, `lastSyncAt` y `lastBackupAt`;
   - además, `Clock` e `IdGenerator` inyectables.
2. **Adaptador en memoria** (`@cuotascasa/persistence/memory`, W1-04). Es el predeterminado en desarrollo, en las pruebas unitarias y en los worktrees de las tarjetas, así que ningún worktree comparte estado. El simulador público no usa persistencia: solo usa el dominio.
3. **Adaptador Dexie 4.4** (`@cuotascasa/persistence/dexie`, W1-05). Es el de producción:
   - base `cuotascasa` versión 1, con una tabla por entidad más `meta` y `snapshots`;
   - `replaceAll` y la instantánea en una sola transacción de lectura y escritura;
   - avisos entre instancias;
   - exporta `DEXIE_SCHEMA_V1` para el helper de siembra de e2e.

   Dexie solo se importa dentro de `packages/persistence/src/dexie/`.
4. **Suite de contrato común** `runDataStoreContract(nombre, fábrica)`, escrita por Opus en W0-04 y congelada:
   - define el comportamiento observable, incluido el orden de listado `(createdAt, id)`;
   - corre **sin cambios** contra los dos adaptadores (Dexie bajo fake-indexeddb);
   - una meta-prueba exige que el registro de métodos cubiertos sea igual a los métodos del puerto.
5. **Selección del adaptador en `apps/web/src/app/data/`** (W3-10), el único lugar de la app que importa adaptadores: memoria en desarrollo y pruebas, Dexie en producción, mediante una bandera de compilación. Las features consumen las interfaces de `data/api.ts` (stores de signals), nunca Dexie.
6. **Al primer guardado** se pide `navigator.storage.persist()`, y Ajustes muestra el resultado de `persisted()` (ADR-0017).
7. **IndexedDB local no se cifra** (ver ADR-0009 y ADR-0016).

## Alternativas consideradas

- **API nativa de IndexedDB.** Es verbosa y propensa a errores en transacciones y versiones de esquema. Dexie resuelve eso con poco peso y sigue activo.
- **`idb`.** Más liviano, pero sin observación de cambios (`liveQuery`) ni ayudas de versionado, que habría que construir.
- **SQLite en WASM sobre OPFS.** Agrega un binario WASM, workers y más CSP, cuando el volumen es de cientos de registros.
- **RxDB o PouchDB.** Traen motores de sincronización propios que no se usan (la sincronización es nuestra, ADR-0008) y mucho peso.
- **Usar Dexie directo en las features, sin puerto.** Acopla la UI al almacenamiento, impide el adaptador en memoria para pruebas y worktrees, y bloquea un backend futuro.

## Consecuencias

**Positivas**
- Pruebas rápidas y deterministas.
- Worktrees aislados.
- El adaptador es intercambiable: un backend futuro solo tendría que implementar el puerto y pasar la suite.

**Negativas**
- Hay dos adaptadores que mantener.
- La suite de contrato debe ser exhaustiva: si no cubre algo, ese comportamiento puede divergir sin que nadie lo note.
- Un cambio de esquema de Dexie exige una migración, y una micro-tarjeta de Opus que actualice el helper de siembra de e2e.

**Riesgos**
- **fake-indexeddb puede comportarse distinto que los navegadores reales.** Mitigación: e2e con IndexedDB real en Chromium y WebKit (W2-11, W6-01).
- **Borrado del almacenamiento por el navegador** (Safari ITP). Mitigación: ADR-0017 y la sincronización con Drive.

## Verificación

- `runDataStoreContract('memory')` y `runDataStoreContract('dexie')` pasan sin modificar la suite (W1-04, W1-05). La meta-prueba del registro de métodos pasa (W0-04).
- Una falla inyectada a mitad de `replaceAll` deja los datos intactos, y `subscribe` solo dispara después del commit, también entre dos instancias (W1-05).
- Una prueba de actualización de versión preserva los datos (W1-05).
- Lint:
  - Dexie solo dentro de `src/dexie/`;
  - `public/` no puede importar `data/`;
  - solo `data/` importa adaptadores.
- `bundle:check` prueba que no hay código de Dexie en la landing (W2-12, W3-10).

## Referencias

- ADR-0001, ADR-0005, ADR-0007, ADR-0008, ADR-0009, ADR-0016, ADR-0017, ADR-0020.
- Tarjetas W0-04, W1-04, W1-05 y W3-10.
- Dexie: https://dexie.org/
