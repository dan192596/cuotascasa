# Archivo: `tools/spikes/` (retirado en W7-01)

`tools/spikes/` guardaba código desechable de investigación, fuera de la compilación de producción. W7-01 lo retiró
antes del release v1.0.0, como anunciaba `docs/specs/spikes/csp-gis-evidence.md` («se retira en W7-01»).

## Qué había

| Ruta | Tarjeta | Contenido |
|---|---|---|
| `tools/spikes/csp-gis/` | W1-08 (PR #14) | Matriz de evidencia de CSP, Trusted Types y Google Identity Services: servidor local, páginas de prueba, constructores de builds candidatos, `run.mjs` (Chromium y WebKit sin interfaz) y `results.json` con las 228 celdas medidas |

El último commit que contiene el directorio completo es `8e0bce5` (`main` al iniciar W7-01). El commit que lo creó es
`81e80ef`. Para consultarlo sin restaurarlo:

```bash
git show 8e0bce5:tools/spikes/csp-gis/results.json
git ls-tree -r --name-only 8e0bce5 -- tools/spikes
```

## Dónde quedaron las conclusiones

- **Decisiones:** ADR-0021 (CSP por ruta, Trusted Types y carga de GIS) y ADR-0023 (alcance del service worker).
- **Evidencia y método:** `docs/specs/spikes/csp-gis-evidence.md`, que cita `results.json` por su ruta histórica.
- **Lo que hoy lo verifica en CI:** `tools/edge/headers/` (`edge:check`, cabeceras por ruta y el smoke de CSP en
  Chromium) y los e2e de W2-11, W6-01 y W6-02, que recogen las violaciones de CSP en Chromium y WebKit.

## Comprobación del retiro

Antes de borrarlo se buscó toda referencia a `tools/spikes` fuera del propio directorio. Ninguna configuración la usa:
ni `.github/workflows/`, ni `eslint.config.mjs`, ni `tsconfig*.json`, ni `vitest.config.ts`, ni `lefthook.yml`, ni
`.prettierignore`, ni `.gitleaks.toml`. Las únicas menciones son documentales: el plan (`docs/plan/`, histórico),
ADR-0021 (actualizado para remitir a este archivo) y el documento de evidencia (ver «Pendiente»).

Sus dos pruebas (`policies.spec.mjs` y `builds.spec.mjs`) corrían en el proyecto `tools` de Vitest. Probaban el propio
spike, no la app: las políticas vigentes las prueban `tools/edge/headers/headers.spec.mjs` y `assertions.spec.mjs`.

## Pendiente

`docs/specs/spikes/csp-gis-evidence.md` (líneas 11, 12 y 213) todavía da `tools/spikes/csp-gis/` como ruta actual. No es
de W7-01: queda como propuesta de micro-tarjeta en el informe del release para que remita a este archivo.
