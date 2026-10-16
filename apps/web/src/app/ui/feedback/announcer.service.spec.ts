import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Announcer } from './announcer.service.ts';

function region(politeness: 'polite' | 'assertive'): HTMLElement | null {
  return document.querySelector(`[data-cc-announcer="${politeness}"]`);
}

describe('Announcer', () => {
  let announcer: Announcer;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    announcer = TestBed.inject(Announcer);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('[data-cc-announcer]').forEach((element) => element.remove());
    document.querySelectorAll('[aria-modal]').forEach((element) => element.remove());
  });

  it('announces politely by default, in a visually hidden aria-live region', async () => {
    const done = announcer.announce('Cuota recalculada');
    await vi.advanceTimersByTimeAsync(150);
    await done;
    const polite = region('polite');
    expect(polite?.textContent).toBe('Cuota recalculada');
    expect(polite?.getAttribute('aria-live')).toBe('polite');
    expect(polite?.getAttribute('aria-atomic')).toBe('true');
    expect(polite?.style.position).toBe('absolute');
    expect(polite?.style.width).toBe('1px');
  });

  it('polite() and assertive() use separate regions', async () => {
    void announcer.polite('a');
    await vi.advanceTimersByTimeAsync(150);
    void announcer.assertive('b');
    await vi.advanceTimersByTimeAsync(150);
    expect(region('polite')?.textContent).toBe('a');
    expect(region('assertive')?.textContent).toBe('b');
    expect(region('assertive')?.getAttribute('aria-live')).toBe('assertive');
  });

  it('re-announces the same message (the region is emptied first)', async () => {
    void announcer.polite('Guardado');
    await vi.advanceTimersByTimeAsync(150);
    void announcer.polite('Guardado');
    expect(region('polite')?.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(150);
    expect(region('polite')?.textContent).toBe('Guardado');
  });

  it('ignores blank messages', async () => {
    await announcer.announce('   ');
    expect(region('polite')).toBeNull();
  });

  it('clear() empties every region', async () => {
    void announcer.polite('a');
    await vi.advanceTimersByTimeAsync(150);
    announcer.clear();
    expect(region('polite')?.textContent).toBe('');
  });

  it('announces inside an open modal dialog so aria-modal does not hide it', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    void announcer.polite('Dentro del diálogo');
    await vi.advanceTimersByTimeAsync(150);
    expect(region('polite')?.parentElement).toBe(dialog);
    dialog.remove();
    void announcer.polite('Fuera');
    await vi.advanceTimersByTimeAsync(150);
    expect(region('polite')?.parentElement).toBe(document.body);
  });

  it('never writes markup: the message is text, not HTML', async () => {
    void announcer.polite('<b>x</b>');
    await vi.advanceTimersByTimeAsync(150);
    expect(region('polite')?.children.length).toBe(0);
    expect(region('polite')?.textContent).toBe('<b>x</b>');
  });
});
