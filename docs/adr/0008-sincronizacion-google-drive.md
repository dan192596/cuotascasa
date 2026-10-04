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
   2. Descifrarlo.
   3. Combinar por registro: gana el `updatedAt` mayor, con desempate por `updatedByDevice`. Las marcas de borrado se respetan y ganan un empate total.
   4. Purgar del conjunto combinado las marcas de borrado vencidas (regla de purga, abajo).
   5. Guardar el resultado localmente. Así la purga es local **y** del conjunto que se sube.
   6. Cifrar.
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
   - **Riesgo residual:** un dispositivo sin sincronizar durante más de 90 días puede resucitar un registro purgado, porque su copia viva gana el merge al no encontrar la marca. Lo mismo pasa con una marca antigua importada de un respaldo (ADR-0007 conserva los sellos) que nunca se subió. Queda documentado y diferido a ADR-0024.
5. **Una sincronización a la vez**, también entre pestañas (Web Locks, candado `cuotascasa-sync`). Drive no ofrece una escritura atómica condicionada confirmada, así que antes de subir se vuelve a verificar el estado remoto («mejor esfuerzo»).
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
- **Resurrección tras la purga:** un dispositivo sin sincronizar durante más de 90 días puede revivir registros purgados. Riesgo residual aceptado; su tratamiento queda diferido a ADR-0024.

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

- ADR-0001, ADR-0002, ADR-0005, ADR-0009, ADR-0016, ADR-0020, ADR-0021 (reservado), ADR-0024 (reservado).
- `docs/specs/drive-api-subset.md`; tarjetas W1-06, W2-08, W2-09, W3-18, W4-09 y W5-08.
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
