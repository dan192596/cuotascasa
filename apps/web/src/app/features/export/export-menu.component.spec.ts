import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { PathKind } from '@cuotascasa/domain';
import type { ExportFormat, ReportModel, ReportWriter } from '@cuotascasa/export';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Announcer } from '../../ui/feedback/announcer.service.ts';
import { ExportMenuComponent, type ExportRequest } from './export-menu.component.ts';
import {
  EXPORT_LOADERS,
  exportFileName,
  FILE_SAVER,
  OBJECT_URL_LIFETIME_MS,
  saveBlobAsFile,
} from './export-support.ts';

const MODEL = { kind: 'schedule', title: 'Tabla', tables: [] } as unknown as ReportModel;
const BYTES = new Uint8Array([1, 2, 3]);
const TYPES = {
  csv: { mimeType: 'text/csv;charset=utf-8', extension: 'csv' },
  excel: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  pdf: { mimeType: 'application/pdf', extension: 'pdf' },
} as const;

// Synthetic placeholders: the builders and writers are spies, so the inputs are never read.
const SCHEDULE_REQUEST = {
  kind: 'schedule',
  input: { pathKind: PathKind.REAL, loanLabel: 'Casa de prueba', generatedOn: '2026-10-16' },
} as unknown as ExportRequest;
const COMPARISON_REQUEST = {
  kind: 'comparison',
  input: { loanLabel: 'Casa de prueba', generatedOn: '2026-10-16' },
} as unknown as ExportRequest;

interface SetupOptions {
  readonly failWrite?: ExportFormat;
  readonly failLoad?: ExportFormat;
  /** Holds the csv writer load until the test releases it. */
  readonly gateCsv?: boolean;
}

function setup(request: ExportRequest = SCHEDULE_REQUEST, options: SetupOptions = {}) {
  const live = {
    polite: vi.fn<(message: string) => Promise<void>>(() => Promise.resolve()),
    assertive: vi.fn<(message: string) => Promise<void>>(() => Promise.resolve()),
    announce: vi.fn(() => Promise.resolve()),
    clear: vi.fn(),
  };
  const save = vi.fn();
  const buildScheduleReport = vi.fn(() => MODEL);
  const buildComparisonReport = vi.fn(() => MODEL);
  const loaded: ExportFormat[] = [];
  let release: () => void = () => undefined;
  const gate = options.gateCsv === true ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
  const writer = (format: ExportFormat) =>
    vi.fn(async () => {
      loaded.push(format);
      if (options.failLoad === format) throw new Error('Loading chunk failed 1234.56');
      if (format === 'csv') await gate;
      return {
        format,
        ...TYPES[format],
        write: () =>
          options.failWrite === format ? Promise.reject(new Error('boom Q 99.00')) : Promise.resolve(BYTES),
      } satisfies ReportWriter;
    });
  const writers = { csv: writer('csv'), excel: writer('excel'), pdf: writer('pdf') };
  const builders = vi.fn(() => Promise.resolve({ buildScheduleReport, buildComparisonReport }));
  TestBed.configureTestingModule({
    providers: [
      { provide: Announcer, useValue: live },
      { provide: FILE_SAVER, useValue: save },
      { provide: EXPORT_LOADERS, useValue: { writers, builders } },
    ],
  });
  const fixture: ComponentFixture<ExportMenuComponent> = TestBed.createComponent(ExportMenuComponent);
  fixture.componentRef.setInput('request', request);
  fixture.detectChanges();
  return {
    fixture,
    live,
    save,
    writers,
    builders,
    buildScheduleReport,
    buildComparisonReport,
    loaded,
    release: () => release(),
  };
}

type Setup = ReturnType<typeof setup>;
const el = (s: Setup) => s.fixture.nativeElement as HTMLElement;
const q = (s: Setup, testId: string) => el(s).querySelector<HTMLElement>(`[data-testid="${testId}"]`);

async function settle(s: Setup): Promise<void> {
  // A few macrotask turns: the export chain awaits dynamic imports, which take more than one turn on a loaded CI runner.
  for (let turn = 0; turn < 5; turn += 1) {
    await s.fixture.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    s.fixture.detectChanges();
  }
}

async function pick(s: Setup, format: ExportFormat): Promise<void> {
  if (q(s, `format-${format}`) === null) q(s, 'export-trigger')?.click();
  s.fixture.detectChanges();
  q(s, `format-${format}`)?.click();
  await settle(s);
}

async function confirmWarning(s: Setup): Promise<void> {
  q(s, 'warning-confirm')?.click();
  await settle(s);
}

describe('cc-export-menu', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('lists the three formats behind a disclosure button that is keyboard operable', () => {
    const s = setup();
    const trigger = q(s, 'export-trigger') as HTMLButtonElement;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(q(s, 'format-csv')).toBeNull();
    trigger.click();
    s.fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    for (const format of ['excel', 'csv', 'pdf']) {
      expect((q(s, `format-${format}`) as HTMLButtonElement).tagName).toBe('BUTTON');
    }
  });

  it('closes the list with Escape and returns focus to the trigger', () => {
    const s = setup();
    document.body.append(el(s));
    const trigger = q(s, 'export-trigger') as HTMLButtonElement;
    trigger.click();
    s.fixture.detectChanges();
    (q(s, 'format-pdf') as HTMLButtonElement).focus();
    q(s, 'format-pdf')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    s.fixture.detectChanges();
    expect(q(s, 'format-pdf')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    el(s).remove();
  });

  it('loads nothing until a format is chosen', () => {
    const s = setup();
    expect(s.builders).not.toHaveBeenCalled();
    for (const format of ['csv', 'excel', 'pdf'] as const) expect(s.writers[format]).not.toHaveBeenCalled();
  });

  it.each(['csv', 'excel', 'pdf'] as const)('%s triggers only its own writer import', async (format) => {
    const s = setup();
    await pick(s, format);
    await confirmWarning(s);
    expect(s.loaded).toEqual([format]);
    expect(s.builders).toHaveBeenCalledTimes(1);
  });

  it.each(['csv', 'excel', 'pdf'] as const)(
    'saves the %s bytes with the right MIME type and file name',
    async (format) => {
      const s = setup();
      await pick(s, format);
      await confirmWarning(s);
      expect(s.save).toHaveBeenCalledWith(
        BYTES,
        TYPES[format].mimeType,
        `cuotascasa-tabla-real-2026-10-16.${TYPES[format].extension}`,
      );
      expect(s.buildScheduleReport).toHaveBeenCalledWith(SCHEDULE_REQUEST.input);
      expect(s.buildComparisonReport).not.toHaveBeenCalled();
    },
  );

  it('builds the comparison report and names the file «comparacion»', async () => {
    const s = setup(COMPARISON_REQUEST);
    await pick(s, 'csv');
    await confirmWarning(s);
    expect(s.buildComparisonReport).toHaveBeenCalledWith(COMPARISON_REQUEST.input);
    expect(s.save).toHaveBeenCalledWith(
      BYTES,
      'text/csv;charset=utf-8',
      'cuotascasa-comparacion-escenarios-2026-10-16.csv',
    );
  });

  it('shows the unencrypted warning before the first download and does not save until it is accepted', async () => {
    const s = setup();
    await pick(s, 'excel');
    expect(q(s, 'export-warning')?.textContent).toContain(
      'el Excel, CSV o PDF no va cifrado y contiene datos financieros',
    );
    expect(s.save).not.toHaveBeenCalled();
    expect(s.builders).not.toHaveBeenCalled();
    await confirmWarning(s);
    expect(s.save).toHaveBeenCalledTimes(1);
    expect(q(s, 'export-warning')).toBeNull();
  });

  it('cancelling the warning downloads nothing and asks again next time', async () => {
    const s = setup();
    await pick(s, 'csv');
    q(s, 'warning-cancel')?.click();
    await settle(s);
    expect(s.save).not.toHaveBeenCalled();
    expect(q(s, 'export-warning')).toBeNull();
    await pick(s, 'csv');
    expect(q(s, 'export-warning')).not.toBeNull();
  });

  it('does not warn again on the next download of the same session, not even in another menu', async () => {
    const s = setup();
    await pick(s, 'csv');
    await confirmWarning(s);
    await pick(s, 'pdf');
    expect(q(s, 'export-warning')).toBeNull();
    expect(s.save).toHaveBeenCalledTimes(2);

    const other = TestBed.createComponent(ExportMenuComponent);
    other.componentRef.setInput('request', COMPARISON_REQUEST);
    other.detectChanges();
    const root = other.nativeElement as HTMLElement;
    root.querySelector<HTMLElement>('[data-testid="export-trigger"]')?.click();
    other.detectChanges();
    root.querySelector<HTMLElement>('[data-testid="format-excel"]')?.click();
    await other.whenStable();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    other.detectChanges();
    expect(root.querySelector('[data-testid="export-warning"]')).toBeNull();
    expect(s.save).toHaveBeenCalledTimes(3);
  });

  it('announces completion politely', async () => {
    const s = setup();
    await pick(s, 'csv');
    await confirmWarning(s);
    expect(s.live.polite).toHaveBeenCalledWith('Archivo CSV listo: cuotascasa-tabla-real-2026-10-16.csv');
    expect(s.live.assertive).not.toHaveBeenCalled();
    expect(q(s, 'export-progress')).toBeNull();
  });

  it('disables the trigger and shows «Generando» while a file is being prepared', async () => {
    const s = setup(SCHEDULE_REQUEST, { gateCsv: true });
    await pick(s, 'csv');
    await confirmWarning(s);
    expect(q(s, 'export-progress')?.textContent).toContain('Generando');
    expect(q(s, 'export-trigger')?.getAttribute('aria-disabled')).toBe('true');
    expect((q(s, 'export-trigger') as HTMLButtonElement).disabled).toBe(false);
    expect(el(s).querySelector('[aria-busy="true"]')).not.toBeNull();
    s.release();
    await settle(s);
    expect(q(s, 'export-progress')).toBeNull();
    expect(q(s, 'export-trigger')?.getAttribute('aria-disabled')).toBeNull();
  });

  it.each([
    ['load', 'failLoad', 'No se pudo preparar la exportación. Revisa tu conexión a internet e inténtalo de nuevo.'],
    ['write', 'failWrite', 'No se pudo generar el archivo. Inténtalo de nuevo.'],
  ] as const)(
    'maps a %s failure to fixed Spanish copy without leaking the error text',
    async (_stage, key, message) => {
      const s = setup(SCHEDULE_REQUEST, { [key]: 'pdf' });
      await pick(s, 'pdf');
      await confirmWarning(s);
      expect(q(s, 'export-error')?.textContent?.trim()).toBe(message);
      expect(el(s).textContent).not.toContain('1234.56');
      expect(el(s).textContent).not.toContain('99.00');
      expect(s.live.assertive.mock.calls).toEqual([[message]]);
      expect(s.live.polite).not.toHaveBeenCalled();
      expect(s.save).not.toHaveBeenCalled();
    },
  );
});

describe('cc-export-menu focus and semantics', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => document.body.replaceChildren());

  function attached(request: ExportRequest = SCHEDULE_REQUEST, options: SetupOptions = {}): Setup {
    const s = setup(request, options);
    document.body.append(el(s));
    return s;
  }
  const trigger = (s: Setup) => q(s, 'export-trigger') as HTMLButtonElement;

  it('moves focus to the confirm button when the warning opens', async () => {
    const s = attached();
    await pick(s, 'csv');
    expect(document.activeElement).toBe(q(s, 'warning-confirm'));
  });

  it('returns focus to the trigger on cancel and on confirm', async () => {
    const s = attached();
    await pick(s, 'csv');
    q(s, 'warning-cancel')?.click();
    await settle(s);
    expect(document.activeElement).toBe(trigger(s));
    await pick(s, 'csv');
    await confirmWarning(s);
    expect(document.activeElement).toBe(trigger(s));
  });

  it('returns focus to the trigger after choosing a format once the warning was accepted', async () => {
    const s = attached();
    await pick(s, 'csv');
    await confirmWarning(s);
    await pick(s, 'pdf');
    expect(document.activeElement).toBe(trigger(s));
  });

  it('Escape with the warning open cancels it and focuses the trigger', async () => {
    const s = attached();
    await pick(s, 'csv');
    q(s, 'warning-confirm')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(s);
    expect(q(s, 'export-warning')).toBeNull();
    expect(s.save).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger(s));
  });

  it('keeps focus on the trigger while busy and ignores clicks on it', async () => {
    const s = attached(SCHEDULE_REQUEST, { gateCsv: true });
    await pick(s, 'csv');
    await confirmWarning(s);
    expect(document.activeElement).toBe(trigger(s));
    trigger(s).click();
    s.fixture.detectChanges();
    expect(q(s, 'export-list')).toBeNull();
    s.release();
    await settle(s);
  });

  it('has no aria-haspopup and sets aria-controls only while the list exists', () => {
    const s = attached();
    expect(trigger(s).hasAttribute('aria-haspopup')).toBe(false);
    expect(trigger(s).hasAttribute('aria-controls')).toBe(false);
    trigger(s).click();
    s.fixture.detectChanges();
    expect(trigger(s).getAttribute('aria-controls')).toBe(q(s, 'export-list')?.id);
  });

  it('describes the confirm button with the warning text', async () => {
    const s = attached();
    await pick(s, 'csv');
    const id = q(s, 'warning-confirm')?.getAttribute('aria-describedby') ?? '';
    expect(id).not.toBe('');
    expect(document.getElementById(id)?.textContent).toContain('no va cifrado');
  });

  it('closes the list on an outside click and when focus leaves the menu', () => {
    const s = attached();
    trigger(s).click();
    s.fixture.detectChanges();
    document.body.click();
    s.fixture.detectChanges();
    expect(q(s, 'export-list')).toBeNull();

    trigger(s).click();
    s.fixture.detectChanges();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    q(s, 'format-csv')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    s.fixture.detectChanges();
    expect(q(s, 'export-list')).toBeNull();
  });

  it('keeps the list open when focus moves inside the menu', () => {
    const s = attached();
    trigger(s).click();
    s.fixture.detectChanges();
    q(s, 'format-csv')?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: q(s, 'format-pdf') }));
    s.fixture.detectChanges();
    expect(q(s, 'export-list')).not.toBeNull();
  });
});

describe('exportFileName', () => {
  it('uses table or comparison, the view and the report date, and nothing personal', () => {
    expect(exportFileName({ kind: 'schedule', pathKind: PathKind.ORIGINAL, generatedOn: '2026-01-02' }, 'xlsx')).toBe(
      'cuotascasa-tabla-original-2026-01-02.xlsx',
    );
    expect(exportFileName({ kind: 'schedule', pathKind: PathKind.SCENARIO, generatedOn: '2026-01-02' }, 'pdf')).toBe(
      'cuotascasa-tabla-escenario-2026-01-02.pdf',
    );
    expect(exportFileName({ kind: 'comparison', generatedOn: '2026-01-02' }, 'csv')).toBe(
      'cuotascasa-comparacion-escenarios-2026-01-02.csv',
    );
  });
});

describe('saveBlobAsFile', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads through an anchor with the file name and revokes the object URL afterwards', () => {
    vi.useFakeTimers();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    saveBlobAsFile(BYTES, 'application/pdf', 'cuotascasa-tabla-real-2026-10-16.pdf');
    const blob = create.mock.calls[0]?.[0] as unknown as Blob;
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(3);
    expect(clicked).toEqual([{ href: 'blob:synthetic', download: 'cuotascasa-tabla-real-2026-10-16.pdf' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(OBJECT_URL_LIFETIME_MS);
    expect(OBJECT_URL_LIFETIME_MS).toBe(40_000);
    expect(revoke).toHaveBeenCalledWith('blob:synthetic');
  });
});
