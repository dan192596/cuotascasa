import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { type SeedDocument, seedFromBackup } from '../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

test('a fresh profile shows the empty state with its three actions', async ({ page }) => {
  await page.goto('/app');
  const empty = page.getByTestId('empty-state');
  await expect(empty).toBeVisible();
  const actions = page.getByTestId('empty-actions').getByRole('link');
  await expect(actions).toHaveText(['Crear un préstamo', 'Restaurar un respaldo', 'Conectar Drive']);
  await expect(page.getByTestId('loan-card')).toHaveCount(0);
  await expect(page.getByTestId('sync-status')).toContainText('Drive:');
  await page.waitForLoadState('networkidle');

  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
  await expectNoA11yViolations(page);
});

test('a seeded synthetic loan shows its card with the house meter and per-currency totals', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.reload();

  const card = page.getByTestId('loan-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Casa A');
  await expect(card.getByTestId('card-status')).toHaveText('Activo');
  await expect(card.getByTestId('card-balance')).toContainText('Q ');
  await expect(card.getByTestId('house-text')).toContainText('capital pagado');
  await expect(card.getByTestId('chip-label')).toHaveText('Sin validar');
  await expect(page.getByTestId('total-GTQ')).toContainText('Q ');
  await expect(page.getByTestId('total-USD')).toContainText('—');
  await expect(page.getByTestId('empty-state')).toHaveCount(0);
  await page.waitForLoadState('networkidle');

  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
  await expectNoA11yViolations(page);
});

const SECOND_LOAN_ID = 'a0000000-0000-4000-8000-000000000002';

/** The synthetic backup plus a second, invented USD loan, so each currency has its own total. */
function twoLoanDocument(): SeedDocument {
  const base = syntheticBackupDocument();
  const loans = base.data['loans'] as Record<string, unknown>[];
  const first = loans[0] as Record<string, unknown>;
  const second = {
    ...first,
    id: SECOND_LOAN_ID,
    name: 'Casa B',
    currency: 'USD',
    principal: '100000.00',
    fixedCharges: [],
  };
  return { ...base, data: { ...base.data, loans: [first, second] } };
}

test('two synthetic loans: per-currency totals, shared transition names and a clean axe in light and dark', async ({
  page,
}) => {
  // Balances depend on today's date, so the clock is pinned for exact totals.
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00'));
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, twoLoanDocument());
  await page.reload();

  const cards = page.getByTestId('loan-card');
  await expect(cards).toHaveCount(2);
  await expect(page.getByTestId('total-GTQ').getByTestId('odometer').first()).toHaveAttribute(
    'aria-label',
    'Q 472,023.28',
  );
  await expect(page.getByTestId('total-USD').getByTestId('odometer').first()).toHaveAttribute(
    'aria-label',
    'US$ 96,488.76',
  );
  const names = await cards.evaluateAll((els) => els.map((el) => getComputedStyle(el).viewTransitionName));
  expect(names).toEqual([`cc-loan-${SYNTHETIC_LOAN_ID}`, `cc-loan-${SECOND_LOAN_ID}`]);
  await page.waitForLoadState('networkidle');

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
  expectNoConsoleErrors(page);
});

test('with reduced motion the cards have no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, twoLoanDocument());
  await page.reload();

  const cards = page.getByTestId('loan-card');
  await expect(cards).toHaveCount(2);
  const animations = await cards.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(animations).toEqual(['none', 'none']);
});
