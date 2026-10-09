# ADR-0015: Higiene de repositorio público y datos sintéticos

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El repositorio es **público** porque forma parte del portafolio del dueño, pero el proyecto nació de préstamos reales: contratos en PDF, correos del banco, tablas de amortización y capturas de la banca en línea. Un dato real en un commit, un fixture, un PR, un log de CI o una captura quedaría expuesto para siempre, aunque después se borre. Decenas de tarjetas de agentes escriben en el repo, así que la revisión sola no basta. Además, el token de Cloudflare y el ID de cliente de Google no deben fijarse en el código.

## Decisión

1. **Cero datos reales, sin excepción.** Ningún monto, tasa, fecha, número de préstamo, PDF, captura, correo ni dato personal real en código, pruebas, docs, commits, PRs, issues, logs ni artefactos. Solo se permiten hechos públicos (por ejemplo, las primas FHA de 1 % y 0.26 %) y **datos sintéticos**.
2. **Fixtures marcados.** Todo JSON en `packages/schema/fixtures`, `tools/oracle/fixtures`, `docs/specs/algorithm-examples` y `e2e/fixtures` lleva `synthetic: true` en la raíz, y un hook lo exige (W1-10). Los formatos que se leen desde esos directorios aceptan la marca sin romperse:
   - el documento de respaldo admite `synthetic?: true` opcional en la raíz, que la app descarta al importar y nunca emite (ADR-0007);
   - los sobres cifrados no se versionan como fixtures: las pruebas los generan en tiempo de ejecución, así que la marca nunca toca la cabecera autenticada (ADR-0009).
3. **`.gitignore` defensivo, desde el commit inicial.** Va en el primer commit, antes de que existan los hooks de W0-01 y W1-10, y cubre los formatos en que llegan los datos reales:
   - documentos y hojas de cálculo: `*.pdf`, `*.doc`, `*.docx`, `*.xls`, `*.xlsx`, `*.xlsm`, `*.ods`, `*.numbers`, `*.csv` y `*.tsv`;
   - correos: `*.eml`, `*.msg` y `*.mbox`;
   - capturas con su nombre por defecto (`Captura de pantalla *`, `Screenshot *`, `Screenshot_*`) y fotos `*.heic`. Los patrones llevan espacio o guion bajo para no atrapar, en un sistema de archivos que ignora mayúsculas, carpetas legítimas como `docs/screenshots/`. Caso negativo obligatorio: `docs/screenshots/x.png` **no** queda ignorado;
   - respaldos de CuotasCasa (`cuotascasa*respaldo*.json`, `cuotascasa*backup*.json`), `*.enc.json` y `.cuotascasa-private/`;
   - `.env*` y llaves.

   Los CSV solo se permiten en dos directorios: `tools/oracle/fixtures/` y `e2e/fixtures/`. La excepción no se extiende a cualquier carpeta `fixtures`, para que un CSV real copiado a otra parte siga ignorado.
4. **Nombres de fixtures que no chocan con `.gitignore`.** Un fixture ignorado desaparecería en silencio del commit y la prueba que lo usa pasaría en local y fallaría en CI, o al revés.
   - Respaldos: `backup-v1-<caso>.json`, en `packages/schema/fixtures/backup/v1/` y `e2e/fixtures/backups/`.
   - Ningún fixture empieza con `cuotascasa` ni termina en `.enc.json`, y no se versionan sobres cifrados.
   - Un check de W1-10 falla si `git ls-files --others --ignored --exclude-standard` encuentra un `.json` o un `.csv` dentro de un directorio de fixtures.
5. **gitleaks** en pre-commit (lefthook) y en CI sobre el **historial completo**.
6. **Lista local de términos prohibidos, opcional.** Un hook lee `$CUOTASCASA_DENYLIST` o `~/.config/cuotascasa/denylist.txt`, y la ruta debe resolver **fuera del repo**. Normaliza números (comas, espacios, símbolos de moneda), ignora mayúsculas e informa solo archivo y línea, nunca el contenido de la lista. Si la lista no existe, pasa con un aviso.
7. **Correo noreply:** un hook exige que `user.email` termine en `@users.noreply.github.com`.
8. **Protecciones de GitHub:** secret scanning y push protection activos **antes del primer push público** (acción del dueño en W0-06), más protección de rama (CI y revisión de Opus).
9. **Configuración inyectada al compilar.** El ID de cliente de Google entra con `--define` (`GOOGLE_CLIENT_ID`) desde variables de GitHub y vale `''` en desarrollo y pruebas. El token de Cloudflare vive solo en los secretos de GitHub (W3-17).
10. **Datos reales solo fuera del repo.** La validación privada usa `~/.cuotascasa-private/`, pendiente de autorización del dueño (ADR-0014). Solo Opus la toca, con herramientas que nunca imprimen montos: su salida de tres líneas muestra en la terminal el número de filas con diferencia y la diferencia máxima, solo localmente y sin copiarse a ningún lado, y la línea versionada de `--log-line` registra solo sí/no (decisión del dueño, 2026-10-09).
11. **Evidencia sintética:** las capturas y trazas de e2e usan solo datos sintéticos y se guardan solo si una prueba falla.
12. **Si algo real llega a un commit:** antes del push, se reescribe la historia. Si ya llegó a GitHub, se considera expuesto: se elimina, se limpia el historial y se rota lo que corresponda.
13. **Bitácoras y salida de las herramientas privadas.** Las herramientas privadas (`compare`, `private-compare`) nunca imprimen el total de filas, ni siquiera en la terminal: su salida son exactamente tres líneas con rótulo (`allRowsMatched`, `mismatchedRows` y `maxAbsDiff`), y `--log-line` da solo la línea de la bitácora (ADR-0014). Las bitácoras de validación (`docs/specs/oracle-validation-log.md`) nunca registran el total de filas ni el plazo de ningún préstamo. La salida de terminal de esas herramientas nunca va al chat, a un PR, a un issue, a un commit ni a un log; solo se copia la línea de `--log-line`.

## Alternativas consideradas

- **Repositorio privado.** Elimina el riesgo, pero anula el propósito de portafolio. Descartada.
- **Datos reales anonimizados o escalados.** Las proporciones, fechas y redondeos pueden seguir revelando condiciones reales. Descartada.
- **Confiar solo en la revisión.** Falla con muchas tarjetas en paralelo y con agentes que copian contexto. Insuficiente.
- **Lista de prohibidos dentro del repo.** Publicaría justo lo que se quiere proteger. Descartada.

## Consecuencias

**Positivas**
- El repo se puede mostrar, clonar y ejecutar sin riesgo.
- Las defensas son automáticas y se repiten en el equipo local y en CI.

**Negativas**
- Los ejemplos son menos «reales». Lo compensan generadores con rangos de mercado y la validación privada.
- Más hooks en cada commit.

**Riesgos**
- La lista de prohibidos es opcional y depende de que el dueño la mantenga. Mitigación: los demás controles no dependen de ella.
- Texto pegado en un PR o issue, que los hooks no ven. Mitigación: regla explícita en el prompt de cada tarjeta y revisión de Opus.

## Verificación

- **W0-01:** `.gitignore`, `.gitleaks.toml` y `lefthook.yml`. `git check-ignore` atrapa un ejemplo de cada patrón del punto 3 (por ejemplo `correo.eml`, `hoja.numbers`, `contrato.doc`, `contrato.docx`, `Captura de pantalla 1.png`, `Screenshot 1.png` y `Screenshot_1.png`) y **no** atrapa `docs/screenshots/x.png`, `tools/oracle/fixtures/x.csv`, `e2e/fixtures/x.csv` ni `packages/schema/fixtures/backup/v1/backup-v1-basico.json`; sí atrapa un CSV en cualquier otra carpeta `fixtures`.
- **W0-06:** gitleaks en CI sobre el historial completo; el PR muestra secret scanning y push protection activos.
- **W0-06 y W1-02:** las pruebas verifican que ni la salida normal (las tres líneas con rótulo) ni `--log-line` de `private-compare` y de `compare` incluyen el total de filas, montos ni condiciones (punto 13).
- **W1-10:** pruebas con repos git temporales: un término prohibido falla aunque cambie el formato numérico, una lista dentro del repo se rechaza, la salida nunca contiene la lista, un correo que no es noreply falla, un fixture sin `synthetic: true` falla y un `.json` o `.csv` ignorado dentro de un directorio de fixtures falla.
- **W1-03:** los fixtures `backup-v1-*.json`, con `synthetic: true`, parsean a la última versión.
- **W2-01:** los primeros fixtures pasan los hooks.
- **W7-01:** gitleaks sobre el historial completo y nueva verificación de las protecciones de GitHub.

## Referencias

- ADR-0007, ADR-0009, ADR-0014, ADR-0016, ADR-0019.
- `CLAUDE.md`, reglas absolutas 1 y 2.
- Tarjetas W0-01, W0-06, W1-03, W1-10, W2-01, W3-17, W5-07 y W7-01.
