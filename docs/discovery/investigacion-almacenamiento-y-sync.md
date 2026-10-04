# Investigación: almacenamiento y sincronización sin backend

Fecha: 2026-10-04 · Alimenta: ADR-0006, ADR-0007, ADR-0008, ADR-0009, ADR-0017, ADR-0024 (reservado)

## 1. La pregunta

Sin servidor, los datos viven en el navegador. Hay que responder tres cosas:

1. ¿Dónde se guardan y qué tan durables son en cada navegador?
2. ¿Cómo se evita perderlos si el navegador los borra o el dispositivo se pierde?
3. ¿Cómo se usan en más de un dispositivo sin un backend propio?

## 2. Almacén local: IndexedDB

- **IndexedDB** es el único almacén del navegador con transacciones, índices y capacidad suficiente. `localStorage` es
  síncrono, solo guarda strings y tiene un límite bajo.
- Se usa mediante **Dexie 4.4** detrás de un puerto de repositorios, con un adaptador en memoria para pruebas, el
  simulador y el desarrollo, y una suite de contrato común (ADR-0006).
- **IndexedDB local no se cifra.** Cifrarlo no protege contra XSS, porque el código que corre en el origen tendría la
  clave, y contra el robo del equipo ya protege el cifrado del disco (FileVault). Se cifran solo la copia en Drive y, si el
  usuario quiere, el respaldo exportado.

## 3. Durabilidad por navegador

| Navegador | Comportamiento por defecto | `navigator.storage.persist()` | Riesgo para CuotasCasa |
|---|---|---|---|
| Chrome / Edge | Almacenamiento *best-effort*: se puede desalojar bajo presión de espacio | Lo concede el navegador **sin preguntar**, según heurísticas (por ejemplo, app instalada o uso frecuente) | Bajo con la PWA instalada |
| Firefox | *Best-effort* | Muestra un **aviso** al usuario | Bajo si se acepta |
| Safari (pestaña normal) | **ITP borra todo el almacenamiento escribible por script** (IndexedDB, localStorage, Cache API, service workers) tras **7 días de uso de Safari sin visitar el sitio** | Disponible, pero **no está verificado que evite el borrado de ITP** | **Alto** |
| Safari, web app en pantalla de inicio / Dock | Las web apps en pantalla de inicio quedan fuera de esa regla según WebKit | — | En macOS, "Agregar al Dock" **probablemente** queda exento, **sin verificar** |

**OPFS** (Origin Private File System) no resuelve nada: comparte la cuota y las reglas de desalojo del origen.

### Decisiones derivadas

- **Banner persistente** cuando la app corre en Safari fuera del modo *standalone*.
- Recomendar **Chrome o Edge con la PWA instalada**.
- Llamar a `persist()` en el **primer guardado** (una vez por sesión) y mostrar el resultado de `persisted()` en Ajustes.
- **Recordatorio de respaldo** cuando pasan más de 30 días o se acumulan más de 20 cambios sin respaldo.
- **Google Drive** como copia durable fuera del navegador.
- Riesgo residual aceptado: si Safari borra los datos y nunca se sincronizó ni respaldó, se pierden.

## 4. File System Access API

- Permitiría un autorespaldo a una carpeta local, incluso una carpeta sincronizada por un cliente de nube de escritorio.
- Solo existe en navegadores **Chromium**; no hay soporte en Safari ni en Firefox.
- El permiso sobre el archivo se vuelve a pedir en sesiones nuevas, así que no es realmente automático.
- **Se descartó de v1:** Drive ya cubre la durabilidad y en Safari, el navegador más riesgoso, no ayudaría.

## 5. Opciones de sincronización sin backend

| Opción | Ventajas | Desventajas | Resultado |
|---|---|---|---|
| Solo respaldo JSON manual | Funciona en todo navegador, sin terceros | Depende de que el usuario se acuerde | **Incluido** como base y como respaldo independiente |
| Carpeta sincronizada vía File System Access | Sin OAuth | Solo Chromium; permisos repetidos | Descartado |
| **Google Drive `appDataFolder`** | Gratis; carpeta oculta y aislada por app; alcance mínimo no sensible | Token corto sin renovación silenciosa; sin escritura condicional confirmada | **Elegido** |
| Otros proveedores (Dropbox, OneDrive, iCloud) | Alternativas para quien no use Google | Cada uno exige su propia app OAuth y su SDK | Fuera de v1; caben detrás del puerto `SyncProvider` |
| Backend propio | Sincronización en vivo y compartir | Cuentas, MFA, admin, costo y mantenimiento | Archivado (ver [investigacion-backend.md](investigacion-backend.md)) |

## 6. Google Drive `appDataFolder`: hechos verificados

**La carpeta**

- Es una carpeta **oculta, propia de la app**: el usuario no la ve en su Drive y otras apps no la leen.
- Se borra desde Drive: *Configuración → Administrar apps → Borrar datos ocultos de la app*. La página de privacidad
  lo explica.

**El permiso (scope `drive.appdata`)**

- Es un alcance **no sensible**: no requiere verificación de Google.
- Con la pantalla de consentimiento **publicada en producción** no aplica el tope de 100 usuarios.
- En estado *Testing*, las autorizaciones **expiran a los 7 días**: hay que publicar la pantalla de consentimiento.
- Publicar exige una **página de inicio pública**, una **política de privacidad** y un **dominio verificado**. Por eso la
  landing y `/privacidad` son públicas y prerenderizadas.

**La autenticación (Google Identity Services, modelo de token)**

- El script de GIS se carga **solo cuando el usuario conecta Drive**; nunca en `/`.
- El modelo de token entrega un **access token de aproximadamente 1 hora y ningún refresh token**. El token vive **solo en
  memoria**.
- Por eso la sincronización la inicia el usuario con el botón **"Sincronizar"**. Pedir un token nuevo con `prompt: ''`
  igual abre una ventana emergente, así que no hay renovación invisible.
- **"Desconectar Drive"** revoca el token.

**La API**

- **No se confirmó una escritura condicional atómica** (compare-and-set) en Drive. Se hace un re-chequeo de mejor esfuerzo
  antes de subir y se conserva la versión anterior como `cuotascasa.prev.json`.

**La CSP**

- `/` no permite conexiones externas.
- `/app` permite solo los orígenes de cuentas de Google y `googleapis`.
- La compatibilidad de GIS con Trusted Types se prueba en el spike W1-08 y se decide en ADR-0021 (tarjeta W2-02).

## 7. Algoritmo de sincronización

1. Descargar `cuotascasa.json` del `appDataFolder`.
2. Descifrarlo con la clave del dispositivo.
3. Combinar **por registro**: gana el `updatedAt` más reciente; un empate se resuelve por id de dispositivo; las marcas de
   borrado (`deletedAt`) se combinan como un registro más y ganan un empate total. El orden exacto lo define ADR-0024.
4. Purgar del conjunto combinado las marcas de borrado vencidas, con la regla de purga de ADR-0008 (decisión 4), la
   única fórmula del proyecto. La purga va **antes** de guardar y subir, así que lo subido ya no trae esas marcas.
5. Guardar el resultado en IndexedDB en una sola transacción.
6. Cifrar con un IV nuevo.
7. Subir, conservando la versión remota anterior como `cuotascasa.prev.json`.
8. `markSynced`, solo tras una subida exitosa.

Este es el orden de ADR-0008 (decisión 4), que manda si algo difiere; el orden total del merge está en ADR-0024.

Sin conexión, la app muestra **"cambios sin sincronizar"** y no bloquea nada. La combinación es pura, conmutativa e
idempotente, y se prueba con propiedades (fast-check).

**Riesgos residuales:**

- relojes desfasados entre dispositivos;
- un registro borrado que **reaparece** si un dispositivo sin sincronizar por más de 90 días sube una copia vieja;
- dos ediciones del mismo registro en dispositivos distintos: gana la última y la otra se pierde.

Se mitigan con sellos monótonos por dispositivo, desempate determinista y la copia previa.

## 8. Cifrado de la copia en Drive

| Elemento | Decisión |
|---|---|
| Algoritmo | **AES-256-GCM** (WebCrypto) |
| Derivación de clave | **PBKDF2-SHA256, 600,000 iteraciones**, sal aleatoria (cifra recomendada por OWASP para PBKDF2-HMAC-SHA256) |
| Sobre | Versionado: versión, sal e IV junto al texto cifrado |
| Clave en el dispositivo | `CryptoKey` **no exportable** guardada en IndexedDB: la frase se pide **una vez por dispositivo** |
| Cambio de frase | Desde cualquier dispositivo que tenga la clave |
| Frase olvidada | Solo se pierden datos si además se pierden **todos** los dispositivos con la clave |
| Recomendación | Guardar la frase en un gestor de contraseñas |
| Respaldo JSON | Puede cifrarse con la misma frase, de forma opcional |

La clave no exportable impide copiarla, pero un XSS podría **usarla** mientras la página está abierta. Por eso la defensa
principal es la CSP estricta y la higiene de dependencias (ADR-0016).

## 9. Respaldo JSON

- Documento `{format: 'cuotascasa', version, exportedAt, deviceId, appVersion, data: {...}}`.
- Esquema zod por versión y migraciones puras encadenadas.
- Importar: leer, migrar, validar, **mostrar vista previa con conteos**, tomar una **instantánea** del estado actual,
  reemplazar en una sola transacción y permitir **deshacer** (ADR-0007).

## 10. Preguntas abiertas

- Si "Agregar al Dock" en Safari para macOS exime del borrado de ITP. Se verificará a mano; mientras tanto, el banner sigue.
- Si GIS funciona con Trusted Types estrictos (spike W1-08, ADR-0021).
- Si Drive ofrece alguna forma de escritura condicional que vuelva atómica la subida.

## Fuentes

Consultadas el 2026-10-04.

- WebKit, *Full Third-Party Cookie Blocking and More* (límite de 7 días para almacenamiento escribible por script y
  exención de web apps en pantalla de inicio): <https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/>.
- MDN, `StorageManager.persist()`: <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist>.
- web.dev, *Persistent storage* (heurísticas de Chrome): <https://web.dev/articles/persistent-storage>.
- MDN, File System API: <https://developer.mozilla.org/en-US/docs/Web/API/File_System_API>.
- Google Drive API, carpeta de datos de la app: <https://developers.google.com/workspace/drive/api/guides/appdata>.
- Google Drive API, elección de scopes: <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>.
- Google Identity Services, modelo de token: <https://developers.google.com/identity/oauth2/web/guides/use-token-model>.
- Google, OAuth 2.0 (caducidad en estado *Testing*): <https://developers.google.com/identity/protocols/oauth2>.
- OWASP, *Password Storage Cheat Sheet*: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>.
