# ADR-0002: Hosting estático en Cloudflare Workers en un subdominio

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

La v1 no tiene backend (ADR-0001): el producto es un conjunto de archivos estáticos generados por Angular (ADR-0011). El hosting tiene que cumplir varias condiciones:

- **Costo US$0.** El único gasto aceptado es el dominio.
- **Cabeceras por ruta.** `/` y `/privacidad` no deben permitir ninguna conexión externa. `/app` solo debe permitir las de Google, para la sincronización con Drive. Ver ADR-0016.
- **Rutas mixtas.** `/` y `/privacidad` están prerenderizadas. `/app/**` se renderiza en el cliente y necesita un *fallback* a `index.csr.html` sin capturar el resto de las rutas.
- **Una página 404 real**, con código de estado 404.
- **Un dominio verificado** con página de inicio pública y política de privacidad: Google los exige para publicar la pantalla de consentimiento OAuth (ADR-0008).

## Decisión

1. **Cloudflare Workers con activos estáticos**, en el plan gratuito, como un Worker sin código propio (solo assets) configurado en `wrangler.jsonc`. El directorio publicado es `dist/apps/web/browser`, con `html_handling` y `not_found_handling: "404-page"`.
2. **Un subdominio del dominio que compra el dueño.** El dominio raíz queda libre para otros usos del portafolio.
3. **Rewrites acotados.** `_redirects` contiene solo `/app` y `/app/*` → `/index.csr` con estado 200 (sin `.html`: con `html_handling` la plataforma responde 307 de `/index.csr.html` a `/index.csr`; evidencia en ADR-0022 §4). **Nunca** se usa un comodín `/*`, para que las rutas desconocidas den 404 y no la app.
4. **Cabeceras en `_headers`, por ruta:**
   - CSP propia de cada área.
   - `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` y `frame-ancestors`.
   - Caché inmutable para los activos con hash.
   - `no-cache` para el HTML, `ngsw.json` y el manifiesto.
5. **Despliegue desde CI** (W3-17) con un token de Cloudflare guardado como secreto de GitHub. El ID de cliente de Google se inyecta al compilar.
6. **Comportamientos de la plataforma documentados en ADR-0022** (reservado, lo escribe W1-09): barra final, `html_handling` y precedencia de rewrites, con evidencia.

**Acciones del dueño:** comprar el dominio y crear el token de Cloudflare, la ruta del subdominio y las variables de GitHub (W3-17).

## Alternativas consideradas

- **GitHub Pages.** No permite cabeceras HTTP propias. La CSP solo podría ir en `<meta>`, que no admite `frame-ancestors` ni distintas políticas por área sin duplicar HTML. El *fallback* de una SPA depende de un truco con `404.html` que responde 404 a rutas válidas.
- **Netlify o Vercel (planes gratuitos).** Técnicamente viables, porque soportan `_headers` y rewrites. Se prefirió Cloudflare por los límites del plan gratuito y porque deja abierto el plan B de backend (un Worker con lógica, ADR-0001) sin cambiar de proveedor.
- **Cloudflare Pages.** Es equivalente para un sitio estático. Se eligió Workers con activos estáticos porque Cloudflare lo impulsa para proyectos nuevos y porque convertirlo en un Worker con código, si alguna vez hiciera falta, no requiere migrar.
- **Servidor propio o VPS.** Tiene costo y exige operación y parches, sin ningún beneficio para un sitio estático.

## Consecuencias

**Positivas**
- Costo cero y CDN global.
- Cabeceras de seguridad por ruta, versionadas en el repositorio.
- La salida es un directorio estático portable, con poco acoplamiento al proveedor.

**Negativas**
- Depende de la cuenta de Cloudflare del dueño y de la renovación del dominio.
- La semántica de rewrites y 404 de Cloudflare tiene detalles propios que hay que probar (W1-09).

**Riesgos**
- Que un cambio de la plataforma altere la precedencia de rewrites o el manejo de la barra final. Mitigación: `edge:check` corre en CI contra el build local y contra el subdominio en vivo.
- Que un rewrite demasiado amplio sirva la app en `/` o en rutas inexistentes, rompiendo la promesa de cero almacenamiento en la landing (ADR-0023). Mitigación: rewrites solo sobre `/app`, más pruebas e2e.
- Que se pierda la verificación de dominio requerida por Google. Mitigación: W7-01 la vuelve a revisar antes del release.

## Verificación

- `pnpm edge:check` (`tools/edge/check-routing.mjs`, W1-09) sobre `wrangler dev --local` comprueba:
  - `/` y `/privacidad` responden 200 con su contenido;
  - `/app` y `/app/prestamos/x/tabla` responden 200 con el contenido de `index.csr.html` (servido como `/index.csr`);
  - `/application` y `/nope` responden 404 con la página 404;
  - las cabeceras de caché son las esperadas.
- La misma herramienta corre con `--base-url` contra el subdominio desplegado desde W3-17.
- Las pruebas e2e corren contra el build de producción detrás de wrangler, con las cabeceras reales (W2-11, W3-16).

## Referencias

- ADR-0001, ADR-0008, ADR-0011, ADR-0016, ADR-0021 (reservado), ADR-0022 (reservado), ADR-0023 (reservado).
- Tarjetas W1-09, W2-10, W3-17 y W6-04.
- Cloudflare Workers, activos estáticos: https://developers.cloudflare.com/workers/static-assets/
