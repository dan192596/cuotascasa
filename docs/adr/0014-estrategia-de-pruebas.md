# ADR-0014: Estrategia de pruebas y cadena de confianza del cálculo

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El valor de CuotasCasa depende de que sus números coincidan **al centavo** con los del banco. El motor lo escriben agentes Sonnet, y una regla mal leída produce cifras plausibles pero falsas. Las pruebas con valores calculados a mano no bastan: quien las escribe puede equivocarse igual que quien escribe el código. Y la tabla real que permitiría validar **no puede entrar al repositorio público** (ADR-0015).

## Decisión

### Cadena de confianza del cálculo

1. **Especificación única.** `docs/algorithm.md` identifica cada regla con `[ALG.*]`, y W0-02 agrega un ejemplo sintético resuelto por regla (`docs/specs/algorithm-examples/`).
2. **Oráculo independiente.** `tools/oracle`, en Python, lo escribe otro linaje de agentes **solo** a partir de `algorithm.md`, en un worktree con sparse-checkout. Las tarjetas del motor nunca leen su código. El checkout parcial trae además `docs/specs/conformance-triage.md`, que Opus redacta por regla `[ALG.*]` e id de fixture, sin código, rutas ni valores del motor (`docs/plan/README.md`, sección 3).
3. **Validación privada, condicional.** Si el dueño la autoriza, Opus compara el oráculo, y antes de fusionar W4-02 también el motor, con una tabla bancaria real guardada **fuera del repo** (`~/.cuotascasa-private/`).
   - **Autorización:** está pendiente. Solo cuenta si el dueño la da explícitamente en el chat, nombrando la carpeta o la validación privada. Opus la registra con fecha y alcance en `docs/specs/oracle-validation-log.md`.
   - **Herramientas** (`compare` del oráculo y `private-compare` del arnés): **nunca imprimen el total de filas, ni siquiera en la terminal**, porque revelaría el plazo real. Tampoco imprimen montos ni condiciones. Su salida son exactamente tres líneas con rótulo: `allRowsMatched: yes|no`, `mismatchedRows: <int>` y `maxAbsDiff: <d.dd>`.
   - **`--log-line`:** recibe `--sha <git sha>` y `--label <a|b…>` e imprime solo la línea para la bitácora: `AAAA-MM-DD · oráculo <sha> · préstamo <label> · todas las filas coinciden: sí|no`, sin el número de filas con diferencia ni la diferencia máxima, que en una corrida que falla podrían revelar el plazo o un monto reales (decisión del dueño, 2026-10-09). El detalle está en `docs/plan/README.md`, sección 6.
   - **Bitácora:** solo registra esa línea, sin montos, condiciones ni total de filas. La salida de terminal nunca se copia al chat, a un PR, a un issue, a un commit ni a la bitácora.
4. **Fixtures sintéticos.** El perfil `core` tiene unos 15 préstamos sin eventos. El perfil `full` tiene unos 40, con sub-semillas propias, cambios de tasa, todos los tipos de abono y el caso de la última fila. Rangos: Q150,000 a Q2,500,000 y un rango propio en USD, tasas de 5.4 % a 9.8 % y plazos de 5 a 30 años. Todos van en `manifest.json` con `synthetic: true`. **`tools/oracle/FORMAT.md` (W0-04) es la única fuente de estos datos para el linaje del oráculo,** así que contiene:
   - la composición de cada perfil: conteos exactos, rangos por moneda (incluido el de USD) y la mezcla de eventos (la matriz de cobertura de W2-06);
   - el esquema de los archivos privados: `a-terms.json` tiene la forma del objeto `inputs` de un fixture, y `a-expected.csv` tiene las columnas exactas de una fila esperada, con nombre y orden fijos.

   `compare` (W1-02) y `private-compare` (W0-06) usan ese mismo esquema.
5. **CI.** `oracle-diff` regenera los perfiles y exige un `git diff` vacío. El arnés de conformidad, escrito por Opus y congelado, ejecuta la API pública del motor TypeScript contra cada fixture y compara cada campo **al centavo**. `enforced-features.json` solo admite agregar etiquetas, y ningún id de fixture puede aparecer en `packages/domain/src`.
6. **Cada corrección cita una sección de `algorithm.md`**, y Opus clasifica cada discrepancia antes de que alguien toque código.

### Criterios condicionales y único plan alternativo

Los criterios de validación privada de los gates W2-01, W3-01 y W4-01 («Private compare reports 0 mismatched rows») y la corrida privada previa al merge de W4-02 se leen así:

- **Si la autorización consta** en `docs/specs/oracle-validation-log.md`, con fecha y alcance: la comparación privada reporta 0 filas con diferencia y queda registrada sin valores.
- **Si no consta:** la bitácora tiene, para ese gate, la línea `validación privada: no autorizada`. El riesgo residual (un error común a motor y oráculo que los ejemplos no cubran) queda anotado en la bitácora y, desde W3-01, en `docs/specs/conformance-triage.md`, y W7-01 lo repite en el checklist del release. Los gates validan solo contra los ejemplos sintéticos, y Opus vuelve a preguntar en cada gate.

Este es el único plan alternativo. El detalle operativo está en `docs/plan/README.md`, sección 6. No se improvisa otra fuente de datos reales.

### Resto de la pirámide

- **Invariantes con fast-check:** el capital suma el principal; el saldo nunca es negativo ni crece; adelantar N reduce el plazo en exactamente N; un abono nunca aumenta el interés total; la búsqueda por meta da el mínimo al centavo.
- **Resultados tipados del motor:**
  - la búsqueda por meta devuelve `ALREADY_MET`, `FOUND` o `INFEASIBLE` (`[ALG.GOAL]`); una meta inviable no lanza excepción y solo una entrada inválida da un error de validación tipado;
  - la validación de plantilla devuelve `GREEN`, `AMBER` o `RED` (`[ALG.VALIDATE]`), con pruebas a cada lado de cada umbral.
- **Esquema:** migraciones por versión e ida y vuelta del códec de respaldo.
- **Persistencia:** la suite de contrato `runDataStoreContract` corre sobre el adaptador en memoria y sobre Dexie (con `fake-indexeddb`).
- **Sincronización:** combinación conmutativa e idempotente, con marcas de borrado y desempate determinista (ADR-0024).
- **Cifrado:** ida y vuelta, frase incorrecta y sobre manipulado, en Vitest modo navegador sobre Chromium y WebKit. Las pruebas reducen las iteraciones de PBKDF2, pero verifican que la constante de producción siga en 600,000.
- **Exportación:** snapshots y verificación de bytes (ADR-0013). **Componentes:** spec de contrato por cada `cc-*`.
- **E2E:** Playwright contra el build de producción con las cabeceras reales, en Chromium y WebKit. Cubre simulador sin red ni almacenamiento, alta de préstamo, Real Δ, escenarios y comparación, exportaciones, respaldo, sync con Google simulado, aviso de Safari, axe y violaciones de CSP.
- **Cobertura** ≥ 95 % en `domain`, `schema` y `sync`.
- **El Drive real se prueba a mano** con una lista de verificación (W6-04, W7-01).

## Alternativas consideradas

- **Solo pruebas unitarias con valores calculados a mano.** Comparten los errores de interpretación del autor. Insuficiente.
- **Subir la tabla real anonimizada o escalada.** Aun transformada puede revelar condiciones reales. Descartada.
- **El mismo linaje para motor y oráculo.** Aumenta el riesgo de error de modo común. Descartada.

## Consecuencias

**Positivas**
- Evidencia trazable de que el motor reproduce el algoritmo validado, sin publicar datos reales.
- Las regresiones numéricas se detectan en cada PR.

**Negativas**
- CI también necesita Python, con dependencias fijadas por hash.
- Tres gates de Opus (W2-01, W3-01, W4-01) y trabajo de triage.

**Riesgos**
- Que motor y oráculo malinterpreten igual una regla. Mitigación: ejemplos resueltos por regla, linajes aislados y validación privada en cada gate, si está autorizada.
- Que el dueño no autorice la carpeta privada. Mitigación: los gates siguen el plan alternativo de arriba (solo ejemplos sintéticos, línea «no autorizada» y riesgo residual anotado). No se replanifica y no se improvisa otra fuente de datos reales.
- Que el total de filas de una comparación privada revele el plazo real. Mitigación: ninguna salida de las herramientas lo imprime (ni la de terminal ni `--log-line`), la bitácora no lo registra y la salida de terminal no se copia a ningún lado.

## Verificación

- W0-04: `FORMAT.md` con la composición de perfiles y el esquema de los archivos privados.
- W0-06: arnés de conformidad, owns-check y `private-compare`. W1-02: `compare`. En ambas herramientas, las pruebas verifican que la salida normal son exactamente las tres líneas con rótulo, que `--log-line` sigue el formato de arriba y que ninguna de las dos incluye el total de filas, montos ni condiciones.
- W1-02, W2-06 y W3-04: oráculo. W2-01, W3-01 y W4-01: gates (validación privada condicional) y fixtures.
- W2-13 y W4-02: conformidad total. W3-02: propiedades.
- W2-07: semáforo `GREEN`/`AMBER`/`RED` en cada umbral. W3-03: búsqueda por meta, con los tres resultados y sin excepción ante una meta inviable.
- W2-11, W6-01 y W6-02: e2e y barridos. W2-12: presupuestos de bundle.
- W7-01: trazabilidad R1–R28.

## Referencias

- ADR-0003, ADR-0004, ADR-0006, ADR-0007, ADR-0013, ADR-0015, ADR-0019, ADR-0024.
- `docs/algorithm.md`, `tools/oracle/FORMAT.md`, `docs/specs/oracle-validation-log.md`, `docs/specs/conformance-triage.md`.
- `docs/plan/README.md`, secciones 3 (checkout parcial del oráculo) y 6 (compuertas y carpeta privada).
