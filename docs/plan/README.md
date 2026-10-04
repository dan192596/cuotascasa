# Guía de ejecución del plan

Para **Opus** (agente principal) y el **dueño del proyecto**. Explica cómo pasar de la planificación a la construcción: lanzar tarjetas, revisarlas, fusionarlas, cambiar contratos y mantener el plan al día.

**Estado (2026-10-04):**
- Fases 0 a 4 terminadas, salvo la aprobación de la paleta propuesta (fase 2, sección 1). Plan aprobado: 72 tarjetas en 8 olas.
- Construcción por iniciar en W0.
- Pendientes: autorizar o no la carpeta privada del oráculo (sección 6), aprobar la paleta cuando W0-05 la presente y las demás acciones del dueño (sección 7).

## Si eres el agente de una tarjeta

Tu prompt te pide leer esta guía. Lo que te aplica:

- Trabaja **solo** dentro de tu worktree y de tus `owns`. Usa rutas absolutas, porque el directorio de trabajo se puede reiniciar entre comandos.
- Instala con `pnpm install --frozen-lockfile`. **Nunca** corras `pnpm install` sin esa bandera: reescribiría el lockfile congelado. Excepción: las tarjetas del linaje del oráculo no corren pnpm; usan un venv con `pip install --require-hashes` (sección 3, paso 3).
- Si necesitas algo fuera de tus `owns`, detente y sigue el protocolo de bloqueo (sección 3, paso 5). Eso incluye un archivo congelado o compartido, una dependencia, una ambigüedad de `docs/algorithm.md`, una contradicción entre fuentes o una decisión de diseño.
- **Dónde buscar** además de tu tarjeta y `CLAUDE.md`:
  - cálculo: `docs/algorithm.md` y `docs/specs/algorithm-examples/`;
  - decisiones: `docs/adr/`;
  - qué se construye: la spec de diseño y las specs de contrato de `docs/specs/`;
  - **comportamiento esperado de cada pantalla:** `docs/discovery/historias-de-usuario.md` (cada historia HU cita sus requisitos R);
  - bocetos y paleta: `docs/discovery/direccion-visual.md`.
- **Precedencia** cuando dos fuentes dicen cosas distintas: `docs/algorithm.md` > ADR aceptado > spec (`docs/specs/`) > historias de usuario > texto de la tarjeta. Ante una contradicción, **no elijas**: detente y escala citando ambas fuentes (archivo y sección). La precedencia decide qué comportamiento manda; nunca amplía tus `owns`.
- Respeta tu linaje:
  - **Motor:** nunca lees `tools/oracle/`.
  - **Oráculo:** nunca lees `packages/` ni `tools/conformance/`.
- **Cero datos reales.** Los únicos números válidos son los de los ejemplos sintéticos de `docs/algorithm.md` y `docs/specs/algorithm-examples/`, y los que se generan con semilla.
- No te saltes los hooks (`git commit --no-verify`). La única excepción es el linaje del oráculo (sección 3, paso 3), y el PR lo declara.
- Al terminar, abre el PR como indica la sección 3, paso 5.
- No edites nada bajo `docs/plan/`: es de Opus.

---

## 1. Fases de planificación y sus entregables

Se definió todo antes de escribir código. La spec de diseño es `docs/specs/2026-10-04-cuotascasa-v1-design.md`.

| Fase | Entregable | Dónde | Estado |
|---|---|---|---|
| 0 · Descubrimiento | Investigación pública del dominio (primas FHA, desgravamen, IUSI, tasa líder), stack de frontend, backends y hosting comparados, y la ingeniería inversa del algoritmo (hecha en privado y sin números en el repo) | `docs/discovery/` | Completa |
| 1 · Arquitectura | ADR-0001 a ADR-0019 aceptados, ADR-0020 diferido (diseño Supabase archivado), ADR-0021 a ADR-0024 reservados | `docs/adr/` (índice en `docs/adr/README.md`) | Completa |
| 2 · UX | Flujos, pantallas, sistema de diseño ("libreta bancaria" + "tu casa se va llenando" + edición en celda), bocetos ASCII de las pantallas clave y paleta propuesta | Spec, sección 9; ADR-0012; `docs/discovery/direccion-visual.md`; comportamiento por pantalla en `docs/discovery/historias-de-usuario.md` | Completa salvo la paleta: es una **propuesta**. W0-05 la presenta al dueño y la congela en `docs/specs/design-palette.md` solo cuando él la aprueba |
| 3 · Datos y motor | Algoritmo con reglas `[ALG.*]` y ejemplo sintético resuelto, glosario y modelo de datos | `docs/algorithm.md`, `docs/glossary.md`, spec sección 7 | Completa. W0-02 agrega un ejemplo por regla y cierra las definiciones |
| 4 · Plan | Tarjetas, olas, contratos congelados, trazabilidad R1–R28 | `docs/plan/` | Completa y aprobada |
| 5 · Construcción | Código, pruebas, despliegue y v1.0.0 | Repo | Por iniciar (W0) |

Después de este punto, cambiar un entregable de las fases 0 a 4 sigue la sección 5 (contratos) o la 8 (plan). Si el cambio es una decisión, va con su ADR.

**ADR reservados**, que escriben las tarjetas:

| ADR | Tema | Tarjeta |
|---|---|---|
| 0021 | CSP, Trusted Types y GIS | W2-02, con la evidencia de W1-08 |
| 0022 | Enrutamiento estático en Cloudflare | W1-09; W2-02 lo acepta o enmienda |
| 0023 | Alcance del registro de la PWA | W2-02 |
| 0024 | Orden de combinación del sync | W0-04 |

El siguiente número libre es el **0025**. Solo Opus crea ADR nuevos.

## 2. Olas e hitos

- Detalle de cada ola y de los contratos congelados: [waves.md](waves.md).
- Requisitos ↔ tarjetas: [traceability.md](traceability.md).
- Una ficha por tarjeta: [cards/](cards/).
- Fuente de todo lo anterior: [plan.json](plan.json).

| Ola | Objetivo | Tarjetas (Opus) | Ejecución | Hito al cerrar |
|---|---|---|---|---|
| W0 | Cimientos y contratos congelados | 6 (6) | Serie, solo Opus: W0-01 ∥ W0-02 → W0-03 ∥ W0-04 → W0-05 → W0-06 | Repo donde las tarjetas paralelas no chocan; CI, owns-check y push protection activos |
| W1 | Probar el núcleo difícil | 10 (1) | 10 listas a la vez; lotes de ≤ 6 Sonnet | Calendario, oráculo, adaptadores, merge, cifrado y spikes probados |
| W2 | Eventos del motor, sync, seguridad de borde | 13 (2) | Gates W2-01 y W2-02, luego 11 listas a la vez; lotes de ≤ 6 Sonnet | **El motor coincide con el oráculo** en el perfil `core` (W2-13) |
| W3 | Corrección del motor y cimientos de la app | 18 (3) | Gate W3-01, integraciones W3-16 y W3-17; luego ~15 listas a la vez; lotes de ≤ 6 Sonnet | Fixtures completos y triage; sistema de diseño, capa de datos y primer deploy en vivo |
| W4 | Motor conforme, superficie pública, primeras pantallas | 12 (1) | Gate W4-01, luego 11 listas a la vez; lotes de ≤ 6 Sonnet | **Primera versión publicable:** landing, simulador, dashboard y asistente; motor conforme al centavo (W4-02) |
| W5 | Pantallas restantes | 8 (0) | 8 listas a la vez; lotes de ≤ 6 Sonnet | **Todas las pantallas** |
| W6 | Recorridos e2e, barridos y docs | 4 (0) | 4 listas a la vez; lotes de ≤ 6 Sonnet | Producto probado de punta a punta en Chromium y WebKit |
| W7 | Release | 1 (1) | — | **v1.0.0** |

En total son 58 tarjetas Sonnet y 14 Opus.

«N listas a la vez» cuenta las tarjetas que pueden empezar; se lanzan en lotes de ≤ 6 Sonnet (sección 3, paso 2).

Las olas agrupan, pero no obligan a esperar. Una tarjeta está **lista** cuando todas sus `depends_on` están fusionadas en `main`. La única excepción son los gates de Opus que abren una ola (W2-01, W2-02, W3-01, W4-01): las tarjetas de esa ola que dependen de ellos esperan al gate.

**Rutas críticas:**
- **Producto:** W0-01 → W0-03 → W0-05 → W0-06 → W1-01 → W2-05 → W3-12 → W4-07 → W5-02 / W5-03 / W5-04 → W6-01 → W7-01.
- **Corrección:** W0-02 → W1-02 → W2-01 → W2-06 → W3-01 → W3-04 → W4-01 → W4-02 → W7-01.

**Arranque, antes de W0-01.** `main` todavía no tiene commits y sin uno no se puede crear un worktree.
1. Opus revisa a mano que la planificación no contenga datos reales. Los hooks de higiene aún no existen: llegan con W0-01 y W1-10.
2. Commit inicial en `main` con el correo noreply ya configurado, por ejemplo `docs: planificación v1`.
3. No se hace push hasta que el dueño active las protecciones de GitHub (sección 7, antes de W0-06).

## 3. Cómo lanzar una tarjeta

### Paso 1. Verificar que está lista

El estado vive en git; no hay archivo de seguimiento:
- **Fusionada:** su commit en `main` termina con `(<ID>)`.
- **En vuelo:** aparece en `git worktree list`.
- **En revisión:** tiene un PR abierto (`gh pr list`).

Este comando lista las tarjetas listas que aún no están fusionadas:

```bash
git log main --format=%s | grep -oE '\(W[0-9]-[0-9]{2}\)$' | tr -d '()' | python3 -c '
import json, sys
merged = set(sys.stdin.read().split())
plan = json.load(open("docs/plan/plan.json"))
for w in plan["waves"]:
    for c in w["cards"]:
        if c["id"] not in merged and set(c["depends_on"]) <= merged:
            print(c["id"], c["executor"], c["size"], c["title"], sep="  ")
'
```

De esa lista, quita las que ya están en vuelo o en revisión.

### Paso 2. Elegir y preparar

- **Límite:** unas **6 tarjetas Sonnet en paralelo**. Si Opus está ejecutando una tarjeta propia, baja a 4 o 5 para que la revisión no se atrase.
- **Prioridad:**
  1. El gate o la integración de Opus que abre la ola.
  2. Lo de mayor incertidumbre: spikes, motor y oráculo.
  3. Lo que desbloquea más tarjetas.
  4. A igualdad, las grandes (L) antes que las chicas, para que empiecen pronto.
- **Ejemplo para W1:**
  - Primer lote: W1-01 (desbloquea 6 directas y 28 en total), W1-08 y W1-09 (spikes que deciden ADR-0021 y ADR-0022), W1-02 (ruta de corrección), W1-10 (debe fusionarse antes de que W2-01 suba fixtures) y W1-05.
  - Después: W1-04, W1-06 y W1-03.
  - Opus ejecuta W1-07 (cifrado) en paralelo.
- **Contexto adicional:** si una dependencia ya fusionada fijó algo que la tarjeta necesita saber (por ejemplo, la CSP de ADR-0021 o una micro-tarjeta de contrato), Opus lo agrega al final del prompt como «Contexto adicional de Opus». La ficha de la tarjeta no se edita (sección 8).

### Paso 3. Crear el worktree

Lo necesitan la opción B y las tarjetas del linaje del oráculo. La rama exacta está en el campo `branch:` de la ficha, y owns-check lee el id de la tarjeta desde ese nombre.

```bash
git switch main && git pull --ff-only        # main al día
git worktree add .worktrees/<ID> -b card/<ID>-<slug> main
pnpm --dir .worktrees/<ID> install --frozen-lockfile   # desde W0-01
```

**Linaje del oráculo** (W1-02, W2-06, W3-04 y micro-tarjetas del oráculo): el worktree es un checkout parcial. Trae los archivos sueltos de la raíz, `docs/algorithm.md`, `docs/glossary.md`, `docs/specs/algorithm-examples/`, `docs/specs/conformance-triage.md` (existe desde W3-01; W3-04 lo usa como contrato), `tools/oracle/` (incluido `FORMAT.md`, con los perfiles del generador y el esquema de los archivos privados; sección 6), esta guía y la ficha de la tarjeta.

```bash
git worktree add --no-checkout .worktrees/<ID> -b card/<ID>-<slug> main
git -C .worktrees/<ID> sparse-checkout set --no-cone '/*' '!/*/' \
  '/docs/algorithm.md' '/docs/glossary.md' '/docs/specs/algorithm-examples/' \
  '/docs/specs/conformance-triage.md' \
  '/docs/plan/README.md' '/docs/plan/cards/<ID>.md' '/tools/oracle/'
git -C .worktrees/<ID> checkout card/<ID>-<slug>
```

Como el triage entra al linaje del oráculo, Opus lo redacta así: cada ítem cita la regla `[ALG.*]`, el id del fixture, la fila y el campo, y explica qué dice la regla. **Nunca** incluye código, rutas ni nombres internos del motor, ni los valores que calculó el motor.

**Las tarjetas de este linaje no corren pnpm.** El checkout parcial trae los archivos sueltos de la raíz, pero no los paquetes del workspace (`apps/`, `packages/`, `tools/conformance/`) ni `node_modules`, así que no corren ni `pnpm install` ni `pnpm lint && pnpm typecheck && pnpm test`. En su lugar:

```bash
python3.13 -m venv .worktrees/<ID>.venv      # Python de tools/oracle/.python-version; fuera del worktree (.worktrees/ ya está ignorado), nunca se commitea
.worktrees/<ID>.venv/bin/pip install --require-hashes -r .worktrees/<ID>/tools/oracle/requirements-dev.txt
cd .worktrees/<ID>/tools/oracle
../../../<ID>.venv/bin/python -m pytest
../../../<ID>.venv/bin/ruff check
```

`--require-hashes` hace que pip rechace cualquier paquete sin hash fijado en `requirements-dev.txt`. El criterio de terminado del linaje es `python -m pytest` y `ruff check` en verde desde `tools/oracle`.

El PR registra el comando de checkout parcial. Lefthook puede no correr en el checkout parcial, porque falta `node_modules`. Solo en este linaje se permite `git commit --no-verify`, y el PR lo declara. **Opus vuelve a correr los hooks sobre la rama completa antes del merge, y CI siempre corre completo** (incluidos los jobs de pnpm).

### Paso 4. Lanzar

**Opción A: desde la sesión de Opus, con el Agent tool.** Es la opción por defecto para las tarjetas Sonnet del linaje del motor y de la app.

```text
Agent(
  description: "<ID>",
  model: "sonnet",
  isolation: "worktree",
  run_in_background: true,
  prompt: <preámbulo> + <sección «Prompt para lanzar» de cards/<ID>.md> + <contexto adicional de Opus, si hay>
)
```

Preámbulo:

```text
Tu worktree aislado lo creó la herramienta; úsalo en lugar de la ruta .worktrees/<ID> que menciona el prompt.
Antes de empezar: git switch -c card/<ID>-<slug>, y confirma con git log que las dependencias <deps> están en la base.
Ejecuta pnpm install --frozen-lockfile; nunca pnpm install sin esa bandera.
Usa rutas absolutas dentro de tu worktree.
Si te bloqueas, sigue el protocolo de docs/plan/README.md (sección 3, paso 5): commit wip(<ID>) y bloque «PREGUNTAS PARA OPUS».
```

Notas:
- `isolation: "worktree"` crea la copia desde el `HEAD` de la sesión de Opus, así que `main` debe estar al día antes de lanzar.
- Si el agente termina con cambios, la herramienta devuelve la ruta y la rama. Con `run_in_background` se lanzan varias tarjetas a la vez.

**Opción B: una sesión separada de Claude Code.**
1. El dueño u Opus abre una sesión nueva en `.worktrees/<ID>` con el modelo Sonnet (`claude --model sonnet` desde esa carpeta, o la carpeta abierta en la app con Sonnet elegido).
2. Pega el «Prompt para lanzar» de la ficha, más el contexto adicional si lo hay.

Úsala para:
- **el linaje del oráculo**, que es obligatorio: la sesión solo ve el checkout parcial;
- tarjetas largas que conviene seguir aparte;
- cuando la sesión de Opus ya está cargada.

**Tarjetas Opus:** las ejecuta el agente principal en su propio worktree, igual que el paso 3.

### Paso 5. Durante y al terminar

**Protocolo de bloqueo.** Un agente en segundo plano (opción A) o en una sesión aparte (opción B) no puede quedarse esperando una respuesta. Cuando necesita algo fuera de sus `owns`, encuentra una ambigüedad o una contradicción entre fuentes, o un hook falla y no puede resolverlo dentro de su alcance:

1. Hace commit de su avance en su rama con el mensaje `wip(<ID>): <qué falta>`. Un commit wip puede tener pruebas en rojo, pero nunca datos reales. No abre PR. Si un hook bloquea el commit, no lo salta: deja el avance sin commit en el worktree y lo dice en el bloque.
2. Termina su turno con este bloque, y nada más después:

   ```text
   PREGUNTAS PARA OPUS (<ID>)
   1. Archivo o regla: <ruta, [ALG.*], HU-xx o ADR-NNNN; si es una contradicción, ambas fuentes>
      Pregunta: <qué no está claro o qué hace falta>
      Opciones: (a) … (b) …
      Impacto: <qué criterio o parte de la tarjeta queda bloqueada>
   Estado: rama card/<ID>-<slug>, último commit <sha corto>, worktree <ruta absoluta>.
   ```

3. Opus responde dentro del alcance de la tarjeta o abre una micro-tarjeta (sección 5). Nunca autoriza tocar algo fuera de `owns`.
   - **Opción A:** el bloque llega a Opus como resultado del subagente. Opus contesta con un mensaje al subagente si sigue activo. Si ya terminó, lo relanza sin `isolation`, con este preámbulo de continuación: «Trabaja en el worktree <ruta> (rama card/<ID>-<slug>) y continúa desde su último commit wip», seguido de la respuesta como «Contexto adicional de Opus».
   - **Opción B:** el dueño pega el bloque en la sesión de Opus y devuelve la respuesta a la sesión del agente. Si esa sesión ya se cerró, abre una nueva en el mismo worktree con el «Prompt para lanzar», la línea «continúa desde el último commit wip» y la respuesta.
   - Si hace falta una micro-tarjeta, la tarjeta espera a que se fusione y luego hace rebase (sección 5, paso 6).
4. Al retomar, el agente puede rehacer sus commits wip. El squash del merge los deja fuera de `main`.

**Hooks.** `git commit --no-verify` está prohibido, salvo en el linaje del oráculo (paso 3). Si se usó, el PR lo declara.

**Al terminar:**
- El agente termina con todos los criterios de aceptación cumplidos y `pnpm lint && pnpm typecheck && pnpm test` en verde. En el linaje del oráculo, en cambio, `python -m pytest` y `ruff check` en verde desde `tools/oracle` (paso 3).
- Abre un PR hacia `main` cuyo título termina con `(<ID>)`, con:
  - el resumen;
  - un checklist de criterios de aceptación con la evidencia de cada uno;
  - los comandos de verificación y su salida;
  - las rutas tocadas;
  - las preguntas abiertas;
  - el comando de creación del worktree y si se usó `--no-verify`, si es del linaje del oráculo.

## 4. Revisión y merge

### Checklist de revisión de Opus

Opus deja su revisión como comentario del PR. Las tarjetas Opus las revisa una sesión Opus nueva, sin el contexto de quien las escribió, con la misma lista.

1. **Criterios:** cada criterio de aceptación tiene evidencia. Opus vuelve a correr en el worktree los comandos clave (`pnpm lint`, `pnpm typecheck`, `pnpm test` y los checks propios de la tarjeta). En el linaje del oráculo, los corre sobre la rama completa, junto con los hooks (sección 3, paso 3).
2. **owns-check en verde,** y una lectura de la lista de rutas del diff: nada fuera de `owns` y ningún archivo de `docs/plan/frozen-files.json`, salvo que la tarjeta figure en su `editableBy`.
3. **Sin datos reales:**
   - fixtures con `synthetic: true`;
   - valores tomados de los ejemplos sintéticos o generados con semilla;
   - ningún PDF, Excel, CSV o captura fuera de los directorios de fixtures;
   - nada real en mensajes de commit, descripción del PR, logs o artefactos, incluida la salida de terminal de `compare` o `private-compare` (sección 6).
4. **Sin dependencias nuevas:** `pnpm-lock.yaml` y los `package.json` sin cambios (además están congelados).
5. **Pruebas reales, no triviales:**
   - se escribieron antes que el código, cuando es lógica;
   - fallan sin la implementación;
   - sin `.only`, `.skip`, `expect(true)` ni aserciones que solo verifican mocks;
   - no hay snapshots que reemplacen pruebas de lógica;
   - no se debilitaron propiedades ni tolerancias;
   - cobertura ≥ 95 % en `domain`, `schema` y `sync`.
6. **Motor y oráculo:**
   - cada corrección cita una regla `[ALG.*]`;
   - ningún id de fixture aparece en `packages/domain/src/`;
   - la cuarentena de propiedades solo cambia de forma visible;
   - el linaje se respetó (sin imports cruzados; comando de checkout parcial en el PR).
7. **Convenciones:**
   - identificadores en inglés, UI en es-GT y términos del glosario;
   - sin `any`, sin `Date` en el dominio y dinero como string decimal;
   - patrones Angular congelados y `data-testid='page-<route-id>'` en cada página;
   - en las pantallas, el comportamiento coincide con sus historias HU, o la contradicción se escaló;
   - accesibilidad AA.
8. **Seguridad:**
   - ningún origen externo, script inline ni analítica nueva;
   - nada de red ni almacenamiento en `public/`;
   - sin datos en `console.*`;
   - estado en IndexedDB, no en `localStorage`, salvo preferencias del visitante.
9. **ADR:** si apareció una decisión nueva, existe su ADR, escrito por Opus o por la tarjeta dueña de un ADR reservado.

**Si la revisión falla:**
- Opus devuelve hallazgos numerados al mismo agente: en la opción A, con un mensaje al subagente o relanzándolo; en la opción B, en su sesión.
- Tras dos rondas sin resolver, Opus redefine o divide la tarjeta.
- Un defecto que se descubre después de fusionar se arregla con una tarjeta de corrección (sección 5).

### Merge

1. **Orden de dependencias:** solo se fusiona una tarjeta cuyas `depends_on` ya están en `main`. Entre varias listas, primero el gate de la ola y luego la que desbloquea más.
2. **Rebase** sobre `main`: `git -C .worktrees/<ID> rebase main`, o `origin/main` una vez que existe el remoto. CI debe quedar verde otra vez.
3. **Squash** con mensaje convencional terminado en el id:
   `gh pr merge <N> --squash --delete-branch --subject "feat(domain): núcleo del calendario (W1-01)"`.
   En W0, antes del primer push, Opus fusiona en local con `git merge --squash` y usa el mismo formato de mensaje.
4. **Limpieza:**

   ```bash
   git switch main && git pull --ff-only
   git worktree remove .worktrees/<ID>
   git branch -D card/<ID>-<slug>      # -D porque el squash no conserva la rama como ancestro
   git worktree prune
   ```

5. Correr de nuevo el comando del paso 1 para lanzar lo que quedó listo.

## 5. Cambios de contrato y micro-tarjetas

Un **contrato** es un archivo congelado (`frozen-files.json`), compartido o exclusivo de Opus. Ninguna tarjeta lo cambia; lo cambia una **micro-tarjeta** de Opus.

1. **Pedido.** El agente se detiene y reporta qué archivo, qué cambio, por qué y qué parte de su tarjeta bloquea.
2. **Decisión.** Opus decide:
   - si hay una salida dentro de los `owns` de la tarjeta, la indica y la tarjeta sigue;
   - si no, abre una micro-tarjeta.
3. **Registro, antes de crear su rama,** en una rama `opus/register-<ID>`, exenta de owns-check:
   - En `plan.json`, Opus agrega la tarjeta con el siguiente número libre de la ola en curso (por ejemplo `W2-14`). Campos: ejecutor `opus`, tamaño `S`, `owns` explícitos (los archivos del contrato y sus specs de contrato), `depends_on`, requisitos y una nota que diga qué tarjeta la pidió.
   - Regenera `cards/`, `traceability.md`, `waves.md`, `cards.json` y `frozen-files.json` (sección 8). Cada archivo congelado lleva `editableBy`, con las tarjetas que pueden editarlo; así owns-check deja pasar a la micro-tarjeta.
   - Fusiona la rama en `main`.
4. **Implementación:**
   - Rama `card/<ID>-<slug>`.
   - Cambio mínimo, con la spec de contrato actualizada y su ADR si es una decisión.
   - CI en verde y merge.
   - Si cambia `docs/algorithm.md` o sus ejemplos, el oráculo se regenera en el siguiente gate, porque `generatorVersion` lo marca como pendiente.
5. **Aviso a las tarjetas en vuelo.** Primero se buscan las que leen o poseen la ruta cambiada y se cruzan con `git worktree list`:

   ```bash
   python3 -c '
   import json, sys
   path = sys.argv[1]
   plan = json.load(open("docs/plan/plan.json"))
   for w in plan["waves"]:
       for c in w["cards"]:
           refs = c["owns"] + c["contracts_used"]
           if any(path.startswith(r) or r.startswith(path) for r in refs):
               print(c["id"], c["title"], sep="  ")
   ' packages/domain/src/types/events.ts
   ```

   El aviso se envía por mensaje al subagente (opción A) o se pega en su sesión (opción B), y queda también como comentario en su PR si ya existe:

   ```text
   AVISO DE CONTRATO <MICRO-ID>, fusionado en main (<sha>).
   Archivos: <rutas>. Cambio: <qué y por qué>.
   Qué hacer: haz commit de tu avance, git rebase main, corre lint/typecheck/test y ajusta solo dentro de tus owns.
   ```

6. **Rebase.** Cada tarjeta avisada hace rebase y vuelve a verificar. La tarjeta que pidió el cambio continúa.

**Tarjetas de corrección.** Los defectos que aparecen tarde siguen el mismo registro con `owns` explícitos: por ejemplo, los que encuentra W7-01 antes del tag.

**Cambios a `docs/algorithm.md`.** Solo Opus, en W3-01 o en una micro-tarjeta de docs. Siempre siguen dos pasos: regenerar el oráculo y avisar a ambos linajes.

## 6. Compuertas del oráculo

La cadena de confianza:
1. `docs/algorithm.md` es la fuente.
2. El oráculo Python se escribe desde él (linaje aislado).
3. Los fixtures sintéticos salen del oráculo.
4. El motor TS debe coincidir con ellos al centavo.

Las compuertas impiden que motor y oráculo compartan el mismo error.

| Gate | Cuándo | Qué hace Opus | Desbloquea |
|---|---|---|---|
| **W2-01** | Inicio de W2 | Validación privada del oráculo (condicional, ver abajo); sube el perfil `core` (~15 préstamos) y `manifest.json`; agrega a CI los jobs `oracle-diff` y `conformance` | W2-06, W2-13, W3-16 |
| **W3-01** | Inicio de W3 | Sube el perfil `full` (~40 préstamos); repite la validación privada (condicional) con el commit final del oráculo; revisa 3 fixtures de eventos a mano; clasifica cada discrepancia en `docs/specs/conformance-triage.md`; corrige ambigüedades de `algorithm.md`; decide si W4-02 se divide (más de 5 familias del lado del motor) | W3-02, W3-03, W3-04, W4-01 |
| **W4-01** | Inicio de W4 | Regenera todos los perfiles con el oráculo corregido, repite la validación privada (condicional) y deja en el triage solo lo que toca al motor | W4-02 |
| Corrida privada del motor | Antes de fusionar W4-02 | Si está autorizada, corre el motor TS contra la tabla real con `private-compare`; si no, lo registra como no autorizada | Merge de W4-02 |

### Criterios condicionales de los gates

La carpeta privada todavía no está autorizada, así que la validación privada es condicional (ADR-0014). Esta sección es el **único plan alternativo**: ADR-0014 y la spec (sección 16) remiten aquí. Los criterios «Private compare reports 0 mismatched rows» de W2-01, W3-01 y W4-01, y la corrida privada de la nota de W4-02, se cumplen así:

- **Si la autorización del dueño consta** en `docs/specs/oracle-validation-log.md`, con fecha y alcance: la comparación privada reporta 0 filas con diferencia, y la corrida queda en la bitácora con el formato de abajo.
- **Si no consta:** la bitácora tiene, para ese gate, la línea `AAAA-MM-DD · <ID del gate> · oráculo <sha> · validación privada: no autorizada`, y el riesgo residual queda anotado: un error común a motor y oráculo que los ejemplos no cubran. En W2-01 se anota en la propia bitácora; desde W3-01, también en `docs/specs/conformance-triage.md`, y W7-01 lo repite en el checklist del release. Las compuertas validan entonces solo contra los ejemplos sintéticos de `docs/algorithm.md` y `docs/specs/algorithm-examples/`.

Ningún gate se cierra con otra fuente de datos reales.

### Autorización de la carpeta privada (PENDIENTE)

Para comparar contra la tabla real del banco hace falta crear `~/.cuotascasa-private/`, fuera del repo. **El dueño aún no lo autorizó.** Opus le pide confirmación explícita antes de W2-01, y otra vez en cada gate mientras no la tenga. Sin ella no crea la carpeta.

- **Qué cuenta como autorización:** que el dueño la dé explícitamente en el chat, nombrando la carpeta privada o la validación privada. Una aprobación genérica (de un plan, de una revisión o de una lista de cambios) no la sustituye.
- **Registro:** antes de crear la carpeta, Opus anota en la bitácora, sin datos: `AAAA-MM-DD · autorización del dueño · alcance: ~/.cuotascasa-private/ para <gates o corridas>`. Si el dueño la retira, se anota de la misma forma y esos archivos no se vuelven a usar.

### Uso de la carpeta privada (si se autoriza)

- **Contenido:** solo números. Por préstamo, un JSON de condiciones y un CSV con la tabla esperada, con nombres genéricos (`a-terms.json`, `a-expected.csv`) y el esquema de `tools/oracle/FORMAT.md` (abajo). No lleva nombres, números de préstamo, correos, identificaciones ni documentos.
- **Permisos:** solo el usuario (`chmod 700`). Nunca entra al repo, a CI, a un PR, a un issue ni a un artefacto.
- **Herramientas:** el `compare` del oráculo (W1-02) y el `private-compare` del arnés (W0-06). **Nunca imprimen el total de filas, ni siquiera en la terminal**, porque revelaría el plazo real del préstamo. Tampoco imprimen montos ni condiciones. Su salida normal son exactamente estas tres líneas con rótulo, y nada más:

  ```text
  allRowsMatched: yes|no
  mismatchedRows: <int>
  maxAbsDiff: <d.dd>
  ```

  Con `--log-line --sha <git sha> --label <a|b…>` imprimen, en lugar de eso, solo la línea para la bitácora:

  ```text
  AAAA-MM-DD · oráculo <sha> · préstamo <label> · todas las filas coinciden: sí/no · filas con diferencia <k> · dif. máx. <d>
  ```

  `<sha>` es el commit de la herramienta que se validó y `<label>` el nombre genérico del par de archivos (`a` para `a-terms.json` y `a-expected.csv`). En la corrida del motor previa a W4-02, `private-compare` escribe `motor <sha>` en lugar de `oráculo <sha>`, con el mismo formato.
- **La salida de terminal no sale de la terminal.** Aunque no trae el total de filas, Opus nunca copia esa salida, ni valores de los archivos privados, al chat, a un PR, a un issue, a un commit ni a la bitácora. Solo copia la línea de `--log-line`.
- **Registro:** cada corrida queda en `docs/specs/oracle-validation-log.md` con la línea de `--log-line`, sin montos, condiciones ni total de filas. Una corrida que pasa dice `todas las filas coinciden: sí · filas con diferencia 0 · dif. máx. 0.00`.

### Formato y perfiles: `tools/oracle/FORMAT.md`

`FORMAT.md` (W0-04, congelado) es el contrato que lee el linaje del oráculo y que refleja `packages/schema/src/oracle/fixture.ts`. Además del formato de fixture y de manifiesto, el contexto decimal, la derivación de sub-semillas y la regla de `generatorVersion`, contiene:

1. **Composición de cada perfil:**
   - `core`: unos 15 préstamos, solo con la etiqueta `core`, sin eventos;
   - `full`: unos 40 préstamos con sub-semillas propias, que no alteran `core`;
   - el conteo exacto de cada perfil, que `manifest.json` repite.
2. **Rangos por moneda:**
   - GTQ, de Q150,000 a Q2,500,000;
   - USD, con el rango propio que fije W0-04;
   - tasas anuales de 5.5 % a 9.75 % y plazos de 5 a 30 años (60 a 360 cuotas);
   - vencimientos con `END_OF_MONTH`, con día numérico y con inicio en año bisiesto.
3. **Mezcla de eventos de `full`:** la matriz de cobertura de W2-06. Cada tipo de evento, política, modo y tipo de comisión aparece en al menos 3 fixtures, solo y combinado, y hay perfil `SIMPLE`, día numérico, ambas monedas y casos de última fila.
4. **Esquema de los archivos privados:**
   - `a-terms.json` tiene exactamente la forma del objeto `inputs` de un fixture;
   - `a-expected.csv` lleva una fila de encabezado con las columnas exactas de una fila esperada de fixture, con los mismos nombres y en el orden que fije `FORMAT.md`; montos con dos decimales y sin separador de miles, fechas `AAAA-MM-DD` y codificación UTF-8.

`compare` (W1-02) y `private-compare` (W0-06) leen ese mismo esquema y rechazan un encabezado distinto.

## 7. Acciones del dueño

El presupuesto es US$0 salvo el dominio.

- [ ] **Autorizar (o no) la carpeta privada** `~/.cuotascasa-private/` (sección 6). Solo cuenta una autorización explícita en el chat que nombre la carpeta o la validación privada; Opus la registra con fecha y alcance. **Antes de W2-01.**
- [ ] **Aprobar la paleta** que W0-05 presenta a partir de la propuesta de `docs/discovery/direccion-visual.md`. Sin esa aprobación no se congela `docs/specs/design-palette.md`. **Antes de que cierre W0-05.**
- [ ] **Crear el repo en GitHub,** público y vacío, y antes del primer push:
  - activar *secret scanning* y *push protection*;
  - en la cuenta, activar *Keep my email addresses private* y *Block command line pushes that expose my email*;
  - proteger `main` con CI obligatorio.

  **Antes de que cierre W0-06.**
- [ ] **(Recomendado) Crear la lista local de términos prohibidos** en `~/.config/cuotascasa/denylist.txt`, o en la ruta de `$CUOTASCASA_DENYLIST`. Va fuera del repo, la escribe el propio dueño y la usa el hook de W1-10. **Antes de W2-01,** que sube los primeros fixtures.
- [ ] **Comprar el dominio y elegir el subdominio de la app.** **Antes de W3-17 y W3-18.** Conviene hacerlo durante W1, porque la verificación del dominio y el DNS toman tiempo.
- [ ] **Cloudflare:**
  - agregar el dominio;
  - crear un token de API con permisos mínimos para desplegar el Worker;
  - configurar la ruta o dominio personalizado del subdominio;
  - crear en GitHub el entorno protegido `production` con el secreto `CLOUDFLARE_API_TOKEN` y las variables que pida el PR de W3-17.

  **W3-17.**
- [ ] **Google Cloud,** siguiendo `docs/guides/google-cloud-setup.md` (W3-18):
  1. Crear el proyecto y la pantalla de consentimiento externa con el alcance `drive.appdata`.
  2. Crear el cliente OAuth web con los orígenes de localhost y del subdominio.
  3. Verificar el dominio.
  4. Guardar el client ID como variable de GitHub Actions.

  **Durante W3.** La publicación a producción va **después de que `/` y `/privacidad` estén desplegadas** (W4-05 fusionada y desplegada). Mientras siga en *Testing*, las autorizaciones vencen a los 7 días. W7-01 verifica que esté publicada.
- [ ] **Prueba manual de Drive** con `docs/guides/drive-sync-manual-checklist.md` (W6-04), en dos dispositivos o navegadores. **W7-01.**
- [ ] **Aprobar el release:** firmar `docs/release/v1-checklist.md` antes del tag v1.0.0. **W7-01.**

## 8. Cómo actualizar el plan

- **La fuente es `plan.json`.** De él salen `cards/<ID>.md`, `waves.md` y `traceability.md`, y desde W0-06 también `cards.json` y `frozen-files.json`, que usa owns-check. Cada entrada de `frozen-files.json` lleva `editableBy`: las tarjetas que pueden editar ese archivo.
- **El generador es `tools/plan/render_plan.py`** (lo corre solo Opus). Valida `plan.json` y regenera `cards/`, `traceability.md` y `waves.md`; con `--check` solo valida, sin escribir, y sale con código 1 si encuentra problemas. W0-06 lo extiende para que emita también `cards.json` y `frozen-files.json` (con `editableBy`), así que regenerar todo es un solo comando.
- No edites a mano las vistas generadas: el próximo regenerado las pisa. Esta guía (`README.md`) sí se edita a mano.
- Todo `docs/plan/` es de Opus. Los cambios van en una rama `opus/…` y se fusionan **antes** de lanzar las tarjetas afectadas.

**Procedimiento:**
1. Editar `plan.json`: tarjetas, `owns`, `depends_on`, `contracts_used`, criterios o requisitos.
2. Regenerar con `python3 tools/plan/render_plan.py`: `cards/`, `traceability.md` y `waves.md`, y desde W0-06 también `cards.json` y `frozen-files.json` (con `editableBy`).
3. Volver a validar mecánicamente. `render_plan.py` lo hace en cada corrida (y con `--check`):
   - ids únicos;
   - dependencias existentes, sin ciclos y sin apuntar a una ola posterior;
   - W0 solo con tarjetas de Opus;
   - ningún par de tarjetas sin dependencia transitiva con `owns` superpuestos;
   - R1–R28 cubiertos.

   Además, Opus verifica que W7-01 dependa de todas las demás.
4. Si el cambio afecta tarjetas en vuelo, avisar y hacer rebase como en la sección 5.
5. Si el cambio es una decisión de arquitectura, escribir o actualizar el ADR correspondiente.
