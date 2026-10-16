import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteLoanDialogComponent } from './delete-loan-dialog.component.ts';

async function setup(open = true) {
  const fixture = TestBed.createComponent(DeleteLoanDialogComponent);
  fixture.componentRef.setInput('open', open);
  fixture.componentRef.setInput('alias', 'Casa A');
  const confirmed = vi.fn();
  const cancelled = vi.fn();
  fixture.componentInstance.confirmed.subscribe(confirmed);
  fixture.componentInstance.cancelled.subscribe(cancelled);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const input = () => root.querySelector<HTMLInputElement>('input');
  const ok = () => root.querySelector<HTMLButtonElement>('[data-testid="delete-confirm"]');
  const type = async (text: string) => {
    const field = input() as HTMLInputElement;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, root, input, ok, type, confirmed, cancelled };
}

beforeEach(() => TestBed.resetTestingModule());

describe('DeleteLoanDialogComponent', () => {
  it('renders nothing while closed', async () => {
    const { root } = await setup(false);
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('is a labelled modal alertdialog that names what will be lost', async () => {
    const { root } = await setup();
    const dialog = root.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = root.querySelector(`#${dialog.getAttribute('aria-labelledby') ?? ''}`);
    expect(title?.textContent).toContain('Eliminar');
    const description = root.querySelector(`#${dialog.getAttribute('aria-describedby') ?? ''}`);
    expect(description?.textContent).toContain('Casa A');
    expect(description?.textContent).toContain('eventos');
  });

  it('puts focus on the alias field, which has a visible label', async () => {
    const { root, input, fixture } = await setup(false);
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(input());
    const label = root.querySelector(`label[for="${input()?.id ?? ''}"]`);
    expect(label?.textContent).toContain('Casa A');
  });

  it('keeps the destructive button disabled until the alias is typed exactly (spaces around are ignored)', async () => {
    const { ok, type } = await setup();
    expect(ok()?.disabled).toBe(true);
    await type('casa a');
    expect(ok()?.disabled).toBe(true);
    await type('Casa');
    expect(ok()?.disabled).toBe(true);
    await type('  Casa A  ');
    expect(ok()?.disabled).toBe(false);
  });

  it('confirms only with the alias typed, and cancels with the button or Escape', async () => {
    const { ok, type, confirmed, cancelled, root, fixture } = await setup();
    ok()?.click();
    expect(confirmed).not.toHaveBeenCalled();
    await type('Casa A');
    ok()?.click();
    expect(confirmed).toHaveBeenCalledTimes(1);
    root.querySelector<HTMLButtonElement>('[data-testid="delete-cancel"]')?.click();
    expect(cancelled).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(cancelled).toHaveBeenCalledTimes(2);
  });

  it('forgets the typed text when it is reopened and blocks the button while busy', async () => {
    const { fixture, ok, type, input } = await setup();
    await type('Casa A');
    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    expect(ok()?.disabled).toBe(true);
    fixture.componentRef.setInput('busy', false);
    fixture.componentRef.setInput('open', false);
    await fixture.whenStable();
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    expect(input()?.value).toBe('');
    expect(ok()?.disabled).toBe(true);
  });
});
