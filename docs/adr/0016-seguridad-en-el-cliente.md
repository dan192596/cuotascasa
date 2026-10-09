# ADR-0016: Seguridad en el cliente: CSP por ruta, dependencias y amenazas residuales

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

Sin backend (ADR-0001), la superficie de ataque está en el navegador. Cualquier código que se ejecute en el origen de la app puede leer IndexedDB (no cifrado), **usar** la clave del dispositivo, que no es exportable pero sí utilizable (ADR-0009), y usar el token de Drive mientras esté en memoria. Por eso la amenaza principal es el XSS y la cadena de suministro de dependencias. La landing debe quedar aislada: sin red, sin almacenamiento y sin código de Google.

## Decisión

### Amenazas y mitigaciones

| Amenaza | Mitigación |
|---|---|
| XSS o dependencia comprometida | CSP estricta por ruta; Trusted Types si GIS lo permite; sanitización de Angular sin `bypassSecurityTrust*`; sin analítica, CDN ni fuentes externas; lockfile congelado; pnpm bloquea scripts de instalación salvo una lista permitida; `pnpm audit --prod` en CI; Renovate con 7 días de antigüedad mínima y versiones exactas; ninguna dependencia nueva sin Opus |
| Acceso físico al dispositivo | Cifrado de disco del sistema (FileVault) y bloqueo de sesión. IndexedDB **no** se cifra |
| Robo del token de Drive | Token solo en memoria (~1 h), alcance `drive.appdata`, revocación al desconectar y GIS cargado solo al conectar |
| Acceso a la cuenta de Google | Copia en Drive cifrada con la frase (ADR-0009) |
| Archivos exportados | Advertencia antes de descargar; cifrado opcional del respaldo JSON (ADR-0007, ADR-0013) |
| Clickjacking | `frame-ancestors 'none'` |
| Fuga por el repo público | ADR-0015 |

### CSP por ruta

- **`/`, `/privacidad` y la 404:** `default-src 'self'`, `connect-src 'self'`, **ningún origen externo** en ninguna directiva, `object-src 'none'`, `base-uri 'none'` y `frame-ancestors 'none'`. **Enmienda (2026-10-09, ADR-0021):** `base-uri` pasa a `'self'`, porque `'none'` choca con `<base href="/">`; las políticas exactas por ruta las fija ADR-0021.
- **`/app/*`:** agrega **solo** los orígenes de Google necesarios para cargar GIS, abrir el popup de consentimiento, llamar a Drive v3 y revocar el token. La lista exacta la fija ADR-0021.
- **Ningún `script-src`** contiene `'unsafe-inline'` ni `'unsafe-eval'`. Los scripts inline del prerender se cubren con `autoCsp` de Angular o con hashes generados después del build y escritos solo en `_headers`; la elección es de ADR-0021.
- **Toda ruta HTML** lleva HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy`, definidas en `_headers` de Cloudflare (ADR-0022).

### Trusted Types: decisión diferida

Se quiere Trusted Types en `/app`, pero no se sabe si GIS es compatible. El spike W1-08 mide una matriz de evidencia en Chromium y WebKit: Trusted Types estricto, solo reporte o apagado, frente a cada estrategia de scripts inline. **La decisión final se difiere a ADR-0021**, que Opus escribe en W2-02. Si GIS resulta incompatible, el respaldo previsto es Trusted Types en modo solo reporte en `/app`.

### Privacidad

Sin cookies, analítica, rastreo ni telemetría. `/privacidad` lo declara.

### Amenazas residuales aceptadas

- Código malicioso en el origen puede leer los datos locales, usar la clave del dispositivo y llamar a Drive mientras el token esté vigente.
- Una dependencia comprometida al compilar, antes de que la auditoría la detecte.
- Extensiones del navegador con permiso sobre el sitio, o un sistema operativo comprometido.
- Archivos exportados sin cifrar que el usuario guarda o comparte.

## Alternativas consideradas

- **Una CSP global.** Abriría los orígenes de Google también en la landing. Descartada.
- **Cifrar IndexedDB.** No protege contra XSS, porque la app necesita la clave para funcionar, y añade fricción. Descartada para v1.
- **SRI para el script de GIS.** Google no publica versiones fijas del script, así que el hash dejaría de coincidir. Descartada.

## Consecuencias

**Positivas**
- La landing no puede filtrar datos aunque tuviera una vulnerabilidad: no tiene a dónde conectarse.
- El daño de un token robado es acotado: carpeta oculta de la app, ~1 h y datos cifrados.

**Negativas**
- La CSP estricta complica el prerender y la integración con GIS (de ahí el spike).

**Riesgos**
- Que GIS obligue a relajar la CSP más de lo previsto. Mitigación: ADR-0021 con evidencia y respaldo definido.
- Que alguien agregue un `innerHTML` inseguro. Mitigación: revisión y barrido de CSP en W6-02.

## Verificación

- W1-08: verificaciones negativas automáticas sobre los candidatos.
- W2-10: `edge:check` revisa las directivas por ruta y las cabeceras comunes, con una prueba de humo sin violaciones.
- W2-11 y W6-02: `collectCspViolations` en e2e y barrido de todas las rutas. W2-12: GIS no aparece en la landing.
- W3-16: auditoría como gate de CI. W7-01: revisión sobre el sitio desplegado.

## Referencias

- ADR-0001, ADR-0002, ADR-0007, ADR-0008, ADR-0009, ADR-0013, ADR-0015, ADR-0021, ADR-0022.
- `docs/security/threat-model.md` (W6-03), `docs/specs/spikes/csp-gis-evidence.md` (W1-08).
