/**
 * Contrato público de `cc-ledger-table` (W3-07). Genérico: no conoce préstamos. El anfitrión entrega el texto ya
 * formateado de cada celda (pipes de `ui/`, W3-06) y recibe ediciones como cadenas decimales.
 */

export interface LedgerColumn {
  /** Clave estable de la columna; indexa `LedgerRow.cells`. */
  readonly key: string;
  /** Texto del encabezado. */
  readonly header: string;
  /** Alineación del contenido; las cifras van a la derecha. Por defecto `start`. */
  readonly align?: 'start' | 'end';
  /**
   * Ancho CSS de la columna. Debe ser una longitud fija (por ejemplo `7rem`, `120px`; nada de `fr`, `%` ni `auto`):
   * los desfases de las columnas fijas (`stickyColumns`) se calculan sumando estos anchos. Por defecto `7rem`.
   * El encabezado fijo solo funciona si el anfitrión acota su altura (`--cc-ledger-max-height` o un contenedor con alto).
   */
  readonly width?: string;
  /** Las celdas de esta columna admiten edición cuando su fila también la admite. */
  readonly editable?: boolean;
}

export type LedgerRowKind = 'data' | 'subtotal';

export interface LedgerRow {
  /** Clave estable de la fila; viaja en `LedgerCellEdit.rowKey`. */
  readonly key: string;
  /** `subtotal` produce una fila de totales: nunca es editable. Por defecto `data`. */
  readonly kind?: LedgerRowKind;
  /** Nombre hablado de la fila (lectores de pantalla). Por defecto, la clave. */
  readonly label?: string;
  /** Texto ya formateado por columna. */
  readonly cells: Readonly<Record<string, string>>;
  /** Valor decimal crudo para precargar la edición, por columna. Por defecto, el texto de la celda sin comas. */
  readonly editValues?: Readonly<Record<string, string>>;
  /** La fila admite edición (en las columnas editables). Por defecto `false`. */
  readonly editable?: boolean;
  /** Fila resaltada como la del mes actual. */
  readonly current?: boolean;
}

export interface LedgerCellEdit {
  readonly rowKey: string;
  readonly columnKey: string;
  /** Cadena decimal (`123.45`); una celda vaciada emite `0`. */
  readonly value: string;
}
