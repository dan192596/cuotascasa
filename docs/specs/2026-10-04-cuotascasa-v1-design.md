# CuotasCasa v1: especificación de diseño

- **Estado:** aprobado por el dueño del proyecto (2026-10-04).
- **Autores:** dueño del proyecto + Claude (Opus).
- **Fuente de verdad del cálculo:** [`docs/algorithm.md`](../algorithm.md). Si este documento y el algoritmo difieren, manda el algoritmo.
- **Precedencia completa:** `docs/algorithm.md` > ADR aceptado > esta spec y las specs de contrato > historias de usuario ([`docs/discovery/historias-de-usuario.md`](../discovery/historias-de-usuario.md)) > texto de la tarjeta. Ante una contradicción, el agente se detiene y escala citando ambas fuentes ([`docs/plan/README.md`](../plan/README.md)).
- **Datos:** todo número que aparece aquí es un hecho público o un valor del ejemplo sintético. Ningún dato real del dueño aparece en este repositorio.

---

## 1. Resumen

CuotasCasa es una app web personal para modelar las cuotas de préstamos de vivienda en Guatemala con la fórmula FHA. Proyecta abonos a capital, que reducen el plazo o la cuota, y compara lo proyectado con lo que reporta el banco. No se conecta a bancos ni mueve dinero.

La v1 es **local-first y sin backend**:

- Los datos viven en el navegador (IndexedDB).
- Opcionalmente, una copia **cifrada con frase** se sincroniza en el `appDataFolder` del Google Drive del usuario.
- El sitio es estático y vive en un subdominio del dueño. Cuesta US$0 aparte del dominio.
- El repositorio es público y sirve de portafolio.

Un oráculo independiente en Python verifica al centavo el motor, escrito en TypeScript puro con aritmética decimal.

## 2. Objetivos y no-objetivos

| Alcance | Incluye |
|---|---|
| **v1** | Préstamos desde plantillas editables (monto, plazo, tasa fija o variable, día de pago, GTQ/USD). Historial de tasas y cargos. Saldos reportados y pagos reales. Abono único, adelantar N y búsqueda por meta. Tres caminos y comparación de hasta 3 escenarios. Excel/CSV/PDF. Respaldo JSON. Sync cifrado con Drive. PWA. Landing con simulador y privacidad. |
| **Fase 2** | Abonos recurrentes, asistente completo de calibración y subsidios de la Ley de Interés Preferencial. |
| **Fase multiusuario (diferida, ADR-0020)** | Cuentas, MFA TOTP, admin, invitaciones, compartir en vivo y anti-bots. Se reactiva con un segundo usuario real, con la necesidad de compartir en vivo o con el uso simultáneo en varios dispositivos. |
| **Nunca** | Conexión con bancos, movimiento de dinero, asesoría financiera, analítica o rastreo, y lectura de correos (no todos los bancos los envían). |

El respaldo automático con File System Access también queda fuera, porque Drive cubre la durabilidad.

## 3. Usuarios y contexto de uso

- **El dueño** tiene préstamos FHA reales y al inicio es el único usuario.
- **Amigos ocasionales:** cada uno usa su propio navegador con sus propios datos. No hay cuentas.
- **Dispositivos:** el escritorio es lo principal (≥ 1280 px) y el móvil sirve para consultar. Varios dispositivos se sincronizan con Drive, pero no se espera que editen a la vez.
- **Datos reales**, ingresados a mano: correos del banco con saldo, cuota, fecha y a veces tasa (el saldo es el **anterior** al pago del mes), el desglose de la banca en línea, la tabla oficial y el contrato.
- **Tasas:** cambian por contrato o por mercado, así que se guarda un historial con fechas de vigencia.

## 4. Requisitos R1–R28

La matriz completa está en [`docs/plan/traceability.md`](../plan/traceability.md).

| Id | Requisito | Criterio de aceptación verificable | Tarjetas principales |
|---|---|---|---|
| R1 | Landing prerenderizada + simulador | e2e (Chromium y WebKit): cero peticiones externas y cero almacenamiento tras simular. Bundle sin Dexie, sync, export, Chart.js ni GIS. | W4-03, W4-04, W2-12 |
| R2 | Privacidad | Incluye las secciones de `privacy-requirements.md`. Sin peticiones externas. | W4-05 |
| R3 | Núcleo del motor | Ejemplo y fixtures *core* iguales al oráculo, al centavo. | W1-01, W2-13, W4-02 |
| R4 | Eventos | Fixtures *full* al centavo. La amortización negativa da un error tipado. | W2-03, W2-04, W2-05 |
| R5 | Tres caminos + métricas | Reproduce el ejemplo: 220 cuotas e `interestSaved` 69172.80; `level` 4089.36. | W2-05, W3-12, W5-05 |
| R6 | Búsqueda por meta | Mínimo al centavo: con un centavo menos no cumple (propiedad). Resultados `ALREADY_MET`, `FOUND` o `INFEASIBLE`. | W3-03, W5-04 |
| R7 | Validación de plantilla | Pruebas en cada umbral. e2e: verde si el saldo coincide, rojo si no. | W2-07, W4-07 |
| R8 | Plantillas | `fha-gt@1` y `simple@1`. Copia + `templateRef`; editar la copia no altera la plantilla. | W2-07, W4-07 |
| R9 | Modelo + zod | Toda entidad valida. Dinero en string decimal y fechas `AAAA-MM-DD`. | W0-04, W1-03 |
| R10 | Persistencia | Suite de contrato en verde en memoria y en Dexie. `persist()` en el primer guardado. | W1-04, W1-05, W3-13 |
| R11 | Respaldo JSON | e2e de ida y vuelta. La vista previa no escribe. Se puede deshacer. La variante cifrada pide frase. | W1-03, W4-08, W5-07 |
| R12 | Sync con Drive | Con el mock: remoto cifrado, segundo contexto con los mismos datos, `.prev` conservado, estado offline y revocación. Merge conmutativo e idempotente. | W1-06, W2-08, W2-09, W5-08 |
| R13 | Dashboard | Medidor, totales por moneda y filtro. Estado vacío con 3 acciones (e2e). | W4-06 |
| R14 | Asistente y gestión | Un paso inválido bloquea. Un guardado fallido no escribe. Eliminar marca también a los hijos. | W4-07, W5-01 |
| R15 | Tabla | Real Δ solo con saldo reportado. Subtotales = `yearlySubtotals`. Abono en celda: +1 evento de escenario, 0 reales. e2e solo con teclado. | W3-07, W5-02 |
| R16 | Datos reales | CRUD por tipo de evento. Real Δ con semáforo. Errores en línea. | W4-12, W5-03 |
| R17 | Proyecciones | Escenario activo persistente. Se bloquea el 4.º escenario. Gráfica diferida con tabla alternativa. | W5-04, W5-05 |
| R18 | Ajustes | Recordatorio exacto según `reminderDue()`. Import/export, Drive, frase y persistencia. | W3-13, W5-07, W5-08 |
| R19 | Exportar | Excel, CSV y PDF de la tabla y la comparación, con pruebas de bytes. CSV con BOM. Fuera del bundle inicial. | W3-15, W4-10, W4-11, W5-06 |
| R20 | PWA | Sin SW en `/`. `/app` funciona offline. Aviso de actualización. | W2-02, W3-14 |
| R21 | Sistema de diseño | Tokens claro/oscuro y pipes es-GT. axe limpio en todas las rutas y en ambos temas. | W3-05, W3-06, W6-02 |
| R22 | Seguridad | `edge:check` de la CSP por ruta, sin `unsafe-*`. Cero violaciones en e2e. | W1-08, W2-10, W6-02 |
| R23 | Higiene del repo | gitleaks local y en CI. `synthetic: true`. Push protection antes del primer push. | W0-06, W1-10, W7-01 |
| R24 | Infraestructura de pruebas | En CI son obligatorios oracle-diff, conformidad, propiedades, contrato, e2e, axe, bundle y owns-check. | W0-06, W1-02, W2-01, W3-16 |
| R25 | CI/CD y Cloudflare | Deploy desde `main`. `edge:check` en vivo: rewrites solo en `/app`, 404 y cabeceras. | W1-09, W3-17 |
| R26 | Documentación | README bilingüe, modelo de amenazas, guías y ADRs al día. | W3-18, W6-03, W6-04 |
| R27 | Multimoneda | Moneda inmutable desde el primer registro hijo (sección 7). Mezclar monedas da un error tipado. Totales por moneda. | W0-03, W4-06, W4-10 |
| R28 | Estado del préstamo | `active`, `paid` y `archived`; los dos últimos ocultos por defecto (e2e). | W4-06, W5-01 |

## 5. Arquitectura

### 5.1 Por qué local-first

En la evaluación de backends, Supabase Free + Cloudflare sacó 23.5/30, Workers + D1 + Better Auth 20 y Firebase Spark 15.5. Luego el dueño preguntó para qué una base de datos si al principio solo él usa la app. Sin cuentas no hacen falta servidor, autenticación, MFA ni RLS, así que el costo y la superficie de ataque bajan a casi cero. Drive cubre la durabilidad y el uso en varios dispositivos.

### 5.2 Paquetes y dependencias

```
┌──────────────────────────── apps/web (Angular 22) ─────────────────────────────┐
│  public/                    features/                                          │
│  landing · simulador ·      dashboard · loans · schedule · real-data ·         │
│  privacidad                 scenarios · export · settings                      │
│      │                            │                                            │
│      │                            ▼                                            │
│      │                      data/  stores (signals) · fachada del motor ·      │
│      │                             BackupService · SyncService · StorageHealth │
│      │                            │                                            │
│  ui/ + core/  shell · tema · pipes es-GT · tabla libreta · medidor de casa     │
└──────┼────────────────────────────┼────────────────────────────────────────────┘
       ▼                            ▼
 packages/domain ◄──── packages/export (CSV · Excel · PDF; carga diferida)
 motor puro, decimal.js
                        packages/persistence ──► packages/schema ◄── packages/sync
                         puerto DataStore         zod, respaldo,     puerto SyncProvider
                         ├─ adaptador memoria     migraciones        ├─ merge LWW (puro)
                         ├─ adaptador Dexie                          ├─ sobre AES-256-GCM
                         └─ suite de contrato                        └─ proveedor Drive
                              ▼                                           ▼
                          IndexedDB                            appDataFolder (Drive)
```

**Reglas de dependencia:** las impone ESLint y su única definición es la matriz de ADR-0010 (decisión 5). Esta spec no las repite.

### 5.3 Flujo de datos y puertos

1. **Edición:** la feature llama a un store, que escribe en una transacción del `DataStore`. Dexie notifica el cambio (`liveQuery` → `toSignal`).
2. **Proyección:** la fachada convierte las entidades a dominio y memoriza `buildPaths`, `compareSchedules` y `yearlySubtotals`. Las tablas nunca se guardan.
3. **Exportación:** el `ReportModel` alimenta un writer de carga diferida, en el navegador.
4. **Sync:** ver la sección 8.

Puertos:

- **`DataStore`:** transacciones, exportación con marcas de borrado, `replaceAll`, instantáneas y contadores de cambios. Tiene dos adaptadores que pasan la misma suite de contrato: memoria (pruebas y desarrollo) y Dexie 4.4. El simulador público no usa persistencia: solo usa `domain` (ADR-0006).
- **`Clock` e `IdGenerator`:** inyectables. El `Clock` da el instante de los sellos y `today()`, la fecha local que usa `data/` como `asOf` (sección 9). El dominio no los usa.
- **`SyncProvider`:** Drive, con un fake compartido por las pruebas unitarias y el e2e.
- **`KeyStore`:** guarda la `CryptoKey` no exportable.

### 5.4 Hosting

- **Plataforma:** Cloudflare Workers static assets, en el plan gratuito.
- **Renderizado:**
  - Angular SSR (`outputMode: 'static'`) prerenderiza `/` y `/privacidad`.
  - `/app/**` usa `index.csr.html` mediante rewrites acotados, nunca `/*`.
  - Cualquier otra ruta da un 404 real (ADR-0022).
- **Cabeceras:** por ruta, en `_headers`.
- **Google:** el ID de cliente se inyecta con `--define`.
- **Aislamiento de `/`:** los providers de datos viven en la ruta lazy de `/app`, y el service worker nunca se registra en `/` (ADR-0023).

## 6. Motor de cálculo

Las reglas `[ALG.*]` están en [`docs/algorithm.md`](../algorithm.md).

- **Fórmula FHA:**
  - La tasa periódica es `r = (i + f)/12`. `f` suma el seguro de hipoteca FHA (1 % anual sobre saldo, Reglamento FHA art. 19b) y el desgravamen (0.26 %); los bancos incluyen ambos en la tasa de la cuota.
  - `FHA_GT_V1` redondea el cargo combinado y lo reparte entre interés y seguro.
  - Los cargos fijos (IUSI, seguro de daños) se suman al total sin tocar el saldo.
- **Perfiles de redondeo:** `FHA_GT_V1` reprodujo al centavo todas las filas de una tabla de amortización bancaria real, incluidos los totales, en una validación privada. Distintos bancos pueden redondear de forma ligeramente distinta, así que hay perfiles de redondeo y las anclas re-basan la proyección.
- **Fechas (`[ALG.DATES]`):** la cuota `k` vence en el mes `firstDueDate + (k − 1)`: con `END_OF_MONTH`, el último día; con `paymentDay = d`, el día `min(d, días del mes)`. El día de `firstDueDate` debe cumplir esa misma regla en su propio mes (por ejemplo, `END_OF_MONTH` con `2027-03-15` o `paymentDay = 15` con `2027-03-10` no son válidos). Un par inválido lanza `InvalidInputError`, y la UI re-deriva el día al cambiar `paymentDay`.
- **Tasas en cero (`[ALG.ZERO]`):** si `r = 0`, `level = HALF_UP_2(B / m)` y el interés y los seguros valen 0. En `FHA_GT_V1` con `f = 0`, `interest = charge`, `insurance = 0` y no hay reparto entre componentes. Nunca se divide entre cero.
- **Eventos:**

  | Evento | Efecto |
  |---|---|
  | `RateChange` | Tres políticas: recalcular la cuota, mantenerla o usar la del banco |
  | `FixedChargeChange` | Reemplaza la lista completa de cargos fijos desde la cuota `k`; los anteriores dejan de regir, incluso los de fecha futura (`[ALG.FIXEDCHANGE]`) |
  | `Prepayment` | Reduce plazo o cuota; admite comisión y tiene tope |
  | `AdvanceInstallments(N)` | Ahorra exactamente N cuotas |
  | `ReportedBalance` | Ancla y Real Δ |
  | `ActualPayment` | Solo compara |

  Cuota de cada evento (`[ALG.EVENTS.ANCHOR]`): si trae `installmentNumber`, `k` es ese número (validado `1 ≤ k ≤` plazo vigente); si no, la primera cuota con vencimiento `≥` su fecha. Un abono, por lo tanto, no se asocia a «la cuota de su mes»: con `paymentDay = 15`, un `Prepayment` fechado el día 20 de un mes queda en la cuota que vence el 15 del mes siguiente y se aplica justo después de pagarla (fase 3). Con `END_OF_MONTH`, cualquier día del mes cae en la cuota de ese mes.

  Orden dentro de una cuota (`[ALG.EVENTS.ORDER]`): saldo reportado (Real Δ y re-anclaje) → tasas y cargos → cálculo de la cuota → abonos y adelantos → comparación de pagos reales.

- **Caminos:**
  - original;
  - real (eventos reales y anclas);
  - escenario (real + hipotéticos posteriores al corte).
- **Corte de los hipotéticos (`[ALG.PATHS.CUTOFF]`):** la regla vive en `algorithm.md` y aquí solo se resume.
  - `cutoffK` es la mayor cuota `k`, asignada con `[ALG.EVENTS.ANCHOR]`, entre los `ReportedBalance`, los `ActualPayment` y los `Prepayment` y `AdvanceInstallments` reales. Sin ninguno de ellos, `cutoffK = 0`.
  - Los `RateChange` y `FixedChargeChange` reales no mueven el corte, aunque tengan fecha futura: describen condiciones que el banco puede anunciar por adelantado.
  - La comparación es por cuota, no por fecha: un evento hipotético con `k ≤ cutoffK` da un error de validación tipado.
  - La fecha de hoy no interviene en el dominio.
- **Métricas (`[ALG.METRICS]`):** se calculan contra una base (por defecto, el camino real sin hipotéticos): `interestSaved`, `monthsSaved`, `endDate`, `totalPaid` y `netSaving` (`totalPaid` de la base − `totalPaid` del escenario: incluye los cargos fijos que ya no se pagan y descuenta las comisiones).
- **Búsqueda por meta (`[ALG.GOAL]`):** bisección por centavos que da el mínimo abono para terminar antes de una fecha o para no pasar de una cuota dada. Devuelve `ALREADY_MET`, `FOUND {amount, metrics, isPayoff}` o `INFEASIBLE {payoffAmount, reason}`. Una meta inviable no lanza excepción; solo una entrada inválida da un error de validación tipado. La búsqueda no aplica comisión.
- **Validación de plantilla (`[ALG.VALIDATE]`):** semáforo `GREEN`, `AMBER` o `RED` sobre `realDelta = reportado − modelado`, contra un saldo reportado de la cuota `k`. Lo modelado es el camino real conservando solo las anclas con `k' < k` (se excluyen todas las de la misma `k` y las posteriores), igual que la fase 0; en el asistente, el plan original. En v1 la causa se emite de forma determinista: ninguna en `GREEN`, `INSTALLMENT_MISALIGNMENT` si el saldo coincide (±1.00) con la apertura modelada de `k−1` o `k+1`, y si no `UNKNOWN`.
- **Ejemplo sintético:** Q500,000.00 a 240 meses, con `i = 0.07` y `f = 0.0126`, da `level` 4263.47. Un abono de Q20,000.00 tras la cuota 12 tiene dos variantes:
  - `REDUCE_TERM`: 220 cuotas e `interestSaved` 69172.80.
  - `REDUCE_INSTALLMENT`: `level` 4089.36.

  Adelantar 6 cuotas cuesta 5446.87.

**Supuestos de v1:**

- El interés es 30/360 mensual, sin importar el día de pago.
- Un evento sin `installmentNumber` se asocia a la primera cuota con vencimiento `≥` su fecha (`[ALG.EVENTS.ANCHOR]`), no a «la cuota de su mes», y un abono se aplica justo después de pagar esa cuota (ejemplo de `paymentDay = 15` y día 20, arriba). Un `ActualPayment` siempre trae `installmentNumber`, que la UI sugiere con la misma regla a partir de `paidDate`.
- El saldo reportado es el anterior al pago del mes.
- No hay regulación pública sobre qué hace el banco ante un cambio de tasa. Por eso la política es elegible y la cuota del banco manda cuando se conoce. Las tasas no se infieren de la tasa líder de Banguat.
- No se modelan moras ni IVA aparte.
- Una cuota que no cubre el cargo lanza `NegativeAmortizationError`, con una explicación.

## 7. Modelo de datos

Solo se guardan **entradas del usuario**. Las tablas, proyecciones y métricas siempre se calculan. Las plantillas viven en el código, y cada préstamo guarda una copia.

**Campos comunes:** `id` (UUID), `createdAt` y `updatedAt` (ISO 8601 UTC, solo metadatos), `updatedByDevice` y `deletedAt`. Dinero y tasas van como strings decimales, y las fechas de negocio como `AAAA-MM-DD`.

| Entidad | Campos principales |
|---|---|
| `Loan` | `name` (rótulo «Alias» en la UI), `bank` (texto libre; rótulo «Banco»), `currency` (inmutable desde el primer registro hijo), `principal`, `termMonths`, `disbursementDate`, `firstDueDate`, `paymentDay`, `interestRate` (tasa original del contrato, al desembolso; los cambios posteriores son eventos `RateChange`), `rateType` (`FIXED` o `VARIABLE`), `insuranceRates`, `fixedCharges` con `effectiveFrom`, `roundingProfile`, `templateRef {id, version}`, `status` |
| `LoanEvent` | `loanId`, `type` (`RateChange`, `FixedChargeChange`, `Prepayment` o `AdvanceInstallments`), `date`, datos del tipo, `note` opcional |
| `ReportedBalance` | `loanId`, `date`, `installmentNumber` opcional, saldo, `totalInstallment` y `reportedRate` opcionales (informativos), origen, `note` opcional |
| `ActualPayment` | `loanId`, `paidDate`, `installmentNumber` (obligatorio), total, desglose opcional, `note` opcional |
| `Scenario` | `loanId`, nombre, eventos hipotéticos |
| `Settings` | sincronizados y locales del dispositivo (el reparto lo fija W0-04) |

`rateType` es informativo (`[ALG.TERMS]`): el motor solo usa `interestRate` y los eventos `RateChange`. Con `FIXED`, registrar un `RateChange` muestra una advertencia, pero no lo impide.

**Cuota de los registros reales** (`[ALG.EVENTS.ANCHOR]`):

- `ActualPayment.installmentNumber` es obligatorio en el esquema. La UI lo sugiere a partir de `ActualPayment.paidDate` y el usuario lo puede cambiar.
- `ReportedBalance.installmentNumber` es opcional. Sin él, la cuota es la primera con vencimiento `≥ ReportedBalance.date`.
- Con `installmentNumber`, el dominio valida `1 ≤ k ≤` plazo vigente (`[ALG.TERM]`) y, si no se cumple, da un error de validación tipado.
- `totalInstallment` y `reportedRate` de un `ReportedBalance` son informativos: el motor no los usa. Un cambio de tasa se registra como `RateChange`.

**`FixedChargeChange`** (`[ALG.FIXEDCHANGE]`) lleva la lista **completa** de cargos vigentes desde su cuota `k`. Todos los cargos anteriores dejan de regir, incluidos los de fecha futura.

Un préstamo en curso se crea con `createWithAnchor`: las condiciones originales y el saldo actual como ancla, en una sola transacción. Si el paso 4 del asistente queda vacío, el préstamo se crea sin ancla (sección 9).

**Banco y alias:** `Loan.bank` (rótulo «Banco») es texto libre que escribe el usuario; el código y el repo no traen una lista de bancos (ADR-0015). `Loan.name` (rótulo «Alias») es el nombre libre con que el usuario identifica el préstamo.

**Moneda:** se puede corregir mientras el préstamo no tenga registros hijos sin borrar (`LoanEvent`, `ReportedBalance`, `ActualPayment` o `Scenario`). Desde el primero es inmutable, y el intento de cambiarla da un error tipado. Un préstamo creado con ancla ya nace con un hijo (ADR-0005).

**Respaldo JSON:**

```
{ format: "cuotascasa", version, exportedAt, deviceId, appVersion,
  data: { loans, events, reportedBalances, payments, scenarios, settings } }
```

**Migraciones e importación:** las fija ADR-0007. Esquema zod por versión y migraciones puras y encadenadas (decisión 2); importar por etapas con vista previa, instantánea, reemplazo en una transacción y deshacer (decisión 5). Los sellos intactos, el aviso de sincronización y los contadores después de importar están en la decisión 6, y aquí no se repiten. Un documento de una versión futura se rechaza sin escribir nada.

**Merge** (ADR-0024):

- Por registro, gana el `updatedAt` mayor; el empate se rompe por `deviceId`, y en empate total gana la marca de borrado.
- El sellado es monótono por dispositivo.
- Las marcas de borrado se purgan del conjunto combinado, antes de guardarlo y subirlo, según la regla de purga de ADR-0008 (decisión 4). Esa es la única fórmula; aquí no se repite.
- El merge es puro, conmutativo e idempotente.

## 8. Sincronización y cifrado

**Google Drive:**

- La conexión usa el token model de GIS. El script se carga solo al conectar.
- El scope `drive.appdata` no es sensible: no requiere verificación ni tiene tope de 100 usuarios, pero la pantalla de consentimiento debe estar **publicada en producción**. En Testing, la autorización expira a los 7 días. Publicar exige página pública, privacidad y dominio verificado.
- No hay refresh token: el access token (~1 h) vive en memoria y el usuario pulsa «Sincronizar».

**Sesión de sincronización:**

1. Descargar `cuotascasa.json`.
2. Descifrar.
3. Combinar con los datos locales.
4. Purgar del conjunto combinado las marcas de borrado vencidas (ADR-0008, decisión 4).
5. Guardar localmente.
6. Cifrar con un IV nuevo.
7. Subir, conservando la versión anterior como `cuotascasa.prev.json`.
8. `markSynced`, solo tras una subida exitosa.

Drive no confirma compare-and-set atómico, así que antes de subir se vuelve a comprobar el remoto (mejor esfuerzo). Sin conexión, la app muestra «Cambios sin sincronizar (n)». «Desconectar Drive» revoca el acceso.

**Cifrado:**

- AES-256-GCM, con una clave derivada por PBKDF2-SHA256 (600,000 iteraciones y sal aleatoria), dentro de un sobre versionado.
- La clave se guarda como `CryptoKey` no exportable en IndexedDB, así que la frase se pide una vez por dispositivo.
- Cualquier dispositivo con clave puede cambiar la frase. Los demás muestran «requiere frase».
- Olvidar la frase solo hace perder datos si además se pierden todos los dispositivos. Se recomienda guardarla en un gestor de contraseñas.
- La misma frase puede cifrar el respaldo JSON.

IndexedDB local no se cifra, porque eso no protege contra XSS. El cifrado del disco cubre el robo del equipo.

## 9. UI/UX

**Dirección visual** (direcciones exploradas, bocetos ASCII y paleta propuesta en [`docs/discovery/direccion-visual.md`](../discovery/direccion-visual.md)):

- **«Libreta bancaria»:** títulos con serifa, cifras monoespaciadas y tablas rayadas.
- **«Tu casa se va llenando»:** una casa que se llena según el capital pagado, en el dashboard y la landing.
- **Edición en celda.**

**Sistema de diseño:**

- Fuentes autoalojadas; por ejemplo, Source Serif 4 y JetBrains Mono.
- Paleta de tinta sobre papel: verde para «ya es tuyo», ámbar para diferencias pequeñas y rojo para diferencias grandes o errores. Los valores son una propuesta que el dueño aprueba en W0-05 (ADR-0012).
- Tokens claro/oscuro, Material 22 compacto y Tailwind v4.
- Formatos `Q 1,234.56`, `US$ 1,234.56` y `dd/mm/aaaa`.

| Ruta | Pantalla | Render |
|---|---|---|
| `/` | Landing + simulador sin cuenta | Prerender |
| `/privacidad` | Política de privacidad | Prerender |
| `/app` | Dashboard o primera ejecución | Cliente |
| `/app/prestamos/nuevo` | Asistente de 4 pasos | Cliente |
| `/app/prestamos/:id` | Detalle, edición, archivar, pagado, eliminar | Cliente |
| `/app/prestamos/:id/tabla` | Tabla de amortización | Cliente |
| `/app/prestamos/:id/datos-reales` | Datos reales | Cliente |
| `/app/prestamos/:id/proyecciones` | Escenarios y comparación | Cliente |
| `/app/ajustes` | Ajustes | Cliente |

El archivo central de rutas solo lo edita Opus.

**Pantallas y flujos.** Los criterios de comportamiento de cada pantalla están en las historias HU-01 a HU-25.

- **Primera ejecución:** crear un préstamo, restaurar un respaldo o conectar Drive.
- **Aviso de Safari:** persistente si Safari no corre como app instalada; enlaza a Ajustes y recomienda Chrome o Edge con la PWA.
- **Simulador de la landing:** definición cerrada en «Simulador», más abajo.
- **Asistente:** (1) plantilla y banco, (2) condiciones originales: `principal`, `termMonths`, `interestRate` (tasa original del contrato), filas de seguros (`insuranceRates`), `roundingProfile`, `rateType`, `paymentDay`, `firstDueDate` y `disbursementDate`, (3) cargos fijos a partir del total del banco y (4) ancla y validación, opcional. Todo es editable. Reglas en «Asistente», más abajo.
- **Dashboard:** medidor, totales por moneda, filtro, y estado del respaldo y del sync.
- **Tabla:** vistas original, real y escenario, con encabezado fijo, el mes actual marcado y Real Δ. Tiene subtotales anuales de capital y se navega con teclado.
- **Datos reales:** línea de tiempo de saldos, pagos, tasas, cargos y abonos reales.
- **Proyecciones:** abono, adelantar N, meta y comparación de hasta 3 escenarios con gráfica. La comparación muestra las métricas de `[ALG.METRICS]`: `interestSaved`, `monthsSaved`, `endDate`, `totalPaid` y `netSaving`.
- **Exportar:** menú en la tabla y en la comparación. Antes de la primera descarga de cada sesión, un aviso en español dice que el Excel, CSV o PDF no va cifrado y contiene datos financieros. Exportar el respaldo JSON sin cifrar muestra el mismo aviso y ofrece la variante cifrada.
- **Ajustes:** «último respaldo: hace N días», con recordatorio tras más de 30 días o más de 20 cambios. Import/export, Drive, frase y estado de persistencia.

**Reglas clave:**

- **El abono en celda edita solo el escenario activo.** Los eventos reales se registran en «Datos reales».
- Las filas con `k ≤ cutoffK` (`[ALG.PATHS.CUTOFF]`, sección 6) no aceptan abonos en celda.
- Los errores del motor se muestran en línea y en español.

**Simulador** (`public/`, solo `domain`; definición cerrada):

| Aspecto | Definición |
|---|---|
| Plantilla | `fha-gt@1` fija: perfil `FHA_GT_V1`, vencimiento `END_OF_MONTH` y seguros `0.01 + 0.0026` |
| Moneda y cargos | GTQ, sin cargos fijos |
| Entradas | Monto (`principal`); tasa de interés anual `i`, sin seguros, con la leyenda «+ 1.26 % seguros FHA» junto al campo; plazo en años (`termMonths = años × 12`, de 1 a 30 años) |
| Abono opcional | Monto, número de cuota `k` tras la cual se aplica (`1 ≤ k < termMonths`) y modo `REDUCE_TERM` o `REDUCE_INSTALLMENT`, sin comisión. El «mes» del formulario es ese número de cuota, no un mes calendario. Se aplica como `Prepayment` (`[ALG.PREPAY]`), con su tope. |
| `firstDueDate` | Último día del mes siguiente a la fecha local del navegador. Se calcula en el navegador al interactuar, nunca en el prerender, y llega al dominio como `LocalDate`. `public/` no puede usar el `Clock` de `data/`. |
| Resultados | Cuota nivelada `level`: capital, interés y seguros FHA, sin IUSI ni seguro de daños, que el banco suma aparte. Sin cargos fijos, el `total` de cada fila es igual a `level` salvo en la última cuota, así que no se muestra una «cuota total» distinta. También: desglose de la cuota 1 (interés, seguro y capital), intereses y seguros totales Σ(`interest` + `insurance`), número de cuotas y fecha de fin. Con abono: `interestSaved`, `monthsSaved`, la nueva fecha de fin y, con `REDUCE_INSTALLMENT`, la nueva `level`. |
| Prerender | El HTML prerenderizado trae el formulario sin resultados. Los resultados aparecen tras hidratar, al interactuar. |
| Errores | Una entrada vacía, cero, negativa o fuera de rango muestra un mensaje en español y oculta los resultados. |
| Comprobación | Con 500,000.00, 20 años y 7 %: `level` 4263.47. Un abono de 20,000.00 tras la cuota 12 da 220 cuotas e `interestSaved` 69172.80 con `REDUCE_TERM`, y `level` 4089.36 con `REDUCE_INSTALLMENT` (`[ALG.EXAMPLE]`). |

**Asistente** (tarjeta W4-07):

- **Paso 1:** plantilla, banco (`bank`, rótulo «Banco»), alias (`name`, rótulo «Alias») y moneda. El banco es texto libre, sin lista precargada en el código.
- **Paso 2, condiciones originales:**
  - `interestRate` es la **tasa original del contrato**, la vigente al desembolso. Los cambios posteriores, también los de un préstamo en curso, se registran como eventos `RateChange` en «Datos reales» (HU-10); nunca se edita esta tasa para reflejarlos.
  - Las filas de seguros (`insuranceRates`) y el perfil de redondeo (`roundingProfile`) llegan de la plantilla y son editables: cambiar el valor de una fila, agregar o quitar filas, y elegir `FHA_GT_V1` o `SIMPLE`. Lo que se guarda es la copia del préstamo; la plantilla no cambia.
  - Las tasas se escriben en porcentaje y se convierten a fracción **exacta**, con aritmética decimal sobre el string y sin pasar por `number`: `7.00` → `"0.07"`, `1.00` → `"0.01"`, `0.26` → `"0.0026"`.
  - `firstDueDate` debe cumplir la regla de `paymentDay` en su propio mes (`[ALG.DATES]`). Al cambiar `paymentDay`, el asistente re-deriva el día de `firstDueDate`; un par inválido es un error del formulario y no deja avanzar.
- **Paso 3, cargos fijos (`[ALG.TEMPLATES.FIXED]`):** el usuario escribe la cuota total que cobra el banco. El paso muestra la cuota nivelada `level` calculada con las condiciones del paso 2 y los cargos fijos = total − `level`, recalculados al instante. Los cargos se reparten en conceptos con nombre editables (por ejemplo IUSI y seguro de daños, más «Agregar concepto»), que se guardan como `fixedCharges`. Un resultado negativo es un error que sugiere revisar la tasa o el plazo.
- **Paso 4, ancla y validación, opcional:**
  - Pide el saldo que informa el banco y la cuota `k` a la que corresponde (saldo **antes** de pagarla), con un selector que muestra el vencimiento de cada cuota, más la fecha del aviso (`ReportedBalance.date`, informativa porque `k` manda). Se guarda como `ReportedBalance` con `installmentNumber = k`.
  - Muestra el saldo modelado de `k` (en el asistente, la apertura de `k` en el plan original), la diferencia `realDelta = reportado − modelado` y el semáforo con texto e ícono: «Coincide» (●), «Diferencia pequeña» (▲) o «Diferencia grande» (■).
  - En `AMBER` y `RED` muestra la causa sugerida antes de guardar, con estos textos:

    | Causa (`[ALG.VALIDATE]`) | Texto en la UI |
    |---|---|
    | `INSTALLMENT_MISALIGNMENT` | «El saldo parece corresponder a otra cuota (¿la anterior o la siguiente?)» |
    | `UNKNOWN` | «Diferencia sin causa identificada: revisa tasa, seguros o cargos» |

  - Con saldo, se guarda con `createWithAnchor` y el saldo queda como ancla. Sin saldo, por ejemplo en un préstamo nuevo, se guarda el préstamo solo con `create`, sin `ReportedBalance`; el chip queda en «Sin validar» (`UNVALIDATED`) y el saldo se registra después en «Datos reales».
- **Bloqueos:** solo bloquean los errores del formulario (campos vacíos o fuera de rango, par `firstDueDate`/`paymentDay` inválido, cargos fijos negativos) y los errores tipados del motor, como `NegativeAmortizationError` o `InvalidInputError`.
- **Semáforo (`[ALG.VALIDATE]`):** informa, no bloquea. Se puede guardar en `GREEN`, `AMBER` o `RED`.
- **Moneda:** se puede corregir en el detalle mientras el préstamo no tenga registros hijos (sección 7).

**Abono en celda:**

- Solo se editan filas con `k > cutoffK`. Las demás son de solo lectura.
- Escribir un monto crea un `Prepayment` hipotético en el escenario activo, con fecha igual al vencimiento de la fila `k`, modo `REDUCE_TERM` y sin comisión. El modo y la comisión se cambian después en «Proyecciones».
- Si el escenario activo ya tiene un único `Prepayment` en `k`, la celda edita su monto y conserva su id, su modo y su comisión. No se duplica.
- Vaciar la celda o escribir 0 elimina ese `Prepayment` con una marca de borrado.
- Si en `k` hay otros eventos hipotéticos (más de un abono, o un `AdvanceInstallments`), la celda es de solo lectura y remite a «Proyecciones».
- Sin escenario activo, la app **ofrece** usar el escenario «Borrador» del préstamo: activarlo o, si no existe, crearlo. Si el usuario acepta, guarda ahí el abono y lo anuncia con `aria-live`; si no, la celda no escribe nada.
- Al confirmar, la tabla pasa a la vista escenario. La celda nunca escribe un evento real.

**Valores derivados (definiciones cerradas).** Los calcula y los expone la fachada del motor (`LoanProjectionService`, W3-12), y las pantallas solo los muestran: dashboard (W4-06), detalle (W5-01), tabla (W5-02), datos reales (W5-03) y proyecciones (W5-04).

| Valor | Definición |
|---|---|
| `asOf` | `Clock.today()`: la fecha de hoy como `LocalDate`, en la hora local del dispositivo, del `Clock` inyectable de `data/`. El dominio nunca lee la fecha de hoy. |
| Cuota actual | La primera fila del camino real con vencimiento `≥ asOf`. Si no existe (`asOf` posterior a `realEndDate`), no hay cuota actual. Es el «mes actual» que resalta la tabla. |
| Saldo (`balance`) | El saldo de apertura de la cuota actual, o `0.00` si no hay cuota actual |
| `percentPaid` | `(principal − balance) / principal × 100`, calculado con decimales, redondeado mitad hacia arriba (`HALF_UP`) a 1 decimal y acotado entre 0 y 100. Es un redondeo de presentación de `data/`, no una regla del dominio. Mueve el medidor de la casa. |
| Próxima cuota | El `total` de la cuota actual, con cargos fijos; vacío si no hay cuota actual |
| `realEndDate` | La `endDate` del camino real (`[ALG.METRICS]`) |
| `activeScenarioEndDate` | La `endDate` del escenario activo, si tiene eventos. Se muestra aparte, como «fin con escenario»; nunca reemplaza a `realEndDate`. |
| Estado de validación | `GREEN`, `AMBER` o `RED` según `[ALG.VALIDATE]`, aplicado al `ReportedBalance` más reciente (mayor `k`; a igual `k`, mayor fecha y luego mayor id), con su Real Δ = reportado − modelado, donde lo modelado es el camino real conservando solo las anclas con `k' < k` (se excluyen todas las de la misma `k` y las posteriores). Sin saldos reportados, `UNVALIDATED` (rótulo «Sin validar»). |
| `cutoffK` | El corte de `[ALG.PATHS.CUTOFF]` sobre los registros reales sin borrar (sección 6). La tabla lo usa para dejar en solo lectura las filas con `k ≤ cutoffK`, y «Proyecciones» para rechazar hipotéticos en esas cuotas. |
| Marcas de pagada | Por cada cuota `k` del camino real, verdadero si existe un `ActualPayment` sin borrar con `installmentNumber = k` (`[ALG.ACTUAL]`). La tabla marca esas cuotas como pagadas. |
| Real Δ por ancla | Por cada `ReportedBalance` sin borrar: `realDelta = reportado − apertura modelada de su k`, con lo modelado definido como en «Estado de validación», más su semáforo y su causa (`[ALG.VALIDATE]`). Todas las anclas de una misma `k` se comparan contra la misma apertura. La tabla y «Datos reales» lo muestran. |
| Real Δ por componente | Por cada `ActualPayment` con desglose: real − proyectado por componente (capital, interés, seguros y cargos), contra la cuota `k` del camino real (`[ALG.ACTUAL]`, fase 4). Sin desglose no hay Real Δ por componente. |
| `suggestedPaid` | Verdadero si `asOf > realEndDate` o si el `ReportedBalance` más reciente es `0.00`. Solo sugiere: el estado `paid` lo cambia el usuario. |
| Totales por moneda | Por moneda, sobre los préstamos `active` sin borrar: Σ `balance` y Σ próxima cuota. Nunca se suman GTQ y USD. |

**Aviso de estimación:** el texto «Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.» aparece en el pie de la landing, bajo los resultados del simulador y en el pie del shell de `/app`. Una prueba lo busca en el HTML prerenderizado de `/` y otra en el shell.

**Accesibilidad:** WCAG AA, uso completo con teclado y resultados anunciados con `aria-live`. El semáforo lleva texto, la gráfica tiene una tabla alternativa y axe corre en ambos temas.

**Responsive:** la app está pensada para 1280 px. En el móvil se apila y la tabla se desplaza con las columnas iniciales fijas.

## 10. Seguridad y privacidad

| Amenaza | Mitigación | Residual |
|---|---|---|
| XSS y cadena de suministro (principal) | CSP por ruta y Trusted Types si GIS lo permite (spike W1-08, ADR-0021). Sin analítica, CDNs ni fuentes externas. Lockfile congelado y scripts de instalación bloqueados. Audit y Renovate. | Un XSS en `/app` podría leer IndexedDB y usar el token vigente |
| Acceso al dispositivo | Cifrado del disco (FileVault) y bloqueo de sesión | Una sesión abierta expone los datos |
| Robo del token de Drive | Token solo en memoria, scope mínimo, vida de ~1 h y revocación | Ventana de 1 h si hay XSS |
| Cuenta de Google comprometida | Copia cifrada (AES-GCM, PBKDF2 600k) | Una frase débil se puede atacar offline |
| Archivos exportados | Aviso antes de descargar (W5-06 para Excel, CSV y PDF; W5-07 para el JSON sin cifrar) y cifrado opcional del JSON | Excel, CSV y PDF van en claro |
| Filtración en el repo | Higiene (abajo) | Error humano |

**CSP por ruta:**

- `/`, `/privacidad` y 404 solo permiten `connect-src 'self'`, sin orígenes externos, y declaran `frame-ancestors`, `object-src` y `base-uri` en `'none'`.
- `/app/**` agrega solo los orígenes de Google que fije ADR-0021.
- Nunca se usan `'unsafe-inline'` ni `'unsafe-eval'`.
- Se agregan HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy`.

**Higiene del repo público:**

- gitleaks en lefthook y en CI, sobre toda la historia.
- `.gitignore` defensivo desde el commit inicial; los patrones están en ADR-0015, punto 3.
- Un hook opcional con una lista de términos prohibidos guardada **fuera** del repo.
- Fixtures con `synthetic: true` y commits con correo noreply.
- Secret scanning y push protection.
- El ID de cliente se inyecta al compilar.
- Las comparaciones privadas solo imprimen tres líneas: si todas las filas coinciden, cuántas difieren y la diferencia máxima. Nunca imprimen el total de filas, ni siquiera en la terminal. La bitácora no registra el total de filas ni el plazo de ningún préstamo, y la salida de terminal de las herramientas privadas no sale de la terminal (ADR-0014; ADR-0015, punto 13).

**Página de privacidad:** explica qué datos hay y dónde, y declara que no hay servidor, analítica ni cookies de rastreo. Describe el scope de Drive y cómo borrar todo, incluido «Administrar aplicaciones» → «Borrar datos ocultos de la aplicación». La configuración de Google Cloud se hace una sola vez y cuesta US$0 (W3-18).

**Límites honestos:**

- No hay defensa total contra XSS.
- Safari puede borrar datos.
- LWW puede perder ediciones simultáneas.
- Un dispositivo ausente más de 90 días puede resucitar registros purgados.
- Las cifras son estimaciones; manda el banco. No es asesoría financiera.

## 11. Estrategia de pruebas y calidad

**Cadena de confianza del cálculo:**

1. `algorithm.md`, con un ejemplo sintético por regla (W0-02).
2. Un oráculo Python escrito solo desde ese documento por otro linaje de agentes, en un sparse-checkout.
3. Validación privada de Opus contra una tabla real, fuera del repo y solo con autorización explícita del dueño. Sin ella, se sigue el plan alternativo de ADR-0014.
4. Préstamos sintéticos sembrados: unos 15 en el perfil `core` y unos 40 en `full`, en Q150k–Q2.5M y un rango en USD, a 5.4–9.8 % y 5–30 años, con cambios de tasa, todos los abonos y la última fila. La composición exacta vive en `tools/oracle/FORMAT.md`.
5. CI los regenera y compara. El motor TS debe coincidir al centavo mediante el arnés de conformidad congelado.

| Capa | Qué se prueba |
|---|---|
| Dominio (Vitest + fast-check) | El capital suma el principal. El saldo nunca es negativo ni sube. Adelantar N reduce exactamente N. Un abono nunca aumenta el interés. La búsqueda por meta da el mínimo y devuelve `ALREADY_MET`, `FOUND` o `INFEASIBLE`, sin lanzar excepción ante una meta inviable (`[ALG.GOAL]`). La validación da `GREEN`, `AMBER` o `RED` en cada umbral de `[ALG.VALIDATE]`. |
| Esquema y persistencia | Migraciones por versión. Suite de contrato en memoria y Dexie (fake-indexeddb). |
| Sync y cifrado | Merge conmutativo e idempotente con marcas de borrado. Ida y vuelta, frase incorrecta y manipulación. `KeyStore` en Chromium y WebKit. |
| Exportación y componentes | Snapshots, lectura de bytes y specs de contrato `cc-*` |
| E2E (Playwright 1.63) | Build de producción con cabeceras reales, en Chromium y WebKit: simulador sin red, alta, Real Δ, escenarios, exportes, respaldo, sync simulado, aviso de Safari y axe |
| Borde y bundle | `edge:check` y presupuestos: la landing no carga Excel, PDF, Chart ni Google |

La cobertura debe ser al menos del 95 % en `domain`, `schema` y `sync`. El Drive real se prueba a mano con un checklist (W6-04, W7-01).

**Definición de terminado:** TDD para la lógica, CI en verde, `owns` respetados, sin dependencias nuevas, ADR por cada decisión nueva, solo datos sintéticos, revisión de Opus y merge en orden de dependencias.

## 12. Entrega

El plan aprobado tiene 72 tarjetas en 8 olas: 58 Sonnet y 14 Opus. El detalle está en [`waves.md`](../plan/waves.md), [`plan.json`](../plan/plan.json), [`cards/`](../plan/cards/) y [`README.md`](../plan/README.md) de `docs/plan/`.

| Ola | Objetivo | Tarjetas (Opus) |
|---|---|---|
| W0 | Cimientos y contratos congelados | 6 (6) |
| W1 | Probar el núcleo difícil | 10 (1) |
| W2 | Eventos, sync, seguridad de borde y primera prueba del oráculo | 13 (2) |
| W3 | Corrección del motor y cimientos de la app | 18 (3) |
| W4 | Motor conforme, superficie pública y primeras pantallas | 12 (1) |
| W5 | Pantallas restantes | 8 (0) |
| W6 | Recorridos, barridos y documentación | 4 (0) |
| W7 | Release v1.0.0 | 1 (1) |

**Hitos:** tras W2, el motor coincide con el oráculo. Tras W4 hay una primera versión publicable (landing, simulador, dashboard y asistente), y tras W5 están todas las pantallas. W7 publica la v1.0.0.

**Ejecución:** Opus congela los contratos en W0. Cada tarjeta Sonnet trabaja en `.worktrees/<ID>`, solo dentro de sus `owns`, con unas 6 en paralelo como máximo. El oráculo y el motor van en linajes aislados, y Opus revisa y hace merge en orden de dependencias.

**Acciones del dueño:**

- Comprar el dominio.
- Crear el repo y activar secret scanning y push protection antes del primer push público (W0-06).
- Autorizar la carpeta privada antes de W2-01.
- Aprobar la paleta cuando W0-05 la presente.
- Crear el token de Cloudflare, la ruta del subdominio y las variables de GitHub (W3-17).
- Crear el cliente OAuth y publicar la pantalla de consentimiento (W3-18).
- Ejecutar el checklist de Drive y firmar el release (W7-01).

## 13. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Motor y oráculo malinterpretan igual el algoritmo | Ejemplos por regla, linajes separados y validación privada en W2-01, W3-01 y W4-01 si el dueño la autoriza |
| Divergencia decimal entre TS y Python | Contexto de 34 dígitos congelado; Opus implementa `money/` |
| GIS incompatible con Trusted Types o con una CSP estricta | Spike W1-08 y ADR-0021, con dos alternativas: TT en modo report-only o hashes posbuild |
| Safari borra datos (ITP, 7 días sin visitas) | Aviso, recordatorios, `persist()` y Drive; el riesgo se mitiga pero no se elimina |
| Fuga de datos reales al repo | Hooks antes del primer fixture, push protection desde W0 y comparaciones que solo imprimen conteos |
| Pérdida de la frase | Clave por dispositivo, gestor de contraseñas y respaldo JSON |
| Concurrencia en Drive o reloj desfasado | Comprobación previa, `cuotascasa.prev.json`, sellado monótono y ADR-0024 |
| Consentimiento en modo Testing | Publicar en producción con privacidad y dominio verificado |
| Bancos con redondeos o políticas distintos | Perfiles de redondeo, tres políticas de tasa, cuota del banco y re-anclaje |
| Stack de vanguardia | Toolchain y patrones congelados en W0, versiones exactas y Renovate |
| Revisión de Opus como cuello de botella | Tope de 6 tarjetas en paralelo y criterios verificables en CI |

## 14. Decisiones (ADRs)

El índice está en [`docs/adr/README.md`](../adr/README.md) y los archivos siguen el patrón `docs/adr/NNNN-*.md`. Los decisores son el dueño del proyecto y Claude (Opus), con fecha 2026-10-04.

| ADR | Título | Estado |
|---|---|---|
| 0001 | Arquitectura v1 local-first sin backend | Aceptado |
| 0002 | Hosting estático en Cloudflare Workers en un subdominio | Aceptado |
| 0003 | Cálculo en el cliente con dominio TypeScript puro y aritmética decimal | Aceptado |
| 0004 | Algoritmo 'FHA Guatemala v1' y perfiles de redondeo | Aceptado |
| 0005 | Modelo de datos: solo entradas del usuario y campos para sincronizar | Aceptado |
| 0006 | Persistencia: puerto de repositorios, Dexie y adaptador en memoria con suite de contrato | Aceptado |
| 0007 | Formato de respaldo JSON versionado, migraciones e importación segura | Aceptado |
| 0008 | Sincronización con Google Drive (appDataFolder, modelo de token de GIS) | Aceptado |
| 0009 | Cifrado con frase (AES-256-GCM + PBKDF2) y clave no exportable por dispositivo | Aceptado |
| 0010 | Monorepo pnpm, paquetes y reglas de dependencia | Aceptado |
| 0011 | Angular 22 y renderizado híbrido estático | Aceptado |
| 0012 | Sistema de diseño y dirección visual | Aceptado |
| 0013 | Exportación en el cliente (Excel, CSV, PDF) | Aceptado |
| 0014 | Estrategia de pruebas y cadena de confianza del cálculo | Aceptado |
| 0015 | Higiene de repositorio público y datos sintéticos | Aceptado |
| 0016 | Seguridad en el cliente: CSP por ruta, dependencias y amenazas residuales | Aceptado |
| 0017 | PWA, navegadores soportados y durabilidad del almacenamiento | Aceptado |
| 0018 | Convenciones de idioma y nomenclatura | Aceptado |
| 0019 | Proceso de desarrollo con agentes | Aceptado |
| 0020 | Fase multiusuario diferida (diseño Supabase archivado) | Diferido |
| [0021](../adr/0021-csp-trusted-types-gis.md) | CSP, Trusted Types y GIS | Reservado (W2-02) |
| [0022](../adr/0022-cloudflare-static-routing.md) | Enrutamiento estático en Cloudflare | Reservado (W1-09) |
| [0023](../adr/0023-pwa-registration-scope.md) | Alcance de registro de la PWA | Reservado (W2-02) |
| [0024](../adr/0024-sync-merge-order.md) | Orden del merge de sincronización | Reservado (W0-04) |

## 15. Bitácora de decisiones del brainstorming

Todas las decisiones son del 2026-10-04, en orden cronológico.

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿MFA contra bots? | MFA protege cuentas y los bots se frenan con invitación o CAPTCHA. Como la v1 no tiene cuentas, se difiere. |
| 2 | ¿Datos reales? | Correos, desglose, tabla oficial y contratos. Las tasas cambian, así que se guarda un historial con vigencias. |
| 3 | ¿Compartir? | Privado. La v1 comparte por PDF o Excel; compartir en vivo se difiere. |
| 4 | ¿Tipos de abono? | Único, adelantar N y meta. Los recurrentes van a la fase 2. |
| 5 | ¿Préstamos en curso? | Condiciones originales más el saldo actual como ancla. |
| 6 | ¿Dispositivo? | Escritorio primero. |
| 7 | ¿Exportar y capturar? | Excel, CSV y PDF. No se leen correos. El respaldo JSON pasa a ser núcleo. |
| 8 | ¿Configuración del préstamo? | Plantillas editables («FHA Guatemala v1»: 1 % + 0.26 %). Los cargos fijos son el total del banco menos la cuota nivelada, y se validan contra un saldo real. La calibración va a la fase 2. |
| 9 | ¿Dirección visual? | «Libreta bancaria», «tu casa se va llenando» y edición en celda. |
| 10 | ¿Landing? | Presentación y simulador sin cuenta. |
| 11 | ¿Admin, invitaciones, MFA, sesión? | Diseño Supabase archivado (ADR-0020): el admin es el dueño, aprueba invitaciones y nunca ve finanzas. TOTP obligatorio; la sesión cierra con el navegador o tras 30 min inactiva; hasta US$5/mes. |
| 12 | ¿Publicación? | En un subdominio del dominio del dueño. |
| 13 | ¿Repo? | Público, solo con datos sintéticos. |
| 14 | ¿Backend? | Ganó Supabase + Cloudflare. Firebase y Appwrite se rechazan. |
| 15 | ¿Para qué una base de datos si solo hay un usuario? | Pivote a local-first. |
| 16 | ¿Nube personal en v1? | Google Drive. |
| 17 | ¿Arquitectura? | Aprobada. |
| 18 | ¿Cifrar la copia en Drive? | Sí, con frase. |
| 19 | ¿Idioma? | Código en inglés, UI es-GT y docs en español. |
| 20 | ¿Plan? | 72 tarjetas en 8 olas. |
| 21 | ¿Carpeta privada del oráculo? | Pendiente. |

## 16. Pendientes conocidos

- **Carpeta privada:** falta autorizar `~/.cuotascasa-private/`, que se necesita en W2-01. Sin ella, los gates W2-01, W3-01 y W4-01 siguen el único plan alternativo (ADR-0014 y `docs/plan/README.md`, sección 6): validan solo con ejemplos sintéticos, la bitácora dice «validación privada: no autorizada» y el riesgo residual queda anotado. Solo cuenta una autorización explícita del dueño que nombre la carpeta o la validación privada.
- **Spike W1-08:** su resultado decide ADR-0021 (en W2-02). Queda pendiente probar el popup real de consentimiento en localhost.
- **ADRs por escribir:** ADR-0022 (W1-09), ADR-0023 (W2-02) y ADR-0024 (W0-04).
- **Pendientes de W0-02:** los valores de «Hipotecario simple». Los umbrales del semáforo y las causas que emite v1 ya están en `[ALG.VALIDATE]`.
- **Pendiente de W0-05:** la aprobación del dueño de la paleta propuesta en `docs/discovery/direccion-visual.md`.
- **Pendiente de W3-05:** la elección final de fuentes.
- **Sin verificar:** la exención de «Agregar al Dock» frente a ITP y la ausencia de compare-and-set en Drive.
- **Fase multiusuario:** requiere un spike del trigger `BEFORE INSERT` sobre `auth.users`.
- **Acciones del dueño:** ver la sección 12.
