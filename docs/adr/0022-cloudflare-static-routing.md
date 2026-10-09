# ADR-0022: Enrutamiento estático en Cloudflare Workers (assets, rewrites acotados y 404)

Estado: Propuesto

Fecha: 2026-10-09

Decisores: dueño del proyecto + Claude (Opus)

<!-- Lo escribe W1-09 como spike; W2-02 (Opus) lo acepta o lo enmienda (docs/adr/README.md). -->

## Contexto

ADR-0002 elige Cloudflare Workers con activos estáticos y exige tres cosas: `/` y `/privacidad` prerenderizadas, `/app/**` servida desde `index.csr.html` sin capturar nada más y un 404 real. Antes de construir sobre eso hay que medir cómo se comporta la plataforma: barra final, `html_handling`, precedencia de los rewrites y página 404.

La evidencia sale de `wrangler dev --local` (wrangler 4.147.0, motor local `workerd`) sobre `pnpm build`, sin cuenta, sin `login` y sin llamadas a la API de Cloudflare (`WRANGLER_SEND_METRICS=false`). El código de assets es el mismo que corre en producción, pero **no se ha verificado todavía en el dominio en vivo**: `edge:check --base-url` lo hará desde W3-17.

## Decisión

1. **`wrangler.jsonc`** es un Worker de solo assets: `directory: ./dist/apps/web/browser`, `not_found_handling: "404-page"`, `html_handling: "drop-trailing-slash"` y `compatibility_date` fija. No lleva `account_id`, zona, rutas ni dominio; se aportan al desplegar (W3-17).
2. **`html_handling: "drop-trailing-slash"`** (y no `auto-trailing-slash`, el valor por omisión). Angular prerenderiza `privacidad/index.html`; con `auto-trailing-slash` la URL canónica es `/privacidad/` y `/privacidad` responde 307. Con `drop-trailing-slash` la canónica es `/privacidad` (200) y `/privacidad/` redirige a ella.
3. **`_redirects` contiene solo** `/app /index.csr 200` y `/app/* /index.csr 200`. Nunca `/*`.
4. **Desviación respecto al texto de la tarjeta y de ADR-0002:** el destino del rewrite es `/index.csr`, **no** `/index.csr.html`. Con cualquier `html_handling` distinto de `none`, la plataforma quita la extensión `.html`: un rewrite a `/index.csr.html` termina en `307 Location: /index.csr` y el navegador nunca recibe 200 en `/app`.
5. **404:** `404-page` busca **`/404.html` en la raíz**. Un `404/index.html` no sirve (responde 404 con cuerpo vacío y la ruta `/404` se sirve como página normal con 200). Ver «Acción para W2-02».
6. **`_headers`:** base en `/*` (nosniff, `Referrer-Policy`, `Permissions-Policy`, HSTS sin `includeSubDomains`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` aplicada, y un `Content-Security-Policy-Report-Only` provisional). `Cache-Control` **no** se pone en `/*`: inmutable por prefijo de archivo con hash (`/main-*`, `/chunk-*`, `/styles-*`, `/polyfills-*`, `/media/*`) y `no-cache` para `/`, `/privacidad`, `/app`, `/app/*`, `/index.csr.html`, `ngsw.json`, los workers y el manifiesto.
7. **`frame-ancestors` va en la cabecera aplicada**, no solo en la de solo reporte: la directiva se ignora en `Content-Security-Policy-Report-Only`. La CSP por área (ADR-0016) y Trusted Types son de ADR-0021 (W2-02).

## Comportamientos de la plataforma medidos

| Petición | Resultado local | Nota |
|---|---|---|
| `/` | 200, prerender | |
| `/privacidad` | 200 | con `auto-trailing-slash` sería 307 a `/privacidad/` |
| `/privacidad/` | 307 a `/privacidad` | |
| `/app`, `/app/`, `/app/prestamos/x/tabla` | 200, contenido de `index.csr.html` | la barra final dentro de `/app` se reescribe, no se redirige |
| `/app/missing.js` | **200 con HTML** de la app | un archivo inexistente con aspecto de activo bajo `/app` no da 404; el navegador lo recibe como HTML. Aceptado: los activos reales cuelgan de la raíz, no de `/app` |
| `/app/<archivo real>` (ej. `/app/real.txt`) | 200 con el HTML de la app (medido a mano con un archivo añadido a una copia del build; `edge:check` no lo afirma porque el build no tiene archivos bajo `/app/`) | **el rewrite gana al archivo existente**: no puede haber assets bajo `/app/` |
| `/application`, `/nope`, `/nope/` | 404 con la página 404 | `/app` no captura prefijos parecidos |
| `/index.csr.html` | 307 a `/index.csr` | `html_handling` quita `.html` |
| `/index.csr` | 200, `no-cache` | destino del rewrite, accesible directamente |
| `/Privacidad` | 404 | las rutas distinguen mayúsculas |
| hash `main-*.js`, `styles-*.css` | 200, `public, max-age=31536000, immutable` | |
| `ngsw.json`, `manifest.webmanifest` | 200, `no-cache` | |

Otros hechos: las reglas de `_headers` se evalúan contra la **URL pedida**, no contra la reescrita, así que `/app/*` recibe `no-cache` aunque el cuerpo salga de `/index.csr`. Si dos reglas fijan la misma cabecera, los valores se **unen con coma** (por eso `Cache-Control` no va en `/*`). La página 404 recibe solo las cabeceras de `/*`.

## Acción para W2-02 (Opus; este spike no toca esos archivos)

1. **Emitir `404.html` en la raíz del build.** Probado: la ruta `{ path: '404', renderMode: RenderMode.Prerender }` en `app.routes.server.ts`, más una ruta `404` en `app.routes.ts` que cargue `NotFoundPageComponent`, produce `404/index.html` (Angular rechaza una ruta de servidor sin ruta de aplicación). Falta moverlo a `404.html`. Opciones: un paso posterior al build (por ejemplo un script en `package.json` que lo renombre) o dejar `404/index.html` y copiarlo. `RenderMode.Prerender` sobre `'**'` **no** emite ningún 404 (probado). Hasta entonces `tools/edge/serve.mjs` sirve una copia temporal del build con un `404.html` de reemplazo y lo avisa por consola; cuando el build lo traiga, lo usa tal cual.
2. **`angular.json`/`ngsw-config.json`:** `ngsw-config.json` declara `"index": "/index.csr.html"`, y esa URL ahora redirige (307) a `/index.csr`. Hay que verificar que el service worker acepte esa respuesta redirigida al guardar el shell; si no, cambiar el `index` a `/index.csr` o publicar el shell sin redirección. Es un riesgo abierto para ADR-0023 y W3-14.
3. Revisar el título de la ruta 404 (`edge:check` busca «Página no encontrada») y los marcadores del prerender (`nghm` en la landing, `ngcm` en el shell cliente) si cambian.

## Alternativas consideradas

- **`auto-trailing-slash` (valor por omisión).** Obliga a que `/privacidad` redirija a `/privacidad/`; la tarjeta y ADR-0002 piden 200 directo.
- **`html_handling: "none"`.** Permitiría el rewrite a `/index.csr.html`, pero exigiría rutas explícitas a `/privacidad/index.html` y desactivaría la redirección de `/index.html`.
- **Rewrite a `/index.csr.html`.** Descartado por la medición: termina en 307.
- **Comodín `/* /index.csr 200`.** Prohibido por ADR-0002: ninguna ruta daría 404.

## Consecuencias

**Positivas**
- Los rewrites acotados, el 404 y las cabeceras de caché quedan comprobados por una tabla ejecutable.
- La misma tabla corre en vivo con `--base-url`.

**Negativas**
- El destino del rewrite difiere de lo escrito en la tarjeta y en ADR-0002; ambos se anotan para enmienda.
- Nada puede colgar de `/app/` como archivo estático.

**Riesgos**
- La evidencia es local. Mitigación: `edge:check --base-url` en W3-17 y en cada despliegue.
- Un cambio de la plataforma altera la semántica. Mitigación: la tabla detecta el cambio y la versión de wrangler queda fijada en el catálogo de pnpm.

## Verificación

- `pnpm build && pnpm edge:check` (`tools/edge/check-routing.mjs`): 17 peticiones, sin Cloudflare ni red.
- `pnpm edge:check -- --base-url https://<subdominio>` contra un origen desplegado.
- La tabla afirma también `X-Frame-Options: DENY` y el HSTS exacto de `_headers`; `wrangler dev --local` los entrega sin cambios.
- `tools/edge/edge.spec.ts` (Vitest) valida `wrangler.jsonc`, `_redirects`, `_headers`, la tabla y el staging del 404.

## Referencias

- ADR-0002, ADR-0011, ADR-0016, ADR-0017, ADR-0021 (reservado), ADR-0023 (reservado).
- Tarjeta W1-09; W2-02, W3-14 y W3-17.
- Cloudflare Workers, activos estáticos: https://developers.cloudflare.com/workers/static-assets/
