import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { seedFromBackup } from '../support/seed.ts';
import { syntheticBackupDocument } from '../support/synthetic.ts';
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
