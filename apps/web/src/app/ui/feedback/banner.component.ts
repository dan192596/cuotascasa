import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<BannerTone, { readonly label: string; readonly icon: string; readonly role: 'status' | 'alert' }> =
  {
    info: { label: 'Información', icon: 'ℹ', role: 'status' },
    success: { label: 'Listo', icon: '●', role: 'status' },
    warning: { label: 'Advertencia', icon: '▲', role: 'alert' },
    danger: { label: 'Error', icon: '■', role: 'alert' },
  };

/** Inline notice with an optional close button. Tone is conveyed by a text label and an icon, never by colour alone. */
@Component({
  selector: 'cc-banner',
  template: `
    @if (visible()) {
      <div class="banner" data-testid="banner" [attr.role]="toneInfo().role" [attr.data-tone]="tone()">
        <span class="icon" aria-hidden="true" data-testid="banner-icon">{{ toneInfo().icon }}</span>
        <p class="body">
          <strong data-testid="banner-tone">{{ toneInfo().label }}</strong>
          <span class="message"><ng-content /></span>
        </p>
        @if (dismissible()) {
          <button
            type="button"
            class="close"
            data-testid="banner-dismiss"
            [attr.aria-label]="dismissLabel()"
            (click)="dismiss()"
          >
            <span aria-hidden="true">×</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .banner {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem;
      border: 1px solid currentColor;
      border-left-width: 4px;
      border-radius: 0.375rem;
      background: var(--cc-color-surface);
      font-family: var(--cc-font-body);
      color: var(--cc-color-ink);
    }
    [data-tone='info'] .icon {
      color: var(--cc-color-accent);
    }
    [data-tone='success'] .icon {
      color: var(--cc-color-positive);
    }
    [data-tone='warning'] .icon {
      color: var(--cc-color-warning);
    }
    [data-tone='danger'] .icon {
      color: var(--cc-color-danger);
    }
    [data-tone='info'] {
      border-color: var(--cc-color-accent);
    }
    [data-tone='success'] {
      border-color: var(--cc-color-positive);
    }
    [data-tone='warning'] {
      border-color: var(--cc-color-warning);
    }
    [data-tone='danger'] {
      border-color: var(--cc-color-danger);
    }
    .body {
      flex: 1;
      margin: 0;
    }
    .message {
      margin-inline-start: 0.5rem;
    }
    .close {
      border: 1px solid transparent;
      border-radius: 0.25rem;
      background: transparent;
      color: var(--cc-color-ink);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
    }
    .close:focus-visible {
      outline: 2px solid var(--cc-color-control-border);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BannerComponent {
  readonly tone = input<BannerTone>('info');
  readonly dismissible = input(true);
  readonly dismissLabel = input('Cerrar aviso');
  /** Emitted once when the user closes the banner; the banner then hides itself. */
  readonly dismissed = output<void>();

  protected readonly visible = signal(true);
  protected readonly toneInfo = computed(() => TONES[this.tone()]);

  protected dismiss(): void {
    this.visible.set(false);
    this.dismissed.emit();
  }
}
