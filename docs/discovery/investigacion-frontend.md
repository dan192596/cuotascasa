# Investigación: frontend

Fecha: 2026-10-04 · Alimenta: ADR-0003, ADR-0010, ADR-0011, ADR-0012, ADR-0013, ADR-0014

Todas las versiones quedan fijadas en los catálogos de pnpm (tarjeta W0-01). Ninguna tarjeta agrega dependencias.

## 1. Framework: Angular 22

El dueño pidió Angular. Se verificó el estado de **Angular 22.2 estable**:

| Característica | Estado en 22.x | Uso en CuotasCasa |
|---|---|---|
| Zoneless | Por defecto | Sin zone.js; los cambios fluyen por signals |
| `OnPush` | Por defecto | Todos los componentes |
| Signal Forms | Estable | Asistente de alta y formularios de eventos |
| `resource` / `httpResource` | Estables | Carga diferida de datos derivados |
| Vitest | Runner por defecto (Vitest 5) | Pruebas unitarias y de componentes |
| Builder esbuild/Vite | Por defecto | Build y servidor de desarrollo |
| SSR `outputMode: 'static'` | Disponible | Prerender de `/` y `/privacidad`; `/app/**` se renderiza en el cliente |

Entorno: **TypeScript ~6.0** y **Node 24**.

**Monorepo:** un *spike* verificó que un workspace de pnpm puede consumir paquetes internos TypeScript **sin paso de
build** (JIT, directo desde el código fuente). Así `packages/domain` se usa igual desde la app, las pruebas y la
herramienta de conformidad.

**Riesgo:** es un stack muy reciente y el conocimiento de los modelos puede estar desactualizado. Mitigación: W0 arma
toda la cadena de herramientas y congela *golden patterns* (`apps/web/src/app/_patterns/`) antes de que empiece
cualquier tarjeta; versiones exactas; Renovate con edad mínima de publicación.

## 2. Librerías de UI

| Opción | Resultado | Motivo |
|---|---|---|
| **Angular Material / CDK 22** | Elegida | Tokens M3, densidad configurable (modo compacto para tablas), accesibilidad probada, mantenida por el equipo de Angular |
| **Tailwind CSS v4** | Elegida, para layout y utilidades | Convive con los tokens de Material; sin runtime |
| PrimeNG 22 | Rechazada | **Dejó de ser MIT**: requiere llave de licencia, incompatible con un repo público de portafolio a costo cero |

La identidad visual (libreta bancaria, "tu casa se va llenando") se construye con tokens propios sobre Material
(ADR-0012). La tabla de amortización es un componente propio (`ui/`) con navegación por teclado.

**Fuentes tipográficas autoalojadas** (por ejemplo, Source Serif 4 para títulos y JetBrains Mono para cifras; ambas con
licencia abierta). No se usan fuentes externas porque la CSP no permite conexiones a terceros en `/`.

## 3. Gráficas

- **Chart.js 4 + ng2-charts**, unos **60 KB comprimidos**, cargados de forma diferida solo en la comparación de
  escenarios (gráfica de saldo en el tiempo).
- El "tu casa se va llenando" del dashboard y la landing es SVG propio: no necesita una librería de gráficas.
- El presupuesto de bundle prohíbe Chart.js en la landing.

## 4. Aritmética decimal

- **decimal.js** con contexto de 34 dígitos significativos y redondeo intermedio `ROUND_HALF_EVEN` (`[ALG.CONV]`). El
  único redondeo a centavos es `HALF_UP_2` (mitad lejos de cero), solo donde `docs/algorithm.md` lo escribe; la tasa
  periódica `r` va sin `HALF_UP_2`.
- El `number` de JavaScript es binario de punto flotante: `0.1 + 0.2 !== 0.3`. En una tabla de cientos de filas
  (360 a 30 años) esos errores se acumulan y rompen la coincidencia al centavo.
- Montos y tasas viajan como **strings decimales** en todas las fronteras (JSON, IndexedDB, UI).
- El oráculo en Python usa el módulo `decimal` con el mismo contexto; ambos lados lo verifican en sus pruebas.
- Reglas de lint prohíben aritmética con `number` sobre dinero y el uso de `Date` en `packages/domain`.

## 5. Exportación en el cliente

| Formato | Elegida | Descartadas | Motivo |
|---|---|---|---|
| Excel | **write-excel-file** (~21 KB comprimidos) | `xlsx` (npm), ExcelJS | El paquete `xlsx` de npm está congelado en una versión con vulnerabilidades publicadas (SheetJS distribuye las nuevas fuera de npm); ExcelJS no tiene mantenimiento activo |
| PDF | **jsPDF ≥ 4.2.1 + jspdf-autotable** | — | Tablas paginadas con encabezado repetido; versión mínima por correcciones de seguridad |
| CSV | Escritor propio | — | **UTF-8 con BOM**, para que Excel reconozca tildes y el símbolo `Q` al abrir el archivo |

Las tres se cargan **solo al exportar** (`import()` dinámico) y nunca entran en el bundle de la landing. La conversión de
strings decimales a `number` se confina al escritor de Excel, con una prueba de ida y vuelta.

## 6. Persistencia en el navegador

- **Dexie 4.4.x**, activo y mantenido, como capa sobre IndexedDB.
- `liveQuery` + `toSignal` integra los cambios de la base con signals en modo zoneless.
- Dexie queda detrás de un puerto de repositorios; las features nunca lo importan (ADR-0006). Detalle en
  [investigacion-almacenamiento-y-sync.md](investigacion-almacenamiento-y-sync.md).

## 7. Pruebas end-to-end

- **Playwright 1.63** contra el **build de producción** servido con las **cabeceras reales** (CSP incluida).
- Navegadores: **Chromium y WebKit**. WebKit es la mejor aproximación automatizable a Safari, que es el navegador con más
  riesgos de almacenamiento.
- **axe** para accesibilidad (WCAG AA) en cada ruta y en ambos temas.
- La API de Google se reemplaza por un fake compartido; Drive real se prueba a mano con una checklist.

## 8. Locale es-GT

- Angular trae el locale **es-GT** incorporado, con el símbolo `Q` para quetzales.
- Para dólares la app muestra **`US$`**, con manejo propio del símbolo, para evitar la ambigüedad de `$` junto a montos
  en quetzales.
- Formatos: `Q 1,234.56`, `US$ 1,234.56`, fechas `dd/mm/aaaa`, siempre mediante los pipes de `ui/`.
- **Fechas como `AAAA-MM-DD` (strings), nunca `Date`:** `new Date('2025-02-28')` se interpreta como medianoche UTC y en
  Guatemala (UTC−6) se muestra como 27/02/2025. Ese error de un día rompería vencimientos y anclas.

## 9. Presupuestos de bundle

La landing y el simulador deben cargar rápido y sin código innecesario. Un chequeo con el *metafile* de esbuild falla si
el grafo de la landing incluye Excel, PDF, Chart.js, Dexie, sync o código de Google (tarjetas W2-12 y W3-16).

## 10. Resumen de dependencias de la app

| Área | Dependencia |
|---|---|
| Framework | Angular 22.2, TypeScript ~6.0, Node 24 |
| UI | Angular Material/CDK 22, Tailwind v4 |
| Gráficas | Chart.js 4, ng2-charts (diferidas) |
| Decimales | decimal.js |
| Persistencia | Dexie 4.4.x |
| Validación | zod |
| Exportación | write-excel-file, jsPDF ≥ 4.2.1, jspdf-autotable (diferidas) |
| Pruebas | Vitest 5, fast-check, fake-indexeddb, Playwright 1.63, axe |

## Fuentes

Consultadas el 2026-10-04.

- Angular: <https://angular.dev> (zoneless, Signal Forms, SSR y prerender, Vitest).
- Angular Material: <https://material.angular.dev>.
- Tailwind CSS: <https://tailwindcss.com>.
- PrimeNG, términos de licencia de la versión 22: <https://primeng.org>.
- Chart.js: <https://www.chartjs.org>.
- decimal.js: <https://mikemcl.github.io/decimal.js/>.
- SheetJS, notas de instalación (versiones fuera del registro de npm): <https://docs.sheetjs.com>.
- write-excel-file: <https://www.npmjs.com/package/write-excel-file>.
- jsPDF: <https://github.com/parallax/jsPDF>.
- Dexie: <https://dexie.org>.
- Playwright: <https://playwright.dev>.
