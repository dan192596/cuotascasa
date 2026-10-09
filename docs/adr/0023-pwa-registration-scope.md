# ADR-0023: Service worker con alcance `/`, registrado a mano solo después de entrar a `/app`

Estado: Aceptado

Fecha: 2026-10-09

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

ADR-0017 pide tres cosas: una PWA que funcione sin conexión en `/app`, que el service worker **nunca se registre en `/` ni en `/privacidad`** y que el *fallback* de navegación aplique solo a `/app/**`. El mecanismo exacto lo deja para este ADR; el texto de ADR-0017 sugiere «alcance `/app/`». ADR-0022 dejó dos dudas abiertas: `/index.csr.html` responde 307 a `/index.csr` y no se sabía si el service worker acepta esa respuesta. ADR-0021 aplica Trusted Types en `/app`.

W2-02 lo midió en Chromium con `wrangler dev --local` y el build real (`@angular/service-worker` 22.2.1). Se registró `ngsw-worker.js` desde `/app`, se recargó, se cortó la red y se navegó:

| Alcance | `navigationUrls` | Sin red: `/app` | `/app/`, `/app/ajustes`, `/app/prestamos/x/tabla` |
|---|---|---|---|
| `/app` | `/app`, `/app/**` | 504 | 504 |
| `/app` | `/**` | **504** | pintan |
| `/` | `/app`, `/app/**` | pintan | pintan |

Hechos que explican la tabla y el resto de la decisión:

1. **El service worker de Angular quita el alcance antes de comparar la URL con `navigationUrls`** (`isNavigationRequest`). Con alcance `/app` o `/app/`, la URL `/app` queda vacía y ningún patrón la alcanza. Con `/app/` es peor: `/app` ni siquiera está dentro del alcance. `/app` es la URL del panel y el `start_url` del manifiesto.
2. **El builder fija `index` en `ngsw.json`.** `@angular/build` reemplaza el `index` de `ngsw-config.json` por el nombre de salida del índice (`/index.csr.html`), así que ese campo no se puede cambiar. El service worker instaló el shell a pesar del 307 a `/index.csr` y lo sirvió sin red en todas las rutas de `/app`.
3. **`navigator.serviceWorker.register()` es un sumidero de Trusted Types.** Con la CSP de ADR-0021, registrar con una cadena falla: «This document requires 'TrustedScriptURL' assignment». `provideServiceWorker()` de Angular registra con la cadena que recibe al arrancar, así que no sirve tal cual en `/app`.
4. **El shell que sirve el service worker trae las cabeceras de `/index.csr`**, que se guardaron en caché al instalar, y no las de la URL de `/app` que se pidió. Si `/index.csr` tiene la CSP pública, la página de `/app` queda sin los orígenes de Google.
5. **El service worker reenvía con su propio `fetch` las peticiones que no tiene en caché, también las de Google.** Ese `fetch` obedece la CSP del script del worker. Con la de `/*`, GIS, Drive y la revocación fallaron con 504; con la política «Worker» de ADR-0021 pasaron.
6. Con alcance `/`, el service worker controla también `/` y `/privacidad` después de la primera visita a `/app`. Esas navegaciones no están en `navigationUrls`: van a la red sin pasar por caché, sin red fallan como sin service worker, y los archivos con hash se sirven desde caché.

## Decisión

1. **Alcance `/`** y script `/ngsw-worker.js` (absoluto). No se usa `/app` ni `/app/` (hecho 1).
2. **Registro solo dentro de `/app`.** `provideAppPwa()` (en `core/pwa`, ya incluido en `app.config.ts`) registra el worker la primera vez que el router emite un `NavigationEnd` cuyo `urlAfterRedirects` es `/app` o empieza por `/app/`, `/app?` o `/app#`. En `/`, `/privacidad` y la 404 no se llama nunca a `register()` ni se crea la política. Solo con `!isDevMode()`.
3. **Registro manual con Trusted Types.** El registro usa una política `cc-sw-loader` cuyo `createScriptURL` acepta solo `/ngsw-worker.js`. Se crea la primera vez que hace falta, una sola vez por documento, y si el navegador no tiene `trustedTypes` se usa la cadena. Se llama a `navigator.serviceWorker.register(url, { scope: '/' })`. `provideServiceWorker('/ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: () => NEVER })` se mantiene solo para inyectar `SwUpdate`. Su registro propio nunca corre, porque pasaría una cadena (hecho 3). El nombre `cc-sw-loader` ya está en la lista `trusted-types` de `/app` (ADR-0021).
4. **`ngsw-config.json`:**
   - `index` queda en `/index.csr.html` (hecho 2);
   - `navigationUrls` queda en `["/app", "/app/**"]`, absolutos, válidos con alcance `/`;
   - un grupo `prefetch` con `/index.csr.html`, `/*.js`, `/*.css` y `/media/**`, y un grupo `lazy` con `/icons/**` y `/manifest.webmanifest`;
   - **nunca** `/index.html`, `/privacidad/**`, `/404.html`, `/404/**`, `/_headers` ni `/_redirects`;
   - ningún `dataGroup` (las URLs de Google nunca se guardan).
5. **Cabeceras que este mecanismo exige** (las escribe W2-10, según ADR-0021): `/index.csr` y `/index.csr.html` llevan la CSP de la app (hecho 4), y los tres scripts del worker llevan la CSP «Worker» (hecho 5).
6. **Sin cambios en `app.config.ts` ni en `app-area.routes.ts`.** Todo el mecanismo vive dentro de `provideAppPwa()`, que ya está en los providers raíz. Si W3-14 no puede implementarlo dentro de `core/pwa/`, se detiene y Opus ajusta `app.config.ts` con una micro-tarjeta.

## Alternativas consideradas

- **Alcance `/app/` o `/app` con `registrationStrategy` de Angular** (la sugerencia de ADR-0017). `/app`, la URL del panel y del `start_url`, no funciona sin conexión (hecho 1), y el registro de Angular falla con Trusted Types (hecho 3).
- **`start_url` `/app/` para esquivar el hecho 1.** El router de Angular normaliza `/app/` a `/app`; al recargar el panel sin conexión fallaría igual.
- **Crear `cc-sw-loader` al arrancar y pasar el `TrustedScriptURL` a `provideServiceWorker()`.** Obligaría a crear la política también en `/` y a listar su nombre en la CSP pública.
- **Excluir las peticiones de Google del service worker.** Angular solo lo permite con la cabecera o el parámetro `ngsw-bypass`. La cabecera fuerza un *preflight* CORS que Google no promete aceptar, y el parámetro viaja a Google. La CSP «Worker» es más simple.

## Consecuencias

**Positivas**
- `/app` y todas sus rutas abren sin conexión, también el panel y el `start_url`.
- Quien solo visita `/` o `/privacidad` nunca obtiene un service worker ni una política de Trusted Types.
- El registro funciona con Trusted Types aplicado.

**Negativas**
- Después de la primera visita a `/app`, el service worker también controla `/` y `/privacidad`. Sus documentos siguen viniendo siempre de la red, pero un worker roto podría afectarlos. Angular entra en modo seguro ante errores, y `safety-worker.js` permite desactivarlo.
- `@angular/service-worker` queda en el bundle inicial de todas las páginas, porque `provideAppPwa()` es un provider raíz. Pesa poco y `bundle:check` lo vigila.

**Riesgos**
- La evidencia es solo de Chromium: WebKit no se midió. Mitigación: el e2e de W3-14 corre también en WebKit si Playwright lo permite, y si no, W3-14 deja documentada una prueba manual en Safari.
- Una versión futura de Angular cambia `isNavigationRequest` o el manejo de redirecciones. Mitigación: el e2e sin conexión de W3-14 lo detecta.

## Verificación

- `build-output.spec.ts` (`ng test --configuration=dist`): `ngsw.json` tiene `index` `/index.csr.html`, solo patrones de navegación bajo `^\/app`, y ni sus grupos ni su `hashTable` incluyen documentos públicos.
- W3-14 (`e2e/specs/pwa.spec.ts`), en Chromium:
  - visitar solo `/` y `/privacidad` deja `navigator.serviceWorker.getRegistrations()` vacío;
  - después de `/app` hay un registro con alcance `/`;
  - sin red, `/app`, `/app/` y una ruta profunda pintan el shell sin violaciones de CSP;
  - con el worker activo, la carga simulada de GIS y Drive pasa.
- W2-10: `check-headers.mjs` afirma las cabeceras del punto 5.

## Referencias

- ADR-0011, ADR-0016, ADR-0017, ADR-0021 y ADR-0022.
- Tarjetas W2-02, W2-10, W3-14 y W2-11.
- Angular service worker: https://angular.dev/ecosystem/service-workers

## Enmiendas

**Enmienda (2026-10-09, W3-14).** `provideServiceWorker()` **no** está en los providers raíz. `provideAppPwa()` carga `core/pwa/pwa-runtime.ts` con `import()` después de la primera navegación a `/app`, y ese módulo crea `provideServiceWorker()` en un `EnvironmentInjector` hijo. Así, `@angular/service-worker` queda fuera del bundle de la landing. `SwUpdate` se sigue inyectando, desde ese inyector hijo, y el registro manual con Trusted Types de la decisión 3 no cambia.
