import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const IS_DIGIT = /^[0-9]$/;

interface Glyph {
  readonly char: string;
  readonly digit: boolean;
}

/**
 * Odometer for already formatted text such as `Q 984,048.18` (Mercado, W8-03). Each digit is a 0-9 column that rolls
 * to its figure; every other character stays fixed. Only characters are animated: the text is never converted to a
 * number. The final text is in the DOM from the first render (`.text`, plus the accessible name), so the page is
 * complete at rest and prerender-safe; the rolling is purely visual and runs once per column, only when the user has
 * no reduced-motion preference.
 */
@Component({
  selector: 'cc-odometer',
  template: `
    <span class="odometer" data-testid="odometer" role="img" [attr.aria-label]="value()">
      <span class="text" aria-hidden="true">{{ value() }}</span>
      @for (glyph of glyphs(); track $index) {
        @if (glyph.digit) {
          <span
            class="col"
            aria-hidden="true"
            [attr.data-char]="glyph.char"
            [attr.data-digit]="glyph.char"
            [style.--cc-digit]="glyph.char"
            [style.--cc-i]="$index"
          >
            <span class="strip">
              @for (d of digits; track d) {
                <span class="d">{{ d }}</span>
              }
            </span>
          </span>
        } @else {
          <span class="sep" aria-hidden="true" [attr.data-char]="glyph.char">{{ glyph.char }}</span>
        }
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .odometer {
      position: relative;
      display: inline-flex;
      align-items: flex-start;
      font-family: var(--cc-font-numeric);
      font-variant-numeric: tabular-nums;
      line-height: 1;
      white-space: pre;
    }
    .text {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      user-select: text;
    }
    /* Copying the figure yields the hidden final text, never the 0-9 strips of every column. */
    .col,
    .sep {
      user-select: none;
    }
    .col {
      display: inline-block;
      height: 1em;
      overflow: hidden;
    }
    .strip {
      display: flex;
      flex-direction: column;
      transform: translateY(calc(var(--cc-digit) * -1em));
    }
    .d {
      display: block;
      height: 1em;
    }
    .sep {
      display: inline-block;
      height: 1em;
    }
    @keyframes roll {
      from {
        transform: translateY(0);
      }
    }
    @media (prefers-reduced-motion: no-preference) {
      .strip {
        animation: roll var(--cc-duration-slow) var(--cc-ease-out) backwards;
        animation-delay: calc(var(--cc-i) * 25ms);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OdometerComponent {
  /** Final, already formatted text (for example `Q 984,048.18`). Never parsed as a number. */
  readonly value = input.required<string>();

  protected readonly digits = DIGITS;
  protected readonly glyphs = computed<readonly Glyph[]>(() =>
    Array.from(this.value()).map((char) => ({ char, digit: IS_DIGIT.test(char) })),
  );
}
