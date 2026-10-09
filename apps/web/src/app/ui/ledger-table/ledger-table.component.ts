import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { LedgerCellEdit, LedgerColumn, LedgerRow } from './ledger-table.types.ts';

const PAGE_ROWS = 12;
const DEFAULT_WIDTH = '7rem';
const DECIMAL = /^\d+(\.\d+)?$/;

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
  readonly r: number;
  readonly c: number;
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
        el.select();
      }
    });
  }

  private canEdit(row: LedgerRow, column: LedgerColumn): boolean {
    return row.kind !== 'subtotal' && row.editable === true && column.editable === true;
  }

  protected isEditing(r: number, c: number): boolean {
    const e = this.editing();
    return e !== null && e.r === r && e.c === c;
  }

  protected onFocusIn(event: FocusEvent): void {
    const pos = this.positionOf(event.target);
    if (pos) this.active.set(pos);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.editing()) return;
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

  private startEdit(r: number, c: number): void {
    const vm = this.view()[r];
    const cell = vm?.cells[c];
    if (!vm || !cell) return;
    if (!cell.editable) {
      this.status.set('Esta celda no se puede editar.');
      return;
    }
    const raw = vm.row.editValues?.[cell.column.key] ?? cell.text.replace(/[,\s]/g, '');
    this.editing.set({ r, c, initial: raw, draft: raw, invalid: false });
    this.status.set(`Editando ${cell.column.header} de ${this.rowName(vm.row)}. Enter confirma, Escape cancela.`);
  }

  /** `leaving`: la edición termina por foco o Tab; un valor inválido se descarta en lugar de atrapar al usuario. */
  private commit(leaving: boolean): void {
    const state = this.editing();
    if (!state) return;
    const vm = this.view()[state.r];
    const cell = vm?.cells[state.c];
    if (!vm || !cell) return;
    const normalized = state.draft.replace(/[,\s]/g, '');
    if (normalized !== '' && !DECIMAL.test(normalized)) {
      if (leaving) {
        this.editing.set(null);
        this.status.set('Edición cancelada: el valor no era un número válido.');
      } else {
        this.editing.update((e) => (e ? { ...e, invalid: true } : e));
        this.status.set('Escribe un número válido, sin signo (por ejemplo 1500.50).');
      }
      return;
    }
    this.editing.set(null);
    if (!leaving) this.focusCell(state.r, state.c);
    if (normalized === state.initial) return;
    this.cellEdit.emit({ rowKey: vm.row.key, columnKey: cell.column.key, value: normalized === '' ? '0' : normalized });
    this.status.set(`${cell.column.header} de ${this.rowName(vm.row)} actualizado.`);
  }

  private cancel(): void {
    const state = this.editing();
    if (!state) return;
    this.editing.set(null);
    this.focusCell(state.r, state.c);
    this.status.set('Edición cancelada.');
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
