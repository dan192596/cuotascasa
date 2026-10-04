# ADR-0019: Proceso de desarrollo con agentes

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El dueño pidió:

- que un agente principal (Opus) trabaje por fases con entregables y deje **todo definido antes del código**;
- que Opus cree la estructura y el grueso del trabajo pase a subagentes más baratos (Sonnet);
- tareas detalladas que se puedan ejecutar en paralelo, cada una en su worktree y su sesión.

Paralelizar sin reglas produce choques y contratos divergentes; trabajar en serie con Opus es lento y caro.

## Decisión

### Fases previas al código (completadas)

Descubrimiento → arquitectura → modelo de datos → diseño (motor, datos, repo, UI, seguridad, pruebas) → plan. El dueño aprobó cada fase; el código empieza con el plan aprobado.

### Roles

- **Opus:** toda la ola W0, el cifrado (W1-07), los gates del oráculo con validación privada (W2-01, W3-01, W4-01), las decisiones de los spikes (W2-02), las integraciones de CI y despliegue (W3-16, W3-17), el release (W7-01) y **la revisión y el merge de todo**.
- **Sonnet:** 58 de las 72 tarjetas.

### Olas

| Ola | Contenido | Tarjetas |
|---|---|---|
| W0 | Cimientos y contratos congelados (solo Opus) | 6 |
| W1 | Probar el núcleo difícil | 10 |
| W2 | Eventos del motor, sync, seguridad de borde, primera prueba del oráculo | 13 |
| W3 | Corrección del motor y cimientos de la app | 18 |
| W4 | Motor conforme, superficie pública, primeras pantallas | 12 |
| W5 | Pantallas restantes | 8 |
| W6 | Recorridos, barridos y documentación | 4 |
| W7 | Release v1.0.0 | 1 |

Hitos: tras W2, motor igual al oráculo; tras W4, primera versión publicable; tras W5, todas las pantallas.

### Tarjetas, `owns` y contratos congelados

- Cada tarjeta (`docs/plan/cards/<ID>.md`) declara dependencias, requisitos, `owns` (lo único que puede crear o editar), `contracts_used` (solo lectura), criterios de aceptación verificables en CI y su prompt de lanzamiento.
- W0 congela los contratos listados en `docs/plan/frozen-files.json`.
- `owns-check` en CI rechaza un PR que toque rutas ajenas o archivos congelados, que cambie sin agregar un archivo de solo agregado o que use un id desconocido. Las ramas `renovate/` y `opus/` están exentas.
- Dos tarjetas sin dependencia transitiva **nunca** comparten `owns`, y esto se verificó mecánicamente. Una tarjeta solo hereda una ruta si depende de todos sus dueños anteriores.

### Worktrees y paralelismo

- Opus crea cada worktree (`git worktree add .worktrees/<ID> -b card/<ID>-<slug> main`) con las dependencias ya fusionadas.
- El adaptador en memoria evita que los worktrees compartan estado. El oráculo usa un sparse-checkout (ADR-0014).
- **Máximo unas 6 tarjetas Sonnet a la vez**, primero las de mayor riesgo, para que la revisión no se atasque.

### Revisión y merge

El agente cumple los criterios, deja lint, typecheck y test en verde y abre un PR con checklist y salida de comandos. Opus revisa y hace merge **en orden de dependencias**.

### Precedencia entre fuentes

`docs/algorithm.md` > ADR aceptado > spec (`docs/specs/`) > historias de usuario > texto de la tarjeta. Ante una contradicción, el agente **no elige**: se detiene y escala citando ambas fuentes (archivo y sección). La precedencia decide qué comportamiento manda; nunca amplía los `owns`.

### Protocolo de bloqueo

Cuando el agente necesita algo fuera de sus `owns`, encuentra una ambigüedad o una contradicción, o un hook falla y no puede resolverlo dentro de su alcance:

1. Hace commit de su avance en su rama con el mensaje `wip(<ID>): <qué falta>`. Puede tener pruebas en rojo, nunca datos reales. No abre PR. Si un hook bloquea el commit, no lo salta: deja el avance sin commit y lo dice.
2. Termina su turno con un bloque `PREGUNTAS PARA OPUS (<ID>)`, con el formato de `docs/plan/README.md` (sección 3, paso 5), y nada después.
3. Opus responde dentro del alcance de la tarjeta o abre una micro-tarjeta.

Reglas fijas para todo agente:

- Solo instala con `pnpm install --frozen-lockfile`.
- `git commit --no-verify` solo se permite en el linaje del oráculo (checkout parcial sin `node_modules`), y el PR lo declara.

### Micro-tarjetas

Ante una ambigüedad del algoritmo, un archivo compartido o una dependencia nueva, el agente **se detiene y reporta**; no adivina. Opus crea una micro-tarjeta con id y `owns` propios y la fusiona antes de que la tarjeta solicitante continúe. Los defectos tardíos siguen el mismo camino, y un cambio de contrato se anuncia a las tarjetas en curso.

**Registro, antes de crear la rama de la micro-tarjeta** (`docs/plan/README.md`, secciones 5 y 8):

1. Opus la agrega a `docs/plan/plan.json`, que es la única fuente del plan.
2. Regenera `cards/`, `traceability.md`, `waves.md`, `docs/plan/cards.json` y `docs/plan/frozen-files.json`. Cada archivo congelado lleva `editableBy`, con las tarjetas que pueden editarlo; owns-check rechaza el cambio de cualquier otra.
3. Hace todo eso en una rama `opus/register-<ID>`, exenta de owns-check, y la fusiona en `main`.

`cards.json` y `frozen-files.json` nunca se editan a mano: el siguiente regenerado los pisaría y la micro-tarjeta desaparecería de owns-check.

### Acciones del dueño

Comprar el dominio; aprobar la paleta (W0-05), sin cuya aprobación no se congela `docs/specs/design-palette.md`; activar secret scanning y push protection antes del primer push público (W0-06); configurar Cloudflare y las variables de GitHub (W3-17); crear el cliente OAuth y publicar el consentimiento (W3-18); autorizar la carpeta privada de validación (pendiente, W2-01); firmar el release tras la prueba manual de Drive (W7-01).

## Alternativas consideradas

- **Un solo agente en serie.** Lento y caro con Opus; arriesgado con Sonnet sin contratos. Descartada.
- **Paralelismo libre sin `owns`.** Choques de merge y deriva de contratos. Descartada.

## Consecuencias

**Positivas**
- Hasta unas 6 sesiones en paralelo sin choques, con el costo concentrado en Sonnet.
- Cambios pequeños, trazables a R1–R28 y verificables en CI.

**Negativas**
- Mucha planificación previa y contratos rígidos: cambiar uno cuesta una micro-tarjeta y un rebase.
- Opus es el cuello de botella de revisión.

**Riesgos**
- Deriva de contratos entre 72 tarjetas. Mitigación: archivos congelados, specs de contrato y merges en orden.

## Verificación

- Pruebas de `owns-check` (W0-06), incluido el rechazo de un archivo congelado tocado por una tarjeta que no figura en su `editableBy`.
- Validación mecánica del plan: ids únicos, ningún solapamiento de `owns` entre tarjetas paralelas, R1–R28 cubiertos y release dependiente de todo.
- Prueba de trazabilidad en W7-01.

## Referencias

- `docs/plan/waves.md`, `docs/plan/plan.json`, `docs/plan/traceability.md`, `docs/plan/README.md`, `CLAUDE.md`.
- ADR-0014, ADR-0015, ADR-0018.
