# Checklist del release v1.0.0

Lista de verificación del release de CuotasCasa v1.0.0 (tarjeta W7-01). Cada fila registra solo el ítem, el resultado y
la fecha. No lleva correos, cuentas, nombres de dispositivos, dominios, IDs de cliente ni capturas (decisión D27 y
decisión del dueño del 2026-10-21).

Resultados posibles: **aprobado**, **fallido** (con su tarjeta de corrección), **pendiente** o **no aplica**.

## 1. Revisión de seguridad (antes del despliegue)

| Ítem | Resultado | Fecha |
|---|---|---|
| `pnpm audit --prod`: vulnerabilidades altas o críticas | aprobado: 0 en total (0 críticas, 0 altas, 0 moderadas, 0 bajas) | 2026-10-21 |
| gitleaks sobre el historial completo (`gitleaks git --config .gitleaks.toml --redact .`) | aprobado: 0 hallazgos | 2026-10-21 |
| Cifrado contra ADR-0009: PBKDF2-SHA256 con piso de 600 000 y techo de 10 000 000 iteraciones, revisados antes de derivar y de descifrar | aprobado | 2026-10-21 |
| Cifrado: sal aleatoria de 16 bytes, nueva al cambiar la frase y distinta de la anterior | aprobado | 2026-10-21 |
| Cifrado: IV aleatorio de 96 bits por cada cifrado, con prueba de unicidad | aprobado | 2026-10-21 |
| Cifrado: clave AES-GCM 256 no exportable, usos exactos `encrypt` y `decrypt`; la frase nunca se guarda | aprobado | 2026-10-21 |
| Cifrado: la cabecera completa del sobre va como AAD; errores con código fijo, sin texto en claro | aprobado | 2026-10-21 |
| Token de Drive: solo en memoria (variable de cierre), nunca en almacenamiento; se revoca al desconectar y cuando llega tarde | aprobado | 2026-10-21 |
| Token de Drive: un token con alcance insuficiente o vencimiento inválido también se revoca al rechazarlo | aprobado: corregido en el PR #100 | 2026-10-21 |
| Políticas CSP y Trusted Types de `tools/edge/headers/policies.mjs` contra ADR-0021 y lo que la app usa | aprobado: copia literal de ADR-0021 §7; sin `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`; Google solo en `/app` y con ruta | 2026-10-21 |
| Herramienta para el barrido de CSP con Playwright contra la URL de producción | aprobado: `smoke-csp.mjs --base-url` (PR #100) | 2026-10-21 |
| Almacén de claves: no guarda ni carga una clave por debajo del piso de iteraciones (defensa en profundidad) | aprobado: PR #100 | 2026-10-21 |
| Arranque fallido: la consola registra solo el nombre del error, nunca el objeto ni su mensaje | aprobado: PR #100 | 2026-10-21 |
| Bitácora del oráculo: línea de la corrida del motor previa a W4-02 y declaración del dueño del 2026-10-21 | aprobado: PR #100 | 2026-10-21 |
| Documento de evidencia del spike: remite al archivo de `tools/spikes/` retirado | aprobado: PR #100 | 2026-10-21 |
| La prueba del release corre en `pnpm test` y en CI (proyecto `docs/release` en `vitest.config.ts`) | aprobado: PR #100 | 2026-10-21 |
| Higiene en CI: marca `synthetic: true` en cada PR y en cada push a `main`; correo noreply en cada commit del PR | aprobado: W7-02 (PR #97) | 2026-10-21 |
| Tope de 20 MiB al importar un respaldo y al descargar de Drive | aprobado: W7-03 (PR #98) | 2026-10-21 |
| «Borrar datos de este dispositivo» en Ajustes; la copia de Drive no se toca | aprobado: W7-04 (PR #99) | 2026-10-21 |
| `PENDING_RELEASE_CARDS` vacía y `node docs/release/traceability.mjs --check --release` en verde | aprobado | 2026-10-21 |
| `docs/release/` sin identificadores reales: gitleaks y lista local de términos con 0 coincidencias | aprobado | 2026-10-21 |

## 2. Pendiente del dueño

Cada ítem lo hace el dueño. Opus solo anota aquí el resultado y la fecha.

| Ítem | Guía | Resultado | Fecha |
|---|---|---|---|
| Dominio comprado y subdominio de la app elegido | `docs/plan/README.md` §7 | pendiente | — |
| Cloudflare: dominio agregado, token de API mínimo, ruta del Worker y entorno protegido `production` en GitHub | `docs/guides/cloudflare-deploy.md` | pendiente | — |
| Pantalla de consentimiento de Google **publicada** («En producción»), con el alcance `drive.appdata` | `docs/guides/google-cloud-setup.md` | pendiente | — |
| Secret scanning y push protection activos en el repositorio (nueva verificación) | ADR-0015 | pendiente | — |
| Cloudflare Web Analytics apagado, en la zona y en el Worker | `docs/guides/cloudflare-deploy.md` | pendiente | — |
| `DEPLOY_ENABLED` = `true` como variable del repositorio, después de la compuerta de despliegue | `docs/guides/cloudflare-deploy.md` | pendiente | — |
| `pnpm edge:check --base-url https://<subdominio>.<tu-dominio>` contra producción sale con código 0 | `docs/guides/cloudflare-deploy.md` | pendiente | — |
| Barrido de CSP con Playwright contra la URL de producción: `pnpm exec node tools/edge/headers/smoke-csp.mjs --base-url https://<subdominio>.<tu-dominio>` sale con código 0 (0 violaciones) | `docs/guides/cloudflare-deploy.md` | pendiente | — |
| Checklist manual de Drive completo (sección 3) | `docs/guides/drive-sync-manual-checklist.md` | pendiente | — |
| «Borrar datos de este dispositivo» en un dispositivo real: los datos locales y la clave desaparecen y la copia de Drive sigue | W7-04 | pendiente | — |

## 3. Checklist manual de Drive, ítem por ítem

Numeración `<paso>.<casilla>` de `docs/guides/drive-sync-manual-checklist.md`. El texto es un resumen; manda la guía.

| Ítem | Qué se comprueba | Resultado | Fecha |
|---|---|---|---|
| 1.1 | Abre `/app/ajustes` (o la sección Ajustes). Drive no dice «no configurado». | pendiente | — |
| 1.2 | Pulsa Conectar Drive. Se carga el script de Google (solo ahora) y aparece Continuar con Google. | pendiente | — |
| 1.3 | Pulsa Continuar con Google. Se abre la ventana de Google con el nombre de la app y un único permiso: «Ver y … | pendiente | — |
| 1.4 | La ventana no muestra «Acceso bloqueado» ni «Google no ha verificado esta app» como bloqueo. Si aparece una nota … | pendiente | — |
| 1.5 | En Google Auth Platform, el estado de publicación sigue En producción. | pendiente | — |
| 1.6 | Define la frase de prueba. Tras conectar, el estado dice Sincronizado (o ofrece sincronizar) y no pide la frase otra … | pendiente | — |
| 1.7 | Pulsa Sincronizar con un préstamo de prueba creado. Estado Sincronizado. | pendiente | — |
| 2.1 | Pulsa Conectar Drive: debe cargar GIS sin abrir ventana todavía y mostrar Continuar con Google. | pendiente | — |
| 2.2 | Pulsa Continuar con Google: la ventana de Google se abre sin que Safari la bloquee (es un solo gesto directo del … | pendiente | — |
| 2.3 | Si Safari la bloqueó, anótalo como defecto (la conexión de dos pasos existe justamente para evitarlo) y prueba la … | pendiente | — |
| 2.4 | Completa la conexión y sincroniza. | pendiente | — |
| 3.1 | En B, abre la app y conecta Drive con el mismo flujo de dos pasos y la misma cuenta de Google. | pendiente | — |
| 3.2 | B pide la frase (la copia remota existe) y, con la frase de prueba, descarga y muestra el préstamo de prueba creado … | pendiente | — |
| 3.3 | Cierra y reabre la app en B: no vuelve a pedir la frase (clave guardada en ese dispositivo). | pendiente | — |
| 3.4 | Edita un préstamo distinto en cada dispositivo (A y B), sincroniza en ambos y vuelve a sincronizar en A: los dos … | pendiente | — |
| 3.5 | Edita el mismo registro en A y en B, sincroniza A y luego B: queda la edición más reciente (limitación aceptada … | pendiente | — |
| 3.6 | Borra un préstamo en A, sincroniza A y luego B: el préstamo desaparece también en B (R12-b). | pendiente | — |
| 4.1 | En un navegador o perfil limpio, conecta Drive y escribe una frase equivocada. | pendiente | — |
| 4.2 | La app muestra «La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo» y no cambia nada local ni … | pendiente | — |
| 4.3 | Con la frase correcta, entra normalmente. | pendiente | — |
| 5.1 | En A, abre Cambiar frase, escribe una frase nueva dos veces y guarda. Aparece «Frase cambiada. Los otros … | pendiente | — |
| 5.2 | En B, pulsa Sincronizar: B pide la frase («La frase cambió en otro dispositivo: ingrésala de nuevo»). | pendiente | — |
| 5.3 | La frase vieja en B es rechazada y no cambia nada; la nueva funciona y B sincroniza. | pendiente | — |
| 5.4 | En A, Sincronizar sigue funcionando sin pedir frase. | pendiente | — |
| 6.1 | Con A conectado y sincronizado, déjalo abierto algo más de 60 minutos. | pendiente | — |
| 6.2 | Pulsa Sincronizar: la app muestra Falta autorizar Drive o abre una ventana de Google dentro de la sincronización que … | pendiente | — |
| 6.3 | La app nunca abre una ventana de Google por sí sola, sin que pulses nada. | pendiente | — |
| 6.4 | Sus datos locales siguen intactos durante todo el período. | pendiente | — |
| 7.1 | Desactiva la red en A y edita un préstamo: la app sigue funcionando y muestra cambios sin sincronizar (n). | pendiente | — |
| 7.2 | Pulsa Sincronizar sin red: estado Sin conexión con Drive, sin perder datos. | pendiente | — |
| 7.3 | Reactiva la red y sincroniza: queda Sincronizado. | pendiente | — |
| 8.1 | Abre `/app`, navega a un par de pantallas y espera a que cargue por completo. | pendiente | — |
| 8.2 | Apaga la red, recarga `/app` y `/app/prestamos/nuevo`: cargan desde caché. | pendiente | — |
| 8.3 | Se ve el aviso de Safari («Safari puede borrar los datos de este sitio si no lo abres durante 7 días…»); se puede … | pendiente | — |
| 8.4 | En Safari de Mac, Archivo → Agregar al Dock: la app instalada abre sin el aviso. Anota si el aviso desaparece (la … | pendiente | — |
| 8.5 | Anota la versión de Safari y de macOS/iOS. | pendiente | — |
| 9.1 | La app carga y funciona. | pendiente | — |
| 9.2 | ¿Aparece el aviso de almacenamiento? Según ADR-0017 hoy solo se muestra en Safari. Anota qué ves. | pendiente | — |
| 9.3 | Anota el resultado y entrégalo a Opus: si se confirma el mismo riesgo de borrado, se amplía la detección a todos los … | pendiente | — |
| 10.1 | En A, pulsa Desconectar Drive. El estado pasa a Drive desconectado y los datos locales siguen ahí. | pendiente | — |
| 10.2 | En tu cuenta de Google → Seguridad → conexiones con apps de terceros (o «Tus conexiones con apps y servicios de … | pendiente | — |
| 10.3 | Reconecta: Google vuelve a pedir el consentimiento completo. | pendiente | — |
| 10.4 | Con la pestaña ya desconectada, Sincronizar no abre ninguna ventana de Google por sí sola. | pendiente | — |
| 11.1 | En Ajustes, Exportar respaldo cifrado: pide «la misma frase que usas para Drive». Se descarga el archivo y aparece … | pendiente | — |
| 11.2 | Abre el archivo en un editor de texto: no se ve ningún monto ni nombre, solo texto cifrado. | pendiente | — |
| 11.3 | En un navegador o perfil limpio, Importar el archivo con la frase de Drive: se ve la vista previa y, al aceptar, los … | pendiente | — |
| 11.4 | Con una frase incorrecta, la importación falla con un error claro y no cambia nada. | pendiente | — |
| 12.1 | En un navegador con sesión nueva, exporta a Excel, CSV o PDF: antes de la primera descarga de la sesión aparece el … | pendiente | — |
| 12.2 | En la segunda exportación de la misma sesión, el aviso no vuelve a aparecer. | pendiente | — |
| 12.3 | En Safari, espera un par de minutos antes de aceptar el aviso: la descarga sigue funcionando (la descarga ocurre … | pendiente | — |
| 12.4 | Exportar respaldo JSON (sin cifrar) muestra su propio aviso. | pendiente | — |
| 13.1 | Con la versión N cargada en un navegador (pestaña abierta o app instalada), despliega la versión N+1 (cualquier … | pendiente | — |
| 13.2 | Recarga o espera: aparece «Hay una versión nueva de CuotasCasa.» con el botón Actualizar. | pendiente | — |
| 13.3 | Al pulsar Actualizar, la app recarga con la versión nueva y los datos locales siguen intactos. | pendiente | — |
| 13.4 | Si estás en Drive conectado, sigue conectado o pide autorizar de nuevo (el token vive en memoria), pero no pide la … | pendiente | — |
| 14.1 | Con otra cuenta de Google que nunca usó la app (o tras revocar en el paso 10), conecta: no aparece «Acceso bloqueado». | pendiente | — |
| 15.1 | En Google Drive → Configuración → Administrar aplicaciones → CuotasCasa → Borrar datos ocultos de la app (ADR-0008 … | pendiente | — |
| 15.2 | Borra los préstamos de prueba y la frase de prueba de tu gestor de contraseñas. | pendiente | — |
| V.1 | Verificación de la lista completa: cada casilla de los pasos 1 a 14 está marcada o tiene un hallazgo anotado | pendiente | — |
| V.2 | Cada fila de la tabla «Qué requisito cubre cada paso» tiene al menos un paso aprobado | pendiente | — |
| V.3 | Ningún dato real, ID de cliente, dominio ni frase quedó escrito en el repositorio, un issue o una captura | pendiente | — |

## 4. Riesgos residuales

### Validación privada del oráculo y del motor

`docs/specs/oracle-validation-log.md` registra cada gate como «validación privada: no autorizada». En cada uno, el
oráculo y el motor se validaron solo contra los ejemplos sintéticos de `docs/algorithm.md` y
`docs/specs/algorithm-examples/`. Queda sin cubrir un error común al motor TypeScript y al oráculo Python que esos
ejemplos no ejerciten: si los dos leen igual de mal una regla `[ALG.*]`, los fixtures y el motor coinciden entre sí y
el error pasa la compuerta.

| Gate | Fecha | Estado | Riesgo residual |
|---|---|---|---|
| W2-01 | 2026-10-09 | validación privada: no autorizada | Oráculo validado solo contra los ejemplos sintéticos; perfil `core` sin otra fuente de datos |
| W3-01 | 2026-10-09 | validación privada: no autorizada | Igual que W2-01, con el perfil `full`; también en `docs/specs/conformance-triage.md` |
| W4-01 | 2026-10-16 | validación privada: no autorizada | Igual que W3-01, tras regenerar los perfiles con el mismo oráculo |
| W4-02 | 2026-10-16 | validación privada: no autorizada | Corrida privada del motor (`motor 5fd6ab4`) previa al merge de W4-02, no autorizada por pedido del dueño en W4-01: el motor se validó solo contra los fixtures del oráculo y los ejemplos sintéticos |

### Sin tabla privada del banco (decisión del dueño, 2026-10-21)

La declaración consta también en `docs/specs/oracle-validation-log.md` («Autorizaciones del dueño»).

El dueño no tiene una tabla real del banco, así que el motor **nunca se comparó con una tabla real**. El release v1.0.0
sale con ese riesgo aceptado: los cálculos coinciden al centavo con el oráculo independiente y con los ejemplos
sintéticos, pero nadie los contrastó con un préstamo real. Si el dueño consigue una tabla más adelante, puede
compararla en privado, fuera del repositorio y con las herramientas de `docs/plan/README.md` §6. De esa tabla
nunca se publica nada, ni sus valores ni el detalle de la comparación: en la bitácora solo cabe la línea sí/no de
`--log-line`.

### Otros riesgos aceptados para v1

| Riesgo | Dónde se documenta |
|---|---|
| IndexedDB local sin cifrar y sin bloqueo propio de la app | `docs/security/threat-model.md`, riesgos residuales; ADR-0009, decisión 9 |
| Safari (ITP) puede borrar el almacenamiento tras 7 días sin visitar el sitio; la exención de las apps instaladas no está verificada | ADR-0017; checklist manual, paso 8 |
| Navegadores de iOS distintos de Safari: el aviso de almacenamiento solo sale en Safari | ADR-0017, enmienda de W3; checklist manual, paso 9 |
| `style-src 'unsafe-inline'` deja abierta la inyección de CSS | ADR-0021, «Consecuencias» |
| La coincidencia por ruta de `connect-src` con Google real solo se prueba en producción | ADR-0021, «Riesgos»; barrido de CSP de la sección 2 |
| La lista local de términos prohibidos no corre en CI: es privada y vive solo en el equipo del dueño | ADR-0015, decisión 6; W7-02 |
| «Borrar datos de este dispositivo» puede quedar a medias si el navegador bloquea un borrado (otra pestaña abierta); la app lo dice y pide cerrar las demás pestañas y reintentar | ADR-0017, enmienda de W7; `docs/security/threat-model.md` |

## 5. Firma

Este checklist queda **firmado por el dueño mediante la aprobación del PR de release**. La firma no se escribe en
ningún archivo: ni nombre, ni usuario de GitHub, ni correo. El tag v1.0.0 se crea solo después de esa aprobación, con
todas las filas de las secciones 1 a 3 en «aprobado» o «no aplica» (o «fallido» con su tarjeta fusionada).
