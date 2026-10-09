import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

let nextId = 0;

const PERCENT = /^\d+(\.\d+)?$/;

/** Parses a 0-100 percent string; anything not plain decimal counts as 0. Clamped, at most 2 decimals. */
function clampPercent(raw: string): number {
  if (!PERCENT.test(raw)) return 0;
  const value = Math.min(100, Math.max(0, Number(raw)));
  return Number(value.toFixed(2));
}

/**
 * "Tu casa se va llenando" (ADR-0012 decision 2): a house outline filled in proportion to the percentage of principal
 * already paid. The text lives outside the graphic (no text on the green fill) and the SVG is decorative: the meter
 * semantics are on the wrapper. The house is built with Angular SVG templates (no innerHTML, Trusted Types safe).
 */
@Component({
  selector: 'cc-house-meter',
  template: `
    <div
      class="meter"
      role="meter"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="valueText()"
      [attr.aria-label]="label()"
    >
      <svg class="house" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <clipPath [attr.id]="clipId">
            <polygon [attr.points]="outline" />
          </clipPath>
        </defs>
        <g [attr.clip-path]="clipRef">
          <rect
            class="fill"
            data-testid="house-fill"
            x="0"
            y="0"
            width="100"
            height="100"
            [style.transform]="scale()"
          />
        </g>
        <polygon class="outline" [attr.points]="outline" />
        <line class="floor" x1="12" y1="96" x2="88" y2="96" />
      </svg>
      <p class="text" data-testid="house-text">
        <strong class="value">{{ value() }} %</strong>
        <span class="caption">{{ label() }}</span>
      </p>
    </div>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .meter {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: var(--cc-color-ink);
    }
    .house {
      width: 7.5rem;
      height: 7.5rem;
    }
    .outline {
      fill: none;
      stroke: var(--cc-color-control-border);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .floor {
      stroke: var(--cc-color-control-border);
      stroke-width: 2;
      stroke-linecap: round;
    }
    .fill {
      fill: var(--cc-color-positive-fill);
      transform-box: fill-box;
      transform-origin: bottom;
    }
    .text {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .value {
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: 1.25rem;
      color: var(--cc-color-positive);
    }
    .caption {
      font-family: var(--cc-font-body);
      font-size: 0.875rem;
      color: var(--cc-color-ink-muted);
    }
    @keyframes fill-in {
      from {
        transform: scaleY(0);
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .fill {
        animation: fill-in 600ms ease-out;
        transition: transform 600ms ease-out;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .fill {
        animation: none;
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HouseMeterComponent {
  /** Percent of principal paid, as a decimal string between "0" and "100" (out-of-range values are clamped). */
  readonly percent = input.required<string>();
  /** Caption under the percentage; keep it explicit so the meter is not read as the property value. */
  readonly label = input('capital pagado');

  protected readonly clipId = `cc-house-clip-${nextId++}`;
  protected readonly clipRef = `url(#${this.clipId})`;
  protected readonly outline = '50,6 94,44 84,44 84,94 16,94 16,44 6,44';

  protected readonly value = computed(() => String(clampPercent(this.percent())));
  protected readonly scale = computed(() => `scaleY(${clampPercent(this.percent()) / 100})`);
  protected readonly valueText = computed(() => `${this.value()} % ${this.label()}`);
}
