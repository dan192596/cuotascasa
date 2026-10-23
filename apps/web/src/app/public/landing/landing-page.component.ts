import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuickSimulatorComponent } from '../simulator/quick-simulator.component.ts';
import { LandingBoardComponent } from './board/landing-board.component.ts';
import { LANDING_EXAMPLE_SUMMARY as S } from './example/example-summary.generated.ts';
import { startLandingMotion } from './landing-motion.ts';

/** Example figures, already formatted by the engine at generation time (no money arithmetic in the landing). */
const EXAMPLE = {
  level: S.level,
  terms: 'Q 500,000 · 20 años · 7.00 % + 1.26 %',
  stats: [
    { value: String(S.baseCount), label: 'cuotas del ejemplo' },
    { value: S.prepayment.amount, label: `de abono en la cuota ${String(S.prepayment.installment)}` },
    { value: String(S.monthsSaved), label: 'meses menos' },
    { value: S.costSaved, label: 'de intereses ahorrados' },
  ],
  firstInstallment: [
    ['Interés', S.first.interest],
    ['Seguros', S.first.insurance],
    ['Capital', S.first.capital],
    ['Cuota 1', S.first.total],
  ],
} as const;

/** Card 2: balance per year as a share of the example amount, without and with the prepayment (illustrative). */
const YEARS: readonly (readonly [number, number])[] = [
  [100, 100],
  [98, 98],
  [96, 96],
  [93, 93],
  [90, 90],
  [88, 78],
  [84, 74],
  [81, 69],
  [77, 65],
  [73, 59],
  [69, 54],
  [64, 48],
  [59, 41],
  [54, 34],
  [48, 27],
  [41, 18],
  [34, 9],
  [26, 0],
  [18, 0],
  [9, 0],
];

interface Card {
  readonly tag: string;
  readonly title: string;
  readonly text: string;
  readonly rows: readonly (readonly [string, string])[];
}

const CARDS: readonly Card[] = [
  {
    tag: '01 · Tu cuota',
    title: 'Mira a dónde va cada quetzal.',
    text: 'Interés, seguros y capital en cada cuota, con la fórmula FHA de Guatemala.',
    rows: EXAMPLE.firstInstallment,
  },
  {
    tag: '02 · Abonos',
    title: 'Prueba un abono antes de hacerlo.',
    text: 'Abono único, adelantar cuotas o el abono que te deja en tu meta. Hasta tres escenarios.',
    rows: [],
  },
  {
    tag: '03 · Tu banco',
    title: '¿Cuadra con tu estado de cuenta?',
    text: 'Anota el saldo del banco y la app te dice la diferencia al centavo.',
    rows: [
      ['Cuota 12', 'coincide'],
      ['Cuota 24', 'Q 0.42 de diferencia'],
      ['Cuota 36', 'revisar'],
    ],
  },
  {
    tag: '04 · Tus datos',
    title: 'Sin cuenta, sin servidor.',
    text: 'Si quieres, una copia cifrada en tu propio Google Drive, con una frase que solo tú conoces.',
    rows: [
      ['Cifrado', 'AES-256-GCM'],
      ['Analítica', 'ninguna'],
      ['Exporta', 'Excel · CSV · PDF'],
    ],
  },
];

/**
 * Landing `/` in the Mercado identity (ADR-0026 §6.1; HU-01, R1): the mosaic of colour blocks, the 240-installment
 * section, the stacking cards, the example in figures, the quick simulator and the footer. Everything is complete in
 * the prerendered HTML; motion (landing-motion.ts) starts after the first render, in the browser only, and never runs
 * under reduced motion. No storage and no network.
 */
@Component({
  selector: 'cc-landing-page',
  imports: [RouterLink, QuickSimulatorComponent, LandingBoardComponent],
  template: `
    <header class="bar wrap">
      <a class="brand" routerLink="/">CuotasCasa</a>
      <nav aria-label="Principal">
        <a href="#como" (click)="jump($event)">Cómo funciona</a>
        <a routerLink="/privacidad">Privacidad</a>
        <a class="dark" routerLink="/app">Abrir la app</a>
      </nav>
    </header>
    <main class="wrap">
      <section class="mosaic" aria-label="Inicio">
        <div class="b title" data-testid="mosaic-block" style="--i: 0; --r: -2deg">
          <h1>Calcula tus cuotas, <em>mes a mes.</em></h1>
        </div>
        <div class="b f" data-testid="mosaic-block" style="--i: 1; --r: 3deg">
          <small class="cc-numeric">Cuota nivelada · ejemplo</small>
          <span class="big cc-numeric">{{ example.level }}</span>
          <span>{{ example.terms }}</span>
        </div>
        <div class="b s" data-testid="mosaic-block" style="--i: 2; --r: -4deg" aria-hidden="true">Q</div>
        <div class="b t" data-testid="mosaic-block" style="--i: 3; --r: 4deg" aria-hidden="true"></div>
        <p class="b k" data-testid="mosaic-block" style="--i: 4; --r: -2deg">
          Sin cuenta. Tus números se quedan en tu navegador.
        </p>
        <a
          class="b cta"
          data-testid="mosaic-block"
          data-magnet
          style="--i: 5; --r: 2deg"
          href="#simulador"
          (click)="jump($event)"
          >Calcular mi cuota <span aria-hidden="true">→</span></a
        >
      </section>

      <section id="juego" aria-labelledby="juego-h">
        <div class="head">
          <h2 id="juego-h" data-scramble>240 cuotas. Muévelas.</h2>
          <p>
            Arrastra el círculo amarillo por los 20 años del préstamo. Cada cuadro es una cuota; los fucsia ya son
            tuyos.
          </p>
        </div>
        <cc-landing-board />
        <p class="note cc-numeric">Ejemplo: Q 500,000 · 7.00 % + 1.26 % de seguros FHA</p>
      </section>

      <section id="como" tabindex="-1" aria-labelledby="como-h">
        <h2 id="como-h" data-scramble>Cuatro cosas que hace por ti</h2>
        <div class="cards">
          @for (card of cards; track card.tag; let i = $index) {
            <article class="card c{{ i }}" data-stack [style.--n]="i">
              <div>
                <span class="tag cc-numeric">{{ card.tag }}</span>
                <h3>{{ card.title }}</h3>
                <p>{{ card.text }}</p>
              </div>
              <div class="viz cc-numeric">
                @for (row of card.rows; track row[0]) {
                  <div class="row">
                    <span>{{ row[0] }}</span
                    ><span>{{ row[1] }}</span>
                  </div>
                } @empty {
                  <div class="bars" aria-hidden="true">
                    @for (y of years; track $index) {
                      <span><i [style.height.%]="y[0]"></i><i [style.height.%]="y[1]"></i></span>
                    }
                  </div>
                  <span>Saldo por año, con y sin abono (ilustrativo)</span>
                }
              </div>
            </article>
          }
        </div>
      </section>

      <section class="stats" aria-label="El ejemplo en cifras">
        @for (stat of example.stats; track stat.label) {
          <div class="stat" data-testid="stat">
            <b class="cc-numeric" data-odometer>{{ stat.value }}</b>
            <span>{{ stat.label }}</span>
          </div>
        }
      </section>

      <section id="simulador" tabindex="-1">
        <cc-quick-simulator />
      </section>
    </main>
    <footer class="wrap">
      <p>
        Código abierto
        @if (repoUrl(); as url) {
          · <a [href]="url" rel="noopener noreferrer">Repositorio</a>
        }
        · Sin analítica ni cookies de rastreo
      </p>
      <p>Cifras estimadas; el banco tiene la última palabra. No es asesoría financiera.</p>
    </footer>
  `,
  styles: `
    :host {
      display: block;
    }
    :host(.cc-cursor),
    :host(.cc-cursor) :is(a, button) {
      cursor: none;
    }
    .wrap {
      max-width: 84rem;
      margin-inline: auto;
      padding-inline: max(1rem, env(safe-area-inset-left, 0px));
    }
    a {
      color: inherit;
    }
    .bar a,
    .cta {
      text-decoration: none;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h3,
    .brand,
    .b {
      font-weight: 800;
      letter-spacing: -0.04em;
    }
    small,
    .tag {
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .bar,
    nav,
    .head,
    footer {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      justify-content: space-between;
      align-items: center;
    }
    .bar {
      padding-block: 1rem;
    }
    .brand {
      font-size: 1.35rem;
    }
    nav a {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      padding: 0 1rem;
      border: 2px solid;
      border-radius: var(--cc-radius-pill);
      font-weight: 600;
    }
    nav .dark {
      background: var(--cc-color-ink);
      color: var(--cc-color-paper);
    }
    main {
      display: grid;
      gap: clamp(3rem, 8vw, 5rem);
    }
    .mosaic,
    .stats {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      grid-auto-rows: clamp(4.5rem, 9vw, 8rem);
      gap: 8px;
    }
    .stats {
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
      grid-auto-rows: auto;
    }
    .b,
    .stat,
    .card {
      display: grid;
      padding: clamp(0.9rem, 2vw, 1.5rem);
      border: 1px solid light-dark(transparent, var(--cc-color-rule));
      border-radius: var(--cc-radius-block);
      overflow: hidden;
    }
    .title {
      grid-area: span 3 / span 8;
      align-content: end;
      background: var(--cc-color-soft);
    }
    h1 {
      font-size: clamp(2.75rem, 8.6vw, 8rem);
      line-height: 0.88;
    }
    em {
      font-style: normal;
      color: var(--cc-color-accent);
    }
    .f,
    .c0 {
      background: var(--cc-color-accent);
      color: var(--cc-color-paper);
    }
    .f {
      grid-area: span 2 / span 4;
      align-content: space-between;
    }
    .big {
      font-size: clamp(1.75rem, 4vw, 3.5rem);
    }
    .s,
    .t {
      grid-column: span 2;
    }
    .s,
    .cta,
    .c2 {
      background: var(--cc-color-highlight);
      color: var(--cc-color-on-color);
    }
    .s {
      place-items: center;
      font-size: 2.5rem;
    }
    .t {
      --d: linear-gradient(45deg, var(--cc-color-on-color) 25%, transparent 0 75%, var(--cc-color-on-color) 0);
      background:
        var(--d) 0 0 / 22px 22px,
        var(--d) 11px 11px / 22px 22px,
        var(--cc-color-saving);
    }
    .k,
    .c3 {
      background: var(--cc-color-block);
      color: var(--cc-color-on-block);
    }
    .k {
      grid-column: span 5;
      align-content: center;
      font-weight: 600;
    }
    .cta {
      grid-column: span 7;
      grid-auto-flow: column;
      justify-content: start;
      align-items: center;
      gap: 0.5rem;
      font-size: clamp(1.4rem, 3vw, 2.4rem);
      transition: var(--cc-duration-base) var(--cc-ease-out);
    }
    .cta:hover {
      background: var(--cc-color-accent);
      color: var(--cc-color-paper);
    }
    h2 {
      font-size: clamp(2.25rem, 6vw, 5rem);
      line-height: 0.92;
    }
    .head {
      align-items: end;
      margin-bottom: 1.25rem;
    }
    .head p {
      max-width: 40ch;
      color: var(--cc-color-ink-muted);
    }
    :host(.cc-cursor) cc-landing-board {
      --cc-board-cursor: none;
    }
    .note,
    .stat span,
    footer {
      margin-top: 0.75rem;
      font-size: 0.875rem;
      color: var(--cc-color-ink-muted);
    }
    .card {
      position: sticky;
      top: calc(10vh + var(--n) * 28px);
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
      gap: 1.5rem 3rem;
      align-items: center;
      min-height: 62vh;
      margin-bottom: 8vh;
      padding: clamp(1.5rem, 4vw, 3rem);
      border-radius: 28px;
    }
    h3 {
      margin: 0.5rem 0 1rem;
      font-size: clamp(2rem, 5vw, 4rem);
      line-height: 0.92;
    }
    .c1 {
      background: var(--cc-color-saving);
      color: var(--cc-color-on-color);
    }
    .viz {
      display: grid;
      gap: 0.6rem;
      padding: 1.25rem;
      border-radius: var(--cc-radius-block);
      background: color-mix(in srgb, currentColor 8%, transparent);
    }
    .c1 .viz,
    .c2 .viz {
      background: color-mix(in srgb, var(--cc-color-on-block) 40%, transparent);
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding-bottom: 0.45rem;
      border-bottom: 1px dashed;
    }
    .row:last-child {
      border: 0;
    }
    .bars {
      display: flex;
      gap: 6px;
      height: 9rem;
    }
    .bars span {
      position: relative;
      flex: 1;
    }
    .bars i {
      position: absolute;
      inset: auto 0 0;
      background: currentColor;
    }
    .bars i:first-child {
      opacity: 0.35;
    }
    .stat {
      border: 2px solid;
    }
    .stat b {
      /* Fits 'Q 102,206.82' (12 monospaced glyphs) in a quarter of the row at every width. */
      font-size: clamp(1.5rem, 2.6vw, 2.5rem);
      white-space: nowrap;
    }
    footer {
      padding-block: 1.5rem 3rem;
      border-top: 2px solid;
    }
    @media (prefers-reduced-motion: no-preference) {
      .b {
        animation: land var(--cc-duration-slow) var(--cc-ease-out) both calc(var(--i) * 70ms);
      }
    }
    @keyframes land {
      from {
        transform: translateY(40px) rotate(var(--r)) scale(0.92);
      }
    }
    @media (max-width: 820px) {
      .mosaic {
        grid-auto-rows: minmax(4.5rem, auto);
      }
      .b {
        grid-column: span 12;
      }
      .s,
      .t {
        grid-column: span 6;
      }
    }
  `,
  host: { 'data-testid': 'page-landing' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPageComponent {
  /** Route data (ISSUES_URL, injected at build time): the public Issues URL, '' in dev builds. */
  readonly issuesUrl = input<string | undefined>('');

  /** Repository URL derived from the issues URL; '' unless it is an https URL (never a literal in the sources). */
  protected readonly repoUrl = computed(() => {
    const url = (this.issuesUrl() ?? '').replace(/\/+$/, '').replace(/\/issues$/, '');
    return url.startsWith('https://') ? url : '';
  });

  protected readonly example = EXAMPLE;
  protected readonly cards = CARDS;
  protected readonly years = YEARS;

  private readonly document = inject(DOCUMENT);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let stop: () => void = () => undefined;
    afterNextRender(() => {
      const win = this.document.defaultView;
      if (win !== null) stop = startLandingMotion(host, win);
    });
    inject(DestroyRef).onDestroy(() => stop());
  }

  /**
   * In-page links: scroll to the section and move focus there. Without JS the plain `#id` link does the same; with JS
   * the router would otherwise treat the hash change as a navigation and restore the scroll to the top. Modified or
   * non-primary clicks keep the browser's behaviour (open in a new tab and so on).
   */
  protected jump(event: MouseEvent): void {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = this.document.getElementById((event.currentTarget as HTMLAnchorElement).hash.slice(1));
    if (target === null) return;
    event.preventDefault();
    target.scrollIntoView();
    target.focus({ preventScroll: true });
  }
}
