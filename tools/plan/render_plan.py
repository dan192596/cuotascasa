#!/usr/bin/env python3
"""Genera las vistas del plan desde docs/plan/plan.json (fuente única).

Salidas: docs/plan/cards/<ID>.md, docs/plan/traceability.md, docs/plan/waves.md,
docs/plan/cards.json (id, ola, ejecutor, rama y owns de cada tarjeta) y
docs/plan/frozen-files.json (copia exacta de la sección 'frozen_files'); owns-check
(tools/owns-check, W0-06) lee solo esos dos JSON.
Además valida el plan: ids únicos, dependencias existentes y sin ciclos, sin
dependencias hacia olas posteriores, W0 solo Opus, requisitos R1–R28 cubiertos,
ningún traslape de `owns` entre tarjetas que pueden correr en paralelo y la sección
'frozen_files': cada entrada con `path` y `editableBy` (ids existentes), rutas únicas,
y ninguna tarjeta con un `owns` dentro de una ruta congelada sin figurar en su `editableBy`.

Uso:  python3 tools/plan/render_plan.py [--check]
      --check  valida y comprueba que las vistas escritas estén al día, sin escribir
               (código de salida 1 si hay problemas o vistas desactualizadas)
Lo ejecuta Opus después de cambiar plan.json (ADR-0019).
"""
import collections, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "docs/plan/plan.json"
OUT_DIR = "docs/plan"

REQ = {
 "R1": "Landing prerenderizada + simulador público (cero red y cero almacenamiento)",
 "R2": "Página de privacidad",
 "R3": "Núcleo del motor (cuota nivelada, reparto del cargo, cargos fijos, última cuota, fechas, día de pago)",
 "R4": "Línea de tiempo de eventos (cambio de tasa con 3 políticas, cargos fijos, abonos con modo y comisión, adelantar N, anclas, pagos reales)",
 "R5": "Tres caminos + métricas de comparación",
 "R6": "Búsqueda por meta",
 "R7": "Validación de plantilla contra saldo real",
 "R8": "Plantillas (FHA Guatemala v1, Hipotecario simple) con copia editable",
 "R9": "Modelo de datos + esquemas zod",
 "R10": "Puerto de persistencia + adaptadores memoria y Dexie + suite de contrato + persist()",
 "R11": "Respaldo JSON con migraciones, vista previa, instantánea, deshacer y cifrado opcional",
 "R12": "Sincronización con Google Drive (merge, borrados, copia previa, estado offline, revocar, cifrado con frase, clave por dispositivo, cambiar frase)",
 "R13": "Dashboard",
 "R14": "Asistente de alta + edición + archivar/eliminar",
 "R15": "Tabla de amortización (vistas, Real Δ, subtotales anuales, teclado, abono en celda al escenario)",
 "R16": "Pantalla de datos reales",
 "R17": "Proyecciones + comparación + gráfica",
 "R18": "Ajustes (recordatorios de respaldo, import/export, Drive, frase, persistencia, aviso Safari)",
 "R19": "Exportar Excel/CSV/PDF (carga diferida)",
 "R20": "PWA offline + aviso de actualización",
 "R21": "Sistema de diseño (fuentes autoalojadas, tokens claro/oscuro, Material compacto, pipes es-GT, accesibilidad AA)",
 "R22": "Seguridad (CSP, Trusted Types, política de dependencias)",
 "R23": "Higiene de repo público (gitleaks, gitignore, denylist local, noreply, push protection, client ID al compilar)",
 "R24": "Infraestructura de pruebas (oráculo, fixtures sintéticos, diff en CI, propiedades, contrato, e2e Chromium+WebKit, axe, presupuestos, owns-check)",
 "R25": "CI/CD + despliegue en Cloudflare con rewrites acotados y 404",
 "R26": "Documentación (README bilingüe, modelo de amenazas, guía de Google Cloud, checklist manual de Drive, ADRs al día)",
 "R27": "Multimoneda por préstamo GTQ/USD sin mezclar; totales por moneda",
 "R28": "Estado del préstamo activo/pagado/archivado",
}


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:48].rstrip("-")


def validate(plan):
    cards = [dict(c, wave=w["id"]) for w in plan["waves"] for c in w["cards"]]
    by = {c["id"]: c for c in cards}
    problems = []
    ids = [c["id"] for c in cards]
    problems += [f"id duplicado: {i}" for i in sorted({i for i in ids if ids.count(i) > 1})]
    for c in cards:
        problems += [f"{c['id']} depende de {d}, que no existe" for d in c["depends_on"] if d not in by]
    memo = {}

    def ancestors(i, stack=()):
        if i in memo:
            return memo[i]
        if i in stack:
            problems.append(f"ciclo de dependencias en {i}")
            return set()
        s = set()
        for d in by[i]["depends_on"]:
            if d in by:
                s.add(d)
                s |= ancestors(d, stack + (i,))
        memo[i] = s
        return s

    norm = lambda p: p[2:] if p.startswith("./") else p

    def overlaps(a, b):
        a, b = norm(a), norm(b)
        return a == b or (a.endswith("/") and b.startswith(a)) or (b.endswith("/") and a.startswith(b))

    for x in range(len(cards)):
        for y in range(x + 1, len(cards)):
            A, B = cards[x], cards[y]
            if A["id"] in ancestors(B["id"]) or B["id"] in ancestors(A["id"]):
                continue
            for pa in A["owns"]:
                for pb in B["owns"]:
                    if overlaps(pa, pb):
                        problems.append(f"traslape de owns entre {A['id']} ({pa}) y {B['id']} ({pb})")
    widx = {w["id"]: k for k, w in enumerate(plan["waves"])}
    for c in cards:
        for d in c["depends_on"]:
            if d in by and widx[by[d]["wave"]] > widx[c["wave"]]:
                problems.append(f"{c['id']} depende de {d}, de una ola posterior")
    w0 = plan["waves"][0]
    problems += [f"{c['id']} está en {w0['id']} y no es de Opus" for c in w0["cards"] if c["executor"] != "opus"]
    covered = {r for c in cards for r in c["requirements"]}
    problems += [f"requisito sin cubrir: {r}" for r in REQ if r not in covered]
    problems += validate_frozen_files(plan.get("frozen_files"), cards)
    return cards, problems


SAFE_PATH = re.compile(r"^(?!\./)(?!/)(?!.*(?:^|/)\.\.(?:/|$))[^*?\[\]]+$")


def frozen_covers(frozen_path, owned_path):
    """True si el owns `owned_path` queda entero dentro de la ruta congelada (igual, o dentro de un directorio)."""
    return owned_path == frozen_path or (frozen_path.endswith("/") and owned_path.startswith(frozen_path))


def validate_frozen_files(frozen, cards):
    """Valida la sección 'frozen_files' de plan.json: [{path, editableBy: [ids de tarjeta]}]."""
    if not isinstance(frozen, list):
        return ["plan.json no tiene la sección 'frozen_files' (lista de {path, editableBy})"]
    ids = {c["id"] for c in cards}
    problems, seen = [], set()
    for i, entry in enumerate(frozen):
        path = entry.get("path") if isinstance(entry, dict) else None
        if not isinstance(path, str) or not path:
            problems.append(f"frozen_files[{i}]: falta path")
            continue
        where = f"frozen_files[{i}] ({path})"
        if not SAFE_PATH.match(path):
            problems.append(f"{where}: la ruta debe ser relativa a la raíz, sin './', '..' ni comodines")
        if path in seen:
            problems.append(f"frozen_files: ruta repetida {path}")
        seen.add(path)
        if set(entry) - {"path", "editableBy"}:
            problems.append(f"{where}: solo admite las claves path y editableBy")
        editable = entry.get("editableBy")
        if not isinstance(editable, list) or not all(isinstance(x, str) for x in editable):
            problems.append(f"{where}: falta editableBy")
            continue
        problems += [f"{where}: editableBy nombra {x}, que no existe" for x in editable if x not in ids]
        if len(set(editable)) != len(editable):
            problems.append(f"{where}: editableBy repite una tarjeta")
    for c in cards:
        for owned in c["owns"]:
            for entry in frozen:
                if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
                    continue
                editable = entry.get("editableBy") if isinstance(entry.get("editableBy"), list) else []
                if frozen_covers(entry["path"], owned) and c["id"] not in editable:
                    problems.append(
                        f"{c['id']} posee {owned}, congelado por {entry['path']} sin figurar en su editableBy"
                    )
    return problems


def bullets(xs):
    return "\n".join(f"- `{x}`" for x in xs) if xs else "- (ninguna)"


def branch_name(c):
    return f"card/{c['id']}-{slug(c['title'])}"


def build_outputs(plan, cards):
    """Devuelve {ruta relativa a la raíz: contenido} de todas las vistas generadas."""
    outputs = {}
    dependents = collections.defaultdict(list)
    for c in cards:
        for d in c["depends_on"]:
            dependents[d].append(c["id"])
    wave_name = {w["id"]: w["name"] for w in plan["waves"]}
    for c in cards:
        oracle = all(p.startswith("tools/oracle/") for p in c["owns"])  # linaje aislado del oráculo (ADR-0014)
        install = ("No uses pnpm en este linaje: crea un venv con el Python de tools/oracle/.python-version, "
                   "`pip install --require-hashes -r tools/oracle/requirements-dev.txt`, y verifica con `python -m pytest` y `ruff check` desde tools/oracle.") if oracle else "Instala con `pnpm install --frozen-lockfile`."
        verify = ("`python -m pytest` y `ruff check` en verde desde tools/oracle (Opus vuelve a correr hooks y CI completo antes del merge)") if oracle else "`pnpm lint && pnpm typecheck && pnpm test` en verde, más los checks de CI de esta tarjeta"
        branch = branch_name(c)
        who = "Opus (agente principal)" if c["executor"] == "opus" else "Sonnet (subagente en worktree)"
        reqs = "\n".join(f"- **{r}**: {REQ.get(r, '?')}" for r in c["requirements"])
        ac = "\n".join(f"- [ ] {a}" for a in c["acceptance_criteria"])
        deps = ", ".join(c["depends_on"]) or "(ninguna)"
        title = c["title"].replace('"', "'")
        md = f"""---
id: {c['id']}
title: "{title}"
wave: {c['wave']}
executor: {c['executor']}
size: {c['size']}
depends_on: [{", ".join(c['depends_on'])}]
requirements: [{", ".join(c['requirements'])}]
branch: {branch}
worktree: .worktrees/{c['id']}
---

<!-- Generado por tools/plan/render_plan.py desde docs/plan/plan.json. No editar a mano. -->

# {c['id']} · {c['title']}

| Campo | Valor |
|---|---|
| Ola | {c['wave']}: {wave_name[c['wave']]} |
| Ejecutor | {who} |
| Tamaño | {c['size']} |
| Depende de | {", ".join(c['depends_on']) or "—"} |
| Desbloquea | {", ".join(sorted(dependents[c['id']])) or "—"} |
| Rama / worktree | `{branch}` · `.worktrees/{c['id']}` |

## Requisitos cubiertos
{reqs}

## Archivos propios (`owns`): solo estos se pueden crear o editar
{bullets(c['owns'])}

## Contratos de solo lectura (`contracts_used`)
{bullets(c['contracts_used'])}

## Entregables
{c['deliverables']}

## Criterios de aceptación (objetivos, verificables por pruebas o CI)
{ac}

## Notas
{c['notes'] or "—"}

## Definición de terminado
1. Pruebas primero (TDD) para toda la lógica.
2. {verify}.
3. El PR solo toca rutas de `owns` (lo verifica `owns-check`) y ningún archivo congelado de `docs/plan/frozen-files.json`, salvo que figure en su `editableBy`.
4. Sin dependencias nuevas, sin datos reales y sin secretos.
5. Toda decisión de diseño nueva queda en el ADR correspondiente. Las dudas se elevan; no se adivinan. Precedencia: `docs/algorithm.md` > ADR > spec > historias > tarjeta.
6. Revisión de Opus y merge en orden de dependencias.

## Prompt para lanzar esta tarjeta
```text
Eres un agente {"Opus" if c['executor'] == 'opus' else "Sonnet"} ejecutando la tarjeta {c['id']} del proyecto CuotasCasa.
1. Lee CLAUDE.md, docs/plan/README.md y docs/plan/cards/{c['id']}.md completos antes de empezar.
2. Trabaja solo en el worktree .worktrees/{c['id']} (rama {branch}), creado desde main con las dependencias {deps} ya fusionadas. {install}
3. Solo puedes crear o editar las rutas listadas en «Archivos propios». Los «Contratos de solo lectura» y todo archivo congelado son intocables.
4. Sigue TDD. Termina cuando todos los criterios de aceptación pasen y la verificación de la «Definición de terminado» esté en verde.
5. Si necesitas cambiar un archivo compartido o congelado, agregar una dependencia, o encuentras ambigüedad o contradicción entre fuentes: haz commit `wip({c['id']}): …` y termina con un bloque «PREGUNTAS PARA OPUS» (archivo o regla, opciones, impacto). No improvises.
6. Nunca uses datos reales de préstamos ni datos personales; solo fixtures sintéticos.
7. Al terminar, abre un PR hacia main con: resumen, criterios cumplidos (checklist), comandos de verificación y su salida.
```
"""
        outputs[f"{OUT_DIR}/cards/{c['id']}.md"] = md

    cov = collections.defaultdict(list)
    for c in cards:
        for r in c["requirements"]:
            cov[r].append(c["id"])
    tl = ["# Matriz de trazabilidad: requisitos ↔ tarjetas", "",
          "<!-- Generado por tools/plan/render_plan.py desde docs/plan/plan.json. No editar a mano. -->", "",
          "Cada requisito tiene al menos una tarjeta.", "", "| Requisito | Descripción | Tarjetas |", "|---|---|---|"]
    for r in sorted(REQ, key=lambda x: int(x[1:])):
        tl.append(f"| {r} | {REQ[r]} | {', '.join(f'[{i}](cards/{i}.md)' for i in cov[r])} |")
    outputs[f"{OUT_DIR}/traceability.md"] = "\n".join(tl) + "\n"

    wl = ["# Olas y tarjetas", "", "<!-- Generado por tools/plan/render_plan.py desde docs/plan/plan.json. No editar a mano. -->", "",
          "Detalle de cada tarjeta en `cards/`. Cada ola se ejecuta en lotes de ≤ 6 tarjetas Sonnet en paralelo.", ""]
    for w in plan["waves"]:
        wl += [f"## {w['id']} · {w['name']}", "", w["goal"], "",
               "| Tarjeta | Ejecutor | Tamaño | Depende de | Título |", "|---|---|---|---|---|"]
        for c in w["cards"]:
            wl.append(f"| [{c['id']}](cards/{c['id']}.md) | {c['executor']} | {c['size']} | {', '.join(c['depends_on']) or '—'} | {c['title']} |")
        wl.append("")
    wl += ["## Contratos congelados en W0", "", plan["wave0_contracts"], "",
           "## Política de archivos compartidos", "", plan["shared_files_policy"], "",
           "## Riesgos del plan", ""] + [f"- {r}" for r in plan["risks"]] + ["", "## Fundamento", "", plan["rationale"], ""]
    outputs[f"{OUT_DIR}/waves.md"] = "\n".join(wl)

    cards_json = [
        {"id": c["id"], "wave": c["wave"], "executor": c["executor"], "branch": branch_name(c), "owns": c["owns"]}
        for c in cards
    ]
    outputs[f"{OUT_DIR}/cards.json"] = json.dumps(cards_json, ensure_ascii=False, indent=2) + "\n"
    outputs[f"{OUT_DIR}/frozen-files.json"] = json.dumps(plan["frozen_files"], ensure_ascii=False, indent=2) + "\n"
    return outputs


def write_outputs(outputs, root):
    for rel, content in outputs.items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def stale_outputs(outputs, root):
    """Vistas que faltan en disco o cuyo contenido difiere del generado."""
    stale = []
    for rel, content in outputs.items():
        target = root / rel
        if not target.is_file() or target.read_text(encoding="utf-8") != content:
            stale.append(rel)
    return stale


def leftover_views(outputs, root):
    """Fichas de docs/plan/cards/ que ya no corresponden a ninguna tarjeta del plan."""
    cards_dir = root / OUT_DIR / "cards"
    if not cards_dir.is_dir():
        return []
    return sorted(
        f"{OUT_DIR}/cards/{p.name}" for p in cards_dir.glob("*.md") if f"{OUT_DIR}/cards/{p.name}" not in outputs
    )


def main(argv=None, root=ROOT):
    argv = sys.argv[1:] if argv is None else argv
    plan = json.loads((root / "docs/plan/plan.json").read_text(encoding="utf-8"))
    cards, problems = validate(plan)
    if problems:
        print("PROBLEMAS:\n- " + "\n- ".join(problems))
        return 1
    print(f"Plan válido: {len(cards)} tarjetas, {len(plan['waves'])} olas, R1–R28 cubiertos, sin traslapes, "
          f"{len(plan['frozen_files'])} rutas congeladas con editableBy.")
    outputs = build_outputs(plan, cards)
    if "--check" in argv:
        stale = [f"vista desactualizada: {rel} (regenera con python3 tools/plan/render_plan.py)"
                 for rel in stale_outputs(outputs, root)]
        stale += [f"vista sobrante: {rel} (ninguna tarjeta del plan la genera; bórrala)"
                  for rel in leftover_views(outputs, root)]
        if stale:
            print("PROBLEMAS:\n- " + "\n- ".join(stale))
            return 1
        print("Vistas al día: cards/, traceability.md, waves.md, cards.json, frozen-files.json")
        return 0
    write_outputs(outputs, root)
    print("Vistas regeneradas: cards/, traceability.md, waves.md, cards.json, frozen-files.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
