import type { Page } from '@playwright/test';
import {
  expectNoA11yViolations,
  expectNoConsoleErrors,
  expectNoCspViolations,
  expectNoExternalRequests,
} from '../support/expectations.ts';
import { readStore, seedFromBackup } from '../support/seed.ts';
import { SYNTHETIC_LOAN_ID, syntheticBackupDocument } from '../support/synthetic.ts';
import { expect, test } from '../support/test.ts';

/** Synthetic loan 'Casa A' of support/synthetic.ts: a real abono at installment 14 (31/03/2026) sets cutoffK = 14. */
const SCENARIOS_URL = `/app/prestamos/${SYNTHETIC_LOAN_ID}/proyecciones`;

interface StoredScenario {
  readonly name: string;
  readonly deletedAt: string | null;
  readonly events: readonly {
    readonly type: string;
    readonly date: string;
    readonly amount?: string;
    readonly mode?: string;
  }[];
}

test.afterEach(({ page }) => {
  expectNoConsoleErrors(page);
  expectNoCspViolations(page);
  expectNoExternalRequests(page);
});

async function openEditor(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await seedFromBackup(page, syntheticBackupDocument());
  await page.goto(SCENARIOS_URL);
  await expect(page.getByTestId('page-scenarios')).toBeVisible();
  await expect(page.getByTestId('scenario-list')).toBeVisible();
}

async function createScenario(page: Page, name: string): Promise<void> {
  await page.getByLabel('Nombre del nuevo escenario').fill(name);
  await page.getByRole('button', { name: 'Crear escenario' }).click();
  await expect(page.getByTestId('scenario-row').filter({ hasText: name })).toBeVisible();
}

async function storedScenarios(page: Page): Promise<StoredScenario[]> {
  return (await readStore(page, 'scenarios')) as StoredScenario[];
}

/** 'dd/mm/aaaa' → 'aaaammdd', to compare dates as text. */
function sortable(date: string): string {
  const [day = '', month = '', year = ''] = date.trim().split('/');
  return `${year}${month}${day}`;
}

test('create, activate, rename, duplicate and delete scenarios; they persist across a reload', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByTestId('no-scenarios')).toBeVisible();
  await expectNoA11yViolations(page);

  await createScenario(page, 'Plan A');
  await expect(page.getByTestId('active-badge')).toHaveCount(1);
  await createScenario(page, 'Plan B');
  await expect(page.getByTestId('active-badge')).toHaveCount(1);

  const planB = page.getByTestId('scenario-row').filter({ hasText: 'Plan B' });
  await planB.getByRole('button', { name: 'Activar el escenario Plan B' }).click();
  await expect(planB.getByTestId('active-badge')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Escenario activo: Plan B' })).toBeVisible();

  await planB.getByRole('button', { name: 'Renombrar el escenario Plan B' }).click();
  await page.getByLabel('Nuevo nombre del escenario').fill('Plan C');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByTestId('scenario-row').filter({ hasText: 'Plan C' })).toBeVisible();

  await page.getByRole('button', { name: 'Duplicar el escenario Plan C' }).click();
  await expect(page.getByTestId('scenario-row').filter({ hasText: 'Copia de Plan C' })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.reload();
  await expect(page.getByTestId('scenario-row')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Escenario activo: Plan C' })).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar el escenario Copia de Plan C' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('scenario-row')).toHaveCount(2);
  const live = (await storedScenarios(page)).filter((scenario) => scenario.deletedAt === null);
  expect(live.map((scenario) => scenario.name).sort()).toEqual(['Plan A', 'Plan C']);
});

test('an abono changes the metrics, a hypothetical event on real data is rejected, and a finish-by goal is met', async ({
  page,
}) => {
  await openEditor(page);
  await createScenario(page, 'Plan A');
  await expect(page.getByTestId('no-metrics')).toBeVisible();

  // Abono a capital in installment 20, after the cutoff.
  const abono = page.getByTestId('abono-form');
  await abono.getByLabel('Fecha del abono').fill('30/09/2026');
  await abono.getByLabel('Monto del abono').fill('20000');
  await abono.getByRole('button', { name: 'Agregar al escenario' }).click();
  await expect(page.getByTestId('metrics')).toBeVisible();
  const months = Number.parseInt((await page.getByTestId('metric-months').textContent()) ?? '', 10);
  expect(months).toBeGreaterThan(0);
  await expect(page.getByTestId('event-row')).toContainText('Abono de Q 20,000.00');
  await expectNoA11yViolations(page);

  // Installment 14 already has a real abono: the domain error is shown in Spanish and nothing is saved.
  await abono.getByLabel('Fecha del abono').fill('31/03/2026');
  await abono.getByLabel('Monto del abono').fill('5000');
  await abono.getByRole('button', { name: 'Agregar al escenario' }).click();
  await expect(page.getByTestId('abono-failure')).toContainText('cuota 14');
  await expect(page.getByTestId('abono-failure')).toContainText('datos reales');
  await expect(page.getByTestId('event-row')).toHaveCount(1);
  await expectNoA11yViolations(page);

  // Goal-seek: finish by 31/12/2040, abono on 31/10/2026, applied to the scenario.
  const goal = page.getByTestId('goal-form');
  await goal.getByLabel('Fecha del abono').fill('31/10/2026');
  await goal.getByLabel('Terminar a más tardar el').fill('31/12/2040');
  await goal.getByRole('button', { name: 'Calcular abono' }).click();
  await expect(page.getByTestId('goal-result')).toBeVisible();
  await expect(page.getByTestId('goal-amount')).toContainText('Q ');
  await expectNoA11yViolations(page);
  await page.getByTestId('goal-apply').click();
  await expect(page.getByTestId('event-row')).toHaveCount(2);
  await expect(page.getByTestId('goal-result')).toHaveCount(0);
  const end = (await page.getByTestId('metric-end').textContent()) ?? '';
  expect(sortable(end) <= sortable('31/12/2040')).toBe(true);

  const [stored] = (await storedScenarios(page)).filter((scenario) => scenario.deletedAt === null);
  expect(stored?.events.map((event) => event.type)).toEqual(['Prepayment', 'Prepayment']);
  await expectNoA11yViolations(page);
});

test('advance N installments and a max-installment goal use the active scenario', async ({ page }) => {
  await openEditor(page);
  await createScenario(page, 'Plan A');

  const advance = page.getByTestId('advance-form');
  await advance.getByLabel('Fecha del adelanto').fill('30/09/2026');
  await advance.getByLabel('Cuántas cuotas adelantar').fill('6');
  await advance.getByRole('button', { name: 'Agregar al escenario' }).click();
  await expect(page.getByTestId('event-row')).toContainText('Adelantar 6 cuotas');
  await expect(page.getByTestId('metric-months')).toHaveText('6');

  const goal = page.getByTestId('goal-form');
  await goal.getByLabel('Meta').selectOption('MAX_INSTALLMENT');
  await goal.getByLabel('Fecha del abono').fill('31/10/2026');
  await goal.getByLabel('Cuota total máxima').fill('4200');
  await goal.getByRole('button', { name: 'Calcular abono' }).click();
  await expect(page.getByTestId('goal-result')).toBeVisible();
  await expectNoA11yViolations(page);
});
