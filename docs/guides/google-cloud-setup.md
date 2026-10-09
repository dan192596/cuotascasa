# Guía de Google Cloud: cliente OAuth, pantalla de consentimiento y dominios

Para el **dueño del proyecto**. Se hace una sola vez, cuesta US$0 y deja a CuotasCasa listo para sincronizar con Google Drive (ADR-0008). Hay que terminarla **antes** de que W3-17 lea la variable `GOOGLE_CLIENT_ID` en el despliegue.

> **Repositorio público.** Esta guía usa solo marcadores (`<tu-dominio>`, `<subdominio>`, `<puerto>`, `<id-del-proyecto>`). Nunca escribas en el repositorio, en un PR ni en una captura tu correo, el ID del proyecto, el ID de cliente ni tu dominio real. El ID de cliente solo vive en una variable de GitHub Actions (paso 9).

## Qué vas a configurar

| Pieza | Valor |
|---|---|
| Alcance (scope) | `https://www.googleapis.com/auth/drive.appdata`, y ningún otro. No es sensible: no pide verificación de Google ni tiene tope de 100 usuarios una vez publicada la pantalla (ADR-0008) |
| Tipo de cliente | Aplicación web, con el modelo de token de Google Identity Services (GIS) |
| Secreto de cliente | No se usa. La app no tiene backend y no guarda tokens de actualización: el token de acceso (unos 60 minutos) vive solo en memoria |
| Sitio publicado | `https://<subdominio>.<tu-dominio>` |
| Página de inicio | `https://<subdominio>.<tu-dominio>/` |
| Política de privacidad | `https://<subdominio>.<tu-dominio>/privacidad` (sin barra final: es la URL canónica, ADR-0022) |
| Origen de JavaScript de producción | `https://<subdominio>.<tu-dominio>` |
| Origen de JavaScript para pruebas locales | `http://localhost:<puerto>` |
| Dominio autorizado | `<tu-dominio>` (el dominio base, sin subdominio ni `https://`) |

## Antes de empezar

- Una cuenta de Google personal.
- El dominio ya comprado y el subdominio apuntando al despliegue de Cloudflare (ADR-0002; la ruta del subdominio la crea W3-17). Si aún no lo activas, sigue primero [la guía de despliegue en Cloudflare](despliegue-cloudflare.md).
- La página `/` y la página `/privacidad` **ya publicadas** en el subdominio. Google las abre durante la revisión de la marca. Si todavía no existen, haz primero los pasos 1 a 5 y vuelve a los pasos 6 a 8 cuando estén en línea.
- Acceso a los DNS del dominio, para la verificación del paso 4.

## Pasos

### 1. Crear el proyecto

1. Entra a la consola de Google Cloud (<https://console.cloud.google.com/>).
2. En el selector de proyectos, elige **Proyecto nuevo**.
3. Nombre: `CuotasCasa`. No necesitas organización ni facturación.
4. Crea el proyecto y selecciónalo. Anota el ID (`<id-del-proyecto>`) solo en tu gestor de contraseñas, no en el repositorio.

### 2. Activar la API de Drive

1. Menú **APIs y servicios** → **Biblioteca**.
2. Busca **Google Drive API** y pulsa **Habilitar**.

No hace falta habilitar ninguna otra API.

### 3. Configurar la marca y la audiencia (pantalla de consentimiento)

En la consola nueva este menú se llama **Google Auth Platform**; en la antigua, **Pantalla de consentimiento de OAuth**. Los nombres de los campos son los mismos.

1. **Introducción** (o **Comenzar**): nombre de la aplicación `CuotasCasa`; correo de asistencia: el tuyo (es el único dato personal que ves en la consola, no se escribe en el repo).
2. **Audiencia**: elige **Externos**. Una cuenta personal de Gmail no puede elegir «Internos».
3. **Marca** (*Branding*):
   - Logotipo: opcional. Si lo subes, usa el ícono del proyecto, nunca una captura de datos reales. Un logotipo obliga a una revisión de marca más larga; para empezar, déjalo vacío.
   - **Página principal de la aplicación**: `https://<subdominio>.<tu-dominio>/`
   - **Vínculo a la política de privacidad**: `https://<subdominio>.<tu-dominio>/privacidad`
   - Términos del servicio: déjalo vacío (no hay).
   - **Dominios autorizados**: agrega `<tu-dominio>`. Google pide el dominio base, no el subdominio.
   - Correo de contacto del desarrollador: el tuyo (lo ve Google, no los usuarios).
4. Guarda.

### 4. Verificar el dominio en Search Console

Google exige que seas dueño del dominio de la página principal y de la política de privacidad.

1. Entra a Search Console (<https://search.google.com/search-console>) con la **misma cuenta** que creó el proyecto de Google Cloud.
2. **Agregar propiedad** → **Dominio** → escribe `<tu-dominio>`.
3. Search Console muestra un registro `TXT`. Agrégalo en los DNS del dominio (en Cloudflare: **DNS** → **Registros** → **Agregar registro**, tipo `TXT`, nombre `@`, contenido el valor que te dio).
4. Espera unos minutos y pulsa **Verificar**. La propiedad de dominio cubre todos los subdominios, también `<subdominio>.<tu-dominio>`.
5. Vuelve a **Marca** en Google Auth Platform: junto a `<tu-dominio>` no debe aparecer ningún aviso de dominio sin verificar.

Mantén el registro `TXT` en los DNS para siempre; si lo quitas, Google puede retirar la verificación (ADR-0002 lo lista como riesgo, y W7-01 lo revisa antes del release).

### 5. Agregar el alcance `drive.appdata`

1. **Acceso a los datos** (*Data Access*) → **Agregar o quitar permisos**.
2. Marca solo `https://www.googleapis.com/auth/drive.appdata` («Ver y administrar sus propios datos de configuración en Google Drive»). Está en la lista de alcances **no sensibles**.
3. No agregues `drive`, `drive.file` ni `userinfo`. Con más alcances la app pasaría a verificación y el cuadro de consentimiento sería más alarmante (ADR-0008, alternativas).
4. Guarda.

### 6. Crear el ID de cliente OAuth

1. **Clientes** → **Crear cliente**.
2. Tipo de aplicación: **Aplicación web**. Nombre: `CuotasCasa web`.
3. **Orígenes de JavaScript autorizados** (cada uno con esquema, sin ruta y sin barra final):
   - `https://<subdominio>.<tu-dominio>`
   - `http://localhost:<puerto>` solo si vas a probar con este cliente; la recomendación es un cliente aparte para pruebas (ver «Cliente de prueba», abajo).
4. **URI de redireccionamiento autorizados**: déjalo vacío. El modelo de token de GIS usa una ventana emergente, no una redirección.
5. Crea el cliente. Google muestra el **ID de cliente**, con la forma `000000000000-placeholder.apps.googleusercontent.com`.
6. No descargues el JSON del cliente: la app no usa secreto de cliente. Si la consola ofrece un secreto, ignóralo y no lo copies a ningún lado.

Reglas de los orígenes:

- Solo `https://` en producción. `http://` solo se acepta para `localhost`.
- No uses `www`, ni barra final, ni `/app`, ni `/privacidad`: un origen es solo esquema, host y puerto.
- Un cambio de origen puede tardar de unos minutos a unas horas en aplicarse.

### 7. Publicar la pantalla de consentimiento en producción

Es el paso que más se olvida. En estado **Pruebas** (*Testing*) las autorizaciones vencen a los **7 días** y solo funcionan para los usuarios de prueba que agregues.

1. **Audiencia** → **Estado de publicación** → **Publicar aplicación** → **Confirmar**.
2. El estado debe decir **En producción**.
3. Como el único alcance es no sensible, **no pide verificación** de Google ni envío de video. Si la consola ofrece «Preparar para verificación», no la inicies.

### 8. Entender qué verán los usuarios mientras la marca no esté verificada

Con un alcance no sensible, la app funciona en producción sin verificación. Aun así, mientras Google no revise la marca (nombre, logotipo y dominios), el usuario puede ver:

- En la ventana emergente de Google: el nombre de la aplicación y el correo de asistencia, y el texto «CuotasCasa quiere acceder a tu cuenta de Google» con un único permiso: «Ver y administrar sus propios datos de configuración en Google Drive».
- Si Google todavía no revisó la marca, puede aparecer la nota «Google no ha verificado esta app». Para alcances no sensibles es informativa: el usuario sigue con **Continuar**. Para quien dude, la política (`/privacidad`) explica qué se accede y cómo revocarlo.
- Si ves la pantalla roja **«Acceso bloqueado: la app no ha completado el proceso de verificación»**, la app sigue en estado **Pruebas** o pide un alcance sensible: revisa los pasos 5 y 7.
- Si el estado quedó en **Pruebas**, solo los correos de **Usuarios de prueba** pueden conectarse y la autorización vence a los 7 días.

Esto no se arregla en el código: depende del estado en la consola.

### 9. Guardar el ID de cliente en GitHub Actions

1. En el repositorio de GitHub: **Settings** → **Secrets and variables** → **Actions** → pestaña **Variables** (no «Secrets»: el ID de cliente es público por diseño, pero no se escribe en el código).
2. **New repository variable** (o, si usas el entorno protegido `production` de W3-17, en **Environments** → `production` → **Environment variables**).
3. Nombre: `GOOGLE_CLIENT_ID`. Valor: el ID del paso 6.
4. Guarda. El despliegue de W3-17 lo inyecta al compilar con `--define GOOGLE_CLIENT_ID`; las compilaciones de desarrollo y de pruebas lo dejan vacío y la app muestra Drive como «no configurado» (ADR-0008, decisión 6).

No pegues el valor en `README`, ADR, issues ni PRs: `gitleaks` tiene una regla que bloquea cualquier ID de cliente real en el repositorio (ADR-0015).

### 10. Cliente de prueba para `localhost` (opcional, recomendado)

Sirve para la prueba manual del popup de consentimiento (pendiente del dueño en `docs/specs/spikes/csp-gis-evidence.md`, sección 8) y para el checklist de W6-04, sin tocar el cliente de producción.

1. Repite el paso 6 con otro nombre (`CuotasCasa pruebas locales`) y **solo** el origen `http://localhost:<puerto>` (el puerto de `ng serve`, por omisión 4200, o el de `pnpm build` servido localmente).
2. Compila o sirve localmente pasando ese ID por tu entorno. **Nunca** lo guardes en un archivo versionado ni en las variables de GitHub de producción.
3. Mientras la pantalla de consentimiento esté en producción, no hace falta agregar usuarios de prueba.
4. WebKit (Safari) puede bloquear la ventana emergente si el script de GIS se carga después del gesto del usuario. La app carga GIS solo al pulsar «Conectar Drive» (ADR-0021, decisión 3); si Safari bloquea la ventana la primera vez, permite las ventanas emergentes para el sitio y pulsa de nuevo. Documéntalo como hallazgo en el checklist de W6-04 en lugar de precargar GIS en `/` o `/privacidad`, que no pueden cargar orígenes externos.

## Orígenes y rutas que usa la app

La Política de Seguridad de Contenido de `/app` (ADR-0021, decisión 4 y 7) solo permite estas direcciones de Google. Si Google te pidiera otra, no la habilites: abre una consulta para enmendar el ADR.

| Uso | Dirección |
|---|---|
| Script de GIS | `https://accounts.google.com/gsi/client` |
| API de Drive (metadatos) | `https://www.googleapis.com/drive/v3/` |
| API de Drive (subida) | `https://www.googleapis.com/upload/drive/v3/` |
| Revocación del token | `https://oauth2.googleapis.com/revoke` |

Las páginas `/` y `/privacidad` no hacen ninguna petición a Google (`connect-src 'self'`): los enlaces que llevan a Google son enlaces que el usuario abre.

## Verificación

Marca cada punto cuando lo compruebes. Ninguno requiere escribir datos reales.

- [ ] En Google Auth Platform → **Audiencia**: estado **En producción** y tipo **Externos**.
- [ ] En **Marca**: la página principal es `https://<subdominio>.<tu-dominio>/`, la política es `https://<subdominio>.<tu-dominio>/privacidad` y el dominio autorizado `<tu-dominio>` no tiene avisos.
- [ ] En **Acceso a los datos**: un solo alcance, `https://www.googleapis.com/auth/drive.appdata`, en la sección de alcances no sensibles.
- [ ] En **Clientes**: el cliente de producción tiene como único origen `https://<subdominio>.<tu-dominio>` y ningún URI de redireccionamiento.
- [ ] En Search Console: la propiedad de dominio `<tu-dominio>` aparece como **verificada**.
- [ ] Abre `https://<subdominio>.<tu-dominio>/` y `https://<subdominio>.<tu-dominio>/privacidad` en una ventana de incógnito: ambas cargan sin iniciar sesión, y `/privacidad` incluye el alcance de Drive y cómo borrar los datos.
- [ ] En GitHub: la variable `GOOGLE_CLIENT_ID` existe y no hay ningún secreto de cliente guardado.
- [ ] Tras el primer despliegue de W3-17 (`pnpm edge:check -- --base-url https://<subdominio>.<tu-dominio>` en verde): en `/app/ajustes`, Drive ya no dice «no configurado».
- [ ] Prueba manual con el cliente del paso 10 en `http://localhost:<puerto>`: al pulsar «Conectar Drive» se abre la ventana de consentimiento, se concede `drive.appdata`, la app sincroniza y «Desconectar Drive» revoca el acceso. Compruébalo en la cuenta de Google → **Seguridad** → conexiones con apps de terceros.
- [ ] Una cuenta que nunca usó la app puede conectar sin que aparezca «Acceso bloqueado».

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Error `origin_mismatch` | El origen no coincide con los autorizados (barra final, ruta o puerto distintos) | Corrige el paso 6 y espera unos minutos |
| `Error 400: invalid_request` o «Acceso bloqueado» | Pantalla en **Pruebas**, o alcance sensible agregado | Pasos 5 y 7 |
| La autorización caduca a los 7 días | La pantalla sigue en **Pruebas** | Paso 7 |
| Drive dice «no configurado» en producción | La variable `GOOGLE_CLIENT_ID` está vacía o el despliegue corrió antes de crearla | Paso 9 y vuelve a desplegar |
| La ventana emergente no se abre en Safari | El navegador bloqueó la ventana | Permite ventanas emergentes para el sitio (paso 10, punto 4) |
| Google dice que el dominio no está verificado | Falta el registro `TXT` o se creó la propiedad con otra cuenta | Paso 4 |

## Referencias

- ADR-0002 (hosting en subdominio y dominio verificado), ADR-0008 (Drive `appDataFolder`, modelo de token), ADR-0015 (higiene del repositorio), ADR-0021 (GIS y orígenes permitidos) y ADR-0022 (rutas y URL canónica de `/privacidad`).
- Requisitos de la página de privacidad: [privacy-requirements.md](../specs/privacy-requirements.md).
- Evidencia y prueba manual de GIS: [csp-gis-evidence.md](../specs/spikes/csp-gis-evidence.md).
- Modelo de token de GIS: <https://developers.google.com/identity/oauth2/web/guides/use-token-model>
- Alcances de Drive: <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>
- Política de datos de usuario de las APIs de Google: <https://developers.google.com/terms/api-services-user-data-policy>
