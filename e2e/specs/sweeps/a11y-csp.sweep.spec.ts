import { AxeBuilder } from '@axe-core/playwright';
import {
  collectCspViolations,
  expectNoClientStorage,
  expectNoConsoleErrors,
  expectNoExternalRequests,
} from '../../support/expectations.ts';
import { expect, test } from '../../support/test.ts';
import { KNOWN_DEFECTS } from './known-defects.ts';
import { openCase, SWEEP_CASES, THEMES } from './sweep-routes.ts';

/**
 * W6-02 sweep: every route and every error state, in the light and dark themes, on Chromium and WebKit.
 * Per state: zero serious/critical axe violations, zero CSP / Trusted Types violations (enforced or report-only),
 * zero console errors, zero external requests, and zero client storage on the public pages.
 * Known defects outside this area are skipped one by one through KNOWN_DEFECTS (each cites its finding).
 */
for (const sweepCase of SWEEP_CASES) {
  for (const theme of THEMES) {
    test.describe(`${sweepCase.id} [${theme}]`, () => {
      test.beforeEach(async ({ page }) => {
        await openCase(page, sweepCase, theme);
      });

      test('no CSP or Trusted Types violations, console errors or external requests', async ({ page }) => {
        const finding = KNOWN_DEFECTS.find(
          (known) => known.check === 'runtime' && known.caseId === sweepCase.id && known.themes.includes(theme),
        );
        test.fixme(finding !== undefined, finding?.finding ?? '');
        expect(collectCspViolations(page)).toEqual([]);
        expectNoConsoleErrors(page, { expectFailedDocument: (sweepCase.status ?? 200) >= 400 });
        expectNoExternalRequests(page);
      });

      test('no serious or critical axe violations', async ({ page }) => {
        test.slow(sweepCase.heavy === true, 'ledger of hundreds of cells');
        const { violations } = await new AxeBuilder({ page }).analyze();
        const blocking = violations
          .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
          .map((violation) => {
            // Where it is and why: selector, foreground/background colors and ratio from axe's own check data.
            const detail = violation.nodes
              .map((node) => {
                const data = node.any
                  .map((check) => check.data as Record<string, unknown> | null)
                  .find((d) => d != null);
                const colors =
                  data == null
                    ? ''
                    : ` fg=${String(data['fgColor'])} bg=${String(data['bgColor'])} ratio=${String(data['contrastRatio'])} (needs ${String(data['expectedContrastRatio'])})`;
                return `\n    ${node.target.join(' ')}${colors}`;
              })
              .join('');
            return `${violation.impact ?? '?'} ${violation.id}: ${violation.nodes.length} node(s)${detail}`;
          });
        // Only the exact rules listed for this state are skipped: any other violation still fails.
        const known = KNOWN_DEFECTS.filter(
          (entry) => entry.check === 'axe' && entry.caseId === sweepCase.id && entry.themes.includes(theme),
        );
        const unexpected = blocking.filter((line) => !known.some((entry) => line.includes(` ${entry.rule ?? ''}:`)));
        expect(unexpected, 'axe violations').toEqual([]);
        test.fixme(known.length > 0, known.map((entry) => entry.finding).join(' | '));
      });

      if (sweepCase.publicPage) {
        test('public page keeps no client storage', async ({ page }) => {
          await expectNoClientStorage(page);
        });
      }
    });
  }
}
