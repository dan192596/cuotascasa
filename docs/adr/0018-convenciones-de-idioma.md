# ADR-0018: Convenciones de idioma y nomenclatura

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

En CuotasCasa conviven tres públicos con necesidades distintas:

- **Usuarios:** el dueño y, ocasionalmente, amigos en Guatemala. Esperan la interfaz en español y con formatos locales.
- **Lectores del repositorio:** es un portafolio público, donde el código en inglés es la norma y facilita la lectura.
- **Agentes:** decenas de tarjetas las ejecutan agentes Sonnet, que trabajan bien con especificaciones en inglés pero necesitan una correspondencia exacta entre términos.

El dominio usa vocabulario local sin traducción directa: abono a capital, desgravamen, IUSI, cuota nivelada. Sin una regla, el mismo concepto terminaría con tres nombres distintos en tarjetas paralelas.

## Decisión

1. **Código en inglés:** identificadores, tipos, funciones, archivos, directorios, ramas y códigos de error. Ejemplos: `Loan`, `Prepayment`, `features/real-data`.
2. **Interfaz en español de Guatemala.** Registro neutral y cercano (tuteo), como en los textos aprobados («tu casa se va llenando», «ya es tuyo»). v1 no contempla una interfaz en otros idiomas.
3. **Documentación para humanos en español:** `docs/`, ADRs y guías. El README es bilingüe (W6-03).
4. **Tarjetas y specs para agentes pueden ir en inglés.** Su texto fijo (definición de terminado y prompt de lanzamiento) está en español.
5. **El glosario manda.** `docs/glossary.md` es la correspondencia obligatoria ES ↔ EN. Un término nuevo se agrega antes de usarse. Como el glosario es un archivo congelado, el agregado lo hace Opus a pedido de la tarjeta.
6. **Términos locales sin equivalente** conservan su nombre transliterado en el código, por ejemplo `iusi` como etiqueta de cargo fijo. No se inventan traducciones engañosas.
7. **Constantes y enums:**
   - valores de modo y política en inglés `UPPER_SNAKE`: `REDUCE_TERM`, `RECALC_INSTALLMENT_KEEP_TERM`, `FHA_GT_V1`;
   - estados en minúscula: `active`, `paid`, `archived`;
   - monedas en código ISO: `GTQ` y `USD`.
8. **Rutas visibles en español** (`/privacidad`, `/app/prestamos/:id/tabla`, `/app/prestamos/:id/datos-reales`, `/app/prestamos/:id/proyecciones`, `/app/ajustes`). Los directorios y componentes que las implementan van en inglés (`features/loans`, `schedule`, `real-data`, `scenarios`, `settings`).
9. **Nombres de archivo** en kebab-case y selectores de componentes con prefijo `cc-` (por CuotasCasa).
10. **Formatos:**
    - en pantalla, siempre con locale `es-GT` y a través de los pipes de `ui/`: `Q 1,234.56`, `US$ 1,234.56` y `dd/mm/aaaa`;
    - en almacenamiento y fronteras, strings decimales (`"1234.56"`) y fechas `AAAA-MM-DD`.
11. **Errores:** el dominio lanza errores tipados con nombres en inglés (jerarquía `DomainError`), y la capa de UI los traduce a mensajes en español. Ningún texto de interfaz vive en `packages/`, salvo los encabezados en español del modelo de exportación (ADR-0013).
12. **Commits** según Conventional Commits, con tipo y alcance en inglés (`feat(domain): …`). Las ramas siguen `card/<ID>-<slug>`.

## Alternativas consideradas

- **Todo en español, incluido el código.** Mezcla incómoda con las APIs del framework (`loanService.calcularCuota()` dentro de `ngOnInit`), menos legible para el público del portafolio y propenso a errores de acentos en identificadores. Descartada.
- **Todo en inglés, incluida la interfaz.** Los usuarios son guatemaltecos y los términos bancarios locales perderían precisión. Descartada.
- **Interfaz multilingüe desde v1.** Costo de extracción y mantenimiento sin un usuario que lo pida. Descartada para v1.
- **Sin glosario, a criterio de cada tarjeta.** Garantiza sinónimos divergentes entre tarjetas paralelas. Descartada.

## Consecuencias

**Positivas**
- El código se lee como cualquier proyecto Angular moderno y la interfaz se siente local.
- Las tarjetas paralelas nombran igual el mismo concepto.
- Separar el texto de la lógica deja los paquetes del dominio libres de textos de interfaz.

**Negativas**
- Quien lee el código y la interfaz a la vez debe consultar el glosario.
- Cada término nuevo pasa por Opus, lo que añade un paso.

**Riesgos**
- Que alguien traduzca mal un término bancario, por ejemplo «abono» como `payment` en lugar de `Prepayment`. Mitigación: glosario obligatorio, revisión de Opus y textos de UI verificados en las pruebas de componentes y e2e.
- Que aparezcan textos de interfaz en inglés. Mitigación: los barridos de W6-02 y los e2e buscan los rótulos en español.

## Verificación

- La revisión de Opus rechaza identificadores que no sigan el glosario.
- Las pruebas de los pipes es-GT (W3-06) fijan los formatos.
- Las pruebas de componentes y e2e consultan los rótulos en español.
- La revisión de Opus verifica que no haya textos de interfaz en `packages/`, salvo los del modelo de exportación.

## Referencias

- `docs/glossary.md`, `CLAUDE.md` (sección «Convenciones»).
- ADR-0003, ADR-0012, ADR-0013, ADR-0019.
- Tarjetas W3-06 y W6-03.
