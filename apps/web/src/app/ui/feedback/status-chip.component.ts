import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Validation traffic light of [ALG.VALIDATE] plus the "no reported balance yet" state. */
export type ValidationStatus = 'GREEN' | 'AMBER' | 'RED' | 'UNVALIDATED';

const CHIPS: Record<ValidationStatus, { readonly label: string; readonly icon: string }> = {
  GREEN: { label: 'Coincide', icon: '●' },
  AMBER: { label: 'Diferencia pequeña', icon: '▲' },
  RED: { label: 'Diferencia grande', icon: '■' },
  UNVALIDATED: { label: 'Sin validar', icon: '○' },
};

/** Traffic-light chip. Colour is never the only signal: every state carries a text label and a distinct icon shape. */
@Component({
  selector: 'cc-status-chip',
  template: `
    <span class="chip" role="status" data-testid="chip" [attr.data-status]="status()">
      <span class="icon" aria-hidden="true" data-testid="chip-icon">{{ chip().icon }}</span>
      <span data-testid="chip-label">{{ chip().label }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.125rem 0.625rem;
      border: 1px solid currentColor;
      border-radius: 999px;
      background: var(--cc-color-surface);
      font-family: var(--cc-font-body);
      font-size: 0.875rem;
      color: var(--cc-color-ink);
    }
    [data-status='GREEN'] {
      color: var(--cc-color-positive);
    }
    [data-status='AMBER'] {
      color: var(--cc-color-warning);
    }
    [data-status='RED'] {
      color: var(--cc-color-danger);
    }
    [data-status='UNVALIDATED'] {
      color: var(--cc-color-ink-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  readonly status = input.required<ValidationStatus>();
  protected readonly chip = computed(() => CHIPS[this.status()]);
}
