# Oráculo de referencia (`tools/oracle`)

Implementación independiente, en Python, de [`docs/algorithm.md`](../../docs/algorithm.md). Genera los fixtures sintéticos contra los que se mide el motor TypeScript al centavo (ADR-0014). El formato de los fixtures, la composición de los perfiles, la CLI y el esquema de los archivos privados están en [`FORMAT.md`](FORMAT.md), que es el contrato de este directorio.

## Reglas del linaje

- Se escribe **solo** a partir de `docs/algorithm.md`, `docs/specs/algorithm-examples/`, `docs/glossary.md` y `FORMAT.md`. Nunca se lee `packages/` ni `tools/conformance/`.
- Las tarjetas del oráculo (W1-02, W2-06, W3-04) trabajan en un checkout parcial y no corren pnpm (`docs/plan/README.md`, sección 3, paso 3).
- **Cero datos reales.** Todo fixture lleva `synthetic: true` y sale de una semilla. Los archivos privados de validación viven fuera del repo y solo con la autorización del dueño (`docs/plan/README.md`, sección 6).

## Contenido

| Ruta | Dueño | Qué es |
|---|---|---|
| `FORMAT.md` | W0-04 (congelado) | Contrato de formatos, perfiles, CLI y esquema privado |
| `pyproject.toml`, `.python-version`, `requirements-dev.txt` | W0-04 (congelados) | Python 3.13, configuración de pytest y ruff, dependencias de desarrollo con hash |
| `cuotascasa_oracle/` | W1-02, luego W2-06 y W3-04 | El paquete; se ejecuta como `python -m cuotascasa_oracle` |
| `tests/` | W1-02, luego W2-06 y W3-04 | Pruebas con pytest |
| `fixtures/` | Gates de Opus W2-01, W3-01 y W4-01 | Fixtures comprometidos y `manifest.json` |

## Preparar el entorno

Desde la raíz del worktree, con el Python de `.python-version`:

```bash
python3.13 -m venv ../<ID>.venv
../<ID>.venv/bin/pip install --require-hashes -r tools/oracle/requirements-dev.txt
source ../<ID>.venv/bin/activate
```

`<ID>` es el id de la tarjeta; el venv queda fuera del worktree y nunca se commitea. `--require-hashes` rechaza cualquier paquete sin hash fijado.

**Activa el venv antes de cualquier comando** (`source ../<ID>.venv/bin/activate`; `deactivate` lo cierra). Con el venv activo, `python`, `python3`, `pytest` y `ruff` son los de Python 3.13 del venv. Sin él, `python3` puede ser otra versión del sistema, y los scripts raíz `pnpm oracle:gen` y `pnpm oracle:diff` (W0-01), que invocan `python3`, correrían con esa otra versión.

## Comandos

Con el venv activo, todos se ejecutan desde `tools/oracle` (los scripts raíz `oracle:gen` y `oracle:diff` de W0-01 hacen lo mismo con `python3`):

```bash
python -m pytest                      # pruebas (sale con código 5 mientras no existan pruebas)
ruff check                            # lint
python -m cuotascasa_oracle generate --profile core --seed <semilla> --out fixtures
python -m cuotascasa_oracle regenerate --manifest fixtures/manifest.json
python -m cuotascasa_oracle compare --terms <ruta>/a-terms.json --expected <ruta>/a-expected.csv
```

`compare` imprime exactamente tres líneas (`allRowsMatched`, `mismatchedRows`, `maxAbsDiff`) y nunca el total de filas; con `--log-line --sha <sha> --label <label>` imprime solo la línea de la bitácora (FORMAT.md, sección 8).

## Actualizar `requirements-dev.txt`

Solo Opus, en una micro-tarjeta. Las versiones son exactas y cada una lleva todos los sha256 que publica PyPI (todas las plataformas). Para regenerar el archivo con las versiones elegidas:

```bash
python3 - pytest==<versión> ruff==<versión> iniconfig==<versión> packaging==<versión> pluggy==<versión> pygments==<versión> <<'PY' > /tmp/requirements-body.txt
import json, sys, urllib.request
for pin in sorted(sys.argv[1:], key=str.lower):
    name, version = pin.split("==")
    with urllib.request.urlopen(f"https://pypi.org/pypi/{name}/{version}/json", timeout=30) as response:
        digests = sorted({item["digests"]["sha256"] for item in json.load(response)["urls"]})
    print(" \\\n".join([f"{name.lower()}=={version}"] + [f"    --hash=sha256:{d}" for d in digests]))
PY
```

Luego se reemplaza el cuerpo de `requirements-dev.txt` (debajo de los comentarios) por `/tmp/requirements-body.txt`, se actualizan los pines de `[project.optional-dependencies] dev` en `pyproject.toml` y se comprueba la instalación con `pip install --require-hashes`.
