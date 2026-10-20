# Operación del despliegue en Cloudflare: compuerta, verificación, reversa y rotación del ID de cliente

Para el **dueño del proyecto** (operador). Esta guía cubre lo que pasa **después** de que el despliegue exista: cuándo activarlo, cómo verificar un sitio en vivo, cómo revertir una versión mala y cómo rotar el ID de cliente de Google. La configuración inicial (dominio, zona, token de API, entorno `production`, secretos y variables) **no se repite aquí**: está en [la guía de despliegue en Cloudflare](despliegue-cloudflare.md). Para Google Cloud, ver [la guía de Google Cloud](google-cloud-setup.md).

> **Repositorio público.** Solo marcadores (`<tu-dominio>`, `<subdominio>`, `<id-de-version>`, `<sha-del-commit>`). Nunca escribas en el repositorio, un issue, un PR o una captura tu dominio, el ID de cuenta, el token ni el ID de cliente.

## Compuerta de despliegue

El flujo `.github/workflows/deploy.yml` está **dormido** hasta que la variable del **repositorio** `DEPLOY_ENABLED` valga `true`. Actívala solo cuando se cumpla **todo** esto:

1. [ ] Hiciste [la guía de despliegue](despliegue-cloudflare.md) hasta el paso 6 (entorno `production`, secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, variable `SITE_HOST`).
2. [ ] **Cloudflare Web Analytics está apagado**, en la zona y en el Worker (incluida su inyección automática del script). `/privacidad` promete que no hay analítica; si se enciende, la promesa deja de ser cierta.
3. [ ] **Pasaste el [checklist manual de Drive](drive-sync-manual-checklist.md)** completo, sin fallos abiertos. Puedes ejecutarlo con el cliente de prueba de `localhost` (paso 10 de la guía de Google Cloud) antes de que exista el dominio.
4. [ ] Las promesas de `/privacidad` existen en la UI: «Desconectar Drive», el aviso antes de la primera descarga sin cifrar y el respaldo cifrado (el checklist, pasos 10 a 12, lo comprueba).
5. [ ] En GitHub, el último CI de `main` terminó en verde.

Solo entonces: **Settings** → **Secrets and variables** → **Actions** → **Variables** → crea `DEPLOY_ENABLED` = `true` como variable del **repositorio** (no del entorno: el `if` del trabajo no ve las del entorno).

Para volver a apagarlo, borra la variable o ponla en cualquier valor distinto de `true`. Eso detiene los despliegues nuevos; no revierte lo ya publicado (ver «Revertir»).

## Pasos de un despliegue normal

1. Fusiona un PR a `main`. Cuando termina el CI en verde se dispara **Deploy** (solo para un push a `main` de este repositorio).
2. En **Actions** → **Deploy**, la ejecución espera tu aprobación (revisor requerido del entorno `production`). Comprueba que el commit sea el esperado y aprueba.
3. El flujo compila con los valores inyectados, corre las pruebas del build, `bundle:check` y `edge:check` local, ejecuta `wrangler deploy --domain "$SITE_HOST" --message "CI <sha>"` y al final corre `edge:check` contra el sitio en vivo, con reintentos por propagación.

La ejecución deja un mensaje de versión con el SHA del commit: es lo que te permite saber, más adelante, qué versión es cuál.

## Verificar un sitio en vivo

El propio flujo ya corre esto al final. Para repetirlo a mano (por ejemplo, tras una reversa o para confirmar la propagación), desde la raíz del repositorio con las dependencias instaladas:

```bash
pnpm edge:check --base-url "https://<subdominio>.<tu-dominio>"
```

Corre dos comprobaciones sin iniciar ningún servidor local: el enrutamiento (`/` y `/privacidad` responden 200, `/app` y `/app/**` sirven la app, las rutas desconocidas dan 404, cabeceras de caché) y las cabeceras de seguridad por ruta (CSP). Termina con código 0 si todo coincide. El valor debe ser una URL absoluta, con `https://` y sin ruta.

## Verificación

Tras cada despliegue, comprueba:

- [ ] La ejecución de **Deploy** terminó en verde, incluido el paso «Edge routing and headers against the live site».
- [ ] `pnpm edge:check --base-url "https://<subdominio>.<tu-dominio>"` sale con código 0.
- [ ] `https://<subdominio>.<tu-dominio>/` muestra la landing, `/privacidad` la política y una ruta inventada (por ejemplo `/no-existe`) la página 404 con estado 404.
- [ ] En Cloudflare, el Worker `cuotascasa` no tiene `workers.dev` ni URL de vista previa.
- [ ] Web Analytics sigue apagado.
- [ ] En un navegador con la versión anterior ya cargada, aparece el aviso «Hay una versión nueva de CuotasCasa.» (checklist de Drive, paso 13).

## Revertir (rollback)

Úsalo cuando una versión publicada falle (pantalla rota, cabeceras incorrectas, Drive que no conecta). Hay dos caminos; elige uno.

### Camino A: `wrangler rollback` (rápido, sin compilar)

Vuelve a servir una versión anterior del Worker que Cloudflare ya tiene. Es lo más rápido, pero **no deja huella en `main`**.

Necesitas el token de API (la misma plantilla «Edit Cloudflare Workers» de la guía de despliegue) y el ID de cuenta en tu entorno de shell, **solo para esa sesión**; no los escribas en ningún archivo ni en el historial compartido.

1. Exporta las credenciales en tu terminal (con espacio inicial o con `read -s`, para que no queden en el historial) y desactiva la telemetría:
   ```bash
   export CLOUDFLARE_API_TOKEN=...      # el token, solo en esta sesión
   export CLOUDFLARE_ACCOUNT_ID=...     # el ID de cuenta
   export WRANGLER_SEND_METRICS=false
   ```
2. Lista las versiones recientes del Worker `cuotascasa` y elige la última que sabías buena (el mensaje de cada versión trae el SHA del commit):
   ```bash
   pnpm exec wrangler versions list --name cuotascasa
   ```
3. Revierte a esa versión:
   ```bash
   pnpm exec wrangler rollback <id-de-version> --name cuotascasa --message "rollback: <motivo>"
   ```
   Sin `<id-de-version>` vuelve a la versión inmediatamente anterior.
4. Verifica (sección anterior). Cierra la sesión de shell o `unset` las variables.
5. **Importante:** `main` sigue teniendo el código malo. El siguiente push a `main` que pase CI **volverá a desplegarlo**. Corrige hacia delante o usa el camino B antes de fusionar nada más. Si necesitas detener los despliegues mientras tanto, apaga `DEPLOY_ENABLED` (compuerta, arriba).

### Camino B: redesplegar un commit anterior (queda en `main`)

El flujo solo se dispara con un CI de un push a `main`, y no tiene ejecución manual. Para republicar código bueno:

1. Abre un PR que **revierta** el commit malo (`git revert <sha-del-commit>`; se conserva el historial) y fusiónalo.
2. Cuando pase el CI, aprueba el **Deploy** como en un despliegue normal (compila de nuevo con los valores inyectados desde las variables del entorno).
3. Verifica.

Es más lento (compila y corre todas las pruebas), pero deja `main` y producción de acuerdo y deja el motivo registrado.

### Qué pasa con los clientes tras una reversa (service worker)

El sitio es una PWA: los navegadores que ya visitaron `/app` guardan el shell y los chunks de la versión que vieron (ADR-0017, ADR-0023). Al revertir:

- El service worker compara el contenido de `ngsw.json` (se sirve con `no-cache`, ADR-0022) con el que tiene guardado. **Detecta cualquier diferencia**, no solo versiones "más nuevas": una reversa se ve para el cliente como una versión distinta.
- Un cliente que tenía la versión mala **seguirá usándola** hasta que la app compruebe actualizaciones (al abrirla o navegar). Entonces verá «Hay una versión nueva de CuotasCasa.» con el botón **Actualizar**, y al pulsarlo recarga con la versión revertida. No hay forma de forzar la actualización desde el servidor; una pestaña abierta no cambia por sí sola.
- Un cliente que **nunca** tuvo la versión mala simplemente recibe la buena.
- Las páginas públicas (`/`, `/privacidad`) no pasan por el service worker: cambian en la siguiente carga.
- **Cuidado con los datos locales.** Si la versión mala cambió el esquema de la base local (IndexedDB) o la versión del formato de respaldo, una versión más vieja puede no abrir esos datos; y, con Drive, una versión que lee un respaldo "de una versión futura" detiene la sincronización sin guardar nada (ADR-0008, decisión 4). Antes de revertir una versión que tocó el esquema o los respaldos, pide ayuda a Opus y pide a los usuarios que exporten un respaldo. Si la versión mala no cambió el formato, la reversa es segura.
- Tras revertir, haz tú mismo la prueba: abre el sitio con la versión mala cargada, comprueba que aparece el aviso y que al actualizar los datos siguen ahí.

## Rotar el ID de cliente de Google

Hazlo si el ID quedó expuesto donde no debía, si cambias de proyecto de Google Cloud o si Google lo marca. El ID de cliente es público por diseño (viaja en el JavaScript del sitio), pero `gitleaks` impide que entre al repositorio (ADR-0015).

1. En Google Cloud, crea un cliente **nuevo** en el **mismo proyecto** con el mismo origen `https://<subdominio>.<tu-dominio>` ([guía de Google Cloud](google-cloud-setup.md), paso 6). No borres el viejo todavía.
2. En GitHub, **Environments** → `production` → **Variables** → edita `GOOGLE_CLIENT_ID` con el ID nuevo. El flujo exige la forma `…apps.googleusercontent.com`.
3. Publica el cambio: necesita un despliegue que compile con el valor nuevo, porque el ID se inyecta al compilar. Re-ejecuta la última ejecución de **Deploy** (**Re-run all jobs**), o fusiona cualquier PR pendiente a `main`, y aprueba. Verifica que el ID inyectado sea el nuevo (el paso de pruebas del build espera el valor de la variable).
4. Pasa los pasos 1, 6 y 10 del [checklist de Drive](drive-sync-manual-checklist.md) con el ID nuevo y comprueba que **tus datos en Drive siguen apareciendo** tras reconectar. Los datos viven en la carpeta oculta de la app; si no aparecieran, **no borres el cliente viejo** y revierte la variable al valor anterior.
5. Solo si todo está bien, borra el cliente viejo en Google Cloud. Los dispositivos con la sesión abierta pedirán autorizar de nuevo («Falta autorizar Drive»); los datos locales y la frase no se pierden.
6. Si el ID viejo se filtró en un lugar público, no hace falta reescribir el historial: un ID de cliente no es un secreto. Borra el cliente viejo y listo.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| `wrangler rollback` pide iniciar sesión o responde un error de autenticación | `CLOUDFLARE_API_TOKEN` o `CLOUDFLARE_ACCOUNT_ID` sin exportar, vencidos o de otra cuenta |
| `wrangler versions list` no muestra versiones | Falta `--name cuotascasa` o la cuenta equivocada |
| Tras revertir, los usuarios siguen viendo la versión mala | Todavía no se comprobó la actualización: abrir la app o recargar; ver «Qué pasa con los clientes» |
| El siguiente despliegue vuelve a poner el código malo | El camino A no toca `main`; usa el camino B o apaga `DEPLOY_ENABLED` |
| `edge:check --base-url` falla con «must be an absolute URL» | Falta `https://` o el valor tiene comillas mal puestas |
| `edge:check` falla justo después de desplegar | Propagación lenta: reintenta en unos minutos |
| Drive «no configurado» tras rotar el ID | El despliegue corrió antes de actualizar la variable: repite el paso 3 |
