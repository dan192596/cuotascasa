// W1-10 deletes this file when it replaces the stubs with the real checks.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('tools/hygiene pass-through stubs', () => {
  it.each(['tools/hygiene/denylist.mjs', 'tools/hygiene/noreply.mjs', 'tools/hygiene/synthetic-flag.mjs'])(
    '%s exits 0 and says it is pending W1-10',
    (entrypoint) => {
      const result = spawnSync(process.execPath, [entrypoint], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('pending W1-10');
    },
  );
});
