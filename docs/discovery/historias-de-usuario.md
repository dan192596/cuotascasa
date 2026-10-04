# Historias de usuario (v1)

Fecha: 2026-10-04 · Requisitos: [`../plan/traceability.md`](../plan/traceability.md)

**Rol de este documento:** fija el comportamiento esperado de cada pantalla con criterios de aceptación. No define el
cálculo ni los contratos.

**Precedencia:** `docs/algorithm.md` > ADR aceptado > spec (`docs/specs/`) > estas historias > texto de la tarjeta.
Ante una contradicción, el agente no elige: se detiene y escala citando ambas fuentes (ADR-0019).

**Actores**

- **Dueño:** cualquier persona que usa la app en su propio navegador, con sus propios datos. En v1 hay un solo tipo de
  usuario: los amigos que la usen ocasionalmente son "dueños" de su navegador.
- **Visitante:** quien llega a la landing pública sin haber guardado nada.

Los montos de los ejemplos son los sintéticos de [`../algorithm.md`](../algorithm.md) (`[ALG.EXAMPLE]`).

---

## Superficie pública

### HU-01 · Simular sin cuenta

**Como** visitante **quiero** calcular una cuota FHA sin crear cuenta ni guardar nada **para** entender cuánto pagaría y
conocer la app.

- En `/`, con la plantilla `fha-gt@1` (seguro 1 % + desgravamen 0.26 %, perfil `FHA_GT_V1`, fin de mes), ingreso monto,
  tasa anual y plazo en años, y veo la cuota nivelada y el desglose de la primera cuota (interés, seguro y capital). El
  simulador no pide cargos fijos.
- Con Q 500,000.00, 20 años y 7 %, la cuota nivelada es Q 4,263.47 y la cuota 1 se reparte en interés Q 2,916.67,
  seguro Q 525.00 y capital Q 821.80.
- Puedo probar un abono después de la cuota número `k`, con reducir plazo o reducir cuota, y ver el interés y los meses
  ahorrados y la nueva fecha de fin. La definición cerrada del simulador está en la spec, sección 9.
- Bajo los resultados veo «Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.».
- La página no hace solicitudes de red ni escribe almacenamiento (lo verifica un e2e).
- Se sirve prerenderizada desde el subdominio, y su bundle no incluye Excel, PDF, gráficas ni código de Google.
- Contraste AA, operable con teclado; el resultado se anuncia a lectores de pantalla.

Trazabilidad: R1, R3, R21, R25

### HU-02 · Saber qué pasa con mis datos

**Como** dueño **quiero** una página pública que explique qué datos guarda la app, dónde y cómo borrarlos **para**
confiar en ella. Google además la exige para publicar la pantalla de consentimiento.

- `/privacidad` es pública, prerenderizada y está enlazada desde la landing y desde la app.
- Explica que los datos viven en el navegador y, si el dueño quiere, en una copia cifrada en su Drive; que no hay
  servidor, analítica ni cookies de rastreo.
- Explica cómo borrar los datos locales y los de Drive (*Administrar apps → Borrar datos ocultos de la app*).

Trazabilidad: R2

---

## Alta y gestión de préstamos

### HU-03 · Crear un préstamo con plantilla

**Como** dueño **quiero** crear un préstamo a partir de la plantilla "FHA Guatemala v1" **para** no escribir a mano las
primas ni el redondeo de mi banco.

- Asistente de 4 pasos: plantilla y banco → condiciones originales → cargos fijos → ancla y validación.
- La plantilla precarga seguro FHA 1 %, desgravamen 0.26 %, perfil `FHA_GT_V1` y vencimiento a fin de mes; todo es
  editable. Puedo cambiar, agregar o quitar filas de seguros y elegir el perfil de redondeo (`FHA_GT_V1` o `SIMPLE`).
- Pide monto, plazo, **tasa original del contrato (al desembolso)**, tipo de tasa (fija o variable), día de pago, fecha
  de la primera cuota, fecha de desembolso (informativa), alias, banco y moneda (GTQ o USD). El banco es texto libre. La
  moneda se puede corregir mientras el préstamo no tenga eventos, saldos, pagos ni escenarios; después ya no se puede
  cambiar.
- Las tasas se escriben en porcentaje (7.00 %) y se guardan como fracción decimal exacta (`"0.07"`).
- La fecha de la primera cuota debe coincidir con el día de pago (`[ALG.DATES]`): al cambiar el día de pago, el
  asistente ajusta el día de esa fecha.
- Los cambios de tasa posteriores al desembolso, también los de un préstamo en curso, se registran como eventos
  `RateChange` con fecha (HU-10), no cambiando la tasa original.
- El préstamo guarda una copia de los valores y la referencia `{id, versión}` de la plantilla; cambiar la plantilla
  después no lo altera.
- Un paso inválido no deja avanzar y muestra mensajes en español; regresar conserva lo escrito.

Trazabilidad: R8, R9, R14, R27

### HU-04 · Registrar un préstamo en curso

**Como** dueño **quiero** dar de alta un préstamo que ya llevo años pagando usando su saldo real actual como punto de
partida **para** no reconstruir todo su historial.

- El paso 4 pide un saldo informado por el banco y la cuota a la que corresponde (saldo antes de pagarla). Es
  opcional: si lo dejo vacío, el préstamo se guarda sin ancla, con el chip «Sin validar».
- Muestra la diferencia entre lo modelado y el saldo real con un semáforo verde, ámbar o rojo, con texto e ícono
  («Coincide», «Diferencia pequeña», «Diferencia grande»).
- En ámbar o rojo muestra la causa sugerida con estos textos:
  - `INSTALLMENT_MISALIGNMENT`: «El saldo parece corresponder a otra cuota (¿la anterior o la siguiente?)».
  - `UNKNOWN`: «Diferencia sin causa identificada: revisa tasa, seguros o cargos».
- Puedo guardar aun en ámbar o rojo: el semáforo informa y no bloquea. El saldo queda como ancla del camino real.
- Si el guardado falla, no se escribe nada.

Trazabilidad: R4, R7, R14

### HU-05 · Obtener los cargos fijos desde la cuota del banco

**Como** dueño **quiero** escribir la cuota total que cobra el banco y que la app calcule los cargos fijos **para** no
adivinar el IUSI ni el seguro de daños.

- Cargos fijos = cuota total − cuota nivelada, recalculado al instante. Con un total de Q 4,658.47 y una nivelada de
  Q 4,263.47, resultan Q 395.00.
- Puedo repartirlos en conceptos con nombre (IUSI, seguro de daños) y editarlos.
- Un resultado negativo muestra un error que sugiere revisar la tasa o el plazo.

Trazabilidad: R3, R8

### HU-06 · Ver todos mis préstamos de un vistazo

**Como** dueño **quiero** ver mis préstamos en una sola pantalla, con cuánto de la casa ya es mío, **para** saber cómo voy
sin abrir cada uno.

- Una tarjeta por préstamo con saldo, próxima cuota, fecha de fin y el medidor "tu casa se va llenando" (porcentaje del
  capital pagado). Esos valores, el chip de validación y la sugerencia de «pagado» siguen las definiciones cerradas de la
  spec (sección 9, «Valores derivados»).
- Totales separados por moneda: nunca se suman quetzales con dólares.
- Filtro por estado: activo, pagado, archivado.
- Estado de la sincronización y del último respaldo.
- Sin préstamos, muestra las opciones de primer uso: crear un préstamo, restaurar un respaldo o conectar Drive.

Trazabilidad: R13, R21, R27, R28

### HU-07 · Consultar la tabla de amortización

**Como** dueño **quiero** ver la tabla de amortización del plan original, del camino real y del escenario activo **para**
entender en qué punto del préstamo estoy.

- Columnas: cuota, vencimiento, saldo inicial, interés, seguro, capital, cargos fijos, total y saldo final.
- Selector de vista: plan original, real o escenario.
- Encabezado fijo, fila del mes actual resaltada y subtotales anuales de capital por año calendario.
- Columna Real Δ donde hay datos reales.
- Navegable con teclado; en móvil la tabla se desplaza con las primeras columnas fijas.

Trazabilidad: R3, R5, R15

### HU-08 · Cambiar el estado de un préstamo

**Como** dueño **quiero** editar, marcar como pagado, archivar o eliminar un préstamo **para** mantener ordenado el
dashboard.

- Estados: activo, pagado y archivado; un préstamo archivado se puede desarchivar.
- La edición usa los mismos pasos del asistente.
- Eliminar pide confirmación y se sincroniza como marca de borrado.

Trazabilidad: R14, R28

---

## Datos reales

### HU-09 · Registrar el saldo que informa el banco

**Como** dueño **quiero** registrar el saldo que me informa el banco **para** ver si lo proyectado coincide con lo real y
corregir la proyección.

- Formulario corto: fecha, saldo y cuota a la que aplica (saldo antes de pagarla). La cuota es opcional: si la dejo
  vacía, aplica a la primera cuota con vencimiento igual o posterior a la fecha (`[ALG.EVENTS.ANCHOR]`).
- Puedo anotar la cuota total y la tasa que informó el banco; son informativas y no cambian el cálculo (un cambio de
  tasa se registra en HU-10).
- Se muestra Real Δ = saldo reportado − saldo modelado, con el semáforo de `[ALG.VALIDATE]`: verde si coincide, ámbar si
  es pequeña y rojo si es grande.
- El camino real se re-ancla: las cuotas siguientes parten del saldo reportado, sin cambiar cuota nivelada ni plazo.
- El registro aparece en la línea de tiempo de datos reales y se puede editar o eliminar.

Trazabilidad: R4, R16

### HU-10 · Registrar cambios de tasa y de cargos fijos

**Como** dueño **quiero** registrar cuándo el banco cambia mi tasa o mis cargos fijos **para** que la proyección siga al
préstamo real.

- Cambio de tasa con fecha de vigencia, nueva tasa y política: recalcular la cuota manteniendo el plazo (por defecto),
  mantener la cuota y ajustar el plazo, o usar la cuota que informó el banco.
- Si la cuota ya no cubre el cargo financiero, se muestra un error explicado (amortización negativa) y no se guarda.
- Cambio de cargos fijos con fecha: lleva la lista completa de cargos desde la cuota correspondiente; los anteriores
  dejan de regir, incluso los de fecha futura (`[ALG.FIXEDCHANGE]`).
- Si el préstamo es de tasa fija, registrar un cambio de tasa muestra una advertencia, pero se puede guardar.
- El historial de tasas se ve en la línea de tiempo.

Trazabilidad: R4, R16

### HU-11 · Registrar un pago real

**Como** dueño **quiero** registrar cada pago que hice, con su desglose si lo tengo, **para** comparar componente por
componente con lo proyectado.

- Fecha, cuota a la que aplica y monto obligatorios; capital, interés, seguro y cargos son opcionales.
- La app sugiere la cuota a partir de la fecha (`[ALG.EVENTS.ANCHOR]`) y la puedo cambiar; el esquema la exige.
- La cuota queda marcada como pagada en la tabla.
- Con desglose, se muestra Real Δ por componente.
- Un pago real no altera la proyección; solo los saldos reportados re-anclan.

Trazabilidad: R4, R16

### HU-12 · Registrar un abono que ya hice

**Como** dueño **quiero** registrar un abono a capital ya realizado, indicando si redujo plazo o cuota, **para** que el
camino real lo refleje.

- Fecha, monto, modo (reducir plazo o reducir cuota) y comisión opcional, fija o porcentual.
- Se aplica justo después de pagar su cuota: la primera con vencimiento igual o posterior a la fecha del abono
  (`[ALG.EVENTS.ANCHOR]`). Con día de pago 15, un abono del día 20 queda en la cuota del 15 del mes siguiente. Un abono
  mayor que el saldo se recorta y liquida el préstamo.
- La comisión no reduce el saldo y se suma al total pagado.
- Los abonos reales se registran aquí; los hipotéticos viven en los escenarios.

Trazabilidad: R4, R16

---

## Proyecciones

### HU-13 · Simular un abono en un escenario

**Como** dueño **quiero** simular un abono futuro y comparar reducir plazo contra reducir cuota **para** decidir qué le
pido al banco.

- Escenarios con nombre, guardados, y uno activo por préstamo.
- Un abono de Q 20,000.00 después de la cuota 12 da:
  - reducir plazo: 220 cuotas y Q 69,172.80 de interés y seguro ahorrados;
  - reducir cuota: nueva cuota nivelada de Q 4,089.36 y Q 19,694.91 ahorrados.
- Métricas: interés ahorrado, meses ahorrados, fecha de fin, total pagado y ahorro neto.
- Un evento hipotético en una cuota `k ≤ cutoffK` da error de validación. Según `[ALG.PATHS.CUTOFF]`, `cutoffK` es la
  mayor cuota con un saldo reportado, un pago real, un abono real o un adelanto de cuotas real; los cambios de tasa y
  de cargos reales no lo mueven.

Trazabilidad: R4, R5, R17

### HU-14 · Adelantar N cuotas

**Como** dueño **quiero** adelantar N cuotas **para** saber exactamente cuánto abonar y cuántos meses me ahorro.

- El monto es la suma del capital de las N cuotas siguientes del calendario vigente.
- El plazo baja exactamente N cuotas. Con N = 6 después de la cuota 12, el abono es de Q 5,446.87 y quedan 234 cuotas.

Trazabilidad: R4, R17

### HU-15 · Calcular el abono para una meta

**Como** dueño **quiero** saber cuánto abonar para terminar antes de una fecha o para bajar mi cuota a un monto **para**
planificar con una meta concreta.

- Dos metas: terminar a más tardar en una fecha (reduce plazo) o una cuota total máxima (reduce cuota).
- Devuelve el monto mínimo al centavo: con un centavo menos ya no se cumple.
- Si la meta ya se cumple, informa monto 0 (`ALREADY_MET`); si es imposible, explica por qué y muestra el monto que
  liquidaría el préstamo (`INFEASIBLE`). Una meta imposible no es un error (`[ALG.GOAL]`).
- Puedo convertir el resultado en un abono del escenario.

Trazabilidad: R6, R17

### HU-16 · Comparar escenarios

**Como** dueño **quiero** comparar hasta tres escenarios lado a lado, con una gráfica del saldo, **para** elegir la mejor
estrategia.

- Hasta 3 escenarios contra la base (el camino real sin eventos hipotéticos).
- Tabla de métricas con sus diferencias.
- Gráfica del saldo en el tiempo, cargada solo al abrir la comparación.

Trazabilidad: R5, R17

### HU-17 · Probar un abono desde la tabla

**Como** dueño **quiero** escribir un abono directamente en una fila de la tabla, como en una hoja de cálculo, **para**
probar ideas rápido.

- Editar la celda de abono crea o cambia un abono del **escenario activo**, nunca de los datos reales.
- El abono nuevo toma la fecha de vencimiento de la fila, reduce plazo y no lleva comisión; el modo y la comisión se
  cambian en «Proyecciones».
- Si la fila ya tiene un abono hipotético, la celda cambia su monto en lugar de crear otro; vaciarla o escribir 0 lo
  elimina.
- Solo se editan las filas con `k > cutoffK` (`[ALG.PATHS.CUTOFF]`).
- La tabla y las métricas se recalculan al confirmar.
- Si no hay escenario activo, la app **ofrece** usar el escenario «Borrador» (activarlo o, si no existe, crearlo). Si
  acepto, guarda ahí el abono y lo anuncia; si no, no se escribe nada.

Trazabilidad: R15, R17

---

## Datos fuera de la app

### HU-18 · Exportar a Excel, CSV y PDF

**Como** dueño **quiero** exportar la tabla y la comparación a Excel, CSV y PDF **para** compartirlas o archivarlas.

- Menú de exportación en la tabla y en la comparación.
- Excel con números como números y formato de moneda; CSV en UTF-8 con BOM; PDF con encabezado repetido en cada página.
- Montos en la moneda del préstamo (`Q` o `US$`) y fechas `dd/mm/aaaa`.
- Las librerías se cargan solo al exportar.
- Antes de la primera descarga de cada sesión, un aviso indica que el archivo no va cifrado y contiene datos
  financieros.

Trazabilidad: R19, R27

### HU-19 · Respaldar y restaurar

**Como** dueño **quiero** exportar e importar un respaldo completo, cifrado si lo deseo, **para** no perder mis datos y
moverlos entre navegadores.

- El respaldo es un JSON versionado con préstamos, eventos, saldos, pagos, escenarios y ajustes.
- Cifrado opcional con frase. Exportar sin cifrar muestra un aviso y ofrece la variante cifrada.
- Importar valida, migra versiones anteriores y muestra una vista previa con conteos antes de reemplazar.
- Antes de reemplazar se toma una instantánea y puedo deshacer.
- Un archivo inválido o una frase incorrecta no cambian nada y muestran un error claro.

Trazabilidad: R9, R11, R18

### HU-20 · Enterarme si mis datos corren riesgo

**Como** dueño **quiero** que la app me avise cuando mis datos pueden borrarse **para** respaldar a tiempo.

- En el primer guardado, la app pide almacenamiento persistente; Ajustes muestra si se concedió.
- Ajustes muestra "último respaldo: hace N días".
- Recordatorio cuando pasan más de 30 días o hay más de 20 cambios sin respaldo.
- En Safari fuera del modo app, un banner persistente explica el borrado tras 7 días sin visitas y recomienda Chrome o
  Edge con la app instalada, o conectar Drive.

Trazabilidad: R10, R18

### HU-21 · Sincronizar con mi Google Drive

**Como** dueño **quiero** sincronizar mis datos con mi Google Drive, cifrados con una frase, **para** tenerlos a salvo y
usarlos en otro dispositivo.

- "Conectar Drive" carga el código de Google solo en ese momento y pide únicamente el permiso de datos de la app.
- La primera vez defino una frase; la copia en Drive va cifrada y Google no puede leerla.
- "Sincronizar" combina por registro, guarda localmente, sube y conserva la copia anterior.
- Sin conexión se ve "cambios sin sincronizar" y la app sigue funcionando.
- Una checklist manual documenta la prueba con Drive real.

Trazabilidad: R12, R18, R26

### HU-22 · Controlar la frase y la conexión

**Como** dueño **quiero** que la frase no se me pida en cada visita, poder cambiarla y poder desconectar Drive **para**
tener control sin fricción.

- La frase se pide una vez por dispositivo; después se usa una clave no exportable guardada en el navegador.
- Puedo cambiar la frase desde cualquier dispositivo que tenga la clave; la copia se vuelve a cifrar.
- Una frase incorrecta muestra un error claro y no cambia nada.
- "Desconectar Drive" revoca el acceso y conserva los datos locales.
- La app recomienda guardar la frase en un gestor de contraseñas y explica que olvidarla solo causa pérdida si además se
  pierden todos los dispositivos.

Trazabilidad: R12, R18

### HU-23 · Usar la app instalada y sin conexión

**Como** dueño **quiero** instalar la app y usarla sin conexión **para** consultarla en cualquier momento y reducir el
riesgo de borrado.

- Se instala como PWA desde `/app`; el service worker nunca se registra en `/`.
- Funciona sin conexión después de la primera visita.
- Cuando hay una versión nueva, un aviso ofrece actualizar.
- Una ruta desconocida muestra una página 404.

Trazabilidad: R20, R25

---

## Confianza

### HU-24 · Mostrar el proyecto sin exponerme

**Como** dueño **quiero** que la app y su repositorio público no expongan mis datos ni secretos **para** usarlo como
portafolio sin riesgo.

- CSP por ruta: `/` sin conexiones externas y `/app` solo hacia Google; sin analítica, CDNs ni fuentes externas.
- Dependencias fijadas, lockfile congelado, scripts de instalación bloqueados, auditoría y Renovate.
- Repositorio:
  - gitleaks en los hooks y en CI;
  - `.gitignore` para PDF, Excel, CSV, respaldos y `.env`;
  - fixtures sintéticos marcados `synthetic: true`;
  - correo noreply en los commits y *push protection* activa.
- El ID de cliente de Google se inyecta al compilar.
- Modelo de amenazas documentado.

Trazabilidad: R22, R23, R26

### HU-25 · Confiar en los números

**Como** dueño **quiero** que el motor esté verificado contra un cálculo independiente **para** confiar en los números al
decidir un abono.

- `algorithm.md` es la única fuente; el motor TypeScript y el oráculo Python los escriben linajes de agentes distintos.
- Unos 40 préstamos sintéticos (Q 150,000 a Q 2,500,000; 5.5 % a 9.75 %; 5 a 30 años), con cambios de tasa y todos los
  tipos de abono: el motor coincide al centavo.
- Propiedades:
  - el capital suma el monto;
  - el saldo nunca es negativo ni sube;
  - adelantar N reduce el plazo exactamente en N;
  - un abono nunca aumenta el interés total;
  - el resultado de la búsqueda por meta es mínimo al centavo.
- CI regenera los fixtures y compara en cada cambio.
- La validación contra datos reales es privada y no deja rastro en el repositorio.

Trazabilidad: R3, R24

---

## Requisitos → historias

| Requisito | Historias |
|---|---|
| R1 Landing y simulador público | HU-01 |
| R2 Privacidad | HU-02 |
| R3 Núcleo del motor | HU-01, HU-05, HU-07, HU-25 |
| R4 Línea de tiempo de eventos | HU-04, HU-09, HU-10, HU-11, HU-12, HU-13, HU-14 |
| R5 Tres caminos y métricas | HU-07, HU-13, HU-16 |
| R6 Búsqueda por meta | HU-15 |
| R7 Validación de plantilla | HU-04 |
| R8 Plantillas | HU-03, HU-05 |
| R9 Modelo de datos | HU-03, HU-19 |
| R10 Persistencia y `persist()` | HU-20 |
| R11 Respaldo JSON | HU-19 |
| R12 Sincronización con Drive | HU-21, HU-22 |
| R13 Dashboard | HU-06 |
| R14 Asistente, edición, archivar y eliminar | HU-03, HU-04, HU-08 |
| R15 Tabla de amortización | HU-07, HU-17 |
| R16 Datos reales | HU-09, HU-10, HU-11, HU-12 |
| R17 Proyecciones y comparación | HU-13, HU-14, HU-15, HU-16, HU-17 |
| R18 Ajustes | HU-19, HU-20, HU-21, HU-22 |
| R19 Exportación | HU-18 |
| R20 PWA | HU-23 |
| R21 Sistema de diseño y accesibilidad | HU-01, HU-06 |
| R22 Seguridad | HU-24 |
| R23 Higiene del repositorio | HU-24 |
| R24 Infraestructura de pruebas | HU-25 |
| R25 CI/CD y despliegue | HU-01, HU-23 |
| R26 Documentación | HU-21, HU-24 |
| R27 Multimoneda | HU-03, HU-06, HU-18 |
| R28 Estado del préstamo | HU-06, HU-08 |

## Fuera de v1

- Cuentas, inicio de sesión, MFA, rol admin, invitaciones y compartir en vivo: fase multiusuario (ADR-0020). En v1 se
  comparte exportando PDF o Excel.
- Abonos recurrentes automáticos.
- Asistente de calibración del perfil de redondeo.
- Conexión con bancos y lectura de correos.
- Mora, subsidios de tasa y desglose de IVA.
