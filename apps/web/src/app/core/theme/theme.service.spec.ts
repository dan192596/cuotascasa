import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service.ts';

describe('ThemeService', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('follows the system by default: no data-theme attribute', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('system');
    expect(TestBed.inject(DOCUMENT).documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('forces light or dark with data-theme and removes it for system', () => {
    const root = TestBed.inject(DOCUMENT).documentElement;
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(service.preference()).toBe('dark');
    service.setPreference('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    service.setPreference('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('writes nothing to localStorage, sessionStorage or cookies', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const cookie = vi.spyOn(document, 'cookie', 'set');
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    service.setPreference('system');
    expect(setItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });
});
