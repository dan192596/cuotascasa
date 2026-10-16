import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Run after `pnpm build` with `pnpm exec ng test --configuration=dist --no-watch` (cwd = repository root). */
const html = readFileSync('dist/apps/web/browser/index.html', 'utf8');

describe('prerendered / contains the quick simulator form and no results (W4-03)', () => {
  it('has the host and every form field', () => {
    expect(html).toContain('<cc-quick-simulator');
    for (const id of ['sim-principal', 'sim-rate', 'sim-years', 'sim-prepay-toggle']) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect(html).toContain('+ 1.26 % seguros FHA');
  });

  it('has no results and no error', () => {
    expect(html).not.toContain('data-testid="sim-results"');
    expect(html).not.toContain('data-testid="sim-level"');
    expect(html).not.toContain('data-testid="sim-error"');
    expect(html).not.toContain('data-testid="sim-prepay-fields"');
  });
});
