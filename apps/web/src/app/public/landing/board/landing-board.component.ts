import { isPlatformBrowser } from '@angular/common';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { LANDING_EXAMPLE_SUMMARY as S } from '../example/example-summary.generated.ts';
import type { LandingExampleRows } from '../example/example-types.ts';

type Behaviour = typeof import('./landing-board-interactive.ts');

const TILES = 240;
const ANNOUNCE_MS = 600;
const AUTOPLAY_MS = 900;
/** The keys the knob answers to (keyTarget in the behaviour chunk); before it loads they are held, not lost. */
const KNOB_KEYS: ReadonlySet<string> = new Set([
  'ArrowRight',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

/**
 * The 240-installment board of the landing (W8-07, ADR-0026 §6.1). The prerendered HTML already shows the board at
 * installment 60 with its reading, from `LANDING_EXAMPLE_SUMMARY`. The rows of both paths and the behaviour (keyboard,
 * drag, one-time run of the knob) are a lazy chunk, fetched with a dynamic `import()` when the board nears the
 * viewport, as `cc-quick-simulator` does. Browser only; no storage and no network beyond that same-origin chunk.
 */
@Component({
  selector: 'cc-landing-board',
  template: `
    <div class="board">
      <div class="tiles" role="img" aria-label="240 cuadros, uno por cuota">
        @for (tile of tiles(); track $index) {
          <i [class]="tile"></i>
        }
      </div>
      <div
        class="track"
        [class.drag]="dragging()"
        [style.--x]="x()"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up()"
        (pointercancel)="up()"
        (lostpointercapture)="up()"
      >
        <span class="rail"></span><span class="done"></span>
        <span
          class="knob cc-numeric"
          role="slider"
          tabindex="0"
          aria-label="Cuota"
          aria-valuemin="1"
          aria-valuemax="240"
          [attr.aria-valuenow]="k()"
          [attr.aria-valuetext]="valueText()"
          (keydown)="key($event)"
          (focus)="load()"
          >{{ k() }}</span
        >
      </div>
      <div class="years cc-numeric" aria-hidden="true">
        <span>2026</span><span>2031</span><span>2036</span><span>2041</span><span>2046</span>
      </div>
    </div>
    <div class="side">
      <div class="readout cc-numeric">
        <small>{{ view().label }}</small>
        <span class="big">{{ view().row.balance }}</span>
        <span class="unit">saldo</span>
        <div class="row">
          <span>Capital pagado</span><span>{{ view().row.paidPercent }}</span>
        </div>
        <div class="row">
          <span>Fecha</span><span>{{ view().row.dueDate }}</span>
        </div>
      </div>
      <p class="sr" aria-live="polite">{{ announced() }}</p>
      <div class="switch" role="group" aria-label="Escenario">
        <button type="button" [attr.aria-pressed]="!prepaid()" (click)="choose(false)">Sin abono</button>
        <button type="button" [attr.aria-pressed]="prepaid()" (click)="choose(true)">
          + {{ summary.prepayment.amount }} en la cuota {{ summary.prepayment.installment }}
        </button>
      </div>
      <div class="saved">
        <span>Con el abono te ahorras</span>
        <b>{{ summary.monthsSaved }} cuotas</b>
        <span class="cc-numeric">y {{ summary.costSaved }} en intereses y seguros</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
      gap: 8px;
    }
    .board {
      display: grid;
      gap: 1rem;
      align-content: start;
      padding: clamp(1rem, 2.5vw, 1.75rem);
      border-radius: var(--cc-radius-block);
      background: var(--cc-color-soft);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(24, minmax(0, 1fr));
      gap: 3px;
    }
    .tiles i {
      aspect-ratio: 1;
      border-radius: 3px;
      background: var(--cc-color-paper);
      transition:
        background var(--cc-duration-fast) var(--cc-ease-out),
        transform var(--cc-duration-fast) var(--cc-ease-out);
    }
    .tiles .paid {
      background: var(--cc-color-accent);
    }
    .tiles .gone {
      background: transparent;
      box-shadow: inset 0 0 0 2px var(--cc-color-saving);
    }
    .tiles .now {
      background: var(--cc-color-ink);
      transform: scale(1.35);
    }
    .track {
      position: relative;
      height: 56px;
      touch-action: none;
      cursor: var(--cc-board-cursor, grab);
    }
    .rail,
    .done {
      position: absolute;
      inset: 50% 0 auto;
      height: 6px;
      translate: 0 -50%;
      border-radius: var(--cc-radius-pill);
      background: var(--cc-color-paper);
    }
    .done {
      right: auto;
      width: var(--x);
      background: var(--cc-color-accent);
    }
    .knob {
      position: absolute;
      top: 50%;
      left: var(--x);
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      box-sizing: border-box;
      translate: -50% -50%;
      border: 3px solid var(--cc-color-on-color);
      border-radius: 50%;
      background: var(--cc-color-highlight);
      color: var(--cc-color-on-color);
      font-weight: 700;
      font-size: 0.75rem;
      transition: scale var(--cc-duration-fast) var(--cc-ease-out);
    }
    .knob:focus-visible {
      outline: 3px solid var(--cc-color-ink);
      outline-offset: 3px;
    }
    .drag .knob {
      scale: 1.12;
    }
    .years {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--cc-color-ink-muted);
    }
    .side {
      display: grid;
      gap: 8px;
      grid-template-rows: auto auto 1fr;
    }
    .readout,
    .saved {
      display: grid;
      gap: 0.25rem;
      padding: 1.5rem;
      border-radius: var(--cc-radius-block);
    }
    .readout {
      background: var(--cc-color-block);
      color: var(--cc-color-on-block);
    }
    small {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--cc-color-highlight);
    }
    .big {
      font-size: clamp(1.75rem, 3.6vw, 2.75rem);
      font-weight: 700;
      line-height: 1.05;
    }
    .unit,
    .row {
      font-size: 0.9rem;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid color-mix(in srgb, currentColor 25%, transparent);
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .switch {
      display: flex;
      gap: 0.5rem;
      padding: 5px;
      border-radius: 14px;
      background: var(--cc-color-band);
    }
    .switch button {
      flex: 1;
      min-height: 2.75rem;
      padding: 0.75rem;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--cc-color-ink);
      font-weight: 800;
      font-size: 0.95rem;
    }
    .switch [aria-pressed='true'] {
      background: var(--cc-color-saving);
      color: var(--cc-color-on-color);
    }
    .saved {
      align-content: center;
      border: 2px solid;
    }
    .saved b {
      font-size: clamp(2rem, 5vw, 3.5rem);
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.05em;
      color: var(--cc-color-saving);
    }
    .saved span:last-child {
      font-size: 0.9rem;
      color: var(--cc-color-ink-muted);
    }
    @media (max-width: 820px) {
      :host {
        grid-template-columns: minmax(0, 1fr);
      }
      .tiles {
        grid-template-columns: repeat(16, minmax(0, 1fr));
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tiles i,
      .knob {
        transition: none;
      }
    }
  `,
  host: { '[attr.data-ready]': 'behaviour() === null ? null : ""' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingBoardComponent implements AfterViewInit {
  protected readonly summary = S;
  protected readonly k = signal<number>(S.prepayment.installment);
  protected readonly prepaid = signal(false);
  protected readonly dragging = signal(false);
  protected readonly announced = signal('');
  protected readonly behaviour = signal<Behaviour | null>(null);
  private readonly rows = computed<LandingExampleRows | null>(() => this.behaviour()?.BOARD_ROWS ?? null);

  /** The reading at the knob: past the last installment of the prepaid path, it stays on that one. */
  protected readonly view = computed(() => {
    const k = this.k();
    const count = this.prepaid() ? S.prepaidCount : S.baseCount;
    const shown = Math.min(k, count);
    const rows = this.rows();
    const row = (rows === null ? undefined : (this.prepaid() ? rows.prepaid : rows.base)[shown - 1]) ?? S.at60;
    return {
      shown,
      count,
      row,
      label: shown < k ? `Pagado en la cuota ${String(count)}` : `Cuota ${String(k)} de ${String(count)}`,
    };
  });

  protected readonly tiles = computed(() => {
    const { shown, count } = this.view();
    const gone = this.prepaid() ? count : TILES;
    return Array.from({ length: TILES }, (_, i) =>
      i < shown - 1 ? 'paid' : i === shown - 1 ? 'now' : i >= gone ? 'gone' : '',
    );
  });

  protected readonly x = computed(() => `${String(((this.k() - 1) / (TILES - 1)) * 100)}%`);
  protected readonly valueText = computed(() => `Cuota ${String(this.k())}, saldo ${this.view().row.balance}`);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly win = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private loading: Promise<void> | null = null;
  /** Set by the first user input (pointer, key or switch): from then on the knob never runs by itself. */
  private touched = false;
  /** The last pointer position aimed at before the behaviour arrived; applied once it does. */
  private pending: { readonly clientX: number; readonly left: number; readonly width: number } | null = null;
  /** Knob keys pressed before the behaviour arrived, in order; applied once it does. */
  private pendingKeys: { readonly key: string; readonly shift: boolean }[] = [];
  private stopAutoplay: () => void = () => undefined;
  private announceTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.stopAutoplay();
      clearTimeout(this.announceTimer);
    });
  }

  /** Browser only (never during the prerender): fetch the behaviour when the board nears the viewport. */
  ngAfterViewInit(): void {
    if (!this.browser) return;
    if (typeof IntersectionObserver === 'undefined') {
      void this.load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void this.load();
      },
      { rootMargin: '200px' },
    );
    observer.observe(this.host);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  protected load(): Promise<void> {
    if (!this.browser) return Promise.resolve();
    this.loading ??= import('./landing-board-interactive.ts').then((behaviour) => {
      if (this.destroyed) return;
      this.behaviour.set(behaviour);
      this.watchAutoplay(behaviour);
    });
    return this.loading;
  }

  /**
   * A knob key works even before the behaviour has loaded (like a press): it never scrolls the page, and it is applied
   * once the behaviour arrives.
   */
  protected key(event: KeyboardEvent): void {
    this.touched = true;
    if (this.behaviour() === null) {
      if (!KNOB_KEYS.has(event.key)) return;
      event.preventDefault();
      this.pendingKeys.push({ key: event.key, shift: event.shiftKey });
      void this.load().then(() => {
        const ready = this.behaviour();
        const keys = this.pendingKeys.splice(0);
        if (ready === null || keys.length === 0) return;
        this.set(keys.reduce((k, { key, shift }) => ready.keyTarget(key, shift, k) ?? k, this.k()));
      });
      return;
    }
    const target = this.behaviour()?.keyTarget(event.key, event.shiftKey, this.k()) ?? null;
    if (target === null) return;
    event.preventDefault();
    this.set(target);
  }

  /** A press works even before the behaviour has loaded: the drag starts at once and its position waits for it. */
  protected down(event: PointerEvent): void {
    this.touched = true;
    this.stopAutoplay();
    const track = event.currentTarget as HTMLElement;
    try {
      track.setPointerCapture(event.pointerId);
    } catch {
      // No active pointer with that id (synthetic events): the drag still follows pointermove on the track.
    }
    this.dragging.set(true);
    this.aim(event.clientX, track.getBoundingClientRect());
  }

  protected move(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.aim(event.clientX, (event.currentTarget as HTMLElement).getBoundingClientRect());
  }

  protected up(): void {
    this.dragging.set(false);
  }

  /** Moves the knob under the pointer; before the behaviour arrives, keeps the latest position and applies it then. */
  private aim(clientX: number, rect: DOMRect): void {
    const behaviour = this.behaviour();
    if (behaviour !== null) {
      this.set(behaviour.kAt(clientX, rect));
      return;
    }
    this.pending = { clientX, left: rect.left, width: rect.width };
    void this.load().then(() => {
      const ready = this.behaviour();
      const aimed = this.pending;
      this.pending = null;
      if (ready !== null && aimed !== null) this.set(ready.kAt(aimed.clientX, aimed));
    });
  }

  /** Before the rows arrive, the choice waits for them, so the reading never mixes the two paths. */
  protected choose(prepaid: boolean): void {
    this.touched = true;
    if (this.behaviour() === null) {
      void this.load().then(() => {
        if (this.behaviour() !== null) this.choose(prepaid);
      });
      return;
    }
    this.prepaid.set(prepaid);
    this.set(this.k());
  }

  /** A user change: stops the run of the knob and announces the reading once the user pauses. */
  private set(k: number): void {
    this.stopAutoplay();
    this.k.set(k);
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      const { label, row } = this.view();
      this.announced.set(`${label}. Saldo ${row.balance}, capital pagado ${row.paidPercent}.`);
    }, ANNOUNCE_MS);
  }

  /**
   * The knob runs from 1 to 60 once, the first time half the board is in view; never under reduced motion, and never
   * once the user has pressed, dragged, typed on the knob or chosen a scenario (any of them also stops a run).
   */
  private watchAutoplay(behaviour: Behaviour): void {
    const win = this.win;
    if (win === null || typeof IntersectionObserver === 'undefined') return;
    if (typeof win.matchMedia !== 'function' || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        if (this.touched) return;
        this.stopAutoplay = behaviour.autoplay(win, S.prepayment.installment, AUTOPLAY_MS, (k) => this.k.set(k));
      },
      { threshold: 0.5 },
    );
    observer.observe(this.host);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
