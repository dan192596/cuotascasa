# ADR-0008: Sincronización con Google Drive (appDataFolder, modelo de token de GIS)

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

Con datos solo en el navegador (ADR-0001), un borrado o un cambio de equipo pierde datos, y dos equipos divergen. El dueño pidió sincronizar en v1 con su nube personal y eligió Google Drive. Las restricciones son:

- **Sin backend:** no hay dónde guardar un secreto de cliente ni un token de actualización.
- **Costo US$0.**
- **Ningún dato legible por terceros** (ADR-0009).
- **Mínimo código de terceros** (ADR-0016).

## Decisión

1. **Puerto `SyncProvider`** en `packages/sync`, con un único proveedor en v1: Google Drive.
2. **Carpeta `appDataFolder` con el alcance `drive.appdata`.**
   - La carpeta está oculta y aislada por app.
   - Es un alcance no sensible: no requiere verificación de Google ni tiene el tope de 100 usuarios una vez que la pantalla de consentimiento se **publica a producción**.
   - En estado *Testing*, las autorizaciones vencen a los 7 días.
   - Google exige una página de inicio pública, la política de privacidad (`/privacidad`) y un dominio verificado (ADR-0002).
3. **Google Identity Services con el modelo de token.**
   - El script se carga de forma diferida, **solo al conectar Drive**.
   - No hay token de actualización. El token de acceso (unas 1 h) vive **solo en memoria**.
   - El usuario pulsa «Sincronizar». Renovar con `prompt: ''` igual muestra una ventana emergente, por eso solo ocurre dentro de una sincronización iniciada por él.
   - «Desconectar Drive» revoca el token.
4. **Algoritmo de sincronización:**
   1. Descargar `cuotascasa.json`.
   2. Descifrarlo y leerlo como un respaldo de ADR-0007 (`parseBackup`: validación y migraciones). Una versión futura o un contenido ilegible detienen la sesión sin guardar ni subir nada (`SyncSession`).
   3. Combinar por registro: gana el `updatedAt` mayor, con desempate por `updatedByDevice`. Las marcas de borrado se respetan y ganan un empate total.
   4. Purgar del conjunto combinado las marcas de borrado vencidas (regla de purga, abajo).
   5. Guardar el resultado localmente. Así la purga es local **y** del conjunto que se sube.
   6. Cifrar el resultado como documento de respaldo (`serializeBackup`, ADR-0007), con el mismo sobre del respaldo cifrado (ADR-0009, decisión 8).
   7. Subir, guardando antes la versión remota anterior como `cuotascasa.prev.json`.
   8. `markSynced`, **solo tras una subida exitosa**.

   El orden total y los riesgos residuales están en ADR-0024.

   **Regla de purga.** Es la única fórmula del proyecto; la spec, ADR-0005 y ADR-0024 la citan en lugar de redactarla de nuevo:

   ```
   purgar(t)  ⇔  lastSyncAt ≠ null   ∧   t.deletedAt < lastSyncAt − 90 días
   ```

   - **Cuándo:** en cada sesión, después de combinar y **antes** de guardar, cifrar y subir, sobre el conjunto combinado, con la función pura `purgeTombstones` (W1-06).
   - **`lastSyncAt`:** el instante de la sincronización exitosa **anterior**, el valor de `meta` leído al empezar la sesión, antes de `markSynced`.
   - **Por qué es seguro:** la marca ya viajó en una subida anterior. Si llegó desde Drive, la subió algún dispositivo; si es local, su `deletedAt` es anterior a `lastSyncAt`, así que iba en la subida de la sincronización anterior.
   - **90 días** son 90 × 86 400 000 ms entre instantes UTC, no días calendario.
   - **Bordes:** con `lastSyncAt − deletedAt` de 89 días o de exactamente 90 días, la marca no se purga; con 90 días + 1 ms o con 91 días, sí. Con `lastSyncAt` nulo (primera sincronización), no se purga nada.
   - **Subida fallida:** los datos locales ya quedaron purgados y `markSynced` no corre. Si la marca sigue en la copia remota, vuelve con el siguiente merge y se purga otra vez. La purga es idempotente y no revive el registro.
   - **Riesgo residual:** un dispositivo sin sincronizar durante más de 90 días puede resucitar un registro purgado, porque su copia viva gana el merge al no encontrar la marca. Lo mismo pasa con una marca antigua importada de un respaldo (ADR-0007 conserva los sellos) que nunca se subió. Lo documenta ADR-0024 («Riesgos residuales»).
5. **Una sincronización a la vez**, también entre pestañas (Web Locks, candado `cuotascasa-sync`). Drive no ofrece una escritura atómica condicionada confirmada, así que antes de subir se vuelve a verificar el estado remoto («mejor esfuerzo»): si cambió desde la descarga, la sesión vuelve a empezar desde la descarga una sola vez (`SyncSession`).
6. **Estados visibles:** «cambios sin sincronizar (n)», necesita autorización, necesita la frase y «no configurado» si el build no trae ID de cliente.
7. **Configuración:** el ID de cliente se inyecta al compilar (W3-17). El dueño configura Google Cloud una vez, con costo cero (W3-18).
8. **Borrar los datos:** la política de privacidad explica cómo hacerlo desde Drive: Administrar apps → Borrar datos ocultos de la app.

## Alternativas consideradas

- **`drive.file`.** También es no sensible, pero el archivo queda visible y el usuario podría moverlo o borrarlo por accidente.
- **`drive` completo.** Restringido; exige evaluación de seguridad.
- **Código de autorización con token de actualización.** Requiere un backend que guarde el secreto de cliente.
- **iCloud con CloudKit JS.** Requiere la membresía pagada de desarrollador de Apple.
- **CRDT (Automerge, Yjs).** Desproporcionados para un usuario.
- **Backend propio.** Es la fase multiusuario (ADR-0020).

## Consecuencias

**Positivas**
- Costo cero.
- Los datos quedan en la cuenta del usuario y Google solo ve texto cifrado.

**Negativas**
- La sincronización es manual, con una ventana emergente aproximadamente cada hora.
- Si se edita el mismo registro en dos equipos, solo se conserva la edición más reciente.
- En *Testing* hay que reautorizar cada 7 días.

**Riesgos**
- **Subidas simultáneas** desde dos equipos pueden pisarse. Mitigación: verificación previa y `cuotascasa.prev.json`.
- **El script de GIS es código de terceros.** Mitigación: carga diferida, CSP limitada a los orígenes de Google y Trusted Types si es compatible (ADR-0021).
- **Robo del token.** Mitigación: solo en memoria, alcance mínimo y revocación.
- **Resurrección tras la purga:** un dispositivo sin sincronizar durante más de 90 días puede revivir registros purgados. Riesgo residual aceptado; lo documenta ADR-0024 («Riesgos residuales»).

## Verificación

- **W1-06:** la combinación es conmutativa, idempotente y asociativa (fast-check), con marcas de borrado y empates. `purgeTombstones` cumple la regla de purga en sus bordes: `lastSyncAt − deletedAt` de 89 días, 90 días, 90 días + 1 ms y 91 días, y con `lastSyncAt` nulo.
- **W2-08:**
  - nunca se sube texto en claro;
  - se guarda la copia previa;
  - los estados de error funcionan;
  - la purga se aplica al conjunto combinado antes de guardar y subir, con el `lastSyncAt` anterior, así que lo subido no trae las marcas purgadas;
  - `markSynced` corre solo tras una subida exitosa; con una subida fallida, `lastSyncAt` no cambia;
  - las sincronizaciones simultáneas se agrupan, también entre pestañas.
- **W2-09:**
  - el script de GIS aparece solo al conectar;
  - no hay escrituras en almacenamiento;
  - desconectar revoca;
  - todo se prueba con los *fakes* congelados.
- **W4-09 y e2e** con Google simulado; `bundle:check` sin código de Google en la landing.
- **Drive real:** checklist manual (W6-04) ejecutado con el dueño en W7-01.

## Referencias

- ADR-0001, ADR-0002, ADR-0005, ADR-0009, ADR-0016, ADR-0020, ADR-0021, ADR-0024.
- `docs/specs/drive-api-subset.md`; tarjetas W1-06, W2-08, W2-09, W3-18, W4-09 y W5-08.
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/identity/oauth2/web/guides/use-token-model

## Enmiendas

**Enmienda (2026-10-16, W4).** Dictámenes de Opus sobre `SyncService` (PR #63 y W4-09, PR #71) que no cambian la decisión:

- **Conexión en dos pasos.** `prepare()` carga GIS y se llama **solo** tras una intención explícita del usuario de conectar. La conexión tiene dos pasos: «Conectar Drive» llama a `prepare()` y luego un botón llama a `connect()`, que abre la ventana de Google dentro de un gesto. Así WebKit no bloquea la ventana emergente. La pantalla es de W5-08.
- **Estado `connected` y guarda de generación.** El servicio lleva un indicador `connected` y un número de generación que sube al desconectar. Toda escritura de estado de una operación iniciada en una generación anterior se descarta, así que una sesión que termina tarde no pisa un «desconectado». `sync()` nunca reconecta de forma implícita: sin conexión, no abre la ventana de Google.
- **Conexión fallida.** Si `connect()` falla cuando no había conexión, el estado anterior se conserva (no pasa a «sin conexión») y la UI muestra un aviso.
- **Rotación de la frase con subida ambigua.** Si la subida con la clave nueva termina sin una respuesta clara, el servicio vuelve a leer la copia remota y adopta la clave nueva solo si esa copia se descifra con ella. Si no, conserva la clave anterior. La clave se guarda solo después de una subida exitosa (ADR-0009).

**Enmienda (2026-10-16, W5).** Dictámenes de Opus en la revisión de W5-08 (PR #76) que precisan el contrato de `SyncService` sin cambiar la decisión:

- **`prepare(): Promise<boolean>`.** Devuelve `true` solo cuando el módulo de Drive y el script de Google quedaron listos, y `false` si la sincronización no está configurada o la carga falló. Nunca rechaza. La pantalla de Ajustes ofrece el segundo paso (el botón que abre la ventana de consentimiento con `connect()`) **solo** cuando `prepare()` devolvió `true`; con `false` se queda en el primer paso y muestra un aviso.
- **`changePassphrase()` devuelve su resultado:** `'changed' | 'busy' | 'failed'`. Solo `'changed'` significa que la copia de Drive y este dispositivo ya usan la frase nueva, y solo con `'changed'` la UI puede decir que la frase cambió. Con `'busy'` (otro dispositivo estaba sincronizando) no cambió nada; con `'failed'` no se confirmó nada y `status` dice por qué (sin conexión, falta autorizar, etc.).
- **Pantalla de W5-08 (PR #84).** La conexión en dos pasos de la enmienda de W4 ya existe en Ajustes, con e2e de la ventana emergente en Chromium y WebKit sobre un ID de cliente sintético inyectado al compilar el build de e2e (PR #75).

**Enmienda (2026-10-21, W7, decisiones del dueño).** Dos decisiones para v1 que no cambian el modelo de sincronización:

- **Tope de descarga de 20 MiB** (W7-03), el mismo de la importación (ADR-0007). `downloadFile` rechaza con `SyncError('InvalidRemote')` si `Content-Length` pasa el tope, antes de leer el cuerpo; sin esa cabecera, o con una que miente, cuenta los bytes del flujo y lo cancela en cuanto pasa el tope. La sesión ya se detiene ante `InvalidRemote` sin guardar ni subir nada (decisión 4).
- **«Borrar datos de este dispositivo»** (W7-04) **nunca toca la copia de Drive**. Si Drive está conectado, primero desconecta, lo que revoca el token; después borra las dos bases de IndexedDB de la app (datos y clave). La copia `cuotascasa.json` y su `.prev` se quedan en Drive; para borrarlas, la persona usa «Administrar aplicaciones» en Drive (decisión 8), como explica `/privacidad`.
