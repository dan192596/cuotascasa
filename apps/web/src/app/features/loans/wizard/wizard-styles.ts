/**
 * Styles of the wizard and of its step components (ViewEncapsulation.None on the page, so the steps, which are
 * also reusable by the loan detail screen, inherit them). Design tokens only (ADR-0012 §5).
 */
export const WIZARD_STYLES = `
  cc-loan-wizard-page {
    display: block;
    max-width: 44rem;
    margin: 0 auto;
    padding: 1rem;
    color: var(--cc-color-ink);
    font-family: var(--cc-font-body);
  }
  cc-loan-wizard-page h1,
  cc-loan-wizard-page h2 {
    font-family: var(--cc-font-heading);
  }
  cc-loan-wizard-page h2:focus {
    outline: 2px solid var(--cc-color-accent);
    outline-offset: 2px;
  }
  /* The step slides in from the side it comes from (no fade: axe must always read final contrast); reduced motion shows it in place. */
  @media (prefers-reduced-motion: no-preference) {
    .cc-wiz-step[data-direction='forward'] > form {
      animation: cc-wiz-in-forward var(--cc-duration-base) var(--cc-ease-out) backwards;
    }
    .cc-wiz-step[data-direction='back'] > form {
      animation: cc-wiz-in-back var(--cc-duration-base) var(--cc-ease-out) backwards;
    }
  }
  @keyframes cc-wiz-in-forward {
    from {
      transform: translateX(24px);
    }
    to {
      transform: translateX(0);
    }
  }
  @keyframes cc-wiz-in-back {
    from {
      transform: translateX(-24px);
    }
    to {
      transform: translateX(0);
    }
  }
  .cc-wiz-steps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin: 0 0 1rem;
    padding: 0;
    list-style: none;
    color: var(--cc-color-ink-muted);
  }
  .cc-wiz-steps li {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  .cc-wiz-steps li.current {
    color: var(--cc-color-ink);
    font-weight: 600;
  }
  .cc-wiz-steps .num {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-family: var(--cc-font-numeric);
    font-size: 0.875rem;
  }
  .cc-wiz-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0 0 1rem;
  }
  .cc-wiz-field label {
    font-weight: 600;
  }
  cc-loan-wizard-page input,
  cc-loan-wizard-page select {
    min-height: 2.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--cc-color-control-border);
    border-radius: 0.375rem;
    background: var(--cc-color-surface);
    color: var(--cc-color-ink);
    font: inherit;
  }
  cc-loan-wizard-page input[aria-invalid='true'],
  cc-loan-wizard-page select[aria-invalid='true'] {
    border-color: var(--cc-color-danger);
  }
  cc-loan-wizard-page :focus-visible {
    outline: 2px solid var(--cc-color-accent);
    outline-offset: 2px;
  }
  .cc-wiz-errors {
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
    color: var(--cc-color-danger);
  }
  .cc-wiz-hint {
    margin: 0;
    color: var(--cc-color-ink-muted);
    font-size: 0.875rem;
  }
  .cc-wiz-group {
    margin: 0 0 1rem;
    padding: 0.75rem;
    border: 1px solid var(--cc-color-rule);
    border-radius: var(--cc-radius-block);
  }
  .cc-wiz-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.75rem;
  }
  .cc-wiz-summary {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 1rem;
    margin: 0 0 1rem;
    padding: 0.75rem;
    background: var(--cc-color-band);
    border-radius: 0.5rem;
  }
  .cc-wiz-summary dd {
    margin: 0;
    text-align: right;
    font-family: var(--cc-font-numeric);
    font-variant-numeric: tabular-nums;
  }
  .cc-wiz-issue {
    margin: 0 0 1rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--cc-color-danger);
    border-left-width: 4px;
    border-radius: 0.375rem;
    color: var(--cc-color-ink);
    background: var(--cc-color-surface);
  }
  .cc-wiz-cause {
    border-color: var(--cc-color-warning);
  }
  .cc-wiz-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }
  .cc-wiz-actions button:only-child {
    margin-inline-start: auto;
  }
  cc-loan-wizard-page button {
    min-height: 2.5rem;
    padding: 0.375rem 1rem;
    border: 1px solid var(--cc-color-control-border);
    border-radius: var(--cc-radius-pill);
    background: var(--cc-color-surface);
    color: var(--cc-color-ink);
    font: inherit;
    cursor: pointer;
  }
  cc-loan-wizard-page button.cc-wiz-primary {
    border-color: var(--cc-color-accent);
    background: var(--cc-color-accent);
    color: var(--cc-color-paper);
  }
  cc-loan-wizard-page button:disabled {
    cursor: progress;
    opacity: 0.6;
  }
  cc-loan-wizard-page button.cc-wiz-link {
    border-color: transparent;
    background: transparent;
    color: var(--cc-color-accent);
    text-decoration: underline;
  }
  cc-loan-wizard-page button.cc-wiz-secondary {
    border-style: dashed;
  }
`;
