import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync('renovate.json', 'utf8')) as Config;

interface Rule {
  groupName?: string;
  matchPackageNames?: string[];
  matchUpdateTypes?: string[];
  dependencyDashboardApproval?: boolean;
}
interface Config {
  schedule?: string[];
  minimumReleaseAge?: string;
  rangeStrategy?: string;
  lockFileMaintenance?: { enabled?: boolean };
  enabledManagers?: string[];
  pip_requirements?: { managerFilePatterns?: string[] };
  packageRules: Rule[];
}

describe('renovate.json', () => {
  it('declares a weekly schedule, a 7-day minimum release age and exact pins', () => {
    expect(config.schedule).toEqual(expect.arrayContaining([expect.stringMatching(/week|monday/i)]));
    expect(config.minimumReleaseAge).toBe('7 days');
    expect(config.rangeStrategy).toBe('pin');
  });

  it('runs lockFileMaintenance and requires dashboard approval for majors', () => {
    expect(config.lockFileMaintenance?.enabled).toBe(true);
    const major = config.packageRules.find((r) => r.matchUpdateTypes?.includes('major'));
    expect(major?.dependencyDashboardApproval).toBe(true);
  });

  it('groups Angular and Material together', () => {
    const rule = config.packageRules.find((r) => r.groupName === 'angular');
    // '@angular/**' also matches @angular/material and @angular/cdk
    expect(rule?.matchPackageNames).toContain('@angular/**');
  });

  it('covers the pip requirements of tools/oracle', () => {
    expect(config.enabledManagers).toEqual(expect.arrayContaining(['npm', 'pip_requirements', 'github-actions']));
    expect(config.pip_requirements?.managerFilePatterns).toEqual(
      expect.arrayContaining([expect.stringContaining('tools/oracle')]),
    );
  });
});
