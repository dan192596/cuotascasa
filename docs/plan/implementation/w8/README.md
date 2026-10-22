# Ola W8 · Identidad «Mercado»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar la landing y la app a la identidad Mercado (paleta clara y oscura, Bricolage Grotesque, movimiento) sin tocar cálculos, datos ni privacidad.

**Architecture:** Una base de Opus (tokens, fuentes, tema de Material, estilos globales, ADR-0026 y View Transitions del router) habilita tarjetas Sonnet en paralelo por área: componentes de `ui/`, panel y detalle, asistente, pantallas de trabajo, landing y cuadro de 240 cuotas. Todo el movimiento es CSS, la View Transitions API y JavaScript propio pequeño. Las cifras de ejemplo de la landing salen del motor y se guardan como datos generados y verificados por una prueba, así que el motor no entra en el bundle de la landing.

**Tech Stack:** Angular 22 (standalone, signals, zoneless), CSS con `light-dark()`, Angular Material 22, Tailwind v4, `@fontsource-variable/bricolage-grotesque`, Vitest y Playwright.

**Spec:** `docs/specs/2026-10-22-identidad-mercado-design.md` (aprobado por el dueño el 2026-10-22) y su prototipo `docs/specs/mercado/prototipo-landing.html`.

## Global Constraints

- Sin librerías de animación. No se agrega GSAP ni nada parecido. La única dependencia nueva es la fuente, aprobada por el dueño el 2026-10-22.
- `prefers-reduced-motion: reduce` apaga todo movimiento decorativo, incluido el que maneja JavaScript, y deja cada elemento en su estado final. El interruptor global de `styles.scss` (l.67–74) cubre solo CSS.
- La página está completa en reposo: ningún texto ni cifra espera a una animación, a un `IntersectionObserver` o a la hidratación para verse.
- Nunca `number` para dinero. Los contadores animan **caracteres** de una cadena ya formateada (efecto odómetro), nunca interpolan cantidades.
- WCAG 2.2 AA en claro y en oscuro: texto ≥ 4.5:1 y gráficos ≥ 3:1. El texto sobre turquesa y amarillo va en `--cc-color-on-color` (negro); sobre fucsia, en papel.
- `/` no hace peticiones de red ni escribe almacenamiento (R1). Presupuestos de ADR-0025: landing 106 496 B y `/app` inicial 204 800 B gzip, con los vetos de `tools/bundle-check/config.json`. Si una tarjeta los rebasa, **se detiene y escala**; no sube el presupuesto.
- Tiempos: microinteracciones de 150–300 ms, entradas de 300–600 ms, nada de más de 1 s. Curva única `--cc-ease-out`.
- Semántica: fucsia (`--cc-color-accent`) = ya es tuyo y acción principal; turquesa (`--cc-color-saving`) = lo que te ahorras; verde, ámbar y rojo = solo semáforo y errores. El color nunca es la única señal.
- Solo en la landing: cursor propio, títulos que se descifran, tarjetas apiladas y botón que sigue al cursor.
- Textos aprobados: los del prototipo, con el titular «Calcula tus cuotas, *mes a mes*.».

## Review Focus

1. **Movimiento reducido.** Con `reducedMotion: 'reduce'` no hay descifrado, cursor, odómetro, recorrido automático del cuadro ni encogido de tarjetas, y todo se ve en su estado final. Lo fijan pruebas e2e en W8-05 (app) y W8-06 (landing).
2. **Sin JavaScript o antes de hidratar.** El HTML prerenderizado de `/` ya trae el titular, los valores finales de los contadores, el cuadro en la cuota 60 con su lectura y el llamado a la acción. Lo fijan `landing.dist.spec.ts` (W8-06 y W8-07) y la prueba e2e con JS apagado.
3. **Bloques de color en oscuro.** Texto sobre fucsia, turquesa, amarillo y bloque negro. Lo fija la matriz WCAG de los tokens (W8-01) y axe en claro y oscuro en cada pantalla (W8-08).
4. **Pantallas táctiles.** Sin cursor propio, cuadro arrastrable con el dedo (`touch-action: none` solo en el control) y tarjetas apiladas legibles a 375 px. Lo fija e2e con `hasTouch` en W8-07.
5. **Navegar rápido durante una transición.** Clic en un préstamo y «atrás» antes de que termine, o dos clics seguidos: la URL y el contenido terminan correctos y no hay errores en consola. Lo fija e2e en W8-02.

---

## Mapa de archivos

| Área | Archivos | Tarjeta |
|---|---|---|
| Decisión y paleta | `docs/adr/0026-identidad-mercado.md` (nuevo), `docs/adr/0012-sistema-de-diseno.md` (enmienda), `docs/adr/README.md`, `docs/specs/design-palette.md` (reescrito), `docs/discovery/direccion-visual.md` (nota) | W8-01 |
| Tokens y estilos | `apps/web/src/design-contract/token-names.json`, `apps/web/src/styles/{tokens.css,fonts.scss,material-theme.scss,styles.scss,tailwind.scss}` y sus specs | W8-01 |
| Dependencia | `pnpm-workspace.yaml`, `apps/web/package.json`, `pnpm-lock.yaml` | W8-01 |
| Router | `apps/web/src/app/app.config.ts`, `apps/web/src/styles/view-transitions.css` (nuevo) | W8-02 |
| Componentes de diseño | `apps/web/src/app/ui/**` (nuevo `ui/motion/odometer.component.ts`) | W8-03 |
| Panel y detalle | `apps/web/src/app/features/dashboard/**`, `apps/web/src/app/features/loans/detail/**` | W8-04 |
| Asistente y pantallas de trabajo | `features/loans/wizard/**`, `features/schedule/**`, `features/real-data/**`, `features/scenarios/**`, `features/settings/**`, `features/export/**`, `core/errors/**`, `core/shell/**` | W8-05 |
| Landing | `apps/web/src/app/public/landing/**` (salvo `board/` y `example/`), `public/simulator/**`, `public/privacy/**`, `public/not-found/**` | W8-06 |
| Cuadro y datos de ejemplo | `apps/web/src/app/public/landing/board/**`, `apps/web/src/app/public/landing/example/**` | W8-07 |
| Cierre | e2e de barrido, `docs/release/`, `CHANGELOG` | W8-08 |

Dependencias: W8-01 → W8-02 → (W8-03 ∥ W8-06) → (W8-04 ∥ W8-05 ∥ W8-07) → W8-08. W8-04 y W8-05 usan el odómetro y los estilos de W8-03; W8-07 se monta dentro de la landing de W8-06.

---

### Task W8-00: Registrar la ola W8 (Opus)

**Files:**
- Modify: `docs/plan/plan.json` (ola `W8` con las tarjetas W8-01 a W8-08, sus `owns`, `depends_on`, criterios y notas tomadas de este plan; `frozen_files`: `editableBy` de `apps/web/src/design-contract/`, `app.config.ts`, `pnpm-workspace.yaml` y `apps/web/package.json` incluye `W8-01` o `W8-02` según corresponda)
- Regenerate: `docs/plan/{cards/*.md,waves.md,traceability.md,cards.json,frozen-files.json}` con `python3 tools/plan/render_plan.py`

- [ ] **Step 1:** Editar `plan.json` y correr `python3 tools/plan/render_plan.py --check`. Expected: sin errores (ids únicos, sin ciclos, sin `owns` solapados sin dependencia).
- [ ] **Step 2:** Correr `python3 tools/plan/render_plan.py`. Commit `docs(plan): register wave W8 (Mercado identity)` en `opus/register-w8`, abrir el PR y esperar a que el dueño lo fusione.

### Task W8-01: Base de la identidad (Opus)

**Files:**
- Create: `docs/adr/0026-identidad-mercado.md`
- Modify: `docs/adr/0012-sistema-de-diseno.md` (sección «Enmiendas»: decisiones 1, 2, 4 y 8 remiten a ADR-0026), `docs/adr/README.md`, `docs/specs/design-palette.md`, `docs/discovery/direccion-visual.md`
- Modify: `apps/web/src/design-contract/token-names.json`, `apps/web/src/styles/tokens.css`, `fonts.scss`, `material-theme.scss`, `styles.scss`, `tailwind.scss`
- Modify: `pnpm-workspace.yaml`, `apps/web/package.json`, `pnpm-lock.yaml`
- Test: `apps/web/src/styles/tokens.spec.ts`, `apps/web/src/testing/doc-checks/design-palette-doc.spec.ts`, `apps/web/src/design-contract/tokens.contract.spec.ts`, `apps/web/src/styles/fonts.dist.spec.ts`

**Interfaces:**
- Produces, tokens temáticos (todos `light-dark(<claro>, <oscuro>)`). Valores iniciales; los ajusta la matriz WCAG sin cambiar el tono:

| Token | Rol | Claro | Oscuro |
|---|---|---|---|
| `--cc-color-paper` | fondo | `#FFFFFF` | `#141414` |
| `--cc-color-surface` | tarjetas y diálogos | `#FFFFFF` | `#1E1E1E` |
| `--cc-color-band` | renglones alternos | `#F5F5F3` | `#1A1A1A` |
| `--cc-color-current-month` | fila del mes en curso | `#FFF4D1` | `#3A3116` |
| `--cc-color-rule` | líneas decorativas | `#E6E6E6` | `#2E2E2E` |
| `--cc-color-control-border` | bordes de campo y foco | `#767676` | `#8C8C8C` |
| `--cc-color-ink` | texto | `#151515` | `#F5F5F5` |
| `--cc-color-ink-muted` | texto secundario | `#4A4A4A` | `#B5B5B5` |
| `--cc-color-accent` | fucsia: acción principal y «ya es tuyo» | `#D6246E` | `#FF5C98` |
| `--cc-color-positive` | semáforo «coincide» (texto) | `#2D6A3E` | `#82C796` |
| `--cc-color-positive-fill` | semáforo «coincide» (gráfico) | `#4E8B5F` | `#5FA874` |
| `--cc-color-warning` | ámbar | `#875A00` | `#E6B85C` |
| `--cc-color-danger` | rojo | `#A12830` | `#F28C8C` |
| `--cc-color-saving` (nuevo) | turquesa: lo que te ahorras | `#00A6A6` | `#2ED3D3` |
| `--cc-color-highlight` (nuevo) | amarillo: resaltado y control | `#FFC736` | `#FFC736` |
| `--cc-color-on-color` (nuevo) | texto sobre turquesa y amarillo | `#151515` | `#151515` |
| `--cc-color-soft` (nuevo) | agua: superficies suaves | `#E0F6F6` | `#0F2A2A` |
| `--cc-color-block` (nuevo) | bloque negro | `#151515` | `#262626` |
| `--cc-color-on-block` (nuevo) | texto sobre bloque negro | `#FFFFFF` | `#F5F5F5` |

- Produces, tokens compartidos nuevos: `--cc-radius-block: 18px`, `--cc-radius-pill: 999px`, `--cc-ease-out: cubic-bezier(0.2, 0.9, 0.1, 1)`, `--cc-duration-fast: 180ms`, `--cc-duration-base: 320ms` y `--cc-duration-slow: 560ms`. `--cc-font-heading` y `--cc-font-body` pasan a `'Bricolage Grotesque Variable', 'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif`.
- Produces, en `styles.scss`: botón base en píldora (`border-radius: var(--cc-radius-pill)`), clase `.cc-button-primary` (fondo acento, texto papel) y respuesta a `:hover` y `:active` (traslado de 1–2 px o escala 0.98, con `--cc-duration-fast`). Titulares `h1` y `h2` en peso 800 con `letter-spacing: -0.03em` y `text-wrap: balance`.

- [ ] **Step 1: Pruebas en rojo.**
  - `tokens.spec.ts` deja de esperar 13 pares fijos y cuenta los nombres `themed` de `token-names.json`.
  - La matriz WCAG de `tokens.spec.ts` y `design-palette-doc.spec.ts` agrega, en claro y en oscuro:
    - `on-color` sobre `saving` y sobre `highlight` ≥ 4.5;
    - `on-block` sobre `block` ≥ 4.5;
    - papel sobre `accent` ≥ 4.5;
    - `accent` y `saving` como gráficos sobre papel, superficie, banda y `soft` ≥ 3;
    - `accent` como texto sobre papel, superficie, banda y mes en curso ≥ 4.5.
  - `fonts.dist.spec.ts` espera un woff2 con `bricolage-grotesque` y otro con `jetbrains-mono`, ninguno con `source-serif-4`, exactamente 3 woff2 y `font-family` con `Bricolage Grotesque`.
- [ ] **Step 2:** Correr `pnpm --filter web exec vitest run src/styles src/design-contract src/testing/doc-checks`. Expected: FAIL por los tokens nuevos y por el conteo.
- [ ] **Step 3: Dependencia.**
  - Agregar `@fontsource-variable/bricolage-grotesque` al catálogo con una versión exacta publicada hace al menos dos semanas (`npm view @fontsource-variable/bricolage-grotesque time`).
  - Quitar `@fontsource/source-serif-4`.
  - Correr `pnpm install` (este paso sí cambia el lockfile; es el único con `install` sin `--frozen-lockfile`).
  - `fonts.scss`: un `@font-face` con el archivo latino `wght` en woff2 (rango 400–800) más los dos de JetBrains Mono.
- [ ] **Step 4: Tokens y documentos.**
  - Escribir `tokens.css` y `token-names.json` con la tabla de Interfaces.
  - Reescribir la tabla de `design-palette.md`. Formato exacto que lee la prueba: `` | rol | `--cc-color-x` | uso | `#HEX` | `#HEX` | ``, en mayúsculas, con la línea `**Aprobada por el dueño:** 2026-10-22`, la nueva sección de contraste y las reglas de la sección 4.3 del spec.
  - Ajustar luminosidad (sin cambiar el tono) hasta pasar la matriz. Si un par no pasa, detenerse y escalar al dueño.
- [ ] **Step 5: Material y Tailwind.**
  - En `material-theme.scss`: `primary` → `accent`, `on-primary` → papel y `tertiary` → `saving`. Los contenedores de superficie siguen en papel, superficie y banda.
  - En `tailwind.scss`, `@theme inline` agrega `--color-saving`, `--color-highlight`, `--color-soft` y `--color-block`.
- [ ] **Step 6: ADR-0026 y enmiendas.** Copiar las secciones 4–6 del spec como decisiones, con la política de movimiento y la semántica de color.
- [ ] **Step 7: Maqueta oscura para el dueño.** Publicar el prototipo con los tokens finales en claro y en oscuro (los bloques negros en `--cc-color-block` con borde de 1 px en `--cc-color-rule`) y **esperar su aprobación** antes de lanzar W8-06.
- [ ] **Step 8:** Correr `pnpm lint && pnpm typecheck && pnpm test`, más `pnpm build && pnpm --filter web exec ng test --configuration=dist --no-watch`. Expected: PASS. Correr `pnpm e2e specs/sweeps` y anotar las violaciones de axe que dejen los colores en componentes todavía sin migrar: W8-03 a W8-06 las cierran.
- [ ] **Step 9:** Commit `feat(web): Mercado palette, Bricolage Grotesque and ADR-0026 (W8-01)`, abrir el PR y dejar que el dueño fusione.

### Task W8-02: Transiciones entre pantallas (Opus)

**Files:**
- Modify: `apps/web/src/app/app.config.ts`
- Create: `apps/web/src/styles/view-transitions.css` (importado desde `styles.scss`)
- Test: `apps/web/src/app/app.config.spec.ts` (o el spec de configuración existente) y `e2e/specs/view-transitions.spec.ts` (nuevo)

**Interfaces:**
- Produces: `withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated })` dentro de `provideRouter`. `onViewTransitionCreated` llama `transition.skipTransition()` cuando `matchMedia('(prefers-reduced-motion: reduce)').matches`.
- Produces, convención para W8-04: un elemento con `view-transition-name: cc-loan-<loanId>` en la tarjeta y en el encabezado del detalle se transforma de uno en otro. Si falta en un lado (enlace directo, recarga o préstamo borrado), queda el deslizamiento general sin errores.
- Produces, en `view-transitions.css`: `::view-transition-old(root)` sale con un desplazamiento de −24 px y desvanecimiento; `::view-transition-new(root)` entra desde +24 px, con `--cc-duration-base` y `--cc-ease-out`. Todo va dentro de `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 1:** Spec unitario: la configuración del router incluye la función de View Transitions, y con un `matchMedia` falso en `reduce`, `onViewTransitionCreated` llama `skipTransition`. Correr y ver FAIL.
- [ ] **Step 2:** Implementar en `app.config.ts` y crear `view-transitions.css`.
- [ ] **Step 3:** e2e `view-transitions.spec.ts`, con un préstamo sintético sembrado:
  - clic en la tarjeta, `page.goBack()` inmediato y luego otro clic: la URL final es la del detalle, el h1 es el del préstamo y no hay errores en consola;
  - lo mismo con `reducedMotion: 'reduce'` en Chromium y WebKit.

  El navegador sin soporte navega igual: el router omite la transición.
- [ ] **Step 4:** Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e specs/view-transitions.spec.ts`. Expected: PASS. Commit `feat(web): route view transitions with reduced-motion skip (W8-02)`.

### Task W8-03: Componentes de `ui/` (Sonnet)

**Files:**
- Create: `apps/web/src/app/ui/motion/odometer.component.ts` y su spec
- Modify: `ui/house-meter/*`, `ui/feedback/{banner,status-chip,empty-state,confirm-dialog}.component.ts`, `ui/ledger-table/*` y sus specs

**Interfaces:**
- Produces: `cc-odometer`.
  - `value = input.required<string>()` es el texto final, por ejemplo `'Q 984,048.18'`.
  - Cada dígito es una columna 0–9 que rueda hasta su cifra; los demás caracteres quedan fijos.
  - El texto accesible es `value` (`aria-label`, con las columnas `aria-hidden`), y antes de animar el DOM ya muestra el valor final.
  - Rueda una sola vez al primer render. Con movimiento reducido no rueda.
  - No convierte el texto a número.
- Produces: `cc-house-meter` rellena con `--cc-color-accent` y conserva su animación `fill-in`.
- Produces: el banner `success` lleva una marca ✓ que se dibuja con `stroke-dashoffset` en `--cc-duration-base`.
- Produces: en `cc-empty-state`, un `input('plain' | 'mosaic')` llamado `layout`. `mosaic` acomoda las acciones como bloques de color: primaria en acento, secundarias en `soft` y `highlight`, con `--cc-radius-block`.
- Produces: en `cc-ledger-table`:
  - la fila `.current` destella una vez (animación de fondo de `--cc-color-highlight` a `--cc-color-current-month` en `--cc-duration-slow`);
  - las celdas cuyo texto cambia entre dos entradas de filas con la misma clave reciben `.changed` durante 600 ms, con un destello en su color semántico.

- [ ] **Step 1:** Specs en rojo.
  - Odómetro: el DOM final contiene el texto exacto, sin `Number(`/`parseFloat` en el componente (búsqueda en el código fuente, como `no-number-on-money.spec.ts`), y con reducción no hay `animation`.
  - Medidor: el relleno usa `var(--cc-color-accent)`.
  - Tabla: tras cambiar `rows` con un saldo distinto en la fila 3, solo esa celda tiene `.changed`.
  - `empty-state` con `layout="mosaic"`: las acciones llevan `data-layout="mosaic"`.
- [ ] **Step 2:** Implementar. Los estilos usan solo tokens (`tokens-only.spec.ts` y `no-hardcoded-colors.spec.ts`) y los tiempos de `--cc-duration-*`.
- [ ] **Step 3:** Correr `pnpm lint && pnpm typecheck && pnpm test`. Expected: PASS. Commit `feat(ui): Mercado components, odometer and table highlights (W8-03)`.

### Task W8-04: Panel y detalle del préstamo (Sonnet)

**Files:**
- Modify: `features/dashboard/{dashboard-page,loan-card}.component.ts`, `features/loans/detail/loan-detail-page.component.ts` y sus specs
- Test: `e2e/specs/dashboard.spec.ts` y el e2e de detalle existente

**Interfaces:**
- Consumes: `cc-odometer`, `cc-empty-state[layout=mosaic]` y `cc-house-meter` (W8-03); la convención `cc-loan-<id>` (W8-02).

- [ ] **Step 1:** Specs en rojo:
  - cada `loan-card` tiene `style.viewTransitionName === 'cc-loan-' + id`, y el encabezado del detalle el mismo nombre;
  - las tarjetas llevan `--i` con su índice para la entrada escalonada (60 ms por tarjeta, máximo 8 escalones);
  - los totales por moneda se muestran con `cc-odometer` y el valor del servicio;
  - el estado vacío usa `layout="mosaic"`.
- [ ] **Step 2:** Implementar.
  - La tarjeta pasa a bloque con `--cc-radius-block`, titular en peso 800 y el medidor en fucsia.
  - El encabezado del detalle se acomoda para que la transformación sea continua: mismo orden de alias, banco y medidor.
  - La entrada escalonada es CSS (`animation-delay: calc(var(--i) * 60ms)`) dentro de `no-preference`.
- [ ] **Step 3:** e2e: con dos préstamos sintéticos, el panel muestra los totales correctos y axe pasa en claro y oscuro. Con `reducedMotion: 'reduce'`, las tarjetas no tienen `animationName` distinto de `none`.
- [ ] **Step 4:** Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e specs/dashboard.spec.ts specs/loan-detail.spec.ts`. Expected: PASS. Commit `feat(web): Mercado dashboard and loan detail with shared transition (W8-04)`.

### Task W8-05: Asistente y pantallas de trabajo (Sonnet)

**Files:**
- Modify: `features/loans/wizard/**`, `features/schedule/**`, `features/real-data/**`, `features/scenarios/**` (incluye `compare/balance-chart.component.ts` y `chart-palette.ts`), `features/settings/**`, `features/export/**`, `core/errors/error-toast.component.ts`, `core/shell/app-shell.component.ts` y sus specs
- Test: e2e existentes de esas pantallas y `e2e/specs/motion.spec.ts` (nuevo)

**Interfaces:**
- Consumes: estilos y tokens de W8-01, componentes de W8-03.

- [ ] **Step 1:** Specs en rojo:
  - el asistente pone `data-direction="forward" | "back"` en el contenedor del paso, y el CSS desliza ±24 px según la dirección;
  - `balance-chart` usa `animation: { duration: 600 }`, o `false` si `matchMedia('(prefers-reduced-motion: reduce)')`;
  - `chart-palette.ts` usa acento, turquesa y tinta por escenario, sin hex fijos;
  - el selector de escenarios tiene un indicador deslizante (`transform: translateX`) bajo la opción activa;
  - el aviso de error entra desde abajo;
  - la barra del shell usa el estilo de píldoras del prototipo.
- [ ] **Step 2:** Implementar con tokens y `--cc-duration-*`. Sin animar filas de la tabla.
- [ ] **Step 3:** e2e `motion.spec.ts`. Con `reducedMotion: 'reduce'`, en el asistente, la tabla y la comparación, `getAnimations()` no devuelve animaciones en curso tras navegar. Sin reducción, el paso del asistente tiene una animación de entrada. Axe pasa en claro y oscuro en las pantallas tocadas.
- [ ] **Step 4:** Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`. Expected: PASS. Commit `feat(web): Mercado wizard, schedule, scenarios and settings motion (W8-05)`.

### Task W8-06: Landing (Sonnet)

**Files:**
- Modify: `public/landing/landing-page.component.ts` y sus specs, `public/simulator/**` (solo estilos), `public/privacy/**` y `public/not-found/**` (solo estilos)
- Create: `public/landing/landing-motion.ts` (funciones puras de descifrado, cursor, tarjetas apiladas y botón imán, solo con APIs del DOM)
- Test: `landing-page.component.spec.ts`, `landing.dist.spec.ts`, `e2e/specs/landing.spec.ts`

**Interfaces:**
- Produces: un hueco `<cc-landing-board />` en la sección «240 cuotas. Muévelas.», que llena W8-07. Hasta entonces, el bloque se renderiza con un marcador estático.
- Consumes: el prototipo (`docs/specs/mercado/prototipo-landing.html`) como referencia de composición y textos; las cifras del mosaico y de los contadores salen de `LANDING_EXAMPLE_SUMMARY` (W8-07). Mientras tanto se usan los valores que esa constante va a tener, marcados `// replaced by W8-07`.

- [ ] **Step 1:** Specs en rojo:
  - un h1 «Calcula tus cuotas, mes a mes.»;
  - el mosaico con seis bloques (`data-testid="mosaic-block"`);
  - las cuatro tarjetas con los títulos del prototipo;
  - cuatro contadores con su valor final en el HTML;
  - enlaces a `/app` y `/privacidad`;
  - `cc-quick-simulator` presente;
  - el aviso legal en el pie;
  - las pruebas del enlace al repositorio intactas.

  En `landing.dist.spec.ts`: el h1, «Sin cuenta», los cuatro valores de los contadores y «Empezar en la app» o el llamado a la acción del mosaico, en el HTML prerenderizado.
- [ ] **Step 2:** Implementar según el prototipo. `landing-motion.ts` arranca en `afterNextRender`, solo en el navegador, y no hace nada si hay movimiento reducido o `pointer: coarse` (cursor e imán). Ningún import de `ui/`, del dominio, de `@angular/forms` ni de `@angular/cdk` en el grafo inicial.
- [ ] **Step 3:** e2e en `landing.spec.ts`, conservando las pruebas de cero red, cero almacenamiento, CSP y JS apagado:
  - con `reducedMotion: 'reduce'`, el h1 muestra su texto final de inmediato y no existe `.cursor`;
  - con `hasTouch`, no hay cursor propio;
  - axe pasa en claro y oscuro.
- [ ] **Step 4:** Correr `pnpm build && pnpm bundle:check`. Expected: landing ≤ 106 496 B y sin vetos. Si se pasa, commit `wip(W8-06)` y escalar con el diff del metafile.
- [ ] **Step 5:** Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e specs/landing.spec.ts specs/simulator.spec.ts specs/smoke.spec.ts`. Expected: PASS. Commit `feat(web): Mercado landing (W8-06)`.

### Task W8-07: Cuadro de 240 cuotas y datos de ejemplo (Sonnet)

**Files:**
- Create:
  - `public/landing/example/build-example.ts`: función pura que usa `@cuotascasa/domain` y los formatos de `ui/format/format.ts`; solo la importan pruebas.
  - `public/landing/example/example-summary.generated.ts` (grafo inicial, pequeño).
  - `public/landing/example/example-rows.generated.ts` (solo en el chunk diferido).
  - `public/landing/example/example-data.spec.ts`.
  - `public/landing/board/landing-board.component.ts`: marcado estático prerenderizado.
  - `public/landing/board/landing-board-interactive.ts`: comportamiento diferido, con `import()` al entrar en pantalla, como `quick-simulator.component.ts`.
  - Los specs de ambos.
- Modify: `public/landing/landing-page.component.ts`, para reemplazar el marcador de W8-06 y las cifras marcadas `// replaced by W8-07`.

**Interfaces:**
- Produces:
  ```ts
  export interface LandingExampleSummary {
    readonly synthetic: true;
    readonly level: string;            // 'Q 4,263.47'
    readonly prepayment: { readonly installment: 60; readonly amount: string }; // 'Q 50,000.00'
    readonly baseCount: number;        // cuotas sin abono (240)
    readonly prepaidCount: number;     // cuotas con abono REDUCE_TERM
    readonly monthsSaved: number;
    readonly costSaved: string;        // intereses y seguros ahorrados, formateado
    readonly at60: LandingExampleRow;  // estado inicial del cuadro
  }
  export interface LandingExampleRow { readonly k: number; readonly balance: string; readonly paidPercent: string; readonly dueDate: string }
  export const LANDING_EXAMPLE_SUMMARY: LandingExampleSummary;
  // example-rows.generated.ts
  export const LANDING_EXAMPLE_ROWS: { readonly base: readonly LandingExampleRow[]; readonly prepaid: readonly LandingExampleRow[] };
  export function buildLandingExample(): { summary: LandingExampleSummary; rows: typeof LANDING_EXAMPLE_ROWS };
  ```
- El préstamo de ejemplo:
  - plantilla FHA Guatemala v1 (1.00 % de seguro FHA y 0.26 % de desgravamen), perfil `FHA_GT_V1`;
  - Q 500,000.00, 240 meses y 7.00 % fija, en GTQ;
  - día de pago 15, primera cuota el 2026-01-15;
  - abono `REDUCE_TERM` de Q 50,000.00 en la cuota 60 ([ALG.PREPAY.REDUCE_TERM]).

  Los porcentajes llevan un decimal. Las cadenas se formatean con los mismos helpers que los pipes.

- [ ] **Step 1:** `example-data.spec.ts` en rojo:
  - `buildLandingExample()` es igual a las constantes generadas;
  - `summary.level === 'Q 4,263.47'`, igual al boceto de `docs/discovery/direccion-visual.md` §4.1;
  - `rows.base.length === 240`, y `rows.prepaid.length === summary.prepaidCount`;
  - `monthsSaved === baseCount - prepaidCount`.

  Con `UPDATE_LANDING_EXAMPLE=1`, la prueba reescribe los dos archivos generados en lugar de comparar (escribe el módulo TS con `fs`).
- [ ] **Step 2:** Implementar `build-example.ts`, generar con `UPDATE_LANDING_EXAMPLE=1 pnpm --filter web exec ng test --include='**/example-data.spec.ts' --no-watch` y verificar sin la variable. Expected: PASS.
- [ ] **Step 3: Specs en rojo del cuadro.**
  - El HTML estático tiene 240 `i` con 59 `.paid` y un `.now`, la lectura de la cuota 60 de `LANDING_EXAMPLE_SUMMARY.at60`, y un control con `role="slider"`, `aria-valuemin=1`, `aria-valuemax=240`, `aria-valuenow=60` y `aria-valuetext` («Cuota 60, saldo Q …»).
  - En la parte interactiva:
    - las flechas mueven una cuota, Shift+flecha doce, e Inicio y Fin llevan a los extremos;
    - el arrastre con puntero mueve el control;
    - el interruptor `aria-pressed` cambia a `prepaid` y marca `.gone` las cuotas de `prepaidCount + 1` a 240;
    - el recorrido automático de 1 a 60 ocurre una vez y no ocurre con movimiento reducido.
- [ ] **Step 4:** Implementar. Los estilos copian el tablero del prototipo con tokens: `soft` de fondo, `accent` para lo pagado, `saving` para lo ahorrado y `highlight` para el control. El lector de pantalla oye la lectura en una región `aria-live="polite"` con retardo.
- [ ] **Step 5:** e2e en `landing.spec.ts`:
  - con el teclado, Fin muestra «Cuota 240 de 240»;
  - el interruptor muestra el número de cuotas ahorradas del resumen;
  - con `hasTouch`, arrastrar con `page.touchscreen` mueve el control;
  - siguen cero red y cero almacenamiento.

  `landing.dist.spec.ts`: el HTML prerenderizado contiene la lectura de la cuota 60.
- [ ] **Step 6:** Correr `pnpm build && pnpm bundle:check`. Expected: dentro del presupuesto, y `LANDING_EXAMPLE_ROWS` solo en un chunk diferido (comprobar en el metafile). Si no cabe, escalar.
- [ ] **Step 7:** Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e specs/landing.spec.ts`. Expected: PASS. Commit `feat(web): 240-installment board with engine-generated example (W8-07)`.

### Task W8-08: Cierre de la ola (Opus)

**Files:**
- Modify: `e2e/specs/sweeps/known-defects.ts` (vaciarlo de lo que W8 resolvió), `CHANGELOG.md`, `docs/plan/implementation/w0/README.md` («Hallazgos de W8») y la memoria del proyecto

- [ ] **Step 1:** Correr `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm bundle:check && pnpm e2e` sobre `main` con todas las tarjetas. Expected: PASS, axe sin violaciones en claro y oscuro, y los presupuestos con su medida anotada en el PR.
- [ ] **Step 2:** Revisión visual con el dueño en el sitio desplegado, en claro y en oscuro, en escritorio y en teléfono. Anotar los hallazgos como micro-tarjetas.
- [ ] **Step 3:** Commit `docs: close wave W8` y PR.

## Ejecución

Lotes según las dependencias:
1. W8-00, W8-01 y W8-02, de Opus y en secuencia.
2. W8-03 y W8-06 en paralelo (W8-06 espera la aprobación de la maqueta oscura).
3. W8-04, W8-05 y W8-07 en paralelo.
4. W8-08.

Cada tarjeta Sonnet usa su worktree y su `E2E_PORT` propio. Opus revisa cada una y el dueño fusiona.
