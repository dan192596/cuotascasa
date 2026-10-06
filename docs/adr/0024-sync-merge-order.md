# ADR-0024: Orden total de la combinación en la sincronización

Estado: Aceptado

Fecha: 2026-10-05

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

La sincronización con Drive (ADR-0008) combina dos copias del mismo conjunto de datos: la local y la remota. Cada registro lleva `updatedAt`, `updatedByDevice` y `deletedAt` (ADR-0005, decisión 2). El algoritmo de la sesión y la regla de purga de marcas de borrado son los de **ADR-0008, decisión 4**; este ADR no los repite y los cita.

Para que dos dispositivos lleguen siempre al mismo resultado, sin importar quién combina primero ni cuántas veces, la combinación necesita un **orden total** entre dos versiones de un mismo registro. Además:

- los relojes de los dispositivos pueden repetirse, retroceder o estar adelantados;
- un borrado debe propagarse sin «resucitar» el registro, salvo que alguien lo edite después;
- los ajustes del dispositivo (tema, Drive activado) nunca deben viajar a otro dispositivo (ADR-0005, decisión 3; ADR-0007, decisión 6);
- la prueba de propiedades de W1-06 exige que la combinación sea conmutativa, idempotente y asociativa.

## Decisión

1. **Unidad de combinación:** el registro, identificado por colección e `id`. Las colecciones son las de `ENTITY_KEYS` (`packages/schema/src/entities/registry.ts`).
2. **Orden total entre dos versiones del mismo registro**, implementado una sola vez en `compareRecordOrder` (`packages/sync/src/ports.ts`), en este orden de criterios:
   1. gana el `updatedAt` mayor (instantes ISO 8601 UTC con milisegundos y ancho fijo: la comparación de strings es cronológica);
   2. a igual `updatedAt`, gana el `updatedByDevice` mayor (comparación de strings);
   3. a igual par, gana la **marca de borrado** (`deletedAt` no nulo);
   4. si todavía empatan, gana el JSON canónico mayor (claves ordenadas, `canonicalJson`). Este último criterio solo separa versiones distintas con la misma clave, algo que el sellado monótono hace imposible entre dispositivos sanos; existe para que el resultado sea determinista. Dos versiones idénticas comparan 0.
3. **Combinación:** `mergeDatasets(local, remote)` toma, por colección e `id`, la versión máxima según el orden anterior; un registro presente en un solo lado pasa tal cual. Como es un máximo por clave, el conjunto combinado es conmutativo, idempotente y asociativo, y nunca tiene ids duplicados. Las estadísticas (`MergeStats`) describen de qué lado salió cada registro y no forman parte de esas propiedades.
4. **Ajustes:** el registro sincronizado (`SYNCED_SETTINGS_ID`) se combina como cualquier otro. El registro del dispositivo (`DEVICE_SETTINGS_ID`) se descarta de ambas entradas y nunca aparece en el resultado; el local sobrevive porque `DataStore.replaceAll` siempre conserva el registro del dispositivo y descarta el entrante (contrato de persistencia). Así nunca se sube a Drive ni se importa.
5. **Purga:** `purgeTombstones` es una función pura y separada, con la firma de `PurgeTombstones` y la regla de ADR-0008, decisión 4. Se aplica al conjunto combinado, después de combinar y antes de guardar, cifrar y subir, con el `lastSyncAt` de la sincronización anterior.
6. **Sellado:** cada escritura local recibe una estampa estrictamente mayor que la última estampa del dispositivo y que el `updatedAt` actual del registro que modifica (+1 ms cuando el reloj no avanza). Una edición siempre supera, en este orden, a la versión que editó. Lo prueba la suite de contrato de persistencia.

## Alternativas consideradas

- **Relojes vectoriales o CRDT.** Detectan concurrencia real, pero son desproporcionados para un usuario con pocos dispositivos que casi nunca editan a la vez (ADR-0008).
- **El borrado siempre gana.** Impide deshacer un borrado editando después en otro dispositivo, y no es determinista frente a dos marcas distintas.
- **Desempatar solo por contenido (hash).** Sería determinista, pero ignora qué dispositivo escribió y vuelve opaca la depuración de un conflicto.
- **Prioridad fija por dispositivo.** Un dispositivo «principal» ganaría incluso con ediciones viejas.
- **Combinar los ajustes del dispositivo como un registro más.** Un cambio de tema en un equipo pisaría el del otro.

## Consecuencias

**Positivas**
- Dos dispositivos que combinan las mismas copias obtienen el mismo resultado, en cualquier orden y aunque repitan la sesión.
- Una sola implementación del orden, congelada y probada; W1-06 y W2-08 la usan sin reinterpretarla.

**Negativas**
- Last-writer-wins pierde una de dos ediciones simultáneas del mismo registro.
- Las marcas de borrado ocupan espacio hasta la purga.

**Riesgos residuales**
- **Resurrección tras la purga.** Un dispositivo que no sincroniza en más de 90 días conserva una copia viva de un registro cuya marca ya se purgó en los demás; al combinar, su versión gana porque no encuentra la marca. Lo mismo ocurre con una marca antigua importada de un respaldo que conserva sus sellos (ADR-0007) y que nunca se subió. Mitigación: la copia `cuotascasa.prev.json`, el respaldo JSON y el aviso en el modelo de amenazas (W6-03). Se acepta.
- **Desfase de reloj.** Un dispositivo con el reloj adelantado gana los conflictos contra ediciones reales posteriores de otro dispositivo mientras dure el adelanto. El sellado monótono evita que un reloj que retrocede produzca estampas menores, y la regla 6 hace que la siguiente edición del otro dispositivo sobre ese mismo registro vuelva a ganar, lo que limita el daño a ediciones concurrentes. No se corrige el reloj del sistema. Se acepta y se documenta.
- **Sin escritura condicionada en Drive.** Dos subidas simultáneas pueden pisarse. Mitigación: la verificación previa y la copia previa de ADR-0008.
- **Escrituras locales durante la sesión.** `LocalDataset.save` reemplaza todo el conjunto local; una escritura entre la lectura y el guardado se pierde. Mitigación: la sesión lee lo local justo antes de combinar y guarda justo después de purgar, sin llamadas de red entre ambos (`SyncSession`). Se acepta la ventana residual.
- **Primera sincronización simultánea.** Si dos dispositivos crean `cuotascasa.json` a la vez, Drive guarda dos archivos con el mismo nombre. Todos los dispositivos usan el de id menor (`SyncProvider.findFile`), así que convergen; el otro queda huérfano sin perder datos, porque los registros de quien lo creó siguen en su copia local y suben en su siguiente sincronización.

## Verificación

- W0-04: `packages/sync/src/ports.spec.ts` prueba cada criterio del orden (tiempo, dispositivo, marca de borrado, JSON canónico e identidad) y `canonicalJson`.
- W0-04: la suite `runDataStoreContract` prueba el sellado monótono con reloj repetido, reloj que retrocede y registro sellado en el futuro, y que `replaceAll` conserva el registro de ajustes del dispositivo.
- W1-06: fast-check (≥ 500 corridas cada una) prueba que `mergeDatasets` es conmutativa, idempotente y asociativa, sin ids duplicados; casos fijos para marca nueva contra edición vieja, edición nueva contra marca vieja, empate total y empate de `updatedAt`; los ajustes del dispositivo nunca cambian ni salen en el resultado; `purgeTombstones` en sus bordes.
- W2-08: el orden de llamadas de la sesión (combinar, purgar, guardar, cifrar, subir, `markSynced`).

## Referencias

- ADR-0005, ADR-0007, ADR-0008 (decisión 4: algoritmo y regla de purga), ADR-0009.
- `packages/sync/src/ports.ts` (`compareRecordOrder`, `MergeDatasets`, `PurgeTombstones`), `packages/persistence/src/ports.ts` (sellado y `replaceAll`).
- Tarjetas W0-04, W1-06, W2-08 y W6-03.
