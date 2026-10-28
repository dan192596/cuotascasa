/**
 * Mercado layout shared by the prerendered placeholder (cc-quick-simulator) and the lazy form, so the swap does not
 * move anything: a soft block with the fields on one side and a dark results panel on the other (ADR-0026).
 */
export const SIMULATOR_LAYOUT_STYLES = `
  :host {
    display: block;
  }
  .sim {
    display: grid;
    gap: 1.25rem;
    padding: clamp(1.25rem, 3vw, 2rem);
    border-radius: var(--cc-radius-block);
    background: var(--cc-color-soft);
    color: var(--cc-color-ink);
    font-family: var(--cc-font-body);
  }
  .title {
    margin: 0;
    font-family: var(--cc-font-heading);
    font-size: clamp(1.75rem, 3.2vw, 2.5rem);
    line-height: 1.05;
  }
  .template {
    margin: 0.375rem 0 0;
    color: var(--cc-color-ink-muted);
    font-size: 0.9375rem;
  }
  .body {
    display: grid;
    gap: 1.25rem;
    align-items: start;
  }
  @media (min-width: 52rem) {
    .body {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
  .field {
    margin-bottom: 1rem;
  }
  label,
  legend {
    display: block;
    margin-bottom: 0.375rem;
    font-weight: 600;
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
    width: 11rem;
    font-family: var(--cc-font-numeric);
    font-variant-numeric: tabular-nums;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .toggle label {
    margin: 0;
  }
  .out {
    display: flex;
    flex-direction: column;
    min-height: 16rem;
    padding: 1.5rem;
    border-radius: var(--cc-radius-block);
    background: var(--cc-color-block);
    color: var(--cc-color-on-block);
  }
  .idle {
    margin: auto 0;
    font-family: var(--cc-font-heading);
    font-size: 1.25rem;
    font-weight: 700;
  }
`;
