# ADR-0012: Sistema de diseño y dirección visual

Estado: Aceptado

Fecha: 2026-10-04

Decisores: dueño del proyecto + Claude (Opus)

## Contexto

El dueño pidió definir el estilo visual con una lluvia de ideas. La app muestra sobre todo números en tablas largas y, como pieza de portafolio, necesita identidad propia. Se exploraron tres direcciones:

- **A · «Libreta bancaria»:** encabezados con serifa, números monoespaciados y tablas con renglones, como una libreta de ahorro.
- **B · «Tu casa se va llenando»:** una casa que se llena con el porcentaje de capital ya pagado.
- **C · «Excel mejorado»:** una cuadrícula densa con edición directa en celda.

La comparación de las tres direcciones, los bocetos ASCII de las pantallas clave y la paleta propuesta están en `docs/discovery/direccion-visual.md`.

Restricciones: escritorio primero, formatos de Guatemala, accesibilidad AA y ninguna fuente o recurso externo, porque la CSP de `/` no permite orígenes externos (ADR-0016) y cargar fuentes de terceros filtraría visitas.

## Decisión

1. **Dirección A como base.** Encabezados en **Source Serif 4**, números en **JetBrains Mono** con `tabular-nums` y tablas con renglones. La paleta es «tinta sobre papel».
   - La **propuesta** de valores hexadecimales, para tema claro y oscuro y con el contraste ya verificado, está en `docs/discovery/direccion-visual.md`. El dueño la aprobó el 2026-10-06 y la versión congelada es `docs/specs/design-palette.md` (W0-05).
   - W0-05 se la presenta. Con su aprobación, la copia a `docs/specs/design-palette.md` con la fecha y la congela. Si el dueño pide cambios, W0-05 los aplica sin bajar de los mínimos de contraste del punto 12.
   - Después de congelada, cambiar la paleta exige actualizar este ADR.
2. **B en el dashboard y en la landing.** El medidor de casa muestra el porcentaje de capital pagado de cada préstamo y protagoniza el hero de `/`. Se rotula «capital pagado» para que no se confunda con el valor del inmueble.
3. **De C se toma la edición en celda.** En la tabla de amortización, un abono escrito en una celda modifica **solo el escenario activo**. Los eventos reales se registran en «Datos reales».
4. **Semántica de color:**
   - verde = «ya es tuyo» (capital pagado);
   - ámbar = diferencias pequeñas;
   - rojo = diferencias grandes y errores.

   El color nunca es la única señal: siempre lo acompañan texto o un ícono.
5. **Tokens de diseño** como propiedades CSS con nombres congelados en `apps/web/src/design-contract/token-names.json` (W0-05). W3-05 fija los valores para tema claro y oscuro. No hay colores fijos fuera de `apps/web/src/styles/`.
6. **Tema** sistema, claro u oscuro. En `/` sigue al sistema y no escribe nada. En `/app` la elección se guarda en `SettingsStore`.
7. **Angular Material 22** (tokens M3) con densidad compacta, mapeado a los tokens. **Tailwind v4** (`@theme`) solo para layout y utilidades.
8. **Fuentes autoalojadas** (paquetes `@fontsource`). Nada de Google Fonts ni de CDN.
9. **Formatos** `Q 1,234.56`, `US$ 1,234.56` y `dd/mm/aaaa`, siempre a través de los pipes de `ui/` (W3-06). El dinero nunca pasa por `number`.
10. **Layout:** escritorio primero (≥ 1280 px). En móvil, los bloques se apilan y la tabla se desplaza en horizontal con las primeras columnas fijas.
11. **Tabla tipo libreta:** encabezado fijo, mes actual resaltado, columna «Real Δ», subtotales anuales de capital y navegación con teclado.
12. **Accesibilidad WCAG 2.2 AA:** contraste ≥ 4.5:1 en texto y ≥ 3:1 en elementos gráficos, todo operable con teclado y resultados anunciados con una región `aria-live`.

## Alternativas consideradas

- **C como dirección principal.** Densa y familiar, pero fría y genérica para un portafolio. Solo se conserva la edición en celda.
- **B sola.** Expresiva, pero no resuelve las tablas densas.
- **Tema por defecto de Material.** Rápido, pero sin identidad.
- **Fuentes de Google Fonts.** Rompen la CSP de `/` y revelan visitas a terceros.

## Consecuencias

**Positivas**
- Identidad reconocible, coherente entre pantalla y PDF (ADR-0013).
- Los números alinean por columna gracias a los dígitos tabulares.
- Los tokens con nombres congelados dejan trabajar en paralelo a las tarjetas de UI.

**Negativas**
- Dos familias tipográficas añaden peso; se usan subconjuntos latinos.
- Mapear Material M3 a tokens propios exige trabajo inicial (W3-05).

**Riesgos**
- El ámbar y el verde pueden quedar cortos de contraste en tema oscuro. Mitigación: prueba automática de contraste sobre los valores de los tokens.
- El medidor de casa puede leerse como valor del inmueble. Mitigación: rótulo explícito y texto alternativo con el porcentaje.

## Verificación

- **W0-05:** `docs/specs/design-palette.md` registra la fecha de aprobación del dueño. Sin ella, la paleta no se congela.
- **W3-05:**
  - prueba de contraste sobre los tokens en ambos temas;
  - la spec congelada `tokens.contract.spec.ts` pasa;
  - un grep de `dist` no encuentra URLs de fuentes externas ni de CDN;
  - un grep de código no encuentra colores fijos fuera de `styles/`.
- **W3-06:** pruebas de los pipes es-GT y de los inputs de dinero y fecha.
- **W3-07 y W3-08:** pruebas de teclado de la tabla, del medidor de casa y del anunciador.
- **W6-02:** barrido axe de todas las rutas en ambos temas.

## Referencias

- ADR-0011, ADR-0013, ADR-0016, ADR-0017.
- `docs/discovery/direccion-visual.md` (direcciones, bocetos y paleta propuesta), `docs/discovery/historias-de-usuario.md` (comportamiento por pantalla).
- `docs/specs/design-palette.md`, `docs/specs/component-contracts.md`.
- Tarjetas W0-05, W3-05 a W3-09, W4-03, W4-04 y W6-02.

## Enmiendas

**Enmienda (2026-10-09, W3).** Precisiones de W3-05, W3-06 y W3-09 que no cambian la decisión:

- **Tailwind v4 sin *preflight*.** `apps/web/src/styles/tailwind.scss` importa solo las capas `theme` y `utilities`, sin el reinicio de estilos base. Las utilidades se importan con `important`, porque los estilos de los componentes de Material no están en capas y, si no, ganarían a cualquier regla de `@layer utilities`.
- **Fuentes propias solo en woff2.** Las fuentes de `@fontsource/*` se sirven desde el propio sitio y el build no emite archivos `.woff` (lo comprueba `fonts.dist.spec.ts`).
- **Roles de Material sobre los tokens.** `material-theme.scss` apunta los roles de color `--mat-sys-*` a los tokens `--cc-*`, que siguen siendo la única fuente de color.
- **Avisos propios en vez de `MatSnackBar`.** El aviso de errores (`cc-error-toast`, en `core/errors`) y el aviso de actualización (`cc-update-prompt`, en `core/pwa`) son componentes ligeros propios, para cuidar los presupuestos del bundle de la landing y de `/app`.
- **Montos negativos.** El signo va antes del símbolo: `-Q 1,234.50` (y `-US$ 1,234.50`); el cero nunca lleva signo.
