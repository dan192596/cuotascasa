# Spike W1-08: matriz de evidencia de CSP, Trusted Types y Google Identity Services

Estado: evidencia reunida (2026-10-09). **Este documento no decide nada.** Las decisiones (CSP exacta por ruta, Trusted Types, estrategia de scripts inline, método de carga de GIS) son de Opus en ADR-0021 (W2-02). Aquí solo hay opciones, conteos y hallazgos, con la referencia a la celda de `results.json` que los respalda.

Requisitos: R12 (sincronización con Drive) y R22 (seguridad). Contexto: ADR-0016 (CSP por ruta, Trusted Types diferido), ADR-0008 (GIS), ADR-0011 (prerender), ADR-0022 (enrutamiento y `_headers`).

## 1. Cómo se midió

| Elemento | Detalle |
|---|---|
| Comando | `node tools/spikes/csp-gis/run.mjs` (sale con 0 si las comprobaciones negativas pasan y hay al menos un candidato sin violaciones) |
| Resultados | `tools/spikes/csp-gis/results.json`: todas las celdas, las cabeceras candidatas y los hashes de los bloques inline |
| Motores | Chromium 153.0.8010.12 y WebKit 26.6 (el WebKit de Playwright, **no** Safari), ambos headless |
| Compilaciones | Se hacen en una copia temporal del espacio de trabajo; `angular.json`, `app.config.ts` y la landing del repo no se tocan |
| Servidor | Servidor estático local que envía las cabeceras candidatas por clase de ruta y reproduce las reglas de ADR-0022: `/` y `/privacidad` prerenderizadas, `/app/**` reescrita al shell CSR con 200, el resto responde 404 con el shell |
| Eventos | Se cuentan los eventos `securitypolicyviolation` del documento propio (separados en `enforce` y `report`) y los errores de consola que mencionan CSP o Trusted Types. Las violaciones de iframes de terceros se contarían aparte: fueron 0 |
| Red | Solo la parte (a) sale a Internet: `https://accounts.google.com/gsi/client`, un ID de cliente de relleno, una llamada a Drive v3 sin token y una revocación de un token de relleno. Sin cuentas ni credenciales |

### Variantes de compilación

| Id | Qué es |
|---|---|
| `plain` | La compilación actual (prerender de `/` y `/privacidad`, `index.csr.html`) |
| `probe` | Igual, más un listener `(click)` en la landing, para que `withEventReplay()` emita sus scripts inline (nota de W2-02) |
| `autocsp-ssr` | La actual con `security.autoCsp` activado. **El CLI la rechaza**: «Cannot set both SSR and auto-CSP at the same time.» No hay salida que medir |
| `autocsp-csr` | `autoCsp` activado sin `server` ni `outputMode`: la única forma que el CLI acepta. No hay prerender, así que `/` y `/privacidad` sirven el shell CSR |

### Ejes de la matriz

- **Trusted Types (TT):** `enforced` (`require-trusted-types-for 'script'` en la cabecera CSP), `report-only` (la misma directiva en `Content-Security-Policy-Report-Only`) y `off`.
- **Estrategia de scripts inline:**
  - `autocsp`: la compilación `autocsp-csr` con `script-src 'strict-dynamic'` y los hashes que el propio builder calcula.
  - `header-hashes`: hashes fijados una vez, tomados de la compilación `plain` y escritos como constantes en la cabecera.
  - `post-build`: hashes calculados tras la compilación leyendo el HTML que se sirve en cada ruta.
- **Rutas:** `/`, `/privacidad`, 404 (`/no-existe`) y `/app`.
- **Parte (b):** 150 celdas (2 motores x 3 TT x 5 combinaciones estrategia/compilación x 4 rutas, más 30 celdas de `/app` con `style-src 'unsafe-inline'`).
- **Parte (a):** 78 celdas (2 motores x 3 TT x carga de GIS x estilo de `/app`).

Todas las celdas de la parte (b) usan `base-uri 'self'`. La CSP literal de ADR-0016 (`base-uri 'none'`) se mide aparte (sección 4.6).

## 2. Parte (b): Angular bajo cada candidato

Totales por motor sobre las 4 rutas (cuatro cargas por fila). Los dos motores dan los mismos números. «Violaciones» son eventos `enforce` más `report`; «sin pintar» cuenta las rutas donde `cc-root` quedó vacío.

| Estrategia | Compilación | TT | Violaciones por motor | Errores de consola CSP/TT | Rutas sin pintar |
|---|---|---|---|---|---|
| post-build | plain | enforced, report-only, off | 0 | 0 | 0 |
| post-build | probe | enforced, report-only, off | 0 | 0 | 0 |
| header-hashes | plain | enforced, report-only, off | 0 | 0 | 0 |
| header-hashes | probe | enforced, report-only, off | **3** (todas en `/`) | 3 | 0 |
| autocsp | autocsp-csr | off | 0 | 0 | 0 |
| autocsp | autocsp-csr | report-only | 4 (1 por ruta, `report`) | 4 | 0 |
| autocsp | autocsp-csr | enforced | 4 (1 por ruta, `enforce`) | 8 | **4** |

Lectura:

- **header-hashes + probe:** con un listener, el prerender de `/` añade `window.__jsaction_bootstrap(...)` (cuyo contenido depende de los eventos escuchados) y cambia el `<style>` crítico. Los hashes fijados con la compilación `plain` dejan de coincidir: 2 violaciones `script-src-elem` y 1 `style-src-elem` en `/`. `/privacidad`, la 404 y `/app` siguen limpias porque no tienen listeners.
- **post-build:** con hashes leídos del HTML servido, las cuatro rutas están limpias con y sin listener, con TT en cualquier modo y en ambos motores. Los scripts inline del prerender son 3 en `/` de la compilación `probe` (el contrato de eventos, su llamada de arranque y el script de Beasties que activa las hojas de estilo) y 1 en la `plain`.
- **autocsp:** el builder inyecta un `<meta http-equiv="Content-Security-Policy">` y reemplaza `<script src>` por un cargador inline que hace `script.src = '<cadena>'`. Con TT `enforced` ese cargador falla (una cadena no es `TrustedScriptURL`), la app no arranca en ninguna ruta y quedan 4 rutas sin pintar. Con `report-only` el cargador funciona y deja 1 reporte por ruta.
- Con `style-src 'unsafe-inline'` en `/app` (30 celdas extra) los resultados de `/app` son iguales a los de arriba: ningún cambio en Angular.

## 3. Parte (a): GIS bajo la política de `/app`

### 3.1 Orígenes y peticiones observados

Un flujo completo (cargar, `initTokenClient`, abrir el popup con un clic real, Drive v3, revocar) genera exactamente estas peticiones fuera del origen propio, en ambos motores:

| Recurso | Origen y ruta | Directiva que lo gobierna |
|---|---|---|
| Script | `https://accounts.google.com/gsi/client` | `script-src` (ignorado con `'strict-dynamic'`) |
| Drive v3 (`fetch`) | `https://www.googleapis.com/drive/v3/files` | `connect-src` |
| Revocación (`xhr`) | `https://oauth2.googleapis.com/revoke` | `connect-src` |
| Popup de consentimiento | `https://accounts.google.com/signin/oauth/error` (página de error por el ID de relleno) | Ninguna: es una ventana nueva, no un marco |

- No hubo peticiones a `gsi/style`, ni iframes: el flujo de token no dibuja interfaz de GIS. La CSP candidata deja `frame-src 'none'` y no incluye `gsi/style`.
- Drive respondió **403**, no 401, a la llamada sin token (ambos motores). La llamada completó (hay respuesta), así que `connect-src` la permitió.
- `requestAccessToken` abrió el popup en 66 de las 66 celdas en que el flujo llegó hasta ahí (las 12 restantes no llegaron a `init`). Lo que recibió el `error_callback` de GIS al cerrar el popup no quedó registrado en `results.json`.
- GIS **no crea ninguna política de Trusted Types** (`trustedTypes.createPolicy` no se invocó desde el código de GIS en ningún motor). Bajo TT `enforced`, GIS funcionó con una lista `trusted-types` que solo contenía los nombres de Angular y los del cargador de la prueba. Las únicas políticas creadas fueron las del cargador (`cc-gis-loader` o `default`).
- GIS inyecta un **bloque `<style>` inline** al cargarse. Es la única violación que provoca por sí mismo: `style-src-elem` (1 por celda). Su hash fue el mismo en ambos motores: `sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw=` (Google controla ese contenido; puede cambiar sin aviso).

### 3.2 Opciones de carga de GIS

| Opción | Cómo | TT `enforced` | TT `report-only` | TT `off` |
|---|---|---|---|---|
| `direct` | `script.src = '<url>'` desde código propio | **Falla**: «requires a TrustedScriptURL»; GIS no carga y el flujo no avanza | Carga; 1 reporte `require-trusted-types-for` por celda | Carga |
| `policy` | Política propia `cc-gis-loader` con `createScriptURL` que acepta solo la URL de GIS (hay que listarla en `trusted-types`) | Carga y completa el flujo | Carga, 0 reportes de TT | Carga |
| `default` | Política `default` que valida la URL (hay que listarla en `trusted-types`) | Carga y completa el flujo | Carga, 0 reportes de TT | Carga |
| `static` | Etiqueta `<script async src>` en el HTML (no es carga diferida) | Carga y completa el flujo (no pasa por un sumidero de TT) | Carga | Carga |

Notas:

- La política `default` afecta a **todo** sumidero de la página (también a Angular y a otras librerías), no solo a GIS.
- Con `'strict-dynamic'` (estrategia `autocsp`) un script creado por un script de confianza hereda la confianza. `results.json` lo respalda solo con TT `off`: GIS cargó y completó el flujo con `direct`, `policy` y `default` en las celdas `strict` de `autocsp`, sin que `script-src` mencione `accounts.google.com` (cada una con su violación `style-src-elem`). Con TT `report-only` también cargó, pero con reportes de TT. Bajo TT `enforced` el cargador inline de la prueba falla (misma causa que en la parte (b)) y GIS no llega a medirse.
- SRI no es una opción (ADR-0016): Google no publica versiones fijas.

### 3.3 Estilo inline de GIS en `/app`

Violaciones por celda de GIS (sin errores de consola extra) según la política de estilos de `/app`:

| `style-src` de `/app` | Violaciones por celda | Flujo completo |
|---|---|---|
| `'self'` + hashes de Angular (`strict`) | 1 (`style-src-elem`) en todas las celdas que llegan a cargar GIS | Sí (salvo `direct` bajo TT `enforced`) |
| `'self'` + hash del `<style>` de GIS (`gis-hash`) | 0 | Sí |
| `'self' 'unsafe-inline'` (`unsafe-inline`) | 0 | Sí |

`unsafe-inline` aplica a estilos, no a `script-src`; la regla de ADR-0016 y de la tarjeta es solo para `script-src`.

## 4. Cabeceras candidatas por ruta

Todas las cabeceras completas (3 estrategias x 3 modos de TT x 4 rutas) están en `candidateHeaders` de `results.json`. Los hashes `sha256-...` de abajo se abrevian; el valor real depende de cada compilación.

### 4.1 Base común

```
default-src 'self'; script-src <ver 4.2>; style-src 'self' <hashes de los <style> inline>;
img-src 'self' data:; font-src 'self'; connect-src <ver 4.3>; frame-src 'none';
manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'
```

### 4.2 `script-src` por estrategia

| Estrategia | `/`, `/privacidad`, 404 | `/app/*` |
|---|---|---|
| `autocsp` | `'strict-dynamic' 'sha256-...' 'sha256-...'` | igual, más `https://accounts.google.com/gsi/client` (ignorado por `'strict-dynamic'`) |
| `header-hashes` | `'self'` más la lista fija de hashes tomada de `plain` | igual, más `https://accounts.google.com/gsi/client` |
| `post-build` | `'self'` más los hashes del HTML servido en la ruta | igual, más `https://accounts.google.com/gsi/client` |

### 4.3 `connect-src` y Trusted Types

| Ruta | `connect-src` | Directivas de Trusted Types (cuando no está `off`) |
|---|---|---|
| `/`, `/privacidad`, 404 | `'self'` | `require-trusted-types-for 'script'; trusted-types angular angular#bundler angular#unsafe-bypass` |
| `/app/*` | `'self' https://www.googleapis.com https://oauth2.googleapis.com` | lo anterior más `cc-gis-loader default` (los nombres de política del cargador de la prueba) |

Con `enforced` las directivas van en `Content-Security-Policy`; con `report-only`, en una cabecera `Content-Security-Policy-Report-Only` aparte, sin `report-uri`.

### 4.4 Ejemplo: `post-build`, TT `enforced`, `/app`

```
content-security-policy: default-src 'self'; script-src 'self' 'sha256-...' https://accounts.google.com/gsi/client;
  style-src 'self' 'sha256-...'; img-src 'self' data:; font-src 'self';
  connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com; frame-src 'none';
  manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; require-trusted-types-for 'script';
  trusted-types angular angular#bundler angular#unsafe-bypass cc-gis-loader default
```

### 4.5 Comprobaciones negativas automáticas

Corren en cada ejecución; el resultado está en `negativeChecks` de `results.json`.

| Comprobación | Resultado |
|---|---|
| Ningún `script-src` de los 48 valores de cabecera candidatos (3 estrategias x 3 modos de TT x 4 rutas, donde `report-only` emite dos valores por combinación) contiene `'unsafe-inline'` ni `'unsafe-eval'` | Pasa |
| Ninguna directiva de `/`, `/privacidad` ni 404 contiene un origen externo (en los 36 valores de cabecera de esas rutas) | Pasa |
| `/` bloquea un `fetch` a un origen externo (TT `off` y `enforced`, ambos motores) | Pasa: el `fetch` se rechaza con `TypeError`, hay 1 violación `connect-src` y no se observa ninguna petición externa |

Hallazgo de la comprobación estática sobre la salida del builder: el `<meta>` que genera `autoCsp` contiene `script-src 'strict-dynamic' 'sha256-...' 'sha256-...' https: 'unsafe-inline'`, es decir, **sí incluye `'unsafe-inline'`** (como respaldo para navegadores sin CSP3, ignorado cuando `strict-dynamic` se entiende) y `https:`. La cabecera candidata de `autocsp` no lo copia, pero el `<meta>` queda en el HTML y se intersecta con la cabecera. Un `<meta>` tampoco admite `frame-ancestors`.

### 4.6 `base-uri 'none'` (ADR-0016 literal)

`index.html` lleva `<base href="/">`. Con `base-uri 'none'` cada carga de `/` y de `/app` produce 1 violación `base-uri` en ambos motores (4 de 4 celdas). La app sigue pintando porque la ruta es la raíz, pero el `<base>` queda ignorado. El resto de la matriz usa `base-uri 'self'`.

## 5. Candidatos sin violaciones

Un candidato es una combinación (estrategia, TT, carga de GIS, estilo de `/app`) cuyas rutas de Angular y cuyo flujo de GIS (cargar, iniciar, abrir popup, Drive, revocar) tienen 0 violaciones y 0 errores de consola de CSP/TT en **ambos** motores. La lista completa (63 filas) está en `candidates` de `results.json`.

Sin violaciones:

| Estrategia | TT | Carga GIS | Estilo de `/app` |
|---|---|---|---|
| post-build | enforced | policy, static | gis-hash, unsafe-inline |
| post-build | report-only | policy, static | gis-hash, unsafe-inline |
| post-build | off | policy, static | gis-hash, unsafe-inline |
| autocsp | off | policy | gis-hash, unsafe-inline |

Con violaciones (resumen):

- `header-hashes`: ninguno es limpio con la compilación `probe`; con `plain` sí lo serían (las columnas por compilación están en `pagesCleanByBuild`).
- `autocsp` con TT `enforced` o `report-only`: ninguno (cargador del builder).
- Cualquier combinación con estilo de `/app` estricto (`strict`): ninguno, por el `<style>` de GIS.
- Carga `direct` con TT distinto de `off`: ninguno.

## 6. Hallazgos para ADR-0021 (hechos, sin recomendación)

1. `security.autoCsp` y SSR/prerender no se pueden combinar en este CLI (error en `autocsp-ssr`). Para usarlo habría que renunciar al prerender de `/` y `/privacidad`, lo que contradice ADR-0011.
2. El cargador que genera `autoCsp` asigna una cadena a `script.src`: es incompatible con TT `enforced` (la app no arranca) y funciona con `report-only` (1 reporte por carga).
3. El `<meta>` de `autoCsp` incluye `'unsafe-inline'` y `https:` como respaldo.
4. Los hashes fijos en `_headers` se rompen en cuanto una página gana un listener (el contenido de `__jsaction_bootstrap` varía con los eventos y el `<style>` crítico cambia). Los hashes calculados tras la compilación sobre el HTML servido no.
5. GIS no crea políticas de TT y funciona con TT `enforced` si el script se carga mediante una política que lo permita, o con una etiqueta estática. La asignación directa de `src` no funciona con `enforced`.
6. GIS inyecta un `<style>` inline: sin hash (de contenido controlado por Google) ni `'unsafe-inline'` en `style-src`, hay 1 violación por carga.
7. `base-uri 'none'` (ADR-0016) choca con el `<base href="/">` de `index.html`.
8. WebKit emite un aviso de consola cuando una cabecera `Content-Security-Policy-Report-Only` no tiene `report-uri` («was delivered in report-only mode, but does not specify a 'report-uri'»). Se cuenta aparte (`reportOnlyNotices`), no como error. Los eventos de violación sí se disparan en ambos motores.
9. Drive responde 403 (no 401) a la llamada sin token.

## 7. Lo que no se midió (límites)

- **GIS dentro de la app Angular real.** La parte (a) usa una página de prueba mínima servida bajo la política de `/app`; aún no existe el proveedor de W3 que cargará GIS desde la app.
- **Consentimiento real.** El popup se abrió con un ID de cliente de relleno y mostró la página de error de Google; no se inició sesión ni se concedió ningún permiso.
- **Interfaz de GIS** (botón, One Tap, iframes): no se usa en el flujo de token, así que `frame-src` y `gsi/style` no se ejercitaron.
- **Safari real.** Se midió el WebKit de Playwright.
- **Cabeceras de Cloudflare.** Se reproducen con un servidor local; la carga real desde `_headers` y `_redirects` es de W1-09 y W2-10.
- **Service worker, HSTS, `Permissions-Policy`, `Referrer-Policy`.** Fuera del alcance de esta tarjeta.
- **Modo de desarrollo de Angular** y compilaciones con `@defer` o gráficos de `chart.js`.

## 8. Pendientes del dueño

- [ ] Probar el popup de consentimiento real en `localhost` con un cliente OAuth de prueba (propio del dueño, nunca el de producción ni credenciales en el repo): confirmar que la ventana de consentimiento aparece, que se concede `drive.appdata`, que el token llega al `callback` y que la revocación lo invalida.

## 9. Código del spike

`tools/spikes/csp-gis/` es código desechable fuera de la compilación de producción; se retira en W7-01.

| Archivo | Para qué |
|---|---|
| `run.mjs` | Corredor de Playwright (Chromium y WebKit) y escritor de `results.json` |
| `policies.mjs` y `policies.spec.mjs` | Cabeceras candidatas, hashes y comprobaciones negativas (con pruebas) |
| `builds.mjs` y `builds.spec.mjs` | Variantes de compilación en una copia temporal (con pruebas) |
| `server.mjs` | Servidor local con cabeceras por ruta |
| `page/` | Grabador de violaciones, página y script de la prueba de GIS |
| `results.json` | Resultados de la última ejecución |
