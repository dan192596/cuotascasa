# Checklist manual de Drive: lo que la automatización no puede probar

Para el **dueño del proyecto** (operador). Se ejecuta con Google Drive real, dos dispositivos reales y navegadores reales, **antes de activar el despliegue** (ver [la guía de despliegue](cloudflare-deploy.md#compuerta-de-despliegue)) y de nuevo antes de cada release. Los e2e con Google simulado (W5-08) ya cubren el flujo; esta lista cubre lo que un simulador no puede: la pantalla de consentimiento real, el bloqueo de ventanas emergentes de Safari, la caducidad real del token y la revocación en la cuenta de Google.

> **Repositorio público.** Usa solo datos sintéticos: crea un préstamo de prueba con montos inventados y una frase de prueba que no uses en ningún otro lado. No pegues en un issue, PR o captura tu correo, tu dominio, el ID de cliente ni la frase. Anota los resultados en un lugar privado, no en el repositorio.

## Requisitos de Drive (R12) que cubre esta lista

R12 es un solo requisito con ocho partes. Esta tabla les pone un código (`R12-a` a `R12-h`) para poder cruzarlas con los pasos; el texto sale de la fila R12 de la spec y de HU-21 y HU-22.

| Código | Parte de R12 |
|---|---|
| R12-a | Combinación (merge) por registro entre dispositivos |
| R12-b | Borrados (marcas de borrado) |
| R12-c | Copia previa `cuotascasa.prev.json` |
| R12-d | Estado sin conexión y renovación del acceso |
| R12-e | Revocar el acceso («Desconectar Drive») |
| R12-f | Cifrado con frase (Google no puede leer la copia) |
| R12-g | Clave guardada por dispositivo |
| R12-h | Cambiar la frase |

## Preparación

1. Tener hecha la [guía de Google Cloud](google-cloud-setup.md): pantalla de consentimiento **En producción** y un cliente OAuth. Para probar en tu equipo sin tocar el cliente de producción, usa el **cliente de prueba** de su paso 10.
2. Dos dispositivos reales con navegador, llamados aquí **A** y **B**. Al menos uno es un Mac o iPhone con **Safari** (paso 2); el otro puede ser Chrome o Edge.
3. Una cuenta de Google de pruebas, o la tuya. Verifica de antemano que no tenga datos ocultos de CuotasCasa de una prueba anterior (paso 15 limpia).
4. Una build que traiga el ID de cliente: el sitio desplegado (si ya activaste el despliegue) o una build local con el ID de prueba en tu entorno, según el paso 10 de la guía de Google Cloud. Nunca escribas el ID en un archivo versionado.
5. Anota la frase de prueba en tu gestor de contraseñas.

Marca cada casilla al comprobarla. Si un paso falla, anota el síntoma con marcadores y abre un issue sin datos reales.

## Pasos

### 1. Primera conexión con la pantalla de consentimiento real (Chrome o Edge en A)

- [ ] Abre `/app/ajustes` (o la sección Ajustes). Drive **no** dice «no configurado».
- [ ] Pulsa **Conectar Drive**. Se carga el script de Google (solo ahora) y aparece **Continuar con Google**.
- [ ] Pulsa **Continuar con Google**. Se abre la ventana de Google con el nombre de la app y **un único permiso**: «Ver y administrar sus propios datos de configuración en Google Drive».
- [ ] La ventana **no** muestra «Acceso bloqueado» ni «Google no ha verificado esta app» como bloqueo. Si aparece una nota informativa de marca no verificada, anótala: es esperable (guía de Google Cloud, paso 8) y se puede continuar.
- [ ] En Google Auth Platform, el estado de publicación sigue **En producción**.
- [ ] Define la frase de prueba. Tras conectar, el estado dice **Sincronizado** (o ofrece sincronizar) y no pide la frase otra vez.
- [ ] Pulsa **Sincronizar** con un préstamo de prueba creado. Estado **Sincronizado**.

### 2. Bloqueo de ventanas emergentes en Safari (WebKit)

Repite en Safari de Mac o iPhone, con una sesión sin permisos previos para el sitio.

- [ ] Pulsa **Conectar Drive**: debe cargar GIS **sin** abrir ventana todavía y mostrar **Continuar con Google**.
- [ ] Pulsa **Continuar con Google**: la ventana de Google se abre **sin** que Safari la bloquee (es un solo gesto directo del usuario; ADR-0008, enmienda de W4).
- [ ] Si Safari la bloqueó, anótalo como defecto (la conexión de dos pasos existe justamente para evitarlo) y prueba la solución temporal de la guía de Google Cloud (paso 10, punto 4).
- [ ] Completa la conexión y sincroniza.

### 3. Segundo dispositivo con la misma frase (R12-a, R12-f, R12-g)

- [ ] En **B**, abre la app y conecta Drive con el mismo flujo de dos pasos y la misma cuenta de Google.
- [ ] B pide la **frase** (la copia remota existe) y, con la frase de prueba, descarga y muestra el préstamo de prueba creado en A.
- [ ] Cierra y reabre la app en B: **no** vuelve a pedir la frase (clave guardada en ese dispositivo).
- [ ] Edita un préstamo distinto en cada dispositivo (A y B), sincroniza en ambos y vuelve a sincronizar en A: los dos cambios aparecen en los dos (combinación por registro).
- [ ] Edita el **mismo** registro en A y en B, sincroniza A y luego B: queda la edición más reciente (limitación aceptada, ADR-0008 «Consecuencias»).
- [ ] Borra un préstamo en A, sincroniza A y luego B: el préstamo desaparece también en B (R12-b).

### 4. Frase incorrecta (R12-f)

- [ ] En un navegador o perfil limpio, conecta Drive y escribe una frase **equivocada**.
- [ ] La app muestra «La frase no coincide con la copia de Drive: revísala e inténtalo de nuevo» y **no cambia nada** local ni remoto.
- [ ] Con la frase correcta, entra normalmente.

### 5. Cambiar la frase en un dispositivo (R12-h)

- [ ] En A, abre **Cambiar frase**, escribe una frase nueva dos veces y guarda. Aparece «Frase cambiada. Los otros dispositivos te pedirán la frase nueva.»
- [ ] En B, pulsa **Sincronizar**: B pide la frase («La frase cambió en otro dispositivo: ingrésala de nuevo»).
- [ ] La frase **vieja** en B es rechazada y no cambia nada; la **nueva** funciona y B sincroniza.
- [ ] En A, **Sincronizar** sigue funcionando sin pedir frase.

### 6. Caducidad del token (~60 minutos) (R12-d)

- [ ] Con A conectado y sincronizado, déjalo abierto algo más de 60 minutos.
- [ ] Pulsa **Sincronizar**: la app muestra **Falta autorizar Drive** o abre una ventana de Google dentro de la sincronización que iniciaste (ADR-0008, decisión 3). Al autorizar, sincroniza.
- [ ] La app nunca abre una ventana de Google por sí sola, sin que pulses nada.
- [ ] Sus datos locales siguen intactos durante todo el período.

### 7. Sin conexión (R12-d)

- [ ] Desactiva la red en A y edita un préstamo: la app sigue funcionando y muestra **cambios sin sincronizar (n)**.
- [ ] Pulsa **Sincronizar** sin red: estado **Sin conexión con Drive**, sin perder datos.
- [ ] Reactiva la red y sincroniza: queda **Sincronizado**.

### 8. Safari: uso sin conexión y aviso de almacenamiento (pendiente de W6, ADR-0017)

En Safari (pestaña normal, no instalada):

- [ ] Abre `/app`, navega a un par de pantallas y espera a que cargue por completo.
- [ ] Apaga la red, recarga `/app` y `/app/prestamos/nuevo`: cargan desde caché.
- [ ] Se ve el **aviso de Safari** («Safari puede borrar los datos de este sitio si no lo abres durante 7 días…»); se puede plegar y reaparece en la siguiente visita; enlaza a Ajustes.
- [ ] En Safari de Mac, **Archivo → Agregar al Dock**: la app instalada abre sin el aviso. Anota si el aviso desaparece (la exención de ITP para apps instaladas no está verificada; ADR-0017 «Riesgos»).
- [ ] Anota la versión de Safari y de macOS/iOS.

### 9. Navegadores de iOS que no son Safari (pregunta abierta de ADR-0017)

En un iPhone o iPad, repite lo esencial en Chrome o Firefox para iOS (usan WebKit):

- [ ] La app carga y funciona.
- [ ] ¿Aparece el aviso de almacenamiento? Según ADR-0017 hoy **solo** se muestra en Safari. Anota qué ves.
- [ ] Anota el resultado y entrégalo a Opus: si se confirma el mismo riesgo de borrado, se amplía la detección a todos los navegadores de iOS que no corren como app instalada. No hace falta corregirlo en este checklist.

### 10. Desconectar y revocar en la cuenta de Google (R12-e)

- [ ] En A, pulsa **Desconectar Drive**. El estado pasa a **Drive desconectado** y los datos locales siguen ahí.
- [ ] En tu cuenta de Google → **Seguridad** → conexiones con apps de terceros (o «Tus conexiones con apps y servicios de terceros»), **CuotasCasa ya no aparece**, o su acceso figura como revocado.
- [ ] Reconecta: Google vuelve a pedir el consentimiento completo.
- [ ] Con la pestaña ya desconectada, **Sincronizar** no abre ninguna ventana de Google por sí sola.

### 11. Respaldo cifrado de ida y vuelta con la frase de Drive (R12-f)

- [ ] En Ajustes, **Exportar respaldo cifrado**: pide «la misma frase que usas para Drive». Se descarga el archivo y aparece «Respaldo cifrado descargado. Guarda tu frase: sin ella no se puede abrir.»
- [ ] Abre el archivo en un editor de texto: no se ve ningún monto ni nombre, solo texto cifrado.
- [ ] En un navegador o perfil limpio, **Importar** el archivo con la frase de Drive: se ve la vista previa y, al aceptar, los datos coinciden con los de origen.
- [ ] Con una frase incorrecta, la importación falla con un error claro y no cambia nada.

### 12. Aviso de exportación sin cifrar

- [ ] En un navegador con sesión nueva, exporta a Excel, CSV o PDF: antes de la **primera** descarga de la sesión aparece el aviso de que el archivo no va cifrado y contiene datos financieros, con la opción **Descargar de todos modos**.
- [ ] En la segunda exportación de la misma sesión, el aviso no vuelve a aparecer.
- [ ] En Safari, espera un par de minutos antes de aceptar el aviso: la descarga sigue funcionando (la descarga ocurre después de una espera, fuera del gesto del usuario; hallazgo de W5).
- [ ] **Exportar respaldo JSON** (sin cifrar) muestra su propio aviso.

### 13. Aviso de actualización con un despliegue nuevo

Necesita un sitio desplegado con al menos dos versiones.

- [ ] Con la versión N cargada en un navegador (pestaña abierta o app instalada), despliega la versión N+1 (cualquier cambio pequeño por PR a `main`).
- [ ] Recarga o espera: aparece «Hay una versión nueva de CuotasCasa.» con el botón **Actualizar**.
- [ ] Al pulsar **Actualizar**, la app recarga con la versión nueva y los datos locales siguen intactos.
- [ ] Si estás en Drive conectado, sigue conectado o pide autorizar de nuevo (el token vive en memoria), pero no pide la frase.

### 14. Cuenta sin uso previo (consentimiento limpio)

- [ ] Con otra cuenta de Google que nunca usó la app (o tras revocar en el paso 10), conecta: no aparece «Acceso bloqueado».

### 15. Limpieza

- [ ] En Google Drive → **Configuración** → **Administrar aplicaciones** → CuotasCasa → **Borrar datos ocultos de la app** (ADR-0008, decisión 8). Reconecta y verifica que se parte de cero.
- [ ] Borra los préstamos de prueba y la frase de prueba de tu gestor de contraseñas.

## Verificación de la lista completa

- [ ] Todas las casillas de los pasos 1 a 14 están marcadas, o cada una sin marcar tiene un hallazgo anotado.
- [ ] Cada fila de la tabla siguiente tiene al menos un paso aprobado.
- [ ] Ningún dato real, ID de cliente, dominio ni frase quedó escrito en el repositorio, un issue o una captura.
- [ ] Solo entonces pasa a la [compuerta de despliegue](cloudflare-deploy.md#compuerta-de-despliegue).

## Qué requisito cubre cada paso

| Paso | Qué comprueba | R12 |
|---|---|---|
| 1 | Consentimiento real, publicación, primera conexión y frase | R12-f, R12-g |
| 2 | Ventana emergente en Safari con la conexión de dos pasos | R12-d |
| 3 | Segundo dispositivo, combinación por registro, borrados, clave por dispositivo | R12-a, R12-b, R12-f, R12-g |
| 4 | Frase incorrecta | R12-f |
| 5 | Cambio de frase y segundo dispositivo | R12-h, R12-f |
| 6 | Caducidad del token y renovación vía **Sincronizar** | R12-d |
| 7 | Sin conexión y cambios pendientes | R12-d |
| 8 | Safari sin conexión y aviso de almacenamiento | R12-d (y R20) |
| 9 | Navegadores de iOS distintos de Safari | R12-d (pregunta abierta de ADR-0017) |
| 10 | Desconexión y revocación en la cuenta de Google | R12-e |
| 11 | Respaldo cifrado con la frase de Drive | R12-f |
| 12 | Aviso de exportación sin cifrar | R12-f (promesa de `/privacidad`) |
| 13 | Aviso de actualización tras un despliegue | R20 (y R25) |
| 14 | Consentimiento limpio de una cuenta nueva | R12-e |
| 15 | Limpieza de los datos ocultos y arranque desde cero | R12-e |

## Lo que esta lista no puede comprobar

Estos puntos de R12 **no se pueden verificar a mano** en v1, porque `appDataFolder` es una carpeta oculta que ni el usuario ni la app exponen para inspección o restauración. Los cubren las pruebas automáticas (W2-08 y W5-08, con Google simulado y la suite de contrato):

| Parte de R12 | Por qué no hay paso manual | Dónde se prueba |
|---|---|---|
| R12-c Copia previa `cuotascasa.prev.json` | La app la guarda antes de cada subida, pero no ofrece restaurarla ni verla; Drive no deja abrir los datos ocultos | W2-08: se guarda la copia previa antes de sobrescribir |
| R12-f Remoto alterado (manipulado) | No se puede editar el archivo oculto desde Drive | W1-07 y W4-09: la alteración de cualquier parámetro o byte invalida el descifrado (AAD, ADR-0009) |

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| «Acceso bloqueado» al conectar | Estado de publicación (guía de Google Cloud, pasos 5 y 7) |
| `origin_mismatch` | Orígenes del cliente OAuth (guía de Google Cloud, paso 6) |
| Drive «no configurado» | Variable `GOOGLE_CLIENT_ID` vacía o build local sin el ID |
| Safari bloquea la ventana | Paso 2; permite ventanas emergentes para el sitio y reporta el hallazgo |
| La autorización caduca a los 7 días | La pantalla sigue en **Pruebas** |

Referencias: [ADR-0008](../adr/0008-sincronizacion-google-drive.md), [ADR-0009](../adr/0009-cifrado-con-frase.md), [ADR-0017](../adr/0017-pwa-y-durabilidad.md) y [la guía de Google Cloud](google-cloud-setup.md).
