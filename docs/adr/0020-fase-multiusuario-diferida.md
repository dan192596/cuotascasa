# ADR-0020: Fase multiusuario diferida (diseño Supabase archivado)

Estado: Diferido

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

Entre los pedidos originales del dueño estaban un tipo de usuario (luego, también un admin), MFA para frenar bots e historial compartible. Los flujos de arquitectura compararon backends gestionados: Supabase Free + Cloudflare obtuvo 23.5/30, Cloudflare Workers + D1 + Better Auth 20/30 y Firebase Spark 15.5/30. Con Supabase como ganador se diseñó en detalle una versión multiusuario.

Después, el dueño preguntó para qué hace falta una base de datos si al principio solo él usa la app. La respuesta llevó a la arquitectura local-first (ADR-0001). Aclaración que motivó el cambio: **la MFA protege cuentas y la invitación o el CAPTCHA frenan bots**; sin cuentas, ninguno hace falta.

Este ADR **archiva** el diseño multiusuario con detalle suficiente para retomarlo sin repetir la investigación.

## Decisión

La fase multiusuario **se difiere**. v1 no tiene cuentas, login, MFA, rol admin, invitaciones ni compartir en vivo. Compartir en v1 es exportar a PDF o Excel (ADR-0013). Cualquier tarjeta que introduzca autenticación o servidor queda fuera del plan.

### Diseño archivado

**Plataforma**
- **Supabase Free:** Postgres con RLS, Auth con TOTP y una sola Edge Function, `admin`.
- **Cloudflare** para el hosting estático, igual que en v1.
- **Resend** como SMTP de los correos de autenticación.
- **Turnstile** como CAPTCHA.
- Presupuesto de contingencia de hasta **US$5/mes**.

**Roles**
- **Admin = dueño.** El rol vive en `private.app_admins` (esquema no expuesto). `is_admin()` exige sesión `aal2` y usuario activo.
- El admin ve **datos de cuenta** (usuarios, estado, invitaciones), **nunca finanzas**. Lo garantiza la base de datos: ninguna política de una tabla financiera menciona al admin.

**RLS en tablas financieras**

Una función generada, `apply_owner_rls()`, aplica a cada tabla tres políticas:

- una política **RESTRICTIVE** que exige `aal2` y `is_active()`;
- lectura y escritura solo si `owner_id = auth.uid()`;
- lectura para quien recibió el préstamo compartido.

**Registro solo por invitación**
1. Un trigger `BEFORE INSERT` en `auth.users` exige una invitación aprobada y vigente para ese correo. **Requiere un spike** para confirmar que Supabase lo permite y se comporta como se espera.
2. Un usuario propone una invitación con la RPC `propose_invitation`, con un máximo de 3 abiertas.
3. El admin la aprueba con *step-up* TOTP: verificación de menos de 15 minutos, comprobada con el claim `amr`.
4. La Edge Function `admin` llama a `generateLink` de tipo `invite`, que según el código fuente funciona aunque el registro público esté desactivado. El correo sale por Resend.
5. El enlace lleva el token en el **fragmento** de la URL, que no llega a los logs del servidor.
6. Un asistente pide contraseña (mínimo 12 caracteres y puntuación zxcvbn ≥ 3) y el enrolamiento TOTP.

**MFA y sesiones**
- TOTP **obligatorio para todos**; las políticas RESTRICTIVE exigen `aal2`.
- Recuperación: un segundo factor TOTP registrado al enrolarse, más un restablecimiento asistido en dos partes, a detallar al retomar.
- La sesión termina al cerrar el navegador y tras 30 minutos de inactividad. El JWT dura 15 minutos.

**Desactivar un usuario**
- `is_active()` en la política RESTRICTIVE corta el acceso a los datos de inmediato.
- Además se aplica un *ban* en Auth. El ban no revoca sesiones existentes, por eso se combina con `is_active()` y con JWT cortos.

**Compartir**
- Solo lectura y solo con usuarios registrados, identificados por su `user_id`. No hay búsqueda por correo.
- Compartir exige *step-up* TOTP y se puede revocar.

**Operación**
- Supabase Free pausa los proyectos tras 7 días sin actividad. Se evita con un *heartbeat* dos veces al día. Esto está en **zona gris de los términos de servicio**. Un proyecto pausado se puede restaurar durante 90 días.
- Respaldos propios cifrados con `age` en un repositorio privado.

**Plan B de backend:** Cloudflare Workers + D1 + Better Auth (plan pagado de US$5/mes si hiciera falta). Más control, pero la autenticación hay que construirla y mantenerla.

**Puente desde v1.** El modelo de datos de v1 (ADR-0005) ya tiene ids UUID, `createdAt`, `updatedAt` y borrado lógico, lo que facilita mapearlo a tablas con `owner_id`. El respaldo JSON (ADR-0007) sirve como vía de importación inicial, y el puerto `SyncProvider` (ADR-0008) admite otro proveedor.

### Disparadores para retomarla

Cualquiera de estos reabre la fase:

1. **Un segundo usuario real y recurrente**, no un amigo ocasional en su propio navegador.
2. **Necesidad de compartir en vivo**, es decir, que otra persona vea datos actualizados sin recibir un archivo.
3. **Uso simultáneo en varios dispositivos** donde la sincronización manual con «último en escribir gana» por registro ya no alcance.

### Cómo retomarla

1. Volver a verificar los hechos externos, que cambian con el tiempo: límites y precios de Supabase Free, política de pausa, comportamiento de `generateLink` y de los triggers en `auth.users`, y alternativas vigentes.
2. Spikes: trigger de invitación, `generateLink` con el registro desactivado, *step-up* con `amr` y pruebas de RLS que demuestren que el admin no lee finanzas.
3. Escribir un ADR nuevo que reemplace a este, con estado Propuesto, aprobado por el dueño.
4. Planificar las olas con el mismo proceso (ADR-0019).

## Alternativas consideradas

- **Construir la fase multiusuario en v1.** Añade cuentas, MFA, operación y riesgo de pausa sin un segundo usuario que lo justifique. Descartada por ahora.
- **Firebase.** El admin necesitaría una llave exportada de cuenta de servicio capaz de tomar el control de cualquier cuenta, no hay CAPTCHA verificable en el login y el emulador no soporta TOTP. Rechazada.
- **Appwrite.** Pausa proyectos tras 7 días y, desde el 2026-06-29, borra los proyectos pausados a los 90 días. Rechazada.
- **Descartar el diseño sin archivarlo.** Obligaría a repetir la investigación. Descartada.

## Consecuencias

**Positivas**
- v1 cuesta US$0 de operación y no guarda datos personales en servidores.
- No hay MFA, CAPTCHA, roles ni políticas RLS que mantener ni auditar.
- La superficie de ataque es solo el cliente (ADR-0016).

**Negativas**
- No hay compartir en vivo: se comparte con archivos exportados.
- Cada amigo usa la app en su navegador, sin cuenta.
- Varios dispositivos solo se coordinan con la sincronización manual por Drive.

**Riesgos**
- Que los hechos archivados queden obsoletos (precios, límites, APIs). Mitigación: revalidarlos al retomar (paso 1).
- Que el modelo de datos de v1 no encaje con RLS por dueño. Mitigación: los campos de sincronización y los UUID ya facilitan la migración.

## Verificación

- `CLAUDE.md` lista la fase multiusuario como fuera de alcance de v1.
- La revisión de Opus rechaza cualquier PR que agregue autenticación, servidor o dependencias de backend.
- W7-01 confirma que este ADR sigue en estado Diferido y que sus disparadores están listados.

## Referencias

- ADR-0001, ADR-0005, ADR-0007, ADR-0008, ADR-0013, ADR-0016, ADR-0019.
- `docs/discovery/` (comparativa de backends).
- Tarjeta W7-01.
