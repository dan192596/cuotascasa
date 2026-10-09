# Registro de decisiones de arquitectura (ADR)

Cada ADR documenta una decisión importante: su contexto, la decisión, las alternativas descartadas, sus consecuencias y cómo se verifica. Las tarjetas citan los ADRs como contratos. Si una tarjeta contradice un ADR aceptado, gana el ADR y la tarjeta se detiene y escala a Opus.

**Regla absoluta:** ningún ADR contiene datos reales de préstamos ni datos personales (ADR-0015). Solo hechos públicos y valores sintéticos.

## Índice

| Número | Título | Estado | Fecha |
|---|---|---|---|
| [0001](0001-arquitectura-local-first.md) | Arquitectura v1 local-first sin backend | Aceptado | 2026-10-04 |
| [0002](0002-hosting-cloudflare-workers-subdominio.md) | Hosting estático en Cloudflare Workers en un subdominio | Aceptado | 2026-10-04 |
| [0003](0003-calculo-en-cliente-aritmetica-decimal.md) | Cálculo en el cliente con dominio TypeScript puro y aritmética decimal | Aceptado | 2026-10-04 |
| [0004](0004-algoritmo-fha-guatemala-v1.md) | Algoritmo 'FHA Guatemala v1' y perfiles de redondeo | Aceptado | 2026-10-04 |
| [0005](0005-modelo-de-datos.md) | Modelo de datos: solo entradas del usuario y campos para sincronizar | Aceptado | 2026-10-04 |
| [0006](0006-persistencia-repositorios-dexie.md) | Persistencia: puerto de repositorios, Dexie y adaptador en memoria con suite de contrato | Aceptado | 2026-10-04 |
| [0007](0007-formato-de-respaldo-json.md) | Formato de respaldo JSON versionado, migraciones e importación segura | Aceptado | 2026-10-04 |
| [0008](0008-sincronizacion-google-drive.md) | Sincronización con Google Drive (appDataFolder, modelo de token de GIS) | Aceptado | 2026-10-04 |
| [0009](0009-cifrado-con-frase.md) | Cifrado con frase (AES-256-GCM + PBKDF2) y clave no exportable por dispositivo | Aceptado | 2026-10-04 |
| [0010](0010-monorepo-pnpm-reglas-de-dependencia.md) | Monorepo pnpm, paquetes y reglas de dependencia | Aceptado | 2026-10-04 |
| [0011](0011-angular-renderizado-hibrido.md) | Angular 22 y renderizado híbrido estático | Aceptado | 2026-10-04 |
| [0012](0012-sistema-de-diseno.md) | Sistema de diseño y dirección visual | Aceptado | 2026-10-04 |
| [0013](0013-exportacion-en-el-cliente.md) | Exportación en el cliente (Excel, CSV, PDF) | Aceptado | 2026-10-04 |
| [0014](0014-estrategia-de-pruebas.md) | Estrategia de pruebas y cadena de confianza del cálculo | Aceptado | 2026-10-04 |
| [0015](0015-higiene-repo-publico.md) | Higiene de repositorio público y datos sintéticos | Aceptado | 2026-10-04 |
| [0016](0016-seguridad-en-el-cliente.md) | Seguridad en el cliente: CSP por ruta, dependencias y amenazas residuales | Aceptado | 2026-10-04 |
| [0017](0017-pwa-y-durabilidad.md) | PWA, navegadores soportados y durabilidad del almacenamiento | Aceptado | 2026-10-04 |
| [0018](0018-convenciones-de-idioma.md) | Convenciones de idioma y nomenclatura | Aceptado | 2026-10-04 |
| [0019](0019-proceso-con-agentes.md) | Proceso de desarrollo con agentes | Aceptado | 2026-10-04 |
| [0020](0020-fase-multiusuario-diferida.md) | Fase multiusuario diferida (diseño Supabase archivado) | Diferido | 2026-10-04 |
| 0021 | `0021-csp-trusted-types-gis.md`: CSP por ruta, Trusted Types y carga de GIS | Reservado (lo escribe W2-02) | — |
| [0022](0022-cloudflare-static-routing.md) | Enrutamiento estático en Cloudflare | Propuesto (W1-09; W2-02 lo acepta o enmienda) | 2026-10-09 |
| 0023 | `0023-pwa-registration-scope.md`: alcance de registro del service worker | Reservado (lo escribe W2-02) | — |
| [0024](0024-sync-merge-order.md) | Orden total de la combinación en la sincronización | Aceptado | 2026-10-05 |

El siguiente número libre es el **0025**.

## Estados

| Estado | Significado |
|---|---|
| **Propuesto** | Redactado y en revisión. Todavía no obliga a nadie. |
| **Aceptado** | Vigente. Obliga a todas las tarjetas y revisiones. |
| **Diferido** | Se decidió no aplicarlo por ahora. El diseño queda archivado junto con los disparadores para retomarlo (por ejemplo, ADR-0020). |
| **Reemplazado por ADR-XXXX** | Histórico. Manda el ADR que lo reemplaza. |

«Reservado» no es un estado de ADR: solo indica en este índice que el número ya tiene dueño y la tarjeta que lo escribirá.

## Proceso

### Cuándo hace falta un ADR

Toda decisión nueva que afecte la arquitectura, la seguridad, la privacidad, el costo, un contrato congelado o las dependencias, o que sea cara de revertir. La definición de terminado de cada tarjeta lo exige (ADR-0019). Una duda no se resuelve con un ADR improvisado: se escala a Opus.

### Proponer

1. Copia [`template.md`](template.md) como `NNNN-slug.md`, con el siguiente número libre. El slug va en kebab-case ASCII y en español; los números reservados conservan el nombre que fijó el plan.
2. Escribe con estado **Propuesto** y la fecha del día.
3. Abre el PR. Una tarjeta solo puede escribir un ADR que esté en sus `owns`. Si necesita uno que no lo está, se detiene y Opus crea una micro-tarjeta.
4. Opus revisa. Las decisiones técnicas las acepta Opus. Las que cambian alcance, costo, privacidad o manejo de datos del dueño requieren además la aprobación del dueño.
5. Al aceptarse, el estado pasa a **Aceptado**. Opus actualiza este índice, en una micro-tarjeta o en W7-01; las tarjetas no editan el índice.

Una tarjeta Sonnet puede redactar un ADR con evidencia (por ejemplo, W1-09 con ADR-0022), pero lo acepta Opus.

### Enmendar

Una precisión que no cambia la decisión (un dato verificado, un enlace, un detalle de implementación) se agrega al final, en una sección `## Enmiendas` con fecha y tarjeta. Cambiar la decisión exige un ADR nuevo.

### Reemplazar

1. Escribe un ADR nuevo que, debajo de «Decisores», diga `Reemplaza a: ADR-XXXX` y explique qué cambió.
2. En el ADR anterior, cambia solo su estado a `Reemplazado por ADR-YYYY`. No se reescribe su contenido.
3. Actualiza ambos en este índice.

Los ADRs no se borran y sus números no se reutilizan.

### Retomar un ADR diferido

Se escribe un ADR nuevo que reemplaza al diferido, después de revalidar los hechos externos que pudieron cambiar (precios, límites, APIs). ADR-0020 detalla los pasos para la fase multiusuario.

### Mantenimiento

En W7-01, Opus revisa que cada estado esté al día antes del release v1.0.0, y ADR-0020 se mantiene Diferido con sus disparadores.
