# ADR-0001: Arquitectura v1 local-first sin backend

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

Al inicio el único usuario es el dueño, que tiene préstamos FHA reales. Algunos amigos podrían usarla de vez en cuando, cada uno en su propio navegador. La app no se conecta a bancos ni mueve dinero. El repositorio es público (portafolio) y la meta de costo es US$0, salvo el dominio.

Los flujos de arquitectura compararon tres backends gestionados:

| Opción | Puntaje |
|---|---|
| Supabase Free + Cloudflare | 23.5 / 30 |
| Cloudflare Workers + D1 + Better Auth | 20 / 30 |
| Firebase Spark | 15.5 / 30 |

Supabase quedó en primer lugar. Entonces el dueño preguntó para qué hace falta una base de datos si al principio solo él usa la app. Un backend obliga a tener cuentas, MFA, protección contra bots, políticas RLS, un rol admin, operación y riesgo de pausa por inactividad. Nada de eso aporta valor mientras haya un solo usuario.

## Decisión

La v1 es **local-first y sin backend propio**:

- Los datos viven en el navegador (IndexedDB vía Dexie, detrás de un puerto de repositorios; ver ADR-0006).
- Todo el cálculo ocurre en el cliente con un dominio TypeScript puro (ADR-0003).
- Para durabilidad entre dispositivos, el usuario puede sincronizar una copia **cifrada** con su propio Google Drive (ADR-0008, ADR-0009).
- El respaldo y la restauración en JSON versionado son parte del núcleo (ADR-0007).
- El sitio es estático, alojado en Cloudflare en un subdominio del dueño (ADR-0002).
- **No hay cuentas.** Por eso la v1 no necesita MFA ni CAPTCHA. La MFA protege cuentas y el CAPTCHA o la invitación frenan bots que crean cuentas; sin cuentas ni servidor no hay nada que proteger con ellos.
- Compartir en v1 es exportar a PDF o Excel (ADR-0013). Compartir en vivo, el rol admin y las invitaciones pasan a la fase multiusuario diferida (ADR-0020).

## Alternativas consideradas

- **Supabase Free + Cloudflare.** Fue la mejor opción con backend: Postgres con RLS, Auth con TOTP y Edge Functions. Se rechazó para v1 porque exige cuentas, MFA, invitaciones y un rol admin, además de un heartbeat para evitar la pausa de 7 días, que está en zona gris de los términos de servicio. El diseño completo queda archivado en ADR-0020.
- **Cloudflare Workers + D1 + Better Auth.** Más control, pero hay que construir y mantener la autenticación. Es el plan B de backend (plan pagado de US$5/mes si llegara a hacer falta).
- **Firebase Spark.** El admin necesitaría una llave exportada de cuenta de servicio capaz de tomar cualquier cuenta, no hay CAPTCHA verificable en el login y el emulador no soporta TOTP.
- **Appwrite.** Pausa los proyectos tras 7 días de inactividad y, desde el 2026-06-29, borra los proyectos pausados a los 90 días.

## Consecuencias

**Positivas**
- Costo de operación US$0 y ninguna superficie de ataque de servidor.
- Los datos financieros no pasan por infraestructura del proyecto.
- Funciona sin conexión (PWA, ADR-0017) y el repo es más simple de explicar como portafolio.

**Negativas**
- No hay compartir en vivo ni administración central.
- La durabilidad depende del navegador: Safari puede borrar el almacenamiento tras 7 días sin visitas (ADR-0017).
- La sincronización es manual y resuelve conflictos por registro con «último en escribir gana», sin combinar campos.

**Riesgos**
- Pérdida de datos si el usuario borra el almacenamiento y no tiene respaldo ni Drive. Se mitiga con recordatorios de respaldo, `navigator.storage.persist()` y el aviso de Safari.
- Un XSS puede leer IndexedDB, que no está cifrado. La mitigación es la CSP por ruta y la política de dependencias (ADR-0016).
- **Disparadores para revisar esta decisión:** un segundo usuario real, la necesidad de compartir en vivo o el uso simultáneo en varios dispositivos. Cualquiera de ellos reabre ADR-0020.

## Verificación

- No existe código de servidor en el repo: el único despliegue es de activos estáticos (W1-09, W3-17).
- `bundle:check` (W2-12) prueba que la landing no incluye código de Dexie, sincronización, exportación ni Google.
- Las pruebas e2e (W2-11, W4-03, W6-01) confirman que `/` y el simulador no hacen peticiones de red ni escriben almacenamiento, y que los recorridos completos funcionan solo con el navegador y el Drive simulado.
- La CSP de `/` no permite conexiones externas (W2-10).

## Referencias

- ADR-0002, ADR-0003, ADR-0006, ADR-0007, ADR-0008, ADR-0009, ADR-0016, ADR-0017, ADR-0020.
- `docs/specs/2026-10-04-cuotascasa-v1-design.md`, `docs/discovery/`.
- `CLAUDE.md`, sección «Fuera de alcance de v1».
