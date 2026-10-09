# ADR-0017: PWA, navegadores soportados y durabilidad del almacenamiento

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

En una app local-first (ADR-0001), el navegador es el almacenamiento principal, y el navegador puede borrarlo:

- **Safari (ITP)** borra todo el almacenamiento que escribe un script (IndexedDB incluido) tras **7 días de uso de Safari sin visitar el sitio**, en pestañas normales. Las apps agregadas al Dock o a la pantalla de inicio probablemente están exentas, pero no está verificado.
- **Chrome y Edge** pueden desalojar datos bajo presión de espacio, salvo que el sitio obtenga almacenamiento persistente con `navigator.storage.persist()`.

Además, conviene que la app funcione sin conexión, y la landing debe seguir sin almacenamiento: un service worker registrado en `/` crearía cachés ahí.

## Decisión

1. **PWA con `@angular/service-worker`:**
   - funciona sin conexión en `/app` (shell y chunks diferidos en caché);
   - el fallback de navegación a `index.csr.html` aplica solo a `/app/**`;
   - las URLs de Google nunca se guardan en caché;
   - el manifiesto tiene `start_url` `/app` e íconos *maskable*.
2. **El service worker nunca se registra en `/` ni en `/privacidad`.** El mecanismo exacto lo fija ADR-0023; W3-14 lo implementa. **Enmienda (2026-10-09, ADR-0023):** el alcance es `/` y no `/app/`, porque con `/app/` la ruta `/app` no carga sin conexión; el registro sigue ocurriendo solo tras la primera navegación dentro de `/app`, y `ngsw-config` nunca guarda HTML público, así que una visita a `/` o `/privacidad` sin haber usado `/app` no crea almacenamiento.
3. **Aviso de actualización.** `cc-update-prompt` muestra un aviso en español cuando hay versión nueva; al aceptarlo, activa la versión y recarga.
4. **Navegadores.** La recomendación es Chrome o Edge de escritorio con la PWA instalada. Safari se soporta con un **aviso persistente** cuando no corre como app instalada (modo standalone). CI prueba Chromium y WebKit; otros navegadores modernos no se bloquean, pero v1 no los prueba.
5. **Almacenamiento persistente.**
   - `navigator.storage.persist()` se pide en el primer guardado, por un único punto de entrada (`StorageHealth.requestPersist`).
   - Ajustes muestra el resultado de `persisted()` y el uso estimado (`estimate()`).
6. **Aviso de Safari:**
   - se puede plegar durante la sesión;
   - reaparece en la siguiente visita;
   - enlaza a Ajustes, que explica las opciones: instalar, respaldar o conectar Drive.
7. **Recordatorios de respaldo** cuando pasan más de 30 días desde el último respaldo o hay más de 20 cambios sin respaldar. Ajustes muestra «último: hace N días».
8. **Durabilidad entre dispositivos:** la cubre la sincronización con Drive (ADR-0008). El respaldo automático con File System Access **se elimina de v1**.
9. **Pantallas:** escritorio primero (≥ 1280 px); en móvil todo se apila y la tabla se desplaza en horizontal (ADR-0012).

## Alternativas consideradas

- **Sin PWA.** Sin uso sin conexión y sin la posible exención de ITP de las apps instaladas. Descartada.
- **Service worker con alcance raíz.** Rompería la landing sin almacenamiento. Descartada en un principio; ADR-0023 la adopta con registro diferido (ver la enmienda de la decisión 2).
- **Respaldo automático con File System Access.** Solo Chromium, pide permisos recurrentes y Drive ya cubre la necesidad. Descartada para v1.
- **Bloquear Safari.** Demasiado restrictivo. Descartada.
- **Pedir `persist()` al cargar.** Quien solo explora todavía no tiene nada que proteger, y la respuesta del navegador depende de heurísticas de uso. Se pide en el primer guardado.

## Consecuencias

**Positivas**
- La app abre sin conexión una vez visitada.
- El usuario ve en todo momento si sus datos corren riesgo y qué hacer.
- `/` sigue sin service worker, sin cachés y sin almacenamiento.

**Negativas**
- La pérdida de datos no se puede impedir del todo: depende del navegador y del usuario.
- Un service worker añade riesgo de servir versiones viejas.

**Riesgos**
- Que la exención de ITP para apps en el Dock no se cumpla. Mitigación: verificación manual (W6-04); el aviso y los recordatorios no dependen de ella.
- Cachés obsoletos tras un despliegue. Mitigación: `no-cache` en HTML, `ngsw.json` y el manifiesto (ADR-0022), y el aviso de actualización.
- `persist()` denegado sin aviso. Mitigación: el estado se muestra en Ajustes y los recordatorios siguen activos.

## Verificación

- **W3-14:**
  - e2e en un contexto limpio: `/` y `/privacidad` no registran service worker ni crean CacheStorage;
  - e2e en Chromium: sin conexión, `/app/prestamos/nuevo` recarga y se muestra;
  - prueba unitaria del aviso de actualización;
  - `ngsw.json` excluye los orígenes de Google.
- **W3-13:** detección de Safari no standalone por tabla de casos, y llamadas a `persist()` como máximo una vez por sesión.
- **W5-07:** recordatorios y estado de persistencia en Ajustes.
- **W6-02:** barrido del aviso de Safari.
- **W6-04 y W7-01:** verificación manual.

## Referencias

- ADR-0001, ADR-0008, ADR-0011, ADR-0012, ADR-0022, ADR-0023.
- Tarjetas W3-13, W3-14, W5-07, W6-02 y W6-04.

## Enmiendas

**Enmienda (2026-10-09, W3): pregunta abierta.** En iOS, los navegadores distintos de Safari (Chrome, Firefox, Edge) también usan WebKit y sufren la misma limpieza de almacenamiento de ITP. Aun así, el aviso de la decisión 6 se muestra solo en Safari, como piden la tarjeta W3-13 y este ADR. Se revisa en los chequeos manuales de W6: si se confirma el mismo riesgo, se amplía la detección a todos los navegadores de iOS que no corren como app instalada.
