# ADR-0021: CSP por ruta con hashes posteriores al build, Trusted Types aplicado y GIS cargado con política propia

Estado: Aceptado

Fecha: 2026-10-09

Decisores: dueño del proyecto + Claude (Opus)

Enmienda a: ADR-0016 (solo el `base-uri` de «CSP por ruta»: `'self'` en lugar de `'none'`)

## Contexto

ADR-0016 fija la CSP por área, prohíbe `'unsafe-inline'` y `'unsafe-eval'` en `script-src`, y deja para este ADR tres cosas: cómo se cubren los scripts inline del prerender, si Trusted Types se aplica y la lista exacta de orígenes de Google en `/app/*`. El spike W1-08 (`docs/specs/spikes/csp-gis-evidence.md`, `tools/spikes/csp-gis/results.json`) midió 228 celdas en Chromium y WebKit. ADR-0022 fija cómo Cloudflare aplica `_headers`: las reglas se evalúan contra la URL pedida y la página 404 solo recibe las cabeceras de `/*`.

Hechos de W1-08 que pesan aquí (sección del documento de evidencia entre paréntesis):

- `security.autoCsp` no se puede combinar con el prerender, su cargador inline rompe la app con Trusted Types aplicado y su `<meta>` trae `'unsafe-inline'` y `https:` (§6.1 a §6.3).
- Los hashes fijados una vez se rompen en cuanto una página gana un listener: `withEventReplay()` agrega `__jsaction_bootstrap(...)`, cuyo contenido depende de los eventos (§2, §6.4). Los hashes calculados sobre el HTML servido dieron 0 violaciones en las cuatro rutas, con y sin listener, con Trusted Types en los tres modos y en ambos motores (§2).
- GIS no crea políticas de Trusted Types y funciona con Trusted Types aplicado si se carga con una política propia o con una etiqueta estática; la asignación directa de `src` falla (§3.2, §6.5). GIS inyecta un `<style>` inline (§3.3, §6.6).
- `base-uri 'none'` choca con el `<base href="/">` de `index.html` (§4.6).

Evidencia nueva de W2-02 (corrida local con `wrangler dev --local`, sin red: Google se simuló con rutas de Playwright y la CSP se aplica igual en el renderer). Sobre una compilación de prueba con un listener `(click)` en la landing y estilos de componente en la landing y en el shell, con las cabeceras de este ADR:

| Ruta | Chromium | WebKit |
|---|---|---|
| `/`, `/privacidad`, 404 (`/no-existe`) | pinta, hidrata, 0 violaciones | igual |
| `/app`, `/app/ajustes`, `/app/prestamos/x/tabla` | pinta, 0 violaciones; GIS por `cc-gis-loader`, Drive, subida y revocación pasan | igual |
| Pruebas negativas | `fetch` externo en `/` bloqueado; `www.googleapis.com/upload/storage/...` bloqueado en `/app`; política `not-allowed` rechazada | igual |
| `style-src` solo con hashes | 2 violaciones `style-src-elem` por carga de `/app` (estilo del shell insertado en tiempo de ejecución y `<style>` de GIS) | igual |

Además: la regla `! Content-Security-Policy` de `_headers` quita la CSP de `/*` antes de poner la de la ruta (una sola cabecera CSP por respuesta). `ServiceWorkerContainer.register()` es un sumidero de Trusted Types: con la directiva aplicada, registrar con una cadena falla («This document requires 'TrustedScriptURL' assignment»). Ese hecho lo resuelve ADR-0023.

## Decisión

1. **Estrategia de scripts inline: hashes calculados después del build.** Un paso posterior al build lee cada documento que se sirve (`index.html`, `privacidad/index.html`, `404.html`, `index.csr.html`), calcula el `sha256` de cada `<script>` inline ejecutable (se excluyen los que tienen `src` y los `type="application/json"`, como `ng-state`) y escribe los hashes solo en `dist/apps/web/browser/_headers`, nunca en JS ni en `<meta>`. No se usa `security.autoCsp` (queda `false` explícito en `angular.json`) ni hashes fijados a mano. Se conservan `withEventReplay()` y el CSS crítico de Beasties: sus scripts inline quedan cubiertos por esos hashes.
2. **Trusted Types aplicado en todas las rutas**, en la cabecera `Content-Security-Policy` (no en solo reporte). Políticas permitidas:
   - `/`, `/privacidad` y 404: `angular angular#bundler`.
   - `/app/*`: además `cc-gis-loader` (W2-09) y `cc-sw-loader` (ADR-0023, W3-14).
   - Nunca `default`, `angular#unsafe-bypass` ni `'allow-duplicates'`. El respaldo de ADR-0016 (solo reporte en `/app`) no hace falta: GIS es compatible.
3. **Carga de GIS:** al conectar Drive y nunca antes, con un `<script async>` cuyo `src` sale de la política `cc-gis-loader`. Su `createScriptURL` acepta solo la cadena exacta `https://accounts.google.com/gsi/client` y lanza `TypeError` con cualquier otra. La política se crea una sola vez por documento y se reutiliza; si el navegador no tiene `trustedTypes`, se asigna la cadena. Se descartan la etiqueta estática (cargaría Google en cada visita a `/app`, contra ADR-0016) y la política `default` (afecta a todos los sumideros).
4. **Orígenes de Google en `/app/*`, con ruta:**
   - `script-src`: `https://accounts.google.com/gsi/client`.
   - `connect-src`: `https://www.googleapis.com/drive/v3/`, `https://www.googleapis.com/upload/drive/v3/` y `https://oauth2.googleapis.com/revoke`. La ruta impide subir datos a otras APIs del mismo host (por ejemplo, Cloud Storage en `www.googleapis.com/upload/storage/`), algo que el origen solo permitiría.
   - `frame-src 'none'`: el flujo de token usa un popup, no un iframe (W1-08 §3.1).
5. **`style-src 'self' 'unsafe-inline'` en todas las rutas, sin hashes ni nonces.** Angular inserta un `<style>` por componente al renderizar en el navegador y GIS inserta el suyo; con solo hashes cada inserción es una violación (tabla de arriba). Si `style-src` lleva un hash o un nonce, el navegador ignora `'unsafe-inline'`, así que nunca se agregan. La prohibición de ADR-0016 es solo para `script-src` y se mantiene.
6. **`base-uri 'self'`** (enmienda la línea `base-uri 'none'` de ADR-0016). Se conserva `<base href="/">`: Angular lo usa para el router y para resolver `main-*.js`, los chunks y el manifiesto desde cualquier ruta de `/app`. `'self'` sigue impidiendo una base en otro origen.
7. **Políticas exactas.** `<H>` son los hashes del documento que se sirve en esa ruta:
   - **Pública** (`/` con `index.html`, `/privacidad` con `privacidad/index.html`, 404 con `404.html`):
     `default-src 'self'; script-src 'self' <H>; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; manifest-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types angular angular#bundler`
   - **App** (`/app`, `/app/*`, `/index.csr` y `/index.csr.html`, con los hashes de `index.csr.html`):
     `default-src 'self'; script-src 'self' <H> https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://www.googleapis.com/drive/v3/ https://www.googleapis.com/upload/drive/v3/ https://oauth2.googleapis.com/revoke; frame-src 'none'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types angular angular#bundler cc-gis-loader cc-sw-loader`
   - **Worker** (`/ngsw-worker.js`, `/safety-worker.js`, `/worker-basic.min.js`):
     `default-src 'self'; connect-src 'self' https://accounts.google.com/gsi/client https://www.googleapis.com/drive/v3/ https://www.googleapis.com/upload/drive/v3/ https://oauth2.googleapis.com/revoke; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
     El service worker reenvía con su propio `fetch` las peticiones de `/app` que no tiene en caché, también las de Google. Ese `fetch` obedece la CSP del script del worker: con la de `/*`, la carga de GIS, Drive y la revocación fallan con 504. Con esta política pasan (medido en Chromium).
8. **Forma de `_headers`.** La CSP pública de `404.html` va en `/*`, porque es la única regla que recibe la 404. Cada ruta con otra política la reemplaza con `! Content-Security-Policy` seguido de su `Content-Security-Policy`. Las rutas son `/`, `/privacidad`, `/app`, `/app/*`, `/index.csr`, `/index.csr.html` y los tres scripts del worker. `/index.csr` lleva la política de la app porque el service worker sirve el shell de `/app` desde su caché con las cabeceras de esa respuesta. El `Content-Security-Policy-Report-Only` provisional de W1-09 se elimina.

Fuera de este ADR: HSTS, `Referrer-Policy` y `Permissions-Policy` siguen como los dejó ADR-0022. El registro del service worker lo fija ADR-0023.

## Alternativas consideradas

- **`security.autoCsp`.** Incompatible con el prerender (ADR-0011), rompe la app con Trusted Types aplicado y su `<meta>` lleva `'unsafe-inline'`.
- **Hashes fijados en `_headers` a mano.** Se rompen con el primer listener de una página prerenderizada.
- **Quitar `withEventReplay()`.** Evitaría dos de los tres scripts inline, pero no el de Beasties, y perdería los clics hechos antes de hidratar. Los hashes posteriores al build ya lo cubren.
- **Trusted Types solo en reporte.** Deja sin defensa los sumideros del DOM en la página que maneja datos y el token. La evidencia muestra que no hace falta.
- **`style-src` con hashes.** Incompatible con los estilos de componentes que se insertan en el navegador y con el `<style>` de GIS, cuyo contenido controla Google.
- **`base-uri 'none'` y quitar `<base>`.** Exige `deployUrl`, URLs absolutas en `index.html` y cambiar el arnés de `edge:check` (contrato de W1-09) a cambio de una mejora marginal: con `'self'` la base ya no puede apuntar a otro origen.
- **`connect-src` por origen** (`https://www.googleapis.com`). Permitiría escribir en otras APIs de Google del mismo host.

## Consecuencias

**Positivas**
- Ningún `script-src` tiene `'unsafe-inline'` ni `'unsafe-eval'`, y las rutas públicas no tienen ningún origen externo.
- Trusted Types bloquea la inyección por sumideros del DOM en toda la app, también en `/app`, donde están el token y los datos.
- El hash de cada build sale del HTML que realmente se sirve; un listener nuevo no rompe nada.

**Negativas**
- Toda publicación necesita el paso posterior al build. Sin él, `dist/_headers` no tiene hashes y la app no arranca bajo la CSP.
- `'unsafe-inline'` en estilos deja abierta la inyección de CSS. Riesgo residual aceptado: Angular sanea el HTML y la app no inserta HTML del usuario.
- Cada librería que use un sumidero de Trusted Types (por ejemplo `innerHTML` con una cadena o `eval`) falla. Hay que medirla antes de adoptarla.

**Riesgos**
- Google cambia la forma de cargar GIS o pide otro origen. Mitigación: la prueba manual del dueño (W1-08 §8) y el smoke de Chromium de W2-10. Un origen nuevo exige enmendar este ADR.
- La coincidencia por ruta de `connect-src` no se probó contra Google real: la evidencia simula Google con rutas de Playwright, con la CSP del navegador activa. Mitigación: la misma prueba manual del dueño; si falla, se enmienda a origen completo.
- Exportación (W5-06) y gráficas (W5-05) usan librerías que este ADR no midió. Mitigación: sus e2e corren con `collectCspViolations` (W2-11). Si algo necesita un sumidero, se escala; nunca se agrega `default` ni `'unsafe-eval'`.

## Verificación

- `pnpm build` y luego `ng test --configuration=dist`: `apps/web/src/testing/build-output/build-output.spec.ts` comprueba que ningún documento tiene `<meta http-equiv="Content-Security-Policy">`, que todos conservan `<base href="/">`, que ninguno carga un origen externo y que la 404 se prerenderiza.
- W2-10: el paso posterior al build y `tools/edge/headers/check-headers.mjs` (dentro de `edge:check`) afirman estas políticas literalmente, más un smoke de Chromium sin violaciones.
- W2-11: `collectCspViolations` en cada e2e, en Chromium y WebKit.

## Referencias

- ADR-0002, ADR-0008, ADR-0011, ADR-0016, ADR-0022 y ADR-0023.
- `docs/specs/spikes/csp-gis-evidence.md` y `tools/spikes/csp-gis/results.json` (W1-08).
- Tarjetas W2-02, W2-09, W2-10, W2-11, W3-14, W5-05 y W5-06.
- CSP Level 3 y Trusted Types (W3C): https://www.w3.org/TR/CSP3/ y https://www.w3.org/TR/trusted-types/
