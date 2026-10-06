# Patrones dorados de Angular 22.2

- **Estado:** congelado por W0-05, junto con `apps/web/src/app/_patterns/`. Verificado con Angular 22.2.1, TypeScript 6.0.3 y Vitest 5.0.3.
- **Para qué:** las tarjetas copian estos patrones en lugar de improvisar con APIs que su conocimiento quizá no tiene al día (ADR-0011, decisión 8). Si un patrón no cubre lo que necesitas, detente y pregunta a Opus.
- **Dónde:** cada patrón es un componente o servicio genérico, sin dominio, con su prueba al lado. No se importan desde la app; viven en el árbol para que `pnpm lint`, `pnpm typecheck` y `pnpm test` los mantengan en verde.

## 0. Reglas del esqueleto

| Regla | Detalle |
|---|---|
| Imports relativos con extensión | `import { X } from './x.component.ts';` (`allowImportingTsExtensions` de `tsconfig.base.json`). Tipos con `import type` o `type` en línea. |
| Sin propiedades de parámetro | `erasableSyntaxOnly` las prohíbe: se inyecta con `inject()`, nunca por constructor. Tampoco `enum` ni `namespace`. |
| Zoneless | Angular 22 es zoneless por defecto y `app.config.ts` lo declara con `provideZonelessChangeDetection()`. No hay `zone.js`, ni `provideZoneChangeDetection`, ni `fakeAsync`/`waitForAsync` (dependen de zone.js): para tiempo usa `vi.useFakeTimers()`. |
| OnPush explícito | `changeDetection: ChangeDetectionStrategy.OnPush` en todo componente. En 22.2 OnPush ya es el valor por defecto; la regla `@angular-eslint/prefer-on-push-component-change-detection` rechaza `ChangeDetectionStrategy.Eager`. |
| Entradas, salidas y estado | `input()`, `input.required()`, `model()`, `output()`, `signal()`, `computed()`. Sin `@Input()`, `@Output()` ni NgModules. |
| Control de flujo | `@if`, `@for` (con `track`), `@defer`. Nunca `*ngIf`/`*ngFor`. |
| Páginas | `host: { 'data-testid': 'page-<route-id>' }` (ver `docs/specs/component-contracts.md`). |
| Formularios | Signal Forms de `@angular/forms/signals`: `form()`, `[formField]` (`FormField`), `[formRoot]` (`FormRoot`), `required()`, `validate()`, `transformedValue()`, `FormValueControl`, `focusBoundControl()` y `submission: { action, onInvalid }`. Mensajes en español en cada regla. Cada campo tiene su `<label for>`. |
| Dinero | Strings decimales de punta a punta; nunca `number`. Los formularios guardan texto y el dominio lo valida (`parseMoney`, `percentToRate`). |

**Pruebas de la app.** `pnpm test` termina en `ng test --no-watch` (builder `@angular/build:unit-test`, Vitest 5 sobre jsdom). Una sola carpeta o archivo: `pnpm exec ng test --no-watch --include 'app/_patterns/**/*.spec.ts'` (rutas relativas a `apps/web/src`). El directorio de trabajo de las pruebas es la raíz del repositorio: una prueba que lee archivos usa rutas como `apps/web/src/styles/tokens.css`. Las pruebas que leen `dist/` corren aparte, después de `pnpm build`, con `pnpm exec ng test --configuration=dist --no-watch`: las de W0-05 viven en `apps/web/src/testing/build-output/`, y las de cada tarjeta se llaman `*.dist.spec.ts` y viven en sus `owns` (`pnpm test` las excluye).

**Por qué existe `apps/web/vitest.config.ts`.** El builder deja los paquetes como externos y Vite los resuelve desde la raíz del workspace, donde pnpm no instala las dependencias de `apps/web` (por ejemplo `@angular/common`). El plugin `cuotascasa:resolve-from-apps-web` reintenta esas resoluciones desde `apps/web`. No lo quites ni agregues otra configuración de Vitest.

## 1. Control personalizado de Signal Forms

`apps/web/src/app/_patterns/signal-forms-control/digits-input.component.ts` · prueba `digits-input.component.spec.ts`.

- Implementa `FormValueControl<string>`: `value = model.required<string>()` es lo único obligatorio. `errors`, `touched` y la salida `touch` se enlazan solos cuando el anfitrión usa `[formField]`.
- El texto que escribe el usuario pasa por `transformedValue(this.value, { parse, format })`. `parse` devuelve `{ value }` o `{ error: { kind, message } }`; el error llega al campo sin código extra y el modelo conserva el último valor válido.
- Los errores se muestran solo con `touched()`, en una lista con id `<inputId>-errors` enlazada por `aria-describedby` y `aria-invalid`. Mientras el texto no se puede interpretar, la lista muestra solo el error de `parse` (`raw.parseErrors()`): las demás reglas juzgan el último modelo válido, no lo que se ve escrito.
- Declara la entrada `required` (la enlaza `[formField]` desde la regla `required()`) y la anuncia con `aria-required`, sin validación nativa.
- Implementa `focus()` de `FormUiControl` y lo delega al `<input>` interno: así `focusBoundControl()` y el `onInvalid` de un formulario llegan al campo y no al anfitrión, que no es enfocable.
- El control solo recibe `inputId` y lo pone en su `<input>`; el anfitrión escribe el `<label for="<inputId>">`.
- La prueba monta un anfitrión con `form(signal({...}), schema)` y escribe en el `<input>` con eventos `input` y `blur`.

Lo usan `ui/money-input` (W3-06: `MoneyInput`, `DateInput`, `RateInput`), el asistente (W4-07), los formularios de datos reales (W4-12) y el simulador (W4-03).

## 2. Formulario de dos pasos con mensajes en español

`apps/web/src/app/_patterns/two-step-form/two-step-form.component.ts` · prueba `two-step-form.component.spec.ts`.

- Un solo modelo `signal<T>()` y un solo `form()` para todos los pasos; cada regla lleva su `message` en español.
- Cada paso es su propio `<form>` dentro de su rama `@if`, con un único botón `type="submit"`: Enter en un campo activa ese botón y nunca el de otro paso.
  - **Pasos intermedios:** `<form novalidate (submit)="next($event)">` con «Siguiente» como `type="submit"`. `next()` llama a `event.preventDefault()`, marca como tocados solo los campos del paso (`markAsTouched()`) y avanza si son válidos. `novalidate` es obligatorio: `[formField]` pone `required` nativo en el `<input>`, y sin él el navegador frena el envío con su propio globo y el mensaje en español no aparece.
  - **Último paso:** «Guardar» es `type="submit"` dentro de `<form [formRoot]="form">` (`FormRoot` ya pone `novalidate` y llama a `preventDefault()`). La acción vive en `form(model, schema, { submission: { action, onInvalid } })`: se ejecuta solo si todo el formulario es válido y marca todos los campos como tocados.
- «Atrás» es `type="button"` y cambia de paso sin tocar el modelo: lo escrito se conserva.
- Al cambiar de paso, el foco va al encabezado del paso (`<h2 tabindex="-1">`, fuera de los `<form>`), y una región `aria-live="polite"` (`class="sr-only"`) anuncia «Paso N de M». La región existe desde el primer render y queda vacía hasta el primer cambio, así que al cargar no se anuncia ni se enfoca nada.
- Si el paso no es válido, el foco va al primer campo inválido con `focusBoundControl()`. En el último paso lo hace `onInvalid`, con `errorSummary()[0]`.
- El foco se mueve con `afterNextRender(..., { injector })`, cuando la vista ya muestra el paso nuevo o el error. Así el lector de pantalla lee el estado actualizado.
- Cada campo lleva `aria-invalid`, que vale `true` solo si el campo está tocado e inválido; en ese caso también lleva `aria-describedby="<id>-errors"`.
- La prueba simula Enter con `form.requestSubmit()`, porque jsdom no hace el envío implícito, aunque sí la validación nativa. El foco se comprueba con `document.activeElement`.

Lo usan el asistente de cuatro pasos (W4-07) y el editor de escenarios (W5-04).

## 3. Componente zoneless y su prueba

`apps/web/src/app/_patterns/zoneless-component/installment-counter.component.ts` · prueba `installment-counter.component.spec.ts`.

- El estado vive en `signal()` y `computed()`; la plantilla solo lee signals. Los resultados se anuncian en una región `aria-live="polite"`.
- La prueba crea el componente con `TestBed.createComponent`, fija entradas con `fixture.componentRef.setInput(...)` y espera con `await fixture.whenStable()` después de cada cambio o evento. No usa `fixture.detectChanges()` para «forzar» la vista ni nada de zone.js, y comprueba que `Zone` no existe.

## 4. Store de signals y su prueba

`apps/web/src/app/_patterns/signal-store/notes-store.ts` · prueba `notes-store.spec.ts`.

- Signals privados y escribibles; hacia afuera, `asReadonly()` y `computed()`.
- El store lee y escribe por un puerto inyectado con un `InjectionToken` (como los stores de `data/` leen `DATA_STORE`).
- Una escritura actualiza el estado solo después de que el puerto confirmó; si falla, el estado no cambia y el error sube.
- Las escrituras van en fila (`serialized()`): cada una lee el estado que dejó la anterior, así que dos escrituras rápidas (por ejemplo, dos abonos en celda sobre el mismo escenario) no se pisan. Una escritura que falla rechaza a quien la pidió y no frena a la siguiente.
- La prueba registra el store y un puerto falso en `TestBed.configureTestingModule({ providers: [...] })` y lo obtiene con `TestBed.inject`.

Lo usan los stores de `data/stores/` (W3-11), la fachada del motor (W3-12) y los servicios de respaldo y sincronización (W4-08, W4-09).
