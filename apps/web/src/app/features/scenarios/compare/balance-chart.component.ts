import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  type ChartConfiguration,
  type ChartDataset,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import type { ScenarioComparison } from '../../../data/api.ts';
import { formatMoney } from '../../../ui/format/format.ts';
import {
  buildChartSeries,
  type ChartPoint,
  type ChartSeries,
  formatAxisValue,
  type SeriesRole,
} from './chart-series.ts';

/** One marker per year of installments: enough to tell series apart without drawing 240 dots. */
const MARKER_EVERY = 12;

interface Palette {
  readonly ink: string;
  readonly 'ink-muted': string;
  readonly accent: string;
  readonly rule: string;
}

type LineChartConfig = ChartConfiguration<'line', ChartPoint[]>;

function isChartPoint(value: unknown): value is ChartPoint {
  return typeof value === 'object' && value !== null && 'raw' in value && typeof value.raw === 'string';
}

/**
 * Balance over time of the original, real and scenario paths (HU-16). Loaded behind @defer by cc-scenario-compare, so
 * chart.js and ng2-charts stay out of every initial bundle. Only the pieces a line chart needs are registered. It draws
 * on a canvas (no inline HTML, nothing the CSP or Trusted Types would block). Colours come from the design tokens: the
 * swatches below carry them and the resolved values are read back, because a canvas cannot read CSS variables.
 */
@Component({
  selector: 'cc-balance-chart',
  imports: [BaseChartDirective],
  providers: [
    provideCharts({ registerables: [LineController, LineElement, PointElement, LinearScale, Legend, Tooltip] }),
  ],
  template: `
    <span class="swatch ink" aria-hidden="true"></span>
    <span class="swatch ink-muted" aria-hidden="true"></span>
    <span class="swatch accent" aria-hidden="true"></span>
    <span class="swatch rule" aria-hidden="true"></span>
    <div class="frame" data-testid="balance-chart">
      @if (config(); as chart) {
        <canvas
          baseChart
          role="img"
          type="line"
          [data]="chart.data"
          [options]="chart.options"
          [attr.aria-label]="summary()"
        ></canvas>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .swatch {
      display: none;
    }
    .ink {
      color: var(--cc-color-ink);
    }
    .ink-muted {
      color: var(--cc-color-ink-muted);
    }
    .accent {
      color: var(--cc-color-accent);
    }
    .rule {
      color: var(--cc-color-rule);
    }
    .frame {
      position: relative;
      height: 20rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceChartComponent {
  readonly comparison = input.required<ScenarioComparison>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly palette = signal<Palette | null>(null);
  private readonly series = computed(() => buildChartSeries(this.comparison()));

  protected readonly summary = computed(
    () =>
      `Gráfica del saldo por número de cuota de ${this.series()
        .map((series) => series.label)
        .join(', ')}. Los mismos datos están en la tabla de abajo.`,
  );

  protected readonly config = computed<LineChartConfig | null>(() => {
    const palette = this.palette();
    return palette === null ? null : this.buildConfig(this.series(), palette, this.comparison().real.currency);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const read = (): void => {
        const colorOf = (role: keyof Palette): string => {
          const swatch = this.host.nativeElement.querySelector(`.swatch.${role}`);
          return swatch === null ? '' : getComputedStyle(swatch).color;
        };
        this.palette.set({
          ink: colorOf('ink'),
          'ink-muted': colorOf('ink-muted'),
          accent: colorOf('accent'),
          rule: colorOf('rule'),
        });
      };
      read();
      // The tokens follow the explicit theme (data-theme on <html>) or the system one: read them again when it changes.
      const observer = new MutationObserver(read);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const scheme = window.matchMedia('(prefers-color-scheme: dark)');
      scheme.addEventListener('change', read);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        scheme.removeEventListener('change', read);
      });
    });
  }

  private buildConfig(
    series: readonly ChartSeries[],
    palette: Palette,
    currency: ScenarioComparison['real']['currency'],
  ): LineChartConfig {
    const colorOf = (role: SeriesRole): string => palette[role];
    const datasets: ChartDataset<'line', ChartPoint[]>[] = series.map((entry) => ({
      label: entry.label,
      data: [...entry.points],
      parsing: false,
      borderColor: colorOf(entry.role),
      backgroundColor: colorOf(entry.role),
      borderDash: [...entry.dash],
      borderWidth: 2,
      pointStyle: entry.marker,
      pointRadius: (context) => (context.dataIndex % MARKER_EVERY === 0 ? 4 : 0),
      pointHoverRadius: 6,
      tension: 0,
      fill: false,
    }));
    return {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            title: { display: true, text: 'Número de cuota', color: palette['ink-muted'] },
            ticks: { color: palette['ink-muted'], precision: 0 },
            grid: { color: palette.rule },
          },
          y: {
            type: 'linear',
            beginAtZero: true,
            title: { display: true, text: 'Saldo', color: palette['ink-muted'] },
            ticks: {
              color: palette['ink-muted'],
              callback: (value) => (typeof value === 'number' ? formatAxisValue(value) : value),
            },
            grid: { color: palette.rule },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: palette.ink, boxWidth: 40 } },
          tooltip: {
            callbacks: {
              title: (items) => `Cuota ${String(items[0]?.parsed.x ?? 0)}`,
              label: (context) => {
                const raw: unknown = context.raw;
                const amount = isChartPoint(raw) ? formatMoney(raw.raw, currency) : '';
                return `${context.dataset.label ?? ''}: ${amount}`;
              },
            },
          },
        },
      },
    };
  }
}
