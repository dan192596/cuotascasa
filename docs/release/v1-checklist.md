# Checklist del release v1.0.0

Lista de verificación del release de CuotasCasa v1.0.0 (tarjeta W7-01). Cada fila registra solo el ítem, el resultado y
la fecha. No lleva correos, cuentas, nombres de dispositivos, dominios, IDs de cliente ni capturas (decisión D27 y
decisión del dueño del 2026-10-21).

Resultados posibles: **aprobado**, **fallido** (con su tarjeta de corrección), **pendiente**, **no aplica** o
**diferido** (el dueño decidió no probarlo antes de v1; queda en los riesgos residuales de la sección 4).

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
| Dominio comprado y subdominio de la app elegido | `docs/plan/README.md` §7 | aprobado | 2026-10-21 |
| Cloudflare: dominio agregado, token de API mínimo, ruta del Worker y entorno protegido `production` en GitHub | `docs/guides/cloudflare-deploy.md` | aprobado | 2026-10-21 |
| Pantalla de consentimiento de Google **publicada** («En producción»), con el alcance `drive.appdata` | `docs/guides/google-cloud-setup.md` | aprobado: sin verificación requerida, porque el único alcance es `drive.appdata` | 2026-10-21 |
| Secret scanning y push protection activos en el repositorio (nueva verificación) | ADR-0015 | aprobado | 2026-10-21 |
| Cloudflare Web Analytics apagado, en la zona y en el Worker | `docs/guides/cloudflare-deploy.md` | aprobado: la zona traía Real User Monitoring activo por defecto e inyectaba su script; se desactivó por completo (sección 4) | 2026-10-21 |
| `DEPLOY_ENABLED` = `true` como variable del repositorio, después de la compuerta de despliegue | `docs/guides/cloudflare-deploy.md` | aprobado | 2026-10-21 |
| `pnpm edge:check --base-url https://<subdominio>.<tu-dominio>` contra producción sale con código 0 | `docs/guides/cloudflare-deploy.md` | aprobado: 17 comprobaciones de ruteo y 12 de cabeceras, tras el PR #103 | 2026-10-21 |
| Barrido de CSP con Playwright contra la URL de producción: `pnpm exec node tools/edge/headers/smoke-csp.mjs --base-url https://<subdominio>.<tu-dominio>` sale con código 0 (0 violaciones) | `docs/guides/cloudflare-deploy.md` | aprobado: 5 de 5 rutas sin violaciones, tras el PR #103 | 2026-10-21 |
| Checklist manual de Drive completo (sección 3) | `docs/guides/drive-sync-manual-checklist.md` | aprobado en parte: los pasos no probados quedan diferidos (sección 3) | 2026-10-21 |
| «Borrar datos de este dispositivo» en un dispositivo real: los datos locales y la clave desaparecen y la copia de Drive sigue | W7-04 | diferido | 2026-10-21 |

## 3. Checklist manual de Drive, ítem por ítem

Numeración `<paso>.<casilla>` de `docs/guides/drive-sync-manual-checklist.md`. El texto es un resumen; manda la guía.

| Ítem | Qué se comprueba | Resultado | Fecha |
|---|---|---|---|
| 1.1 | Abre `/app/ajustes` (o la sección Ajustes). Drive no dice «no configurado». | aprobado | 2026-10-21 |
| 1.2 | Pulsa Conectar Drive. Se carga el script de Google (solo ahora) y aparece Continuar con Google. | aprobado | 2026-10-21 |
| 1.3 | Pulsa Continuar con Google. Se abre la ventana de Google con el nombre de la app y un único permiso: «Ver y … | aprobado: la solicitud de autorización pide solo `drive.appdata` | 2026-10-21 |
| 1.4 | La ventana no muestra «Acceso bloqueado» ni «Google no ha verificado esta app» como bloqueo. Si aparece una nota … | aprobado | 2026-10-21 |
| 1.5 | En Google Auth Platform, el estado de publicación sigue En producción. | aprobado | 2026-10-21 |
| 1.6 | Define la frase de prueba. Tras conectar, el estado dice Sincronizado (o ofrece sincronizar) y no pide la frase otra … | aprobado | 2026-10-21 |
| 1.7 | Pulsa Sincronizar con un préstamo de prueba creado. Estado Sincronizado. | aprobado | 2026-10-21 |
| 2.1 | Pulsa Conectar Drive: debe cargar GIS sin abrir ventana todavía y mostrar Continuar con Google. | diferido | 2026-10-21 |
| 2.2 | Pulsa Continuar con Google: la ventana de Google se abre sin que Safari la bloquee (es un solo gesto directo del … | diferido | 2026-10-21 |
| 2.3 | Si Safari la bloqueó, anótalo como defecto (la conexión de dos pasos existe justamente para evitarlo) y prueba la … | diferido | 2026-10-21 |
| 2.4 | Completa la conexión y sincroniza. | diferido | 2026-10-21 |
| 3.1 | En B, abre la app y conecta Drive con el mismo flujo de dos pasos y la misma cuenta de Google. | aprobado: B fue un segundo navegador del mismo equipo, con su propio almacenamiento | 2026-10-21 |
| 3.2 | B pide la frase (la copia remota existe) y, con la frase de prueba, descarga y muestra el préstamo de prueba creado … | aprobado | 2026-10-21 |
| 3.3 | Cierra y reabre la app en B: no vuelve a pedir la frase (clave guardada en ese dispositivo). | aprobado: B se recargó varias veces sin volver a pedir la frase | 2026-10-21 |
| 3.4 | Edita un préstamo distinto en cada dispositivo (A y B), sincroniza en ambos y vuelve a sincronizar en A: los dos … | aprobado: en los dos sentidos | 2026-10-21 |
| 3.5 | Edita el mismo registro en A y en B, sincroniza A y luego B: queda la edición más reciente (limitación aceptada … | aprobado | 2026-10-21 |
| 3.6 | Borra un préstamo en A, sincroniza A y luego B: el préstamo desaparece también en B (R12-b). | aprobado: borrado en B y propagado a A | 2026-10-21 |
| 4.1 | En un navegador o perfil limpio, conecta Drive y escribe una frase equivocada. | aprobado: probado en B al pedir la frase tras el cambio del paso 5 | 2026-10-21 |
| 4.2 | La app muestra «La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo» y no cambia nada local ni … | aprobado | 2026-10-21 |
| 4.3 | Con la frase correcta, entra normalmente. | aprobado | 2026-10-21 |
| 5.1 | En A, abre Cambiar frase, escribe una frase nueva dos veces y guarda. Aparece «Frase cambiada. Los otros … | aprobado | 2026-10-21 |
| 5.2 | En B, pulsa Sincronizar: B pide la frase («La frase cambió en otro dispositivo: ingrésala de nuevo»). | aprobado | 2026-10-21 |
| 5.3 | La frase vieja en B es rechazada y no cambia nada; la nueva funciona y B sincroniza. | aprobado | 2026-10-21 |
| 5.4 | En A, Sincronizar sigue funcionando sin pedir frase. | aprobado | 2026-10-21 |
| 6.1 | Con A conectado y sincronizado, déjalo abierto algo más de 60 minutos. | diferido | 2026-10-21 |
| 6.2 | Pulsa Sincronizar: la app muestra Falta autorizar Drive o abre una ventana de Google dentro de la sincronización que … | diferido | 2026-10-21 |
| 6.3 | La app nunca abre una ventana de Google por sí sola, sin que pulses nada. | diferido | 2026-10-21 |
| 6.4 | Sus datos locales siguen intactos durante todo el período. | diferido | 2026-10-21 |
| 7.1 | Desactiva la red en A y edita un préstamo: la app sigue funcionando y muestra cambios sin sincronizar (n). | aprobado: la red caída se simuló en B; en A no se observó el contador | 2026-10-21 |
| 7.2 | Pulsa Sincronizar sin red: estado Sin conexión con Drive, sin perder datos. | fallido: el estado seguía en «Cambios sin sincronizar (n)», sin decir que falló la red; corrección en el PR #104 | 2026-10-21 |
| 7.3 | Reactiva la red y sincroniza: queda Sincronizado. | aprobado: el cambio hecho sin red llegó al otro navegador | 2026-10-21 |
| 8.1 | Abre `/app`, navega a un par de pantallas y espera a que cargue por completo. | diferido | 2026-10-21 |
| 8.2 | Apaga la red, recarga `/app` y `/app/prestamos/nuevo`: cargan desde caché. | diferido | 2026-10-21 |
| 8.3 | Se ve el aviso de Safari («Safari puede borrar los datos de este sitio si no lo abres durante 7 días…»); se puede … | diferido | 2026-10-21 |
| 8.4 | En Safari de Mac, Archivo → Agregar al Dock: la app instalada abre sin el aviso. Anota si el aviso desaparece (la … | diferido | 2026-10-21 |
| 8.5 | Anota la versión de Safari y de macOS/iOS. | diferido | 2026-10-21 |
| 9.1 | La app carga y funciona. | diferido | 2026-10-21 |
| 9.2 | ¿Aparece el aviso de almacenamiento? Según ADR-0017 hoy solo se muestra en Safari. Anota qué ves. | diferido | 2026-10-21 |
| 9.3 | Anota el resultado y entrégalo a Opus: si se confirma el mismo riesgo de borrado, se amplía la detección a todos los … | diferido | 2026-10-21 |
| 10.1 | En A, pulsa Desconectar Drive. El estado pasa a Drive desconectado y los datos locales siguen ahí. | diferido | 2026-10-21 |
| 10.2 | En tu cuenta de Google → Seguridad → conexiones con apps de terceros (o «Tus conexiones con apps y servicios de … | diferido | 2026-10-21 |
| 10.3 | Reconecta: Google vuelve a pedir el consentimiento completo. | diferido | 2026-10-21 |
| 10.4 | Con la pestaña ya desconectada, Sincronizar no abre ninguna ventana de Google por sí sola. | diferido | 2026-10-21 |
| 11.1 | En Ajustes, Exportar respaldo cifrado: pide «la misma frase que usas para Drive». Se descarga el archivo y aparece … | aprobado | 2026-10-21 |
| 11.2 | Abre el archivo en un editor de texto: no se ve ningún monto ni nombre, solo texto cifrado. | aprobado: solo parámetros del sobre y texto cifrado | 2026-10-21 |
| 11.3 | En un navegador o perfil limpio, Importar el archivo con la frase de Drive: se ve la vista previa y, al aceptar, los … | aprobado: importado en A, no en un perfil limpio | 2026-10-21 |
| 11.4 | Con una frase incorrecta, la importación falla con un error claro y no cambia nada. | aprobado | 2026-10-21 |
| 12.1 | En un navegador con sesión nueva, exporta a Excel, CSV o PDF: antes de la primera descarga de la sesión aparece el … | aprobado | 2026-10-21 |
| 12.2 | En la segunda exportación de la misma sesión, el aviso no vuelve a aparecer. | aprobado | 2026-10-21 |
| 12.3 | En Safari, espera un par de minutos antes de aceptar el aviso: la descarga sigue funcionando (la descarga ocurre … | diferido | 2026-10-21 |
| 12.4 | Exportar respaldo JSON (sin cifrar) muestra su propio aviso. | aprobado | 2026-10-21 |
| 13.1 | Con la versión N cargada en un navegador (pestaña abierta o app instalada), despliega la versión N+1 (cualquier … | diferido | 2026-10-21 |
| 13.2 | Recarga o espera: aparece «Hay una versión nueva de CuotasCasa.» con el botón Actualizar. | diferido | 2026-10-21 |
| 13.3 | Al pulsar Actualizar, la app recarga con la versión nueva y los datos locales siguen intactos. | diferido | 2026-10-21 |
| 13.4 | Si estás en Drive conectado, sigue conectado o pide autorizar de nuevo (el token vive en memoria), pero no pide la … | diferido | 2026-10-21 |
| 14.1 | Con otra cuenta de Google que nunca usó la app (o tras revocar en el paso 10), conecta: no aparece «Acceso bloqueado». | diferido | 2026-10-21 |
| 15.1 | En Google Drive → Configuración → Administrar aplicaciones → CuotasCasa → Borrar datos ocultos de la app (ADR-0008 … | diferido | 2026-10-21 |
| 15.2 | Borra los préstamos de prueba y la frase de prueba de tu gestor de contraseñas. | diferido | 2026-10-21 |
| V.1 | Verificación de la lista completa: cada casilla de los pasos 1 a 14 está marcada o tiene un hallazgo anotado | aprobado: cada casilla de los pasos 1 a 14 está aprobada, fallida con su corrección o diferida | 2026-10-21 |
| V.2 | Cada fila de la tabla «Qué requisito cubre cada paso» tiene al menos un paso aprobado | aprobado en parte: R12-a, R12-b, R12-d, R12-f, R12-g y R12-h tienen pasos aprobados; R12-e (pasos 10, 14 y 15) queda diferido y lo cubren las e2e | 2026-10-21 |
| V.3 | Ningún dato real, ID de cliente, dominio ni frase quedó escrito en el repositorio, un issue o una captura | aprobado | 2026-10-21 |

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

### Prueba manual de Drive incompleta (decisión del dueño, 2026-10-21)

La prueba manual se hizo contra producción en dos navegadores del mismo equipo, Chrome (A) y un segundo navegador (B),
con un préstamo inventado y frases de prueba. El dueño dio por suficiente lo probado y difirió el resto a después de
v1:

| Pasos diferidos | Qué queda sin probar a mano | Cobertura automática |
|---|---|---|
| 2, 8, 9 y 12.3 | Safari de Mac y de iPhone y los otros navegadores de iOS: la ventana emergente, el uso sin conexión, el aviso de almacenamiento y la descarga tardía | e2e de W5-08 en WebKit con Google simulado |
| 6 | Caducidad real del token a los ~60 minutos | Pruebas de `drive-sync-service` (renovación dentro de «Sincronizar») |
| 10, 14 y 15 | Revocación vista desde la cuenta de Google, consentimiento de una cuenta nueva y borrado de los datos ocultos | e2e de «Desconectar Drive» con Google simulado |
| 13 | Aviso de actualización tras un despliegue | Pruebas de `core/pwa`; se puede observar con el próximo despliegue |
| «Borrar datos de este dispositivo» | El borrado en un navegador real | Pruebas de W7-04 |

### Hallazgos del primer despliegue (2026-10-21)

| Hallazgo | Qué se hizo |
|---|---|
| En el borde de Cloudflare, `! Content-Security-Policy` no quitó la política de `/*` en la raíz `/`, que quedó con dos CSP y bloqueó los scripts de la landing; `wrangler dev` no lo reproduce | La raíz usa la política de `/*` con la unión de los hashes de `index.html` y `404.html` (PR #103; ADR-0021 §8, enmienda) |
| La zona traía Real User Monitoring de Cloudflare activo por defecto, que inyecta un script de medición | Desactivado por completo en la zona; `smoke-csp` lo detectaría como violación |
| Sin red y con cambios pendientes, el estado no decía que la sincronización falló | Paso 7.2; PR #104 |
| «Préstamos» del menú lleva a la misma pantalla que «Panel» y no queda marcado como activo | Detalle de interfaz para después de v1 |

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
todas las filas de las secciones 1 a 3 en «aprobado», «no aplica», «diferido» (con su riesgo en la sección 4) o
«fallido» con su corrección fusionada.
