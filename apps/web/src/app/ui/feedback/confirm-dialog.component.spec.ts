import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ConfirmDialogComponent } from './confirm-dialog.component.ts';

@Component({
  imports: [ConfirmDialogComponent],
  template: `
    <button id="opener" type="button">Eliminar</button>
    <cc-confirm-dialog
      [open]="open()"
      heading="¿Eliminar préstamo?"
      message="Se marcará como borrado."
      confirmLabel="Eliminar"
      (confirmed)="log.push('confirmed'); open.set(false)"
      (cancelled)="log.push('cancelled'); open.set(false)"
    />
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly log: string[] = [];
}

async function mount() {
  const fixture = TestBed.createComponent(HostComponent);
  document.body.appendChild(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('cc-confirm-dialog', () => {
  it('renders nothing while closed', async () => {
    const { root } = await mount();
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('is a labelled modal dialog when open', async () => {
    const { fixture, host, root } = await mount();
    host.open.set(true);
    await fixture.whenStable();
    const dialog = root.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const label = root.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
    expect(label?.textContent).toContain('¿Eliminar préstamo?');
    const description = root.querySelector(`#${dialog.getAttribute('aria-describedby')}`);
    expect(description?.textContent).toContain('Se marcará como borrado.');
  });

  it('moves focus to the cancel button (safe default) and traps it inside', async () => {
    const { fixture, host, root } = await mount();
    host.open.set(true);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dialog = root.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).dataset['testid']).toBe('confirm-cancel');
    expect(dialog.hasAttribute('cdktrapfocus')).toBe(true);
  });

  it('emits confirmed when the confirm button is pressed', async () => {
    const { fixture, host, root } = await mount();
    host.open.set(true);
    await fixture.whenStable();
    (root.querySelector('[data-testid="confirm-ok"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(host.log).toEqual(['confirmed']);
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('emits cancelled on the cancel button, on Escape and on the backdrop', async () => {
    const { fixture, host, root } = await mount();
    for (const trigger of ['button', 'escape', 'backdrop'] as const) {
      host.open.set(true);
      await fixture.whenStable();
      if (trigger === 'button') (root.querySelector('[data-testid="confirm-cancel"]') as HTMLElement).click();
      if (trigger === 'escape') {
        (root.querySelector('[role="alertdialog"]') as HTMLElement).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      }
      if (trigger === 'backdrop') (root.querySelector('[data-testid="confirm-backdrop"]') as HTMLElement).click();
      await fixture.whenStable();
    }
    expect(host.log).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('does not close when the click starts inside the dialog', async () => {
    const { fixture, host, root } = await mount();
    host.open.set(true);
    await fixture.whenStable();
    (root.querySelector('[role="alertdialog"]') as HTMLElement).click();
    await fixture.whenStable();
    expect(host.log).toEqual([]);
  });

  it('returns focus to the previously focused element on close', async () => {
    const { fixture, host, root } = await mount();
    const opener = root.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    host.open.set(true);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    host.open.set(false);
    await fixture.whenStable();
    expect(document.activeElement).toBe(opener);
  });
});
