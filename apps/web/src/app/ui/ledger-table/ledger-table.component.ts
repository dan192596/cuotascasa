import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { LedgerCellEdit, LedgerColumn, LedgerRow } from './ledger-table.types.ts';

const PAGE_ROWS = 12;
const DEFAULT_WIDTH = '7rem';
const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
const DECIMAL = /^\d+(\.\d{1,2})?$/;

interface CellVm {
  readonly ci: number;
  readonly column: LedgerColumn;
  readonly text: string;
  readonly role: 'gridcell' | 'rowheader';
  readonly editable: boolean;
  readonly left: string | null;
}

interface RowVm {
  readonly ri: number;
  readonly row: LedgerRow;
  readonly subtotal: boolean;
  readonly band: boolean;
  readonly cells: readonly CellVm[];
}

interface Editing {
  readonly rowKey: string;
  readonly c: number;
  /** El editor nació de una tecla: el cursor va al final en lugar de seleccionar todo. */
  readonly seeded: boolean;
  readonly initial: string;
  readonly draft: string;
  readonly invalid: boolean;
}

/**
 * Tabla tipo libreta (ADR-0012 §11, HU-07/HU-17): renglones, cifras tabulares, encabezado fijo, fila actual resaltada,
 * filas de subtotal, rejilla ARIA con tabindex móvil y celdas editables. Es genérica: solo emite `cellEdit`.
 */
@Component({
  selector: 'cc-ledger-table',
  templateUrl: './ledger-table.component.html',
  styleUrl: './ledger-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--cc-ledger-cols]': 'template()',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusIn($event)',
    '(dblclick)': 'onDblclick($event)',
  },
})
export class LedgerTableComponent {
  readonly columns = input.required<readonly LedgerColumn[]>();
  readonly rows = input.required<readonly LedgerRow[]>();
  /** Nombre accesible de la rejilla. */
  readonly label = input('Tabla');
  /** Cuántas columnas iniciales quedan fijas al desplazar en horizontal (máximo 3). */
  readonly stickyColumns = input(2);
  readonly cellEdit = output<LedgerCellEdit>();

  protected readonly active = signal({ r: 0, c: 0 });
  protected readonly editing = signal<Editing | null>(null);
  protected readonly status = signal('');
  private readonly editor = viewChild<ElementRef<HTMLInputElement>>('editor');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('grid');

  protected readonly template = computed(() =>
    this.columns()
      .map((c) => c.width ?? DEFAULT_WIDTH)
      .join(' '),
  );

  /** `left` CSS de cada columna fija (`null` si no lo es). */
  protected readonly offsets = computed<readonly (string | null)[]>(() => {
    const columns = this.columns();
    const sticky = Math.min(this.stickyColumns(), 3, columns.length);
    return columns.map((_, i) => {
      if (i >= sticky) return null;
      const widths = columns.slice(0, i).map((c) => c.width ?? DEFAULT_WIDTH);
      return widths.length === 0 ? '0' : widths.length === 1 ? (widths[0] ?? '0') : `calc(${widths.join(' + ')})`;
    });
  });

  protected readonly view = computed<readonly RowVm[]>(() => {
    const columns = this.columns();
    const offsets = this.offsets();
    let dataIndex = 0;
    return this.rows().map((row, ri) => {
      const subtotal = row.kind === 'subtotal';
      const band = !subtotal && dataIndex++ % 2 === 1;
      return {
        ri,
        row,
        subtotal,
        band,
        cells: columns.map((column, ci) => ({
          ci,
          column,
          text: row.cells[column.key] ?? '',
          role: subtotal && ci === 0 ? 'rowheader' : 'gridcell',
          editable: this.canEdit(row, column),
          left: offsets[ci] ?? null,
        })),
      };
    });
  });

  protected readonly activeCell = computed(() => {
    const { r, c } = this.active();
    return {
      r: Math.max(0, Math.min(r, this.rows().length - 1)),
      c: Math.max(0, Math.min(c, this.columns().length - 1)),
    };
  });

  constructor() {
    effect(() => {
      const el = this.editor()?.nativeElement;
      if (el) {
        el.focus();
        if (untracked(this.editing)?.seeded) el.setSelectionRange(el.value.length, el.value.length);
        else el.select();
      }
    });
    effect(() => {
      const keys = new Set(this.rows().map((row) => row.key));
      const state = untracked(this.editing);
      if (state && !keys.has(state.rowKey)) {
        this.editing.set(null);
        this.announce('Edición cancelada: la fila ya no existe.');
      }
    });
  }

  private canEdit(row: LedgerRow, column: LedgerColumn): boolean {
    return row.kind !== 'subtotal' && row.editable === true && column.editable === true;
  }

  protected isEditing(rowKey: string, c: number): boolean {
    const e = this.editing();
    return e !== null && e.rowKey === rowKey && e.c === c;
  }

  /** Vuelve a anunciar aunque el texto sea idéntico al anterior: vacía la región y la rellena en el turno siguiente. */
  private announce(message: string): void {
    this.status.set('');
    setTimeout(() => this.status.set(message), 0);
  }

  protected onDblclick(event: MouseEvent): void {
    const pos = this.positionOf(event.target);
    if (pos && !this.editing()) this.startEdit(pos.r, pos.c);
  }

  protected onFocusIn(event: FocusEvent): void {
    const pos = this.positionOf(event.target);
    if (pos) this.active.set(pos);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.editing()) return;
    if (event.altKey || event.metaKey || event.shiftKey) return;
    if (event.ctrlKey && event.key.startsWith('Page')) return;
    const pos = this.positionOf(event.target);
    if (!pos) return;
    const lastRow = this.rows().length - 1;
    const lastCol = this.columns().length - 1;
    let next: { r: number; c: number };
    switch (event.key) {
      case 'ArrowUp':
        next = { r: pos.r - 1, c: pos.c };
        break;
      case 'ArrowDown':
        next = { r: pos.r + 1, c: pos.c };
        break;
      case 'ArrowLeft':
        next = { r: pos.r, c: pos.c - 1 };
        break;
      case 'ArrowRight':
        next = { r: pos.r, c: pos.c + 1 };
        break;
      case 'Home':
        next = event.ctrlKey ? { r: 0, c: 0 } : { r: pos.r, c: 0 };
        break;
      case 'End':
        next = event.ctrlKey ? { r: lastRow, c: lastCol } : { r: pos.r, c: lastCol };
        break;
      case 'PageUp':
        next = { r: pos.r - PAGE_ROWS, c: pos.c };
        break;
      case 'PageDown':
        next = { r: pos.r + PAGE_ROWS, c: pos.c };
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        this.startEdit(pos.r, pos.c);
        return;
      default:
        if (!event.ctrlKey && /^\d$/.test(event.key) && this.view()[pos.r]?.cells[pos.c]?.editable) {
          event.preventDefault();
          this.startEdit(pos.r, pos.c, event.key);
        }
        return;
    }
    event.preventDefault();
    this.moveTo(Math.max(0, Math.min(next.r, lastRow)), Math.max(0, Math.min(next.c, lastCol)));
  }

  protected onEditorKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commit(false);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    } else if (event.key === 'Tab') {
      this.commit(true);
    }
  }

  protected onEditorInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.editing.update((e) => (e ? { ...e, draft: value, invalid: false } : e));
  }

  protected onEditorBlur(): void {
    if (this.editing()) this.commit(true);
  }

  private startEdit(r: number, c: number, seed?: string): void {
    const vm = this.view()[r];
    const cell = vm?.cells[c];
    if (!vm || !cell) return;
    if (!cell.editable) {
      this.announce('Esta celda no se puede editar.');
      return;
    }
    const raw = vm.row.editValues?.[cell.column.key] ?? cell.text.replace(/[,\s]/g, '');
    this.editing.set({
      rowKey: vm.row.key,
      c,
      seeded: seed !== undefined,
      initial: raw,
      draft: seed ?? raw,
      invalid: false,
    });
    this.announce(`Editando ${cell.column.header} de ${this.rowName(vm.row)}. Enter confirma, Escape cancela.`);
  }

  /** `leaving`: la edición termina por foco o Tab; un valor inválido se descarta en lugar de atrapar al usuario. */
  private commit(leaving: boolean): void {
    const state = this.editing();
    if (!state) return;
    const r = this.rows().findIndex((row) => row.key === state.rowKey);
    const vm = this.view()[r];
    const cell = vm?.cells[state.c];
    if (!vm || !cell) {
      this.editing.set(null);
      this.announce('Edición cancelada: la fila ya no existe.');
      return;
    }
    const draft = state.draft.trim();
    const normalized = THOUSANDS.test(draft) ? draft.replace(/,/g, '') : draft;
    if (normalized !== '' && !DECIMAL.test(normalized)) {
      if (leaving) {
        this.editing.set(null);
        this.announce('Edición cancelada: el valor no era un número válido.');
      } else {
        this.editing.update((e) => (e ? { ...e, invalid: true } : e));
        this.announce('Escribe un número válido, sin signo, con coma solo para miles y hasta 2 decimales.');
      }
      return;
    }
    this.editing.set(null);
    if (!leaving) this.focusCell(r, state.c);
    const value = normalized === '' ? '0' : normalized;
    if (value === (state.initial === '' ? '0' : state.initial)) return;
    this.cellEdit.emit({ rowKey: vm.row.key, columnKey: cell.column.key, value });
    this.announce(`${cell.column.header} de ${this.rowName(vm.row)} actualizado.`);
  }

  private cancel(): void {
    const state = this.editing();
    if (!state) return;
    this.editing.set(null);
    this.focusCell(
      this.rows().findIndex((row) => row.key === state.rowKey),
      state.c,
    );
    this.announce('Edición cancelada.');
  }

  private rowName(row: LedgerRow): string {
    return row.label ?? row.key;
  }

  private moveTo(r: number, c: number): void {
    this.active.set({ r, c });
    this.focusCell(r, c);
  }

  private focusCell(r: number, c: number): void {
    this.host().nativeElement.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
  }

  private positionOf(target: EventTarget | null): { r: number; c: number } | null {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>('[data-r][data-c]');
    if (!el) return null;
    return { r: Number(el.dataset['r']), c: Number(el.dataset['c']) };
  }
}
