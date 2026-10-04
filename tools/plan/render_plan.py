#!/usr/bin/env python3
"""Genera las vistas del plan desde docs/plan/plan.json (fuente única).

Salidas: docs/plan/cards/<ID>.md, docs/plan/traceability.md y docs/plan/waves.md.
Además valida el plan: ids únicos, dependencias existentes y sin ciclos, sin
dependencias hacia olas posteriores, W0 solo Opus, requisitos R1–R28 cubiertos y
ningún traslape de `owns` entre tarjetas que pueden correr en paralelo.

Uso:  python3 tools/plan/render_plan.py [--check]
      --check  solo valida, sin escribir archivos (código de salida 1 si hay problemas)
Lo ejecuta Opus después de cambiar plan.json (ADR-0019).
"""
import collections, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "docs/plan/plan.json"
OUT = ROOT / "docs/plan"

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
    return cards, problems


def bullets(xs):
    return "\n".join(f"- `{x}`" for x in xs) if xs else "- (ninguna)"


def render(plan, cards):
    dependents = collections.defaultdict(list)
    for c in cards:
        for d in c["depends_on"]:
            dependents[d].append(c["id"])
    wave_name = {w["id"]: w["name"] for w in plan["waves"]}
    (OUT / "cards").mkdir(parents=True, exist_ok=True)
    for c in cards:
        oracle = all(p.startswith("tools/oracle/") for p in c["owns"])  # linaje aislado del oráculo (ADR-0014)
        install = ("No uses pnpm en este linaje: crea un venv con el Python de tools/oracle/.python-version, "
                   "`pip install --require-hashes -r tools/oracle/requirements-dev.txt`, y verifica con `python -m pytest` y `ruff check` desde tools/oracle.") if oracle else "Instala con `pnpm install --frozen-lockfile`."
        verify = ("`python -m pytest` y `ruff check` en verde desde tools/oracle (Opus vuelve a correr hooks y CI completo antes del merge)") if oracle else "`pnpm lint && pnpm typecheck && pnpm test` en verde, más los checks de CI de esta tarjeta"
        branch = f"card/{c['id']}-{slug(c['title'])}"
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
        (OUT / "cards" / f"{c['id']}.md").write_text(md)

    cov = collections.defaultdict(list)
    for c in cards:
        for r in c["requirements"]:
            cov[r].append(c["id"])
    tl = ["# Matriz de trazabilidad: requisitos ↔ tarjetas", "",
          "<!-- Generado por tools/plan/render_plan.py desde docs/plan/plan.json. No editar a mano. -->", "",
          "Cada requisito tiene al menos una tarjeta.", "", "| Requisito | Descripción | Tarjetas |", "|---|---|---|"]
    for r in sorted(REQ, key=lambda x: int(x[1:])):
        tl.append(f"| {r} | {REQ[r]} | {', '.join(f'[{i}](cards/{i}.md)' for i in cov[r])} |")
    (OUT / "traceability.md").write_text("\n".join(tl) + "\n")

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
    (OUT / "waves.md").write_text("\n".join(wl))


def main():
    plan = json.loads(PLAN.read_text())
    cards, problems = validate(plan)
    if problems:
        print("PROBLEMAS:\n- " + "\n- ".join(problems))
    else:
        print(f"Plan válido: {len(cards)} tarjetas, {len(plan['waves'])} olas, R1–R28 cubiertos, sin traslapes.")
    if "--check" in sys.argv:
        sys.exit(1 if problems else 0)
    if problems:
        sys.exit(1)
    render(plan, cards)
    print("Vistas regeneradas: cards/, traceability.md, waves.md")


if __name__ == "__main__":
    main()
