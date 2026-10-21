# Higiene en CI (W7-02)

Dos comprobaciones que también corren como hooks locales (`lefthook.yml`, ADR-0015) se ejecutan en CI en cada PR:

- **Bandera sintética** (`tools/hygiene/synthetic-flag.mjs`, en `pull_request` y `push` a `main`): todo JSON de fixtures lleva `synthetic: true` y ninguno está ignorado por git. Se reutiliza el script tal cual.
- **Identidades noreply** (`noreply-range.mjs`, solo en `pull_request`): cada commit no-merge del rango `base.sha..HEAD` debe tener autor noreply de GitHub; el committer, noreply de GitHub o exactamente `noreply@github.com` (web y squash). Los merges se omiten (los de «Update branch» llevan metadatos de GitHub). La salida solo muestra el SHA corto y qué identidad falló, nunca correos. Códigos: 0 pasa, 1 infracción, 2 error de git o de uso.

En `push` a `main` el chequeo noreply no corre: los squash-merge llevan autor noreply del dueño y committer `noreply@github.com`, y ya pasaron el chequeo como PR.

## La denylist de datos reales NO corre en CI

`tools/hygiene/denylist.mjs` depende de una lista de términos privada que vive solo en la máquina del dueño, fuera del repo. Por diseño no hay lista de ejemplo, variable secreta ni versión de CI: seguiría siendo un hook local de pre-commit (ADR-0015 §6).
