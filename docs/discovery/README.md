# Descubrimiento (fase 0)

Fecha: 2026-10-04 · Estado: cerrado (alimenta los ADR, la spec de v1 y el plan de olas)

Esta carpeta guarda **lo que se aprendió antes de decidir**: cómo funcionan las cuotas FHA en Guatemala, qué datos entregan
los bancos, qué opciones técnicas había y qué necesita el dueño. Las decisiones están en [`../adr/`](../adr/README.md);
aquí está la evidencia y el razonamiento que las sostienen.

> **Regla de datos.** Ningún documento de esta carpeta contiene montos, tasas, fechas, números de préstamo, correos,
> nombres de bancos ni datos personales reales del dueño. Solo hay hechos públicos (por ejemplo, la prima FHA del 1 %) y
> los valores **sintéticos** del ejemplo resuelto de [`../algorithm.md`](../algorithm.md).

## Cómo se hizo

1. **Conversación con el dueño.** Se partió de sus 11 pedidos originales y se registraron las decisiones en orden
   cronológico (registro del 2026-10-04). Cada pregunta abierta se resolvió con él antes de pasar a la siguiente fase.
2. **Fuentes públicas del dominio.** Reglamento y estados financieros del FHA, tasa líder del Banco de Guatemala,
   publicidad de bancos y condiciones generales de productos hipotecarios.
3. **Ingeniería inversa del cálculo bancario, en privado.** Con documentos del dueño (tabla oficial de amortización,
   desgloses de banca virtual, correos de saldo) se dedujo el algoritmo `FHA_GT_V1`. Ese trabajo ocurrió **fuera del
   repositorio** y aquí solo queda el resultado: reglas, no números.
4. **Investigación técnica con agentes.** Workflows comparativos con puntaje para el backend, revisión del ecosistema
   Angular 22 y de librerías, y análisis de almacenamiento y sincronización en el navegador. Las dudas de mayor riesgo
   quedaron como *spikes* en el plan (W1-08 CSP/Trusted Types/GIS, W1-09 rutas en Cloudflare).
5. **Revisión de arquitectura y plan.** La arquitectura local-first, la convención de idioma y el plan de 72 tarjetas
   fueron aprobados por el dueño.

## Validación contra datos reales: privada y fuera del repo

- El perfil `FHA_GT_V1` reprodujo **al centavo** todas las filas de una tabla de amortización bancaria real, incluidos los
  totales.
- Distintos bancos pueden redondear de forma ligeramente distinta: sobre el mismo algoritmo, los saldos pueden diferir
  en pocos centavos. De ahí salen los **perfiles de redondeo por banco** y el **re-anclaje** con saldos reales.
- **Nada de esa validación se incluye aquí**: ni tablas, ni capturas, ni montos. Las herramientas de comparación imprimen
  solo conteos y la diferencia máxima.
- Las validaciones futuras (gates W2-01, W3-01, W4-01) usarán una carpeta privada fuera del repo. Esa carpeta **todavía
  no está autorizada**: requiere confirmación explícita del dueño antes de W2-01.

## Hallazgos que cambiaron el rumbo

- **No hace falta base de datos en v1.** Con un solo usuario, un backend obligaba a cuentas, MFA, antibots, rol admin y
  mantenimiento contra la pausa del plan gratuito. Se pivotó a **local-first** con copia cifrada en Google Drive.
- **El cálculo bancario es reproducible**, pero cada banco redondea a su manera: plantilla editable + perfil de redondeo
  + ancla con el saldo real.
- **Las tasas cambian** (tasa del contrato y referencia del mercado): hace falta un historial de tasas con fecha de
  vigencia y tres políticas de recálculo, porque no hay regulación pública sobre si el banco mantiene plazo o cuota.
- **No todos los bancos envían correos**: se descartó leer correos y se optó por registrar saldos y pagos a mano.
- **Safari puede borrar los datos** de un sitio no visitado en 7 días: banner, recordatorios de respaldo y Drive.
- **El MFA no detiene bots**: protege cuentas. Sin cuentas en v1, ni MFA ni CAPTCHA aplican; quedan para la fase
  multiusuario (ADR-0020).

## Índice

| Documento | Contenido |
|---|---|
| [dominio-hipotecas-guatemala.md](dominio-hipotecas-guatemala.md) | Componentes de la cuota FHA, seguros, cargos fijos, IVA, tasa líder, políticas de abono y cómo reportan los bancos |
| [investigacion-backend.md](investigacion-backend.md) | Supabase, Cloudflare D1 + Better Auth, Firebase y Appwrite; puntajes; por qué se eligió local-first |
| [investigacion-frontend.md](investigacion-frontend.md) | Angular 22, librerías de UI, gráficas, decimales, exportación, e2e y locale es-GT |
| [investigacion-almacenamiento-y-sync.md](investigacion-almacenamiento-y-sync.md) | Durabilidad por navegador, ITP de Safari, `persist()`, File System Access y sincronización con Drive `appDataFolder` |
| [historias-de-usuario.md](historias-de-usuario.md) | 25 historias con criterios de aceptación, trazadas a R1–R28 |
| [direccion-visual.md](direccion-visual.md) | Direcciones visuales exploradas, bocetos ASCII de las pantallas clave, medidor de casa y paleta aprobada por el dueño el 2026-10-06 (congelada en `docs/specs/design-palette.md`) |

## Pedidos originales del dueño y dónde quedaron

| # | Pedido | Resultado | Dónde |
|---|---|---|---|
| 1 | Definir estilo visual | Dirección "libreta bancaria" + "tu casa se va llenando" + edición en celda | ADR-0012, R21 |
| 2 | Plan para subagentes más baratos, áreas pública y autenticada, tarjetas paralelas | 72 tarjetas en 8 olas con `owns`; área pública `/` y área de app `/app` (sin login en v1) | ADR-0019, `docs/plan/` |
| 3 | Un solo tipo de usuario: historial, pagos, abonos, proyecciones | Un solo tipo en v1; el rol admin solo existe en el diseño multiusuario archivado | R13–R17, ADR-0020 |
| 4 | Sin conexión con bancos, sin mover dinero | Principio de producto | ADR-0001 |
| 5 | Control de datos del préstamo (monto, plazo, tasa, tipo de tasa, día de pago, moneda) | Asistente con plantillas editables; tipo de tasa `rateType` (fija o variable, informativo) y la tasa como historial de cambios con fecha | R8, R14, R27, R4 |
| 6 | Registrar abonos extraordinarios | Abono puntual, adelantar N cuotas y búsqueda por meta; recurrentes en fase 2 | R4, R6 |
| 7 | Tabla proyectada vs real | Tres caminos (original, real, escenario) y columna Real Δ | R5, R15 |
| 8 | MFA para frenar bots | Aclarado y diferido: sin cuentas en v1 no aplica | ADR-0020 |
| 9 | Respaldo y exportación Excel/CSV/PDF | Respaldo JSON versionado, exportaciones en el cliente y copia cifrada en Drive | R11, R12, R19 |
| 10 | Trabajo por fases con entregables, todo definido antes del código | Descubrimiento → ADR → modelo de datos → spec → plan | ADR-0019 |
| 11 | CLAUDE.md con convenciones y carpeta de ADR | `CLAUDE.md` y `docs/adr/` | ADR-0018, ADR-0019 |

## Fuera de esta carpeta

- Decisiones: [`../adr/README.md`](../adr/README.md).
- Algoritmo (fuente única de verdad): [`../algorithm.md`](../algorithm.md).
- Glosario ES ↔ EN: [`../glossary.md`](../glossary.md).
- Plan, olas y trazabilidad: [`../plan/waves.md`](../plan/waves.md), [`../plan/traceability.md`](../plan/traceability.md).
