import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * GOLDEN PATTERN · zoneless OnPush component (docs/specs/angular-patterns.md §3).
 * State lives in signals; templates read signals; nothing relies on zone.js or on manual change detection.
 */
@Component({
  selector: 'cc-pattern-installment-counter',
  template: `
    <p data-testid="summary">{{ summary() }}</p>
    <button type="button" (click)="advance()">Adelantar una cuota</button>
    <p aria-live="polite" data-testid="announcement">{{ announcement() }}</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallmentCounterComponent {
  readonly total = input.required<number>();
  protected readonly advanced = signal(0);
  protected readonly remaining = computed(() => Math.max(this.total() - this.advanced(), 0));
  protected readonly summary = computed(() => `Quedan ${this.remaining()} de ${this.total()} cuotas`);
  protected readonly announcement = computed(() =>
    this.advanced() === 0 ? '' : `Adelantaste ${this.advanced()} cuota(s).`,
  );

  protected advance(): void {
    this.advanced.update((count) => count + 1);
  }
}
