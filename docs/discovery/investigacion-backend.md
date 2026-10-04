# Investigación: backend

Fecha: 2026-10-04 · Resultado: **sin backend en v1** (ADR-0001). Diseño multiusuario archivado (ADR-0020, Diferido).

## 1. La pregunta inicial

Al principio el producto se pensó con cuentas: el dueño y algunos amigos, cada uno con sus préstamos, un administrador y
compartir en solo lectura. La pregunta era qué backend gratuito sostenía eso con seguridad.

Condiciones de ese momento:

- costo objetivo **US$0** (solo el dominio), con un presupuesto de contingencia de hasta **US$5/mes**;
- **MFA TOTP** obligatorio y una barrera contra bots (solo por invitación, CAPTCHA en formularios);
- un **admin** que gestiona cuentas e invitaciones pero **nunca ve finanzas**, y que eso lo imponga la base de datos, no
  el código de la app;
- compartir en solo lectura con usuarios registrados;
- poder probar todo en local (emuladores) y no quedar atado a un proveedor.

## 2. Opciones evaluadas

Los workflows de arquitectura puntuaron cada opción sobre 30. Aquí quedan los totales y los hechos verificados que los
explican.

| Opción | Puntaje | Veredicto |
|---|---|---|
| Supabase Free + hosting en Cloudflare | **23.5 / 30** | La mejor con backend; archivada para la fase multiusuario |
| Cloudflare Workers + D1 + Better Auth | 20 / 30 | Plan B si algún día se necesita backend propio |
| Firebase (plan Spark) | 15.5 / 30 | Rechazada |
| Appwrite Cloud | — | Descartada por la política de pausa y borrado |

### 2.1 Supabase Free + Cloudflare

Hechos verificados:

- **Postgres con Row Level Security (RLS):** permite que la regla "el admin no ve finanzas" viva en la base de datos.
  Ninguna política de tablas financieras menciona al admin.
- **Auth con TOTP** y nivel de garantía de sesión (`aal2`), útil para exigir MFA en cada política.
- **Edge Functions** para la única operación privilegiada (aprobar invitaciones).
- `generateLink` de tipo *invite* funciona con el registro público deshabilitado, según el código fuente.
- **El plan Free pausa el proyecto tras 7 días de inactividad.** Un proyecto pausado se puede restaurar durante 90 días.
  Evitarlo exige un *heartbeat* (dos veces al día), una zona gris de los términos de servicio.
- **`ban` no revoca sesiones abiertas:** hace falta un JWT corto (15 minutos) y una política restrictiva de usuario activo.
- Un trigger `BEFORE INSERT` en `auth.users` para exigir invitación aprobada era viable, pero **requería un spike**.
- Complementos: Resend como SMTP y Cloudflare Turnstile como CAPTCHA.

### 2.2 Cloudflare Workers + D1 + Better Auth

- Workers y D1 tienen capa gratuita y el hosting ya estaría en Cloudflare.
- Better Auth es una librería de autenticación con soporte de TOTP que corre dentro del Worker.
- **D1 es SQLite sin RLS:** toda la autorización vive en el código del Worker. La garantía "el admin no ve finanzas"
  depende de no equivocarse en ese código.
- Más código propio que mantener (sesiones, invitaciones, recuperación de MFA).
- Si el tráfico lo exigiera, el plan pagado de Workers cuesta **US$5/mes**, dentro del presupuesto de contingencia.

### 2.3 Firebase (Spark)

Se rechazó por tres hechos:

- Las funciones de admin requieren exportar una **llave de cuenta de servicio** que puede tomar control de cualquier
  cuenta. Es el peor secreto posible para un proyecto personal.
- No había un **CAPTCHA verificable en el inicio de sesión**.
- El **emulador no soporta TOTP**, así que el flujo de MFA no se podía probar en local.

### 2.4 Appwrite Cloud

Pausa proyectos tras 7 días de inactividad y, desde el **2026-06-29**, **elimina** los proyectos pausados después de
90 días. Para una app de uso esporádico eso es pérdida de datos programada.

## 3. Diseño multiusuario archivado (Supabase)

Se diseñó completo antes del pivote y se conserva en **ADR-0020 (Diferido)**:

- **Admin = dueño**, registrado en `private.app_admins`; `is_admin()` exige `aal2` y usuario activo.
- **RLS generada** (`apply_owner_rls()`): política restrictiva `aal2 ∧ is_active`, propiedad `owner_id = auth.uid()` y
  lectura compartida.
- **Invitaciones:** el usuario propone (máximo 3 abiertas), el admin aprueba con *step-up* TOTP (menos de 15 minutos),
  el enlace lleva el token en el fragmento de la URL y un asistente pide contraseña (≥ 12 caracteres, zxcvbn ≥ 3) y TOTP.
- **MFA obligatorio** para todos; recuperación con un segundo TOTP y reinicio asistido en dos partes.
- **Sesión:** termina al cerrar el navegador y tras 30 minutos de inactividad.
- **Compartir** solo con usuarios registrados, por `user_id`, con *step-up*.
- **Respaldos** cifrados con `age` en un repositorio privado.

**Cuándo reactivarlo:**

- aparece un segundo usuario real que necesita sus propios datos en la nube;
- se necesita compartir en vivo;
- el dueño usa varios dispositivos al mismo tiempo y la sincronización manual no alcanza.

## 4. El pivote: por qué local-first

El dueño preguntó **por qué hace falta una base de datos si al principio solo él usa la app**. El análisis mostró que,
con un solo usuario, el backend generaba casi todo el trabajo y casi todo el riesgo:

| Con backend | Sin backend (local-first) |
|---|---|
| Cuentas, contraseñas y MFA | No hay cuentas: nada que robar en un servidor |
| Barrera contra bots (CAPTCHA, invitaciones) | No hay formularios de registro que atacar |
| Rol admin y RLS para aislarlo | No hay admin: cada navegador solo tiene sus datos |
| Pausa del plan gratuito y *heartbeat* | Nada que se pause; hosting estático gratuito |
| Datos financieros en un tercero | Datos en el navegador y una copia **cifrada** en el Drive propio |
| Requiere conexión | Funciona sin conexión (PWA) |

Lo que local-first cuesta y cómo se mitiga:

- **Durabilidad del navegador:** el navegador puede borrar los datos (Safari, en especial). Se mitiga con sincronización
  con Google Drive, respaldos JSON, `persist()` y un aviso en Safari. Ver
  [investigacion-almacenamiento-y-sync.md](investigacion-almacenamiento-y-sync.md).
- **Varios dispositivos:** sincronización manual con combinación por registro (última escritura gana).
- **Compartir:** en v1 se comparte exportando PDF o Excel; compartir en vivo queda diferido.
- **Amigos:** cada uno usa la app en su propio navegador, con sus propios datos.

La arquitectura deja la puerta abierta: los puertos de repositorio y `SyncProvider`, y los campos `updatedAt`,
`deletedAt` y `updatedByDevice` en cada registro, permiten agregar un backend después sin rehacer el dominio.

## 5. Fuentes

Consultadas el 2026-10-04.

- Supabase: documentación de RLS, Auth MFA y Edge Functions, y página de precios (pausa del plan Free):
  <https://supabase.com/docs>, <https://supabase.com/pricing>.
- Cloudflare Workers y D1: <https://developers.cloudflare.com/workers/>, <https://developers.cloudflare.com/d1/>.
- Better Auth: <https://www.better-auth.com/docs>.
- Firebase: documentación de Admin SDK, Authentication y Emulator Suite: <https://firebase.google.com/docs>.
- Appwrite: precios y política de proyectos inactivos: <https://appwrite.io/pricing>.
