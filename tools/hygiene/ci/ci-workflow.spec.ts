import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve(import.meta.dirname, '../../../.github/workflows/ci.yml'), 'utf8');

/** The text of the step named `name` inside the verify job (up to the next step or job). */
function step(name: string): string {
  const start = workflow.indexOf(`- name: '${name}'`);
  expect(start, `step "${name}" exists`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const end = rest.search(/\n {6}- name: |\n {2}\S/);
  return rest.slice(0, end === -1 ? undefined : end);
}

describe('ci.yml hygiene steps (W7-02)', () => {
  it('runs the noreply range check on pull_request only, from the event base SHA', () => {
    const text = step('Hygiene: noreply identities');
    expect(text).toContain("if: github.event_name == 'pull_request'");
    expect(text).toContain('BASE_SHA: ${{ github.event.pull_request.base.sha }}');
    expect(text).toContain('node tools/hygiene/ci/noreply-range.mjs --base "$BASE_SHA"');
  });

  it('runs the synthetic-flag check on pull_request and push (no condition)', () => {
    const text = step('Hygiene: synthetic flag');
    expect(text).not.toContain('if:');
    expect(text).toContain('run: node tools/hygiene/synthetic-flag.mjs');
  });

  it('documents the denylist as local-only and never runs it', () => {
    expect(workflow).toContain('denylist');
    expect(workflow).not.toMatch(/run:.*denylist\.mjs/);
  });

  it('keeps every action pinned by full SHA and credentials not persisted', () => {
    for (const line of workflow.split('\n').filter((l) => /^\s+uses: /.test(l))) {
      expect(line).toMatch(/uses: [\w./-]+@[0-9a-f]{40} # v/);
    }
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toMatch(/persist-credentials: true/);
  });

  it('contains no e-mail address', () => {
    expect(workflow).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  });
});
