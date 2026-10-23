import { isPlatformBrowser } from '@angular/common';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { INSURANCE_LEGEND } from './simulator-legend.ts';

/**
 * Public quick simulator host (spec §9 «Simulador»). It keeps the landing's initial JS small: the prerendered HTML
 * carries a light static copy of the form, and the interactive form (Signal Forms, inputs and the domain engine) is a
 * lazy chunk, fetched with a dynamic `import()` when the placeholder nears the viewport (no `@defer` runtime in the
 * landing's initial graph). Zero network beyond that same-origin chunk, zero storage.
 */
@Component({
  selector: 'cc-quick-simulator',
  template: `
    <ng-container #slot />
    @if (!loaded()) {
      <section class="sim" aria-labelledby="sim-title" aria-busy="true" data-testid="sim-placeholder">
        <!-- The placeholder fields are disabled on purpose: they cannot take focus, so no typing is lost on the swap. -->
        <h2 id="sim-title" class="title">Simulador rápido</h2>
        <p class="template">Plantilla: FHA Guatemala v1 · Quetzales</p>
        <div class="field">
          <label for="sim-principal">Monto del préstamo (Q)</label>
          <input id="sim-principal" type="text" inputmode="decimal" placeholder="500,000.00" disabled />
        </div>
        <div class="field">
          <label for="sim-rate">Tasa de interés anual</label>
          <div class="row">
            <input id="sim-rate" type="text" inputmode="decimal" placeholder="7.00" disabled />
            <span class="legend" data-testid="sim-rate-legend">{{ insuranceLegend }}</span>
          </div>
        </div>
        <div class="field">
          <label for="sim-years">Plazo en años</label>
          <div class="row">
            <input id="sim-years" type="text" inputmode="numeric" placeholder="20" disabled />
            <span class="legend">años (1 a 30)</span>
          </div>
        </div>
        <div class="field toggle">
          <input id="sim-prepay-toggle" type="checkbox" disabled />
          <label for="sim-prepay-toggle">Probar un abono a capital</label>
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .sim {
      /* About the height of the live form, so swapping it in does not shift the page. */
      min-height: 22rem;
      background: var(--cc-color-surface);
      border: 1px solid var(--cc-color-rule);
      border-radius: var(--cc-radius-block);
      padding: 1.25rem;
      color: var(--cc-color-ink);
      font-family: var(--cc-font-body);
    }
    .title {
      margin: 0;
      font-family: var(--cc-font-heading);
      font-size: 1.375rem;
    }
    .template {
      margin: 0.25rem 0 1rem;
      color: var(--cc-color-ink-muted);
      font-size: 0.875rem;
    }
    .field {
      margin-bottom: 0.875rem;
    }
    label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.9375rem;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
    }
    .legend {
      color: var(--cc-color-ink-muted);
      font-size: 0.875rem;
    }
    input[type='text'] {
      min-height: 2.5rem;
      padding: 0 0.5rem;
      border: 1px solid var(--cc-color-control-border);
      border-radius: 0.25rem;
      background: var(--cc-color-paper);
      font-family: var(--cc-font-numeric);
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .toggle label {
      margin: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickSimulatorComponent implements AfterViewInit {
  protected readonly loaded = signal(false);
  protected readonly insuranceLegend = INSURANCE_LEGEND;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;

  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
  }

  /** Browser only (never during the prerender), once the view exists: wait until the placeholder nears the viewport. */
  ngAfterViewInit(): void {
    if (this.browser) this.watch();
  }

  private watch(): void {
    const target = this.host.nativeElement.querySelector('[data-testid="sim-placeholder"]');
    if (target === null || typeof IntersectionObserver === 'undefined') {
      void this.load();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void this.load();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(target);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private async load(): Promise<void> {
    const { QuickSimulatorFormComponent } = await import('./quick-simulator-form.component.ts');
    if (this.destroyed) return;
    this.slot().createComponent(QuickSimulatorFormComponent);
    this.loaded.set(true);
  }
}
