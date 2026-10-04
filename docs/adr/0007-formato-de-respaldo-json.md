# ADR-0007: Formato de respaldo JSON versionado, migraciones e importación segura

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

Sin backend (ADR-0001), el usuario custodia sus datos. El respaldo JSON pasó de diferido a núcleo de v1 para:

- **Restaurar** tras un borrado del navegador. Safari, por ejemplo, borra el almacenamiento tras 7 días sin visitas (ADR-0017).
- **Mover datos** a otro navegador o equipo sin Drive.
- **Tener una copia** bajo control del usuario, independiente de Google.

El formato debe sobrevivir a la evolución del modelo (ADR-0005). Un respaldo de hoy tiene que poder importarse en versiones futuras, y una importación defectuosa no debe destruir los datos actuales.

## Decisión

1. **Documento de respaldo:**

   ```json
   {
     "format": "cuotascasa",
     "version": 1,
     "exportedAt": "…",
     "deviceId": "…",
     "appVersion": "…",
     "data": {
       "loans": [], "events": [], "reportedBalances": [],
       "payments": [], "scenarios": [], "settings": []
     }
   }
   ```

   - `data` incluye las marcas de borrado, para que una restauración no reviva registros borrados.
   - La forma exacta de `settings` (objeto o lista) la fija el esquema `backup/v1.ts` de W0-04.
   - Los montos son strings decimales y las fechas `AAAA-MM-DD` (ADR-0005).
   - **`synthetic?: true` opcional en la raíz**, solo para los fixtures, que deben llevarlo (ADR-0015). `parseBackup` lo acepta y lo quita antes de migrar, así que no llega al documento resultante ni se persiste; `serializeBackup` nunca lo emite. Un respaldo exportado por la app jamás lo trae.
2. **Un esquema zod por versión**, más migraciones **puras** encadenadas (`v1 → v2 → …`) hasta `LATEST_VERSION`:
   - una migración nunca muta su entrada;
   - cada versión registrada tiene fixtures sintéticos propios en `packages/schema/fixtures/backup/vN/`, con nombres `backup-vN-<caso>.json` que no chocan con `.gitignore` (ADR-0015);
   - no se versionan respaldos cifrados como fixtures: las pruebas los generan en tiempo de ejecución (ADR-0009).
3. **`parseBackup` nunca lanza excepciones.** Devuelve un resultado con el documento migrado, la versión de origen y la vista previa, o un `BackupError` tipado: JSON inválido, formato ajeno, versión futura o validación con ruta precisa.
4. **`serializeBackup` emite salida canónica**, con orden estable.
5. **La importación es un proceso por etapas**, con confirmación explícita:
   1. parsear;
   2. migrar;
   3. validar;
   4. mostrar una vista previa (registros activos y borrados por entidad);
   5. pedir confirmación;
   6. tomar una instantánea del estado actual;
   7. hacer `replaceAll` en **una sola transacción**;
   8. ofrecer **deshacer**.

   La instantánea se descarta con la siguiente escritura o a los 10 minutos.
6. **Importar reemplaza, no combina.** Combinar datos de dos orígenes es trabajo de la sincronización (ADR-0008). Reemplazar es predecible y se puede deshacer. Además:
   - **Sellos intactos.** Cada registro entra con su `createdAt`, `updatedAt`, `updatedByDevice` y `deletedAt` tal como vienen en el respaldo; la importación no vuelve a sellar. Así no pisa, con sellos nuevos que no le corresponden, ediciones más recientes hechas en otros dispositivos.
   - **Aviso de sincronización.** Por lo anterior, si Drive está configurado, la siguiente sincronización combina lo importado con la copia remota, registro por registro (ADR-0008): los registros más nuevos en Drive vuelven a ganar y los que solo existen en Drive reaparecen. La vista previa lo advierte antes de confirmar.
   - **Lo que nunca se importa:** los campos locales del dispositivo de `Settings` y el `deviceId` del dispositivo; se conservan los del dispositivo que importa. El `deviceId` de la raíz del respaldo es solo informativo, y los campos locales que traiga el respaldo se ignoran.
   - **Contadores después de importar:** `pendingChanges` cuenta todos los registros importados (activos y marcas de borrado), para que la siguiente sincronización los suba; `changesSinceBackup` queda en 0 y `lastBackupAt` toma el `exportedAt` del respaldo, porque el estado local es igual a ese respaldo. `lastSyncAt` no cambia.
   - **Deshacer** restaura también `pendingChanges`, `changesSinceBackup` y `lastBackupAt`.
7. **Cifrado opcional.** El respaldo puede exportarse cifrado con el mismo sobre de ADR-0009, usando la frase de Drive u otra. El nombre sugerido es `cuotascasa-respaldo-AAAA-MM-DD.json`, un patrón que `.gitignore` excluye del repo.
8. **Recordatorio de respaldo.** `BackupService.reminderDue` es la única fuente de esta regla:
   - con un respaldo previo, se activa cuando pasan más de 30 días desde `lastBackupAt` o hay más de 20 cambios desde entonces (`changesSinceBackup`);
   - si nunca hubo respaldo (`lastBackupAt` nulo), se activa con más de 20 cambios o cuando el registro activo más antiguo (el `createdAt` mínimo) tiene más de 30 días. Sin registros activos, solo cuenta la condición de los cambios.

## Alternativas consideradas

- **Excel o CSV como respaldo.** Pierden tipos y estructura: no hay ida y vuelta fiable. Se mantienen solo como exportaciones para leer.
- **El complemento de exportación de Dexie.** Ata el formato a los detalles internos del almacenamiento y no valida con las reglas del dominio.
- **Combinar al importar.** Reglas ambiguas y difíciles de explicar al usuario. La combinación con reglas claras ya existe en la sincronización.
- **Sin número de versión.** El primer cambio de modelo rompería los respaldos viejos.

## Consecuencias

**Positivas**
- El usuario puede recuperar sus datos sin depender de ningún servicio.
- Los respaldos viejos siguen siendo importables.
- Un archivo dañado o ajeno nunca toca el almacenamiento, y una importación equivocada se puede deshacer.

**Negativas**
- Cada cambio de modelo exige una migración nueva, sus fixtures y su prueba.
- Un respaldo sin cifrar es un archivo con datos financieros en claro en el disco del usuario. Se muestra una advertencia y se ofrece cifrarlo.

**Riesgos**
- **Un respaldo de una versión más nueva de la app** no se puede importar en una más vieja. Se rechaza con un error claro, no se degrada.
- **Que un respaldo real termine en el repo público.** Mitigación: patrones en `.gitignore`, gitleaks y la lista local de términos prohibidos (ADR-0015).

## Verificación

- **Codec (W1-03):**
  - JSON inválido, formato ajeno, versión futura y monto inválido devuelven errores tipados sin lanzar;
  - cada migración deja intacta su entrada congelada y su salida valida;
  - la propiedad «serializar y luego parsear» devuelve el mismo documento (1000 corridas);
  - todo fixture tiene `synthetic: true` y parsea; el documento resultante no trae `synthetic`, y `serializeBackup` nunca lo emite.
- **Servicio de respaldo (W4-08):**
  - exportar e importar en un almacenamiento vacío da un `exportAll` idéntico, ignorando `exportedAt`, el `deviceId` y los campos locales de `Settings`;
  - los archivos inválidos no tocan el almacenamiento;
  - deshacer restaura el estado exacto;
  - el respaldo cifrado hace ida y vuelta, y una frase incorrecta da un error tipado;
  - importar conserva los sellos, los campos locales de `Settings` y el `deviceId`, y deja `pendingChanges`, `changesSinceBackup` y `lastBackupAt` como dice el punto 6; deshacer los restaura;
  - hay pruebas de borde del recordatorio a 30/31 días y 20/21 cambios, también con `lastBackupAt` nulo (30/31 días del registro activo más antiguo).
- **Ajustes (W5-07):** la vista previa muestra los conteos antes de escribir y, si Drive está configurado, el aviso de sincronización.
- **E2E:** la ida y vuelta de respaldo forma parte de los recorridos de W6-01.

## Referencias

- ADR-0005, ADR-0006, ADR-0008, ADR-0009, ADR-0013, ADR-0015, ADR-0017.
- Tarjetas W0-04, W1-03, W4-08 y W5-07.
