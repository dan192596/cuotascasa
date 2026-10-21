# Registro de cambios

Todos los cambios relevantes de CuotasCasa. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto usa [versionado semántico](https://semver.org/lang/es/). Los ejemplos de este registro, como los del resto
del repositorio, son sintéticos: aquí no hay montos, tasas ni fechas de ningún préstamo real.

## [1.0.0] - sin publicar

Primera versión. Se publica con el tag `v1.0.0`, después de que el dueño apruebe el PR de release
(`docs/release/v1-checklist.md`).

### Qué es

CuotasCasa es una app web **local-first** para modelar las cuotas de un préstamo de vivienda en Guatemala con la
fórmula FHA, proyectar abonos a capital y comparar lo proyectado con lo real. No se conecta a bancos ni mueve dinero.
No hay servidor de datos: todo vive en el navegador y, si la persona quiere, en una copia cifrada en su Google Drive.

### Funciones

- **Motor de cálculo** en TypeScript puro con aritmética decimal: cuota nivelada, reparto del cargo, cargos fijos,
  última cuota y fechas de pago, con los perfiles de redondeo de la plantilla «FHA Guatemala v1» y la «Hipotecario
  simple».
- **Línea de tiempo de eventos:** cambios de tasa con tres políticas, cambios de cargos fijos, abonos a capital con modo
  y comisión, adelantar cuotas, saldos reportados como anclas y pagos reales.
- **Tres caminos** (original, real y escenario) con métricas de comparación, y **búsqueda por meta**: terminar en una
  fecha o no pasar de una cuota.
- **Validación de la plantilla** contra un saldo real, con semáforo verde, ámbar o rojo.
- **Préstamos en quetzales o en dólares**, sin mezclar monedas; totales por moneda. Estados activo, pagado y archivado.
- **Pantallas:** landing prerenderizada con simulador rápido (sin red y sin almacenamiento), política de privacidad,
  panel con medidor de la casa, asistente de alta en cuatro pasos, detalle del préstamo, tabla de amortización estilo
  libreta (vistas, diferencia con lo real, subtotales anuales, teclado y abono en la celda), datos reales, editor de
  escenarios, comparación de hasta tres escenarios con gráfica, y Ajustes.
- **Exportación** a Excel, CSV y PDF en el propio navegador, cargada solo al exportar, con un aviso antes de la primera
  descarga sin cifrar de cada sesión.
- **Respaldo JSON** versionado, con migraciones, vista previa, instantánea y deshacer, y cifrado opcional con la misma
  frase de Drive.
- **Sincronización con Google Drive** en la carpeta oculta de la app: combinación por registro con marcas de borrado,
  copia previa antes de cada subida, conexión en dos pasos, revocación al desconectar y estado sin conexión.
- **Cifrado con frase** (AES-256-GCM y PBKDF2-SHA256 con 600 000 iteraciones) y clave no exportable guardada por
  dispositivo; la frase nunca se guarda y se puede cambiar desde cualquier dispositivo con la clave.
- **PWA:** uso sin conexión en `/app`, aviso de actualización, aviso de Safari sobre el borrado del almacenamiento y
  recordatorios de respaldo.
- **Sistema de diseño** con fuentes autoalojadas, temas claro y oscuro, formato es-GT (`Q 1,234.56`, `dd/mm/aaaa`) y
  accesibilidad AA.

### Seguridad y privacidad

- CSP por ruta con hashes calculados después del build, Trusted Types aplicado en todas las rutas y Google solo en
  `/app`, cargado al conectar Drive.
- Higiene de repositorio público: gitleaks en cada commit y en CI sobre el historial completo, fixtures marcados como
  sintéticos, correo noreply, lista local de términos prohibidos e ID de cliente de Google inyectado al compilar.
- Modelo de amenazas bilingüe en `docs/security/threat-model.md`.

### Construcción por olas

- **W0, cimientos:** espacio de trabajo pnpm con dependencias fijadas, `docs/algorithm.md` con un ejemplo resuelto por
  regla, contratos congelados del dominio, el esquema, la persistencia y la sincronización, esqueleto de Angular 22 y
  CI con owns-check.
- **W1, el núcleo difícil:** calendario del motor, oráculo independiente en Python, códec del respaldo, adaptadores en
  memoria y Dexie, combinación de la sincronización, cifrado y los spikes de CSP y de Cloudflare.
- **W2, eventos y base de seguridad:** todos los eventos del motor, los tres caminos, fixtures `core` al centavo,
  plantillas, sesión de sincronización, proveedor de Drive, cabeceras finales, infraestructura e2e y presupuestos de
  bundle.
- **W3, cálculo cerrado y bases de la app:** fixtures `full`, pruebas de propiedades, búsqueda por meta, sistema de
  diseño, componentes de UI, shell, capa de datos, PWA, CSV y la tubería de despliegue (dormida).
- **W4, motor conforme y superficie pública:** conformidad total con el oráculo, landing, simulador, privacidad, 404,
  panel, asistente, servicios de respaldo y sincronización, y escritores Excel y PDF.
- **W5, pantallas:** detalle del préstamo, tabla de amortización, datos reales, escenarios, comparación, menú de
  exportación y Ajustes de respaldo y Drive.
- **W6, recorridos y documentación:** recorridos e2e entre funciones con exportaciones bajo las cabeceras de producción,
  barridos de accesibilidad, CSP y restos de stubs, README bilingüe, modelo de amenazas y guías de operación.
- **W7, release:** higiene en CI, topes de tamaño de archivo al importar y al descargar de Drive, «Borrar datos de este
  dispositivo», revisión de seguridad, matriz de trazabilidad R1–R28, ADR al día y retiro de `tools/spikes/`.

### Limitaciones conocidas

- El motor coincide al centavo con el oráculo independiente y con los ejemplos sintéticos, pero **nunca se comparó con
  una tabla real del banco** (riesgo aceptado; `docs/release/v1-checklist.md`).
- IndexedDB no se cifra en el dispositivo; Safari puede borrar el almacenamiento si el sitio no se visita en 7 días.
- Sin cuentas ni compartir en vivo: la fase multiusuario sigue diferida (ADR-0020).
