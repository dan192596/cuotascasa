import { formatNumber } from '@angular/common';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { appConfig } from './app.config.ts';

describe('app.config.ts', () => {
  it('registers es-GT as LOCALE_ID (ADR-0011 decision 6)', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    expect(TestBed.inject(LOCALE_ID)).toBe('es-GT');
    expect(formatNumber(1234.5, 'es-GT', '1.2-2')).toBe('1,234.50');
  });

  it('runs without zone.js (ADR-0011 decision 2)', () => {
    expect(typeof (globalThis as { Zone?: unknown }).Zone).toBe('undefined');
  });
});
