# ADR-0013: Exportación en el cliente (Excel, CSV, PDF)

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El dueño pidió exportar a Excel, CSV y PDF. En v1, además, **compartir es exportar**: quien quiera mostrar su tabla o una comparación envía el PDF o el Excel (el compartir en vivo quedó en ADR-0020). Sin backend (ADR-0001), los archivos se generan en el navegador.

Estado de las librerías al 2026-10-04:

- El paquete npm `xlsx` (SheetJS) está congelado en npm con CVE conocidos.
- ExcelJS está sin mantenimiento.
- `write-excel-file` pesa unos 21 KB gzip y solo escribe, que es lo único que se necesita.
- jsPDF corrigió vulnerabilidades en la 4.2.1; `jspdf-autotable` dibuja tablas paginadas.

Restricciones: el dinero viaja como string decimal (ADR-0003), Excel guarda números en doble precisión, Excel en español necesita BOM para leer acentos en CSV, y la landing no debe cargar código de exportación (ADR-0011).

## Decisión

1. **Un modelo de reporte único.** `packages/export` define `ReportModel`, `ReportWriter` y `ExportFormat` (congelados en W0-03). `buildScheduleReport` y `buildComparisonReport` (W3-15) arman el modelo desde el dominio, con encabezados en español, rótulo de moneda y subtotales anuales tomados de `yearlySubtotals`. El paquete no calcula subtotales propios.
2. **Un escritor por formato**, cada uno en su subpath (`@cuotascasa/export/csv`, `/excel` y `/pdf`) y sin efectos al importarse. Se cargan con import dinámico **solo cuando el usuario exporta**.
3. **CSV:** BOM UTF-8, CRLF, comillas según RFC 4180, montos como strings decimales exactos y fechas `dd/mm/aaaa`. Contra la inyección de fórmulas:
   - se neutralizan **solo las celdas de texto** que empiezan con `=`, `+`, `-` o `@`, anteponiéndoles un apóstrofo (`'`);
   - las celdas numéricas, que cumplen `^-?\d+(\.\d{2})?$` (montos con 2 decimales o enteros, como el número de cuota), se escriben tal cual, también si son negativas. Real Δ y las diferencias de la comparación pueden ser negativas y deben seguir siendo números al abrir el archivo, no textos como `'-12.34`.
4. **Excel** con `write-excel-file`: hoja «Tabla» y, si aplica, «Comparación»; encabezado fijo, anchos de columna, moneda en el encabezado y formato `#,##0.00`. La conversión de decimal a `number` ocurre **solo dentro de este escritor**, con prueba de ida y vuelta al centavo. Los montos negativos se escriben como números negativos y los textos como celdas de texto, nunca como fórmulas.
5. **PDF** con jsPDF ≥ 4.2.1 y `jspdf-autotable`, en estilo libreta (ADR-0012): título, datos del préstamo, moneda, tabla con renglones y subtotales anuales, «Página x de y» y fecha de generación.
6. **Puntos de exportación:** la tabla de amortización y la comparación de escenarios, mediante `cc-export-menu` (W5-06).
7. **Los archivos exportados van sin cifrar** y contienen datos financieros, así que la UI lo advierte antes de descargar. El respaldo JSON, con cifrado opcional, es otra cosa (ADR-0007).
8. **Los escritores no usan red ni `eval`.**

## Alternativas consideradas

- **`xlsx` desde npm.** Congelado y con CVE; tomarlo de un CDN rompería la regla de no usar CDN y la CSP. Descartada.
- **ExcelJS.** Sin mantenimiento y más pesado. Descartada.
- **Generar en un servidor.** No hay backend, y los datos saldrían del dispositivo. Descartada.
- **Imprimir a PDF desde el navegador.** Poco control sobre paginación y encabezados, y el resultado varía por navegador. Descartada como formato principal.

## Consecuencias

**Positivas**
- Los datos nunca salen del dispositivo y la exportación funciona sin conexión.
- El peso de Excel y PDF solo se paga al exportar.
- Un solo modelo garantiza las mismas cifras en los tres formatos.

**Negativas**
- jsPDF es la dependencia más pesada, aunque se carga de forma diferida.
- Excel recibe `number`, no decimales exactos. Lo cubre la prueba de ida y vuelta con montos de 2 decimales.

**Riesgos**
- Vulnerabilidades nuevas en jsPDF o `write-excel-file`. Mitigación: Renovate, `pnpm audit` en CI y versión mínima fijada.
- Acentos mal codificados en el PDF. Mitigación: una prueba extrae el texto y busca «Año» e «Interés».
- Archivos olvidados en carpetas compartidas. Mitigación: advertencia en la UI; el riesgo residual se acepta (ADR-0016).

## Verificación

- **W3-15:** el CSV empieza con `EF BB BF`, usa CRLF y RFC 4180 y neutraliza fórmulas en las celdas de texto; un monto negativo (`-12.34`) sale tal cual, sin apóstrofo, y un texto que empieza con `-` o `=` sale neutralizado; snapshots de 2 préstamos sintéticos (GTQ y USD); los subtotales coinciden con `yearlySubtotals`.
- **W4-10:** la salida empieza con `PK`, `fflate` encuentra `[Content_Types].xml` y cada celda numérica vuelve a su string de 2 decimales, incluido un monto negativo.
- **W4-11:** la salida empieza con `%PDF-`, 360 filas dan el número de páginas esperado, `pdfjs-dist` extrae los acentos correctos y no hay `eval` ni red.
- **W2-12:** `bundle-check` falla si `@cuotascasa/export`, `write-excel-file` o `jspdf` aparecen en la landing, o si `write-excel-file` o `jspdf` aparecen en el bundle inicial de `/app`.
- **W6-01:** e2e que descargan los tres formatos bajo las cabeceras de producción.

## Referencias

- ADR-0003, ADR-0007, ADR-0011, ADR-0012, ADR-0016, ADR-0020.
- Tarjetas W0-03, W3-15, W4-10, W4-11, W5-06 y W6-01.
