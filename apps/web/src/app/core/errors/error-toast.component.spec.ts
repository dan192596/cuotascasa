import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AppToastService } from './app-toast.service.ts';
import { ErrorToastComponent } from './error-toast.component.ts';

describe('cc-error-toast', () => {
  it('renders nothing without a message, then an alert that can be dismissed', async () => {
    const fixture = TestBed.createComponent(ErrorToastComponent);
    const toast = TestBed.inject(AppToastService);
    const el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).toBeNull();

    toast.show('Algo salió mal.');
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Algo salió mal.');

    (el.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
