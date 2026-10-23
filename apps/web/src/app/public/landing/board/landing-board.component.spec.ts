import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING_EXAMPLE_ROWS } from '../example/example-rows.generated.ts';
import { LANDING_EXAMPLE_SUMMARY as S } from '../example/example-summary.generated.ts';
import { LandingBoardComponent } from './landing-board.component.ts';

/** Controllable IntersectionObserver: the test decides when the board "enters the viewport". */
class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnected = false;
  private readonly callback: (entries: { isIntersecting: boolean }[]) => void;
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  fire(): void {
    this.callback([{ isIntersecting: true }]);
  }
}

function stubMotion(reduce: boolean): FrameRequestCallback[] {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }) as MediaQueryList);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  return frames;
}

async function render(): Promise<{ fixture: ComponentFixture<LandingBoardComponent>; root: HTMLElement }> {
  const fixture = TestBed.createComponent(LandingBoardComponent);
  await fixture.whenStable();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

async function interactive(): Promise<{ fixture: ComponentFixture<LandingBoardComponent>; root: HTMLElement }> {
  const view = await render();
  FakeObserver.instances[0]?.fire();
  await vi.waitFor(() => expect(view.root.hasAttribute('data-ready')).toBe(true), { timeout: 10000 });
  await view.fixture.whenStable();
  return view;
}

const slider = (root: HTMLElement): HTMLElement => root.querySelector<HTMLElement>('[role="slider"]') as HTMLElement;
const readout = (root: HTMLElement): string => root.querySelector('.readout')?.textContent?.replace(/\s+/g, ' ') ?? '';

async function key(fixture: ComponentFixture<LandingBoardComponent>, init: KeyboardEventInit): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
  slider(fixture.nativeElement as HTMLElement).dispatchEvent(event);
  await fixture.whenStable();
  return event;
}

describe('cc-landing-board (W8-07)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    FakeObserver.instances = [];
  });

  it('renders 240 tiles at installment 60: 59 paid and one current, none gone (complete at rest)', async () => {
    stubMotion(false);
    const { root } = await render();
    const tiles = root.querySelectorAll('.tiles i');
    expect(tiles).toHaveLength(240);
    expect(root.querySelectorAll('.tiles i.paid')).toHaveLength(59);
    expect(root.querySelectorAll('.tiles i.now')).toHaveLength(1);
    expect(tiles[59]?.classList.contains('now')).toBe(true);
    expect(root.querySelectorAll('.tiles i.gone')).toHaveLength(0);
    expect(root.querySelector('.tiles')?.getAttribute('role')).toBe('img');
  });

  it('reads installment 60 from the summary before anything loads', async () => {
    stubMotion(false);
    const { root } = await render();
    const text = readout(root);
    expect(text).toContain('Cuota 60 de 240');
    expect(text).toContain(S.at60.balance);
    expect(text).toContain(S.at60.paidPercent);
    expect(text).toContain(S.at60.dueDate);
    expect(root.hasAttribute('data-ready')).toBe(false);
  });

  it('has a slider from 1 to 240 at 60 with a spoken value', async () => {
    stubMotion(false);
    const { root } = await render();
    const knob = slider(root);
    expect(knob.getAttribute('tabindex')).toBe('0');
    expect(knob.getAttribute('aria-label')).toBe('Cuota');
    expect(knob.getAttribute('aria-valuemin')).toBe('1');
    expect(knob.getAttribute('aria-valuemax')).toBe('240');
    expect(knob.getAttribute('aria-valuenow')).toBe('60');
    expect(knob.getAttribute('aria-valuetext')).toBe(`Cuota 60, saldo ${S.at60.balance}`);
  });

  it('shows the scenario switch and what the prepayment saves', async () => {
    stubMotion(false);
    const { root } = await render();
    const buttons = Array.from(root.querySelectorAll('.switch button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Sin abono', `+ ${S.prepayment.amount} en la cuota 60`]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    const saved = root.querySelector('.saved')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(saved).toContain(`${String(S.monthsSaved)} cuotas`);
    expect(saved).toContain(S.costSaved);
  });

  it('loads the behaviour only when the board nears the viewport', async () => {
    stubMotion(false);
    const { root, fixture } = await render();
    await key(fixture, { key: 'End' });
    expect(slider(root).getAttribute('aria-valuenow')).toBe('60');
    FakeObserver.instances[0]?.fire();
    await vi.waitFor(() => expect(root.hasAttribute('data-ready')).toBe(true), { timeout: 10000 });
  });

  it('moves with the keyboard: arrows by one, Shift by twelve, Home and End to the ends', async () => {
    stubMotion(true);
    const { root, fixture } = await interactive();
    const now = (): string | null => slider(root).getAttribute('aria-valuenow');
    expect((await key(fixture, { key: 'ArrowRight' })).defaultPrevented).toBe(true);
    expect(now()).toBe('61');
    await key(fixture, { key: 'ArrowLeft', shiftKey: true });
    expect(now()).toBe('49');
    await key(fixture, { key: 'End' });
    expect(now()).toBe('240');
    expect(readout(root)).toContain('Cuota 240 de 240');
    expect(readout(root)).toContain(LANDING_EXAMPLE_ROWS.base[239]?.balance);
    expect(root.querySelectorAll('.tiles i.paid')).toHaveLength(239);
    await key(fixture, { key: 'Home' });
    expect(now()).toBe('1');
    expect(slider(root).getAttribute('aria-valuetext')).toBe(`Cuota 1, saldo ${LANDING_EXAMPLE_ROWS.base[0]?.balance}`);
    expect((await key(fixture, { key: 'Tab' })).defaultPrevented).toBe(false);
  });

  it('follows a pointer drag across the track', async () => {
    stubMotion(true);
    const { root, fixture } = await interactive();
    const track = root.querySelector<HTMLElement>('.track') as HTMLElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 239 } as DOMRect);
    const pointer = (type: string, clientX: number): void => {
      track.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
    };
    pointer('pointerdown', 9);
    await fixture.whenStable();
    expect(slider(root).getAttribute('aria-valuenow')).toBe('10');
    expect(track.classList.contains('drag')).toBe(true);
    pointer('pointermove', 119);
    await fixture.whenStable();
    expect(slider(root).getAttribute('aria-valuenow')).toBe('120');
    pointer('pointerup', 119);
    pointer('pointermove', 200);
    await fixture.whenStable();
    expect(slider(root).getAttribute('aria-valuenow')).toBe('120');
    expect(track.classList.contains('drag')).toBe(false);
  });

  it('switches to the prepaid path: the saved installments turn .gone and the readout counts fewer', async () => {
    stubMotion(true);
    const { root, fixture } = await interactive();
    const [base, prepaid] = Array.from(root.querySelectorAll<HTMLButtonElement>('.switch button'));
    prepaid?.click();
    await fixture.whenStable();
    expect(prepaid?.getAttribute('aria-pressed')).toBe('true');
    expect(base?.getAttribute('aria-pressed')).toBe('false');
    const gone = Array.from(root.querySelectorAll('.tiles i')).flatMap((tile, i) =>
      tile.classList.contains('gone') ? [i + 1] : [],
    );
    expect(gone).toHaveLength(240 - S.prepaidCount);
    expect(gone[0]).toBe(S.prepaidCount + 1);
    expect(gone.at(-1)).toBe(240);
    expect(readout(root)).toContain(`Cuota 60 de ${String(S.prepaidCount)}`);
    expect(readout(root)).toContain(LANDING_EXAMPLE_ROWS.prepaid[59]?.balance);
    await key(fixture, { key: 'End' });
    expect(readout(root)).toContain(`Pagado en la cuota ${String(S.prepaidCount)}`);
    expect(root.querySelectorAll('.tiles i.now')).toHaveLength(1);
    base?.click();
    await fixture.whenStable();
    expect(root.querySelectorAll('.tiles i.gone')).toHaveLength(0);
  });

  it('announces the reading politely after a pause', async () => {
    stubMotion(true);
    const { root, fixture } = await interactive();
    const live = root.querySelector('[aria-live="polite"]');
    expect(live?.textContent?.trim()).toBe('');
    await key(fixture, { key: 'End' });
    expect(live?.textContent?.trim()).toBe('');
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(live?.textContent).toContain('Cuota 240 de 240');
      },
      { timeout: 3000 },
    );
  });

  it('runs the knob from 1 to 60 once when the board comes into view', async () => {
    const frames = stubMotion(false);
    const { root, fixture } = await interactive();
    const play = FakeObserver.instances[1];
    expect(play).toBeDefined();
    play?.fire();
    await fixture.whenStable();
    expect(slider(root).getAttribute('aria-valuenow')).toBe('1');
    let t = performance.now();
    while (frames.length > 0) {
      t += 100;
      frames.shift()?.(t);
    }
    await fixture.whenStable();
    expect(slider(root).getAttribute('aria-valuenow')).toBe('60');
    expect(play?.disconnected).toBe(true);
  });

  it('never runs the knob by itself under reduced motion', async () => {
    stubMotion(true);
    const { root } = await interactive();
    expect(FakeObserver.instances).toHaveLength(1);
    expect(slider(root).getAttribute('aria-valuenow')).toBe('60');
  });
});
