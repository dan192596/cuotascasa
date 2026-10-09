# Guía de despliegue en Cloudflare: activar el despliegue dormido

Para el **dueño del proyecto**. Se hace una sola vez. El flujo `.github/workflows/deploy.yml` (W3-17) ya está en el repositorio, pero está **dormido**: no corre hasta que configures todo lo de esta guía. Mientras tanto, nada sale a internet.

> **Repositorio público.** Esta guía usa solo marcadores (`<tu-dominio>`, `<subdominio>`, `<id-de-cuenta>`). Nunca escribas en el repositorio, en un issue, en un PR ni en una captura tu dominio real, el ID de cuenta, el ID de zona ni el token de Cloudflare. Esos valores solo viven en la configuración de GitHub y de Cloudflare.

## Qué vas a configurar

| Pieza | Dónde vive |
|---|---|
| Dominio `<tu-dominio>` y sitio en `<subdominio>.<tu-dominio>` | Registrador del dominio y Cloudflare (ADR-0002: el sitio va en un subdominio y el dominio raíz queda libre) |
| Cuenta y zona de Cloudflare | Cloudflare |
| Token de API y ID de cuenta | Secretos del entorno `production` de GitHub |
| Host del sitio e ID de cliente de Google | Variables del entorno `production` de GitHub |
| Interruptor del despliegue | Variable del repositorio `DEPLOY_ENABLED` |

El despliegue publica solo el sitio estático (un Worker de solo recursos, ADR-0022). `wrangler.jsonc` desactiva `workers.dev` y las URL de vista previa, así que el sitio **solo** responde en tu subdominio.

## Pasos

### 1. Comprar el dominio

1. Compra `<tu-dominio>` en el registrador que prefieras (o en Cloudflare Registrar). Es el único gasto aceptado (ADR-0002).
2. Elige el subdominio del sitio, por ejemplo `<subdominio>.<tu-dominio>`. No lo crees a mano en los DNS: el primer despliegue lo crea.

### 2. Crear la cuenta y la zona de Cloudflare

1. Crea una cuenta gratuita de Cloudflare (o usa la tuya).
2. **Agregar un dominio** → escribe `<tu-dominio>` → elige el plan **Free**.
3. Cloudflare te muestra dos servidores de nombres. En tu registrador, reemplaza los servidores de nombres del dominio por esos dos.
4. Espera a que la zona aparezca como **Activa** (de minutos a unas horas). Cloudflare te avisa por correo.

### 3. Crear el token de API

1. En Cloudflare: **Mi perfil** → **Tokens de API** → **Crear token**.
2. Usa la plantilla **«Edit Cloudflare Workers»**.
3. En **Recursos de cuenta**, deja **solo tu cuenta**. En **Recursos de zona**, deja **solo la zona `<tu-dominio>`**. No uses «Todas las cuentas» ni «Todas las zonas».
4. Crea el token y cópialo una sola vez: Cloudflare no lo vuelve a mostrar. No lo pegues en ningún archivo.
5. Si el primer despliegue (paso 7) falla al asociar el dominio, edita el token y agrega el permiso **Zona → DNS → Editar** para la misma zona; luego vuelve a ejecutar el despliegue.

### 4. Copiar el ID de cuenta

En el panel de Cloudflare, en la página de la zona o de **Workers y Pages**, copia el **ID de cuenta** (`<id-de-cuenta>`). No es un secreto fuerte, pero se guarda como secreto para no publicarlo.

### 5. Crear el entorno `production` en GitHub

1. En el repositorio: **Settings** → **Environments** → **New environment** → nombre `production`.
2. Activa **Required reviewers** y agrégate como revisor: cada despliegue esperará tu aprobación.
3. En **Deployment branches and tags**, elige **Selected branches and tags** y agrega solo `main`.

### 6. Guardar secretos y variables

En **Environments** → `production`:

| Tipo | Nombre | Valor |
|---|---|---|
| Secreto | `CLOUDFLARE_API_TOKEN` | El token del paso 3 |
| Secreto | `CLOUDFLARE_ACCOUNT_ID` | El ID del paso 4 |
| Variable | `SITE_HOST` | `<subdominio>.<tu-dominio>`: solo el host, en minúsculas, sin `https://`, ruta ni puerto |
| Variable | `GOOGLE_CLIENT_ID` | Puede quedar **vacía** en el primer despliegue: la app muestra Drive como «no configurado» (ADR-0008, decisión 6) |

Después, en **Settings** → **Secrets and variables** → **Actions** → pestaña **Variables**, crea la **variable del repositorio** `DEPLOY_ENABLED` con valor `true`. Tiene que ser del repositorio, no del entorno: el `if` del trabajo no ve las variables del entorno.

### 7. Aprobar el primer despliegue

1. El despliegue se dispara cuando termina bien un CI de un push a `main`. Si no hay ninguno nuevo, haz un cambio pequeño por PR y fusiónalo.
2. En **Actions** → **Deploy**, la ejecución queda esperando tu aprobación. Revisa que corresponda al commit esperado y apruébala.
3. El flujo valida la configuración, compila, corre las pruebas del build, `bundle:check` y `edge:check` local, despliega con `wrangler deploy --domain` y al final corre `edge:check` contra el sitio en vivo.
4. **Guarda el registro** del paso «Edge routing and headers against the live site» de esa primera ejecución: es la evidencia de que las rutas y las cabeceras en producción son las correctas. Si lo compartes, revisa antes que no muestre tu dominio.

### 8. Configurar Google Cloud

Con `/` y `/privacidad` ya en línea, sigue [la guía de Google Cloud](google-cloud-setup.md). Al terminar, pon el ID de cliente en la variable `GOOGLE_CLIENT_ID` del entorno `production` y aprueba un nuevo despliegue.

## Verificación

- `https://<subdominio>.<tu-dominio>/` muestra la landing y `/privacidad` la política de privacidad.
- La ejecución de **Deploy** terminó en verde, incluido el `edge:check` en vivo.
- En Cloudflare, el Worker `cuotascasa` no tiene subdominio `workers.dev` activo ni URL de vista previa.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| El flujo **Deploy** no aparece o se salta | `DEPLOY_ENABLED` no es `true`, es variable del entorno en vez del repositorio, o el CI no fue un push a `main` |
| «SITE_HOST must be a bare lowercase host name» | `SITE_HOST` lleva `https://`, una barra, un puerto o mayúsculas |
| Error de autenticación de Cloudflare | Token vencido, de otra cuenta o sin la zona; o `CLOUDFLARE_ACCOUNT_ID` equivocado |
| Falla al asociar el dominio | Falta el permiso **Zona → DNS → Editar** (paso 3.5) o la zona aún no está activa |
| Falla el `edge:check` en vivo | Propagación lenta: el flujo reintenta varias veces; si sigue fallando, vuelve a ejecutarlo más tarde |

Nunca pegues el token, el ID de cuenta ni tu dominio en un issue o PR para pedir ayuda: describe el error con marcadores.
