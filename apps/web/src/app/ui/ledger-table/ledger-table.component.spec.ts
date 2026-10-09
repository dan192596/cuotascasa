import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LedgerTableComponent } from './ledger-table.component.ts';
import type { LedgerCellEdit, LedgerColumn, LedgerRow } from './ledger-table.types.ts';

const COLUMNS: readonly LedgerColumn[] = [
  { key: 'k', header: '#', align: 'end', width: '3rem' },
  { key: 'due', header: 'Vence', width: '6rem' },
  { key: 'capital', header: 'Capital', align: 'end' },
  { key: 'extra', header: 'Abono', align: 'end', editable: true },
];

function dataRow(k: number, editable: boolean, current = false): LedgerRow {
  return {
    key: `r${k}`,
    label: `Cuota ${k}`,
    cells: { k: String(k), due: '31/01/2026', capital: '1,000.00', extra: k === 3 ? '20,000.00' : '' },
    editable,
    current,
  };
}

const SUBTOTAL: LedgerRow = {
  key: 'sub-2026',
  kind: 'subtotal',
  label: 'Subtotal 2026',
  cells: { k: 'Subtotal 2026', capital: '3,000.00' },
  editable: true,
};

function sampleRows(): LedgerRow[] {
  return [dataRow(1, false), dataRow(2, false), dataRow(3, true, true), SUBTOTAL, dataRow(4, true)];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

async function mount(rows: readonly LedgerRow[] = sampleRows()) {
  const fixture = TestBed.createComponent(LedgerTableComponent);
  fixture.componentRef.setInput('columns', COLUMNS);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('label', 'Tabla de prueba');
  const edits: LedgerCellEdit[] = [];
  fixture.componentInstance.cellEdit.subscribe((edit) => edits.push(edit));
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const cell = (r: number, c: number) =>
    root.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) as HTMLElement;
  const press = async (target: Element, key: string, init: KeyboardEventInit = {}) => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    await fixture.whenStable();
  };
  const focused = () => {
    const el = document.activeElement as HTMLElement | null;
    return el ? `${el.dataset['r']},${el.dataset['c']}` : null;
  };
  return { fixture, root, cell, press, focused, edits };
}

async function tick(fixture: { whenStable(): Promise<unknown> }) {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fixture.whenStable();
}

describe('cc-ledger-table', () => {
  it('exposes ARIA grid semantics with a distinct subtotal row', async () => {
    const { root } = await mount();
    const grid = root.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute('aria-label')).toBe('Tabla de prueba');
    expect(grid.getAttribute('aria-rowcount')).toBe('6');
    expect(grid.getAttribute('aria-colcount')).toBe('4');
    const rows = Array.from(grid.querySelectorAll('[role="row"]'));
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(rows[0]?.querySelectorAll('[role="columnheader"]')).toHaveLength(4);
    const data = rows[1] as HTMLElement;
    expect(data.querySelectorAll('[role="gridcell"]')).toHaveLength(4);
    const subtotal = rows[4] as HTMLElement;
    expect(subtotal.getAttribute('aria-roledescription')).toBe('subtotal');
    expect(subtotal.querySelectorAll('[role="rowheader"]')).toHaveLength(1);
    expect(subtotal.querySelectorAll('[role="gridcell"]')).toHaveLength(3);
    expect(data.hasAttribute('aria-roledescription')).toBe(false);
    expect(rows[3]?.getAttribute('aria-current')).toBe('true');
    expect(rows[1]?.hasAttribute('aria-current')).toBe(false);
  });

  it('uses a roving tabindex: exactly one cell is tabbable and it follows focus', async () => {
    const { root, cell, press, focused } = await mount();
    const tabbable = () => root.querySelectorAll('[tabindex="0"]');
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(cell(0, 0));
    cell(0, 0).focus();
    await press(cell(0, 0), 'ArrowRight');
    expect(focused()).toBe('0,1');
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(cell(0, 1));
  });

  it('moves with arrows, clamping at the edges', async () => {
    const { cell, press, focused } = await mount();
    cell(0, 0).focus();
    await press(cell(0, 0), 'ArrowUp');
    await press(cell(0, 0), 'ArrowLeft');
    expect(focused()).toBe('0,0');
    await press(cell(0, 0), 'ArrowDown');
    expect(focused()).toBe('1,0');
    await press(cell(1, 0), 'ArrowRight');
    expect(focused()).toBe('1,1');
    await press(cell(1, 1), 'ArrowUp');
    expect(focused()).toBe('0,1');
    cell(4, 3).focus();
    await press(cell(4, 3), 'ArrowDown');
    await press(cell(4, 3), 'ArrowRight');
    expect(focused()).toBe('4,3');
  });

  it('jumps to row edges with Home/End and to grid corners with Ctrl+Home/End', async () => {
    const { cell, press, focused } = await mount();
    cell(2, 1).focus();
    await press(cell(2, 1), 'End');
    expect(focused()).toBe('2,3');
    await press(cell(2, 3), 'Home');
    expect(focused()).toBe('2,0');
    await press(cell(2, 0), 'End', { ctrlKey: true });
    expect(focused()).toBe('4,3');
    await press(cell(4, 3), 'Home', { ctrlKey: true });
    expect(focused()).toBe('0,0');
  });

  it('moves 12 rows with PageDown/PageUp and clamps', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => dataRow(i + 1, false));
    const { cell, press, focused } = await mount(rows);
    cell(0, 2).focus();
    await press(cell(0, 2), 'PageDown');
    expect(focused()).toBe('12,2');
    await press(cell(12, 2), 'PageDown');
    expect(focused()).toBe('24,2');
    await press(cell(24, 2), 'PageDown');
    await press(cell(36, 2), 'PageDown');
    expect(focused()).toBe('39,2');
    await press(cell(39, 2), 'PageUp');
    expect(focused()).toBe('27,2');
    cell(5, 2).focus();
    await press(cell(5, 2), 'PageUp');
    expect(focused()).toBe('0,2');
  });

  it('Enter edits an editable cell, Enter commits and emits a decimal string', async () => {
    const { cell, press, root, fixture, edits } = await mount();
    cell(2, 3).focus();
    await press(cell(2, 3), 'Enter');
    const input = root.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('20000.00');
    input.value = '1,500.5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    await press(input, 'Enter');
    expect(edits).toEqual([{ rowKey: 'r3', columnKey: 'extra', value: '1500.5' }]);
    expect(root.querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(cell(2, 3));
  });

  it('Escape cancels without emitting and restores focus to the cell', async () => {
    const { cell, press, root, fixture, edits } = await mount();
    cell(2, 3).focus();
    await press(cell(2, 3), 'Enter');
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = '99';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    await press(input, 'Escape');
    expect(edits).toEqual([]);
    expect(root.querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(cell(2, 3));
  });

  it('does not emit when the value is unchanged and emits 0 when a cell is cleared', async () => {
    const { cell, press, root, fixture, edits } = await mount();
    cell(2, 3).focus();
    await press(cell(2, 3), 'Enter');
    await press(root.querySelector('input') as Element, 'Enter');
    expect(edits).toEqual([]);
    await press(cell(2, 3), 'Enter');
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    await press(input, 'Enter');
    expect(edits).toEqual([{ rowKey: 'r3', columnKey: 'extra', value: '0' }]);
  });

  it('keeps editing and announces an error for a non-decimal value', async () => {
    const { cell, press, root, fixture, edits } = await mount();
    cell(4, 3).focus();
    await press(cell(4, 3), 'Enter');
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = '12abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    await press(input, 'Enter');
    await tick(fixture);
    expect(edits).toEqual([]);
    expect(root.querySelector('input')).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(root.querySelector('[role="status"]')?.textContent).toContain('número');
    input.value = '-5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    await press(input, 'Enter');
    expect(edits).toEqual([]);
  });

  it('never enters edit mode on rows or columns that are not editable, nor on subtotals', async () => {
    const { cell, press, root } = await mount();
    cell(0, 3).focus();
    await press(cell(0, 3), 'Enter');
    expect(root.querySelector('input')).toBeNull();
    cell(2, 2).focus();
    await press(cell(2, 2), 'Enter');
    expect(root.querySelector('input')).toBeNull();
    cell(3, 3).focus();
    await press(cell(3, 3), 'Enter');
    await press(cell(3, 3), 'F2');
    expect(root.querySelector('input')).toBeNull();
    expect(cell(0, 3).getAttribute('aria-readonly')).toBe('true');
    expect(cell(2, 3).hasAttribute('aria-readonly')).toBe(false);
    expect(cell(2, 3).getAttribute('data-editable')).toBe('true');
  });

  it('does not mutate its inputs', async () => {
    const rows = deepFreeze(sampleRows());
    const columns = deepFreeze(COLUMNS.map((c) => ({ ...c })));
    const fixture = TestBed.createComponent(LedgerTableComponent);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('label', 'x');
    const edits: LedgerCellEdit[] = [];
    fixture.componentInstance.cellEdit.subscribe((e) => edits.push(e));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const target = root.querySelector('[data-r="2"][data-c="3"]') as HTMLElement;
    target.focus();
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    const input = root.querySelector('input') as HTMLInputElement;
    input.value = '5';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(edits).toHaveLength(1);
    expect(rows[2]?.cells['extra']).toBe('20,000.00');
  });

  it('renders 360 rows within the test budget', async () => {
    const rows = Array.from({ length: 360 }, (_, i) => dataRow(i + 1, true));
    const start = performance.now();
    const { root } = await mount(rows);
    const elapsed = performance.now() - start;
    expect(root.querySelectorAll('[role="row"]')).toHaveLength(361);
    expect(elapsed).toBeLessThan(2000);
  });

  describe('fix round', () => {
    const type = async (fixture: { whenStable(): Promise<unknown> }, input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
    };

    it('does not hijack modified keys, but keeps Ctrl+Home/End', async () => {
      const rows = Array.from({ length: 40 }, (_, i) => dataRow(i + 1, false));
      const { cell, focused } = await mount(rows);
      cell(5, 1).focus();
      const fire = (key: string, init: KeyboardEventInit) => {
        const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
        cell(5, 1).dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      expect(fire('ArrowDown', { shiftKey: true })).toBe(false);
      expect(fire('ArrowLeft', { altKey: true })).toBe(false);
      expect(fire('ArrowRight', { metaKey: true })).toBe(false);
      expect(fire('PageDown', { ctrlKey: true })).toBe(false);
      expect(fire('PageUp', { ctrlKey: true })).toBe(false);
      expect(focused()).toBe('5,1');
      expect(fire('End', { ctrlKey: true })).toBe(true);
      expect(focused()).toBe('39,3');
    });

    it('starts editing on double click of an editable cell only', async () => {
      const { cell, root, fixture } = await mount();
      cell(0, 3).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      cell(2, 2).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await fixture.whenStable();
      expect(root.querySelector('input')).toBeNull();
      cell(2, 3).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await fixture.whenStable();
      expect((root.querySelector('input') as HTMLInputElement).value).toBe('20000.00');
    });

    it('type-to-edit: a digit on an editable cell seeds the editor, other keys do not', async () => {
      const { cell, press, root, fixture, edits } = await mount();
      cell(0, 3).focus();
      await press(cell(0, 3), '5');
      expect(root.querySelector('input')).toBeNull();
      cell(4, 3).focus();
      await press(cell(4, 3), 'a');
      expect(root.querySelector('input')).toBeNull();
      const ev = new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true });
      cell(4, 3).dispatchEvent(ev);
      await fixture.whenStable();
      expect(ev.defaultPrevented).toBe(true);
      const input = root.querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('7');
      expect(input.selectionStart).toBe(1);
      expect(input.selectionEnd).toBe(1);
      await type(fixture, input, '75');
      await press(input, 'Enter');
      expect(edits).toEqual([{ rowKey: 'r4', columnKey: 'extra', value: '75' }]);
    });

    it('accepts commas only as valid thousands separators and at most 2 decimals', async () => {
      const { cell, press, root, fixture, edits } = await mount();
      cell(4, 3).focus();
      const attempt = async (raw: string) => {
        await press(cell(4, 3), 'Enter');
        const input = root.querySelector('input') as HTMLInputElement;
        await type(fixture, input, raw);
        await press(input, 'Enter');
        const stillOpen = root.querySelector('input') !== null;
        if (stillOpen) await press(root.querySelector('input') as Element, 'Escape');
        return stillOpen;
      };
      expect(await attempt('1,50')).toBe(true);
      expect(await attempt('1,5000')).toBe(true);
      expect(await attempt('12 34')).toBe(true);
      expect(await attempt('1.234')).toBe(true);
      expect(edits).toEqual([]);
      expect(await attempt('  1,234,567.89  ')).toBe(false);
      expect(edits).toEqual([{ rowKey: 'r4', columnKey: 'extra', value: '1234567.89' }]);
    });

    it('clearing a cell whose value is 0 does not emit', async () => {
      const rows = [{ ...dataRow(1, true), cells: { k: '1', due: 'x', capital: '1', extra: '0.00' } }];
      const rows0 = [{ ...rows[0]!, editValues: { extra: '0' } }];
      const { cell, press, root, fixture, edits } = await mount(rows0);
      cell(0, 3).focus();
      await press(cell(0, 3), 'Enter');
      await type(fixture, root.querySelector('input') as HTMLInputElement, '');
      await press(root.querySelector('input') as Element, 'Enter');
      expect(edits).toEqual([]);
    });

    it('commits by row key and cancels the edit when the row disappears', async () => {
      const { cell, press, root, fixture, edits } = await mount();
      cell(4, 3).focus();
      await press(cell(4, 3), 'Enter');
      const input = root.querySelector('input') as HTMLInputElement;
      await type(fixture, input, '9');
      fixture.componentRef.setInput('rows', [dataRow(0, false), ...sampleRows()]);
      await fixture.whenStable();
      await press(root.querySelector('input') as Element, 'Enter');
      expect(edits).toEqual([{ rowKey: 'r4', columnKey: 'extra', value: '9' }]);

      cell(5, 3).focus();
      await press(cell(5, 3), 'Enter');
      expect(root.querySelector('input')).not.toBeNull();
      fixture.componentRef.setInput('rows', sampleRows().slice(0, 3));
      await fixture.whenStable();
      await tick(fixture);
      expect(root.querySelector('input')).toBeNull();
      expect(root.querySelector('[role="status"]')?.textContent).toContain('cancel');
      expect(edits).toHaveLength(1);
    });

    it('re-announces an identical status message', async () => {
      const { cell, press, root, fixture } = await mount();
      const status = () => root.querySelector('[role="status"]')?.textContent?.trim();
      cell(0, 3).focus();
      await press(cell(0, 3), 'Enter');
      await tick(fixture);
      const first = status();
      expect(first).toContain('no se puede editar');
      await press(cell(0, 3), 'Enter');
      expect(status()).toBe('');
      await tick(fixture);
      expect(status()).toBe(first);
    });

    it('blur or Tab commits a valid edit and discards an invalid one', async () => {
      const { cell, press, root, fixture, edits } = await mount();
      cell(4, 3).focus();
      await press(cell(4, 3), 'Enter');
      let input = root.querySelector('input') as HTMLInputElement;
      await type(fixture, input, '10');
      await press(input, 'Tab');
      expect(edits).toEqual([{ rowKey: 'r4', columnKey: 'extra', value: '10' }]);
      expect(root.querySelector('input')).toBeNull();

      await press(cell(4, 3), 'Enter');
      input = root.querySelector('input') as HTMLInputElement;
      await type(fixture, input, '11');
      input.dispatchEvent(new FocusEvent('blur'));
      await fixture.whenStable();
      expect(edits).toHaveLength(2);
      expect(edits[1]?.value).toBe('11');

      await press(cell(4, 3), 'Enter');
      input = root.querySelector('input') as HTMLInputElement;
      await type(fixture, input, 'zz');
      input.dispatchEvent(new FocusEvent('blur'));
      await fixture.whenStable();
      expect(edits).toHaveLength(2);
      expect(root.querySelector('input')).toBeNull();

      await press(cell(4, 3), 'Enter');
      input = root.querySelector('input') as HTMLInputElement;
      await type(fixture, input, 'zz');
      await press(input, 'Tab');
      expect(edits).toHaveLength(2);
      expect(root.querySelector('input')).toBeNull();
    });

    it('styles: silent current-row marker and forced-colors fallback', () => {
      const css = readFileSync('apps/web/src/app/ui/ledger-table/ledger-table.component.css', 'utf8');
      expect(css).toMatch(/content:\s*'\\25B6'\s*\/\s*''/);
      expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*data-editable/);
    });
  });
});
