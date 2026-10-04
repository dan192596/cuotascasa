# Matriz de trazabilidad: requisitos ↔ tarjetas

<!-- Generado por tools/plan/render_plan.py desde docs/plan/plan.json. No editar a mano. -->

Cada requisito tiene al menos una tarjeta.

| Requisito | Descripción | Tarjetas |
|---|---|---|
| R1 | Landing prerenderizada + simulador público (cero red y cero almacenamiento) | [W0-05](cards/W0-05.md), [W2-12](cards/W2-12.md), [W4-03](cards/W4-03.md), [W4-04](cards/W4-04.md), [W6-01](cards/W6-01.md) |
| R2 | Página de privacidad | [W0-05](cards/W0-05.md), [W4-05](cards/W4-05.md) |
| R3 | Núcleo del motor (cuota nivelada, reparto del cargo, cargos fijos, última cuota, fechas, día de pago) | [W0-02](cards/W0-02.md), [W0-03](cards/W0-03.md), [W1-01](cards/W1-01.md), [W1-02](cards/W1-02.md), [W2-13](cards/W2-13.md), [W3-02](cards/W3-02.md), [W4-02](cards/W4-02.md) |
| R4 | Línea de tiempo de eventos (cambio de tasa con 3 políticas, cargos fijos, abonos con modo y comisión, adelantar N, anclas, pagos reales) | [W0-02](cards/W0-02.md), [W2-03](cards/W2-03.md), [W2-04](cards/W2-04.md), [W2-05](cards/W2-05.md), [W2-06](cards/W2-06.md), [W3-02](cards/W3-02.md), [W4-02](cards/W4-02.md), [W4-12](cards/W4-12.md), [W5-03](cards/W5-03.md) |
| R5 | Tres caminos + métricas de comparación | [W0-02](cards/W0-02.md), [W2-05](cards/W2-05.md), [W3-12](cards/W3-12.md), [W4-02](cards/W4-02.md), [W5-01](cards/W5-01.md), [W5-05](cards/W5-05.md) |
| R6 | Búsqueda por meta | [W0-02](cards/W0-02.md), [W3-03](cards/W3-03.md), [W4-02](cards/W4-02.md), [W5-04](cards/W5-04.md) |
| R7 | Validación de plantilla contra saldo real | [W0-02](cards/W0-02.md), [W2-07](cards/W2-07.md), [W3-12](cards/W3-12.md), [W4-07](cards/W4-07.md) |
| R8 | Plantillas (FHA Guatemala v1, Hipotecario simple) con copia editable | [W0-02](cards/W0-02.md), [W2-07](cards/W2-07.md), [W4-07](cards/W4-07.md) |
| R9 | Modelo de datos + esquemas zod | [W0-04](cards/W0-04.md), [W1-03](cards/W1-03.md) |
| R10 | Puerto de persistencia + adaptadores memoria y Dexie + suite de contrato + persist() | [W0-04](cards/W0-04.md), [W1-04](cards/W1-04.md), [W1-05](cards/W1-05.md), [W3-10](cards/W3-10.md), [W3-11](cards/W3-11.md), [W3-13](cards/W3-13.md), [W5-07](cards/W5-07.md) |
| R11 | Respaldo JSON con migraciones, vista previa, instantánea, deshacer y cifrado opcional | [W0-04](cards/W0-04.md), [W1-03](cards/W1-03.md), [W1-07](cards/W1-07.md), [W4-08](cards/W4-08.md), [W5-07](cards/W5-07.md), [W6-01](cards/W6-01.md) |
| R12 | Sincronización con Google Drive (merge, borrados, copia previa, estado offline, revocar, cifrado con frase, clave por dispositivo, cambiar frase) | [W0-04](cards/W0-04.md), [W1-06](cards/W1-06.md), [W1-07](cards/W1-07.md), [W1-08](cards/W1-08.md), [W2-08](cards/W2-08.md), [W2-09](cards/W2-09.md), [W3-18](cards/W3-18.md), [W4-09](cards/W4-09.md), [W5-08](cards/W5-08.md), [W6-04](cards/W6-04.md) |
| R13 | Dashboard | [W0-05](cards/W0-05.md), [W3-08](cards/W3-08.md), [W3-09](cards/W3-09.md), [W3-12](cards/W3-12.md), [W4-06](cards/W4-06.md) |
| R14 | Asistente de alta + edición + archivar/eliminar | [W0-05](cards/W0-05.md), [W3-11](cards/W3-11.md), [W4-07](cards/W4-07.md), [W5-01](cards/W5-01.md) |
| R15 | Tabla de amortización (vistas, Real Δ, subtotales anuales, teclado, abono en celda al escenario) | [W0-05](cards/W0-05.md), [W3-07](cards/W3-07.md), [W5-02](cards/W5-02.md) |
| R16 | Pantalla de datos reales | [W0-05](cards/W0-05.md), [W4-12](cards/W4-12.md), [W5-03](cards/W5-03.md) |
| R17 | Proyecciones + comparación + gráfica | [W0-05](cards/W0-05.md), [W5-04](cards/W5-04.md), [W5-05](cards/W5-05.md) |
| R18 | Ajustes (recordatorios de respaldo, import/export, Drive, frase, persistencia, aviso Safari) | [W0-05](cards/W0-05.md), [W3-13](cards/W3-13.md), [W4-06](cards/W4-06.md), [W4-08](cards/W4-08.md), [W5-07](cards/W5-07.md), [W5-08](cards/W5-08.md), [W6-02](cards/W6-02.md) |
| R19 | Exportar Excel/CSV/PDF (carga diferida) | [W0-03](cards/W0-03.md), [W2-12](cards/W2-12.md), [W3-15](cards/W3-15.md), [W4-10](cards/W4-10.md), [W4-11](cards/W4-11.md), [W5-06](cards/W5-06.md), [W6-01](cards/W6-01.md) |
| R20 | PWA offline + aviso de actualización | [W0-05](cards/W0-05.md), [W2-02](cards/W2-02.md), [W3-14](cards/W3-14.md) |
| R21 | Sistema de diseño (fuentes autoalojadas, tokens claro/oscuro, Material compacto, pipes es-GT, accesibilidad AA) | [W0-05](cards/W0-05.md), [W3-05](cards/W3-05.md), [W3-06](cards/W3-06.md), [W3-07](cards/W3-07.md), [W3-08](cards/W3-08.md), [W3-09](cards/W3-09.md), [W4-03](cards/W4-03.md), [W4-04](cards/W4-04.md), [W6-02](cards/W6-02.md) |
| R22 | Seguridad (CSP, Trusted Types, política de dependencias) | [W0-01](cards/W0-01.md), [W0-06](cards/W0-06.md), [W1-07](cards/W1-07.md), [W1-08](cards/W1-08.md), [W1-09](cards/W1-09.md), [W1-10](cards/W1-10.md), [W2-02](cards/W2-02.md), [W2-09](cards/W2-09.md), [W2-10](cards/W2-10.md), [W3-16](cards/W3-16.md), [W6-02](cards/W6-02.md), [W7-01](cards/W7-01.md) |
| R23 | Higiene de repo público (gitleaks, gitignore, denylist local, noreply, push protection, client ID al compilar) | [W0-01](cards/W0-01.md), [W0-06](cards/W0-06.md), [W1-10](cards/W1-10.md), [W2-01](cards/W2-01.md), [W3-17](cards/W3-17.md), [W7-01](cards/W7-01.md) |
| R24 | Infraestructura de pruebas (oráculo, fixtures sintéticos, diff en CI, propiedades, contrato, e2e Chromium+WebKit, axe, presupuestos, owns-check) | [W0-01](cards/W0-01.md), [W0-02](cards/W0-02.md), [W0-04](cards/W0-04.md), [W0-06](cards/W0-06.md), [W1-02](cards/W1-02.md), [W1-03](cards/W1-03.md), [W1-04](cards/W1-04.md), [W1-06](cards/W1-06.md), [W2-01](cards/W2-01.md), [W2-06](cards/W2-06.md), [W2-11](cards/W2-11.md), [W2-12](cards/W2-12.md), [W2-13](cards/W2-13.md), [W3-01](cards/W3-01.md), [W3-02](cards/W3-02.md), [W3-04](cards/W3-04.md), [W3-16](cards/W3-16.md), [W4-01](cards/W4-01.md), [W4-02](cards/W4-02.md), [W6-01](cards/W6-01.md), [W6-02](cards/W6-02.md) |
| R25 | CI/CD + despliegue en Cloudflare con rewrites acotados y 404 | [W0-05](cards/W0-05.md), [W0-06](cards/W0-06.md), [W1-09](cards/W1-09.md), [W2-02](cards/W2-02.md), [W3-16](cards/W3-16.md), [W3-17](cards/W3-17.md), [W4-05](cards/W4-05.md), [W6-04](cards/W6-04.md), [W7-01](cards/W7-01.md) |
| R26 | Documentación (README bilingüe, modelo de amenazas, guía de Google Cloud, checklist manual de Drive, ADRs al día) | [W3-18](cards/W3-18.md), [W6-03](cards/W6-03.md), [W6-04](cards/W6-04.md), [W7-01](cards/W7-01.md) |
| R27 | Multimoneda por préstamo GTQ/USD sin mezclar; totales por moneda | [W0-03](cards/W0-03.md), [W0-04](cards/W0-04.md), [W1-01](cards/W1-01.md), [W2-05](cards/W2-05.md), [W3-06](cards/W3-06.md), [W3-11](cards/W3-11.md), [W3-12](cards/W3-12.md), [W3-15](cards/W3-15.md), [W4-06](cards/W4-06.md), [W4-07](cards/W4-07.md), [W4-10](cards/W4-10.md) |
| R28 | Estado del préstamo activo/pagado/archivado | [W0-04](cards/W0-04.md), [W3-11](cards/W3-11.md), [W3-12](cards/W3-12.md), [W4-06](cards/W4-06.md), [W5-01](cards/W5-01.md) |
