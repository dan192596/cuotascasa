# Subconjunto de Google Drive v3 y de GIS que usa CuotasCasa

- **Estado:** congelado en W0-04. Solo lo cambia una micro-tarjeta de contrato de Opus.
- **Quién lo usa:** el proveedor de Drive (W2-09), la sesión de sincronización (W2-08), el mock de Google del e2e (W2-11) y los *fakes* congelados `packages/sync/src/testing/drive-fake.ts` y `packages/sync/src/testing/gis-fake.ts`, que implementan exactamente lo que dice esta página.
- **Tipos:** `packages/sync/src/ports.ts` (`DriveFile`, `DriveFileList`, `DriveCreateMetadata`, `DriveUpdateMetadata`, `DriveCopyRequest`, `DriveErrorResponse`, `DriveOperation`, `GisOAuth2` y afines).
- **Decisiones de fondo:** ADR-0008 (Drive, `appDataFolder`, modelo de token de GIS) y ADR-0024 (orden de la combinación).

## Reglas comunes

- **Alcance OAuth:** solo `https://www.googleapis.com/auth/drive.appdata` (`DRIVE_APPDATA_SCOPE`).
- **Origen:** todas las llamadas de datos van a `https://www.googleapis.com` (`DRIVE_API_ORIGIN`). Ningún otro origen de Drive.
- **Autorización:** cabecera `Authorization: Bearer <access_token>` en cada llamada. Sin token, o con uno vencido o revocado, Drive responde `401` con `reason: authError`.
- **Carpeta:** los archivos viven en `appDataFolder`. Los únicos nombres que usa la app son `cuotascasa.json` (`REMOTE_FILE_NAME`) y `cuotascasa.prev.json` (`REMOTE_PREV_FILE_NAME`).
- **Campos:** Drive v3 solo devuelve `kind`, `id`, `name` y `mimeType` si no se pide `fields`. La app pide siempre los campos que lee, por ejemplo `fields=files(id,name,modifiedTime,version)`; en una lista, `fields` selecciona dentro de `files(...)`. `fields` se valida antes de escribir, también en create, update y copy: un campo desconocido da `400 invalidParameter` y el almacén queda igual.
- **Errores:** cuerpo JSON `{ "error": { "code", "message", "errors": [{ "domain", "reason", "message", ... }] } }`. Referencia: <https://developers.google.com/workspace/drive/api/guides/handle-errors>.
- **Fuera del subconjunto:** cualquier otra llamada es un error de diseño. El *fake* responde `400` con `reason: notInDriveApiSubset` y la registra en `requests` con `operation: 'unsupported'`.
- **No se usan:** `files.delete`, `files.get` sin `alt=media`, subidas reanudables, `changes`, permisos ni papelera (los archivos de `appDataFolder` no se pueden mandar a la papelera).

## Llamadas de Drive v3

### 1. `files.list` (`DriveOperation: 'files.list'`)

- **Para qué:** encontrar `cuotascasa.json` o `cuotascasa.prev.json` y releer el remoto antes de subir (ADR-0008, decisión 5).
- **Petición:** `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%20%3D%20'cuotascasa.json'&fields=files(id,name,modifiedTime,version)`.
- **Parámetros:** `spaces=appDataFolder` (obligatorio); `q`, que es opcional: sin `q` lista todo `appDataFolder`, y con `q` tiene la forma exacta `name = '<nombre>'`, opcionalmente seguida de `and trashed = false`; `fields`.
- **Respuesta:** `200` con `DriveFileList` (`{ "files": [DriveFile, ...] }`).
- **Nombres duplicados:** si varios archivos comparten el nombre (dos dispositivos que crean `cuotascasa.json` a la vez), el proveedor usa el de id menor, en orden de string (`SyncProvider.findFile`), para que todos los dispositivos converjan en el mismo archivo.
- **Errores que emula el fake:** `403 insufficientScopes` si `spaces` no es `appDataFolder`; `400 invalidQuery` si `q` tiene otra forma; `400 invalidParameter` si `fields` pide un campo fuera de `kind, id, name, mimeType, modifiedTime, version, parents`.
- **Referencia oficial:** <https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list>, sintaxis de `q`: <https://developers.google.com/workspace/drive/api/guides/search-files>, `appDataFolder`: <https://developers.google.com/workspace/drive/api/guides/appdata>.

### 2. `files.get` con `alt=media` (`DriveOperation: 'files.get.media'`)

- **Para qué:** descargar el contenido del sobre cifrado.
- **Petición:** `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`.
- **Respuesta:** `200` con el contenido tal cual y `Content-Type` igual al `mimeType` del archivo.
- **Errores que emula el fake:** `404 notFound` si el id no existe.
- **Referencia oficial:** <https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get> y <https://developers.google.com/workspace/drive/api/guides/manage-downloads>.

### 3. `files.create` multiparte (`DriveOperation: 'files.create.multipart'`)

- **Para qué:** crear `cuotascasa.json` la primera vez, o `cuotascasa.prev.json` si el proveedor lo crea en lugar de copiarlo.
- **Petición:** `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,version`, con `Content-Type: multipart/related; boundary=<b>` y exactamente dos partes: los metadatos JSON (`DriveCreateMetadata`: `name`, `parents: ["appDataFolder"]` y, opcional, `mimeType`) y el contenido (`Content-Type: application/json`).
- **Respuesta:** `200` con el `DriveFile` creado (`version: "1"`).
- **Errores que emula el fake:** `403 insufficientScopes` si `parents` no es exactamente `["appDataFolder"]`; `400 required` sin `name`; `400 badContent` o `400 parseError` si el cuerpo no es multiparte de dos partes con metadatos JSON de tipo objeto.
- **Referencia oficial:** <https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create> y <https://developers.google.com/workspace/drive/api/guides/manage-uploads>.

### 4. `files.update` multiparte (`DriveOperation: 'files.update.multipart'`)

- **Para qué:** reemplazar el contenido de `cuotascasa.json` (o de `cuotascasa.prev.json`) sin crear duplicados.
- **Petición:** `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=multipart&fields=id,name,modifiedTime,version`, con las mismas dos partes; los metadatos (`DriveUpdateMetadata`) pueden ser `{}`.
- **Respuesta:** `200` con el `DriveFile` actualizado; `version` sube en 1 y `modifiedTime` cambia.
- **Errores que emula el fake:** `404 notFound` si el id no existe; `403 fieldNotWritable` si los metadatos traen `parents`; los mismos `400` del cuerpo multiparte.
- **Referencia oficial:** <https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update> y <https://developers.google.com/workspace/drive/api/guides/manage-uploads>.

### 5. `files.copy` (`DriveOperation: 'files.copy'`)

- **Para qué:** guardar el remoto anterior como `cuotascasa.prev.json` antes de sobrescribir (ADR-0008, decisión 4, paso 7) cuando todavía no existe una copia previa. Si ya existe, el proveedor la actualiza con `files.update`, porque `appDataFolder` no permite papelera y el subconjunto no incluye `files.delete`.
- **Petición:** `POST https://www.googleapis.com/drive/v3/files/{fileId}/copy?fields=id,name,modifiedTime,version` con cuerpo JSON `DriveCopyRequest` (`{ "name": "cuotascasa.prev.json", "parents": ["appDataFolder"] }`).
- **Respuesta:** `200` con el `DriveFile` nuevo (id nuevo, `version: "1"`, mismo contenido). Sin `name`, Drive nombra la copia `Copy of <nombre>`.
- **Errores que emula el fake:** `404 notFound` si el id no existe; `403 insufficientScopes` si `parents` no es `["appDataFolder"]`; `400 parseError` si el cuerpo no es JSON o no es un objeto JSON.
- **Referencia oficial:** <https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy>.

### Recurso `File`

Campos que la app lee: `id`, `name`, `mimeType`, `modifiedTime` (RFC 3339 en UTC) y `version` (entero como string, sube con cada cambio de contenido). Referencia: <https://developers.google.com/workspace/drive/api/reference/rest/v3/files>.

## Errores inyectables en el fake

`driveFake.failNext(failure, { operation?, times? })` hace fallar las siguientes peticiones que coincidan (por defecto, la siguiente de cualquier operación):

| Falla | Respuesta | `reason` por defecto | Cómo la trata el proveedor (W2-09) |
|---|---|---|---|
| `{ kind: 'status', status: 401 }` | `401 Invalid Credentials` | `authError` | `SyncError('AuthError')` |
| `{ kind: 'status', status: 403 }` | `403 Rate Limit Exceeded` | `rateLimitExceeded` (se puede cambiar con `reason`, por ejemplo `insufficientFilePermissions`) | `SyncError('NetworkError')` si `reason` es `rateLimitExceeded` o `userRateLimitExceeded`; `SyncError('AuthError')` con cualquier otro `reason` |
| `{ kind: 'status', status: 429 }` | `429 Rate Limit Exceeded` | `rateLimitExceeded` | `SyncError('NetworkError')`, sea cual sea el `reason` |
| `{ kind: 'status', status: 500 \| 502 \| 503 }` | `5xx` con su mensaje | `backendError` | `SyncError('NetworkError')` |
| `{ kind: 'network' }` | `fetch` rechaza con `TypeError('Failed to fetch')` | — | `SyncError('NetworkError')` |

Cualquier otro estado no 2xx (por ejemplo `400` o `404`): `SyncError('NetworkError')`, para que la siguiente sincronización iniciada por el usuario empiece de nuevo.

## Google Identity Services: modelo de token

Referencia oficial: guía <https://developers.google.com/identity/oauth2/web/guides/use-token-model> y referencia de la API <https://developers.google.com/identity/oauth2/web/reference/js-reference>.

| Llamada | Uso en la app | Comportamiento del fake |
|---|---|---|
| `google.accounts.oauth2.initTokenClient({ client_id, scope, callback, error_callback, prompt })` | Crear el cliente de token al conectar (el script se carga solo entonces) | Devuelve un `GisTokenClient`; no abre nada todavía |
| `tokenClient.requestAccessToken(overrides?)` | Pedir el token con ventana emergente. La primera vez muestra el consentimiento. Las renovaciones usan `{ prompt: '' }` y solo ocurren dentro de una sincronización iniciada por el usuario | Responde de forma asíncrona según la acción de usuario en cola (`approve` por defecto, `deny`, `close-popup`, `block-popup`). Registra `prompt` y si habría pantalla de consentimiento |
| `callback(tokenResponse)` | Recibir `{ access_token, expires_in, scope, token_type: 'Bearer' }` o `{ error: 'access_denied', ... }` | `expires_in` es un número de segundos (3599 por defecto). `@types/google.accounts` lo declara como string; el proveedor lo convierte con `Number()` |
| `error_callback({ type })` | Ventana cerrada (`popup_closed`) o bloqueada (`popup_failed_to_open`) | Se llama con esos dos tipos |
| Vencimiento | El token vive unos 3600 s y solo en memoria | `gisFake.isTokenValid(token)` es falso desde `emitido + expires_in × 1000` ms en el reloj inyectado; el fake de Drive lo usa para responder `401` solo si se crea con `createDriveFake({ isTokenValid: gisFake.isTokenValid })`; por defecto acepta cualquier token no vacío |
| `google.accounts.oauth2.revoke(accessToken, done)` | «Desconectar Drive» | Marca el token como revocado, olvida el consentimiento y llama `done` de forma asíncrona |

## Uso en el e2e (W2-11)

El mock de Google del e2e enruta `https://accounts.google.com/gsi/client` a un script que instala `gisFake.oauth2` como `window.google.accounts.oauth2` (`gisFake.install(window)`) y las URLs de Drive de esta página a `driveFake.handle(request)`, con el almacén inspeccionable (`files()`, `fileByName()`, `requests`). Ni el fake ni el e2e llaman a Google de verdad.
