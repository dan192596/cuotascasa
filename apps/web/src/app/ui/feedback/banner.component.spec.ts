import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BannerComponent, type BannerTone } from './banner.component.ts';

@Component({
  imports: [BannerComponent],
  template: `
    <cc-banner [tone]="tone()" [dismissible]="dismissible()" (dismissed)="count.set(count() + 1)">
      Este archivo no va cifrado.
    </cc-banner>
  `,
})
class HostComponent {
  readonly tone = signal<BannerTone>('warning');
  readonly dismissible = signal(true);
  readonly count = signal(0);
}

async function mount() {
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  return { fixture, host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('cc-banner', () => {
  it('renders the projected message with a text tone label and an icon', async () => {
    const { root } = await mount();
    expect(root.textContent).toContain('Este archivo no va cifrado.');
    expect(root.querySelector('[data-testid="banner-tone"]')?.textContent?.trim()).toBe('Advertencia');
    expect(root.querySelector('[data-testid="banner-icon"]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['info', 'status', 'Información'],
    ['success', 'status', 'Listo'],
    ['warning', 'alert', 'Advertencia'],
    ['danger', 'alert', 'Error'],
  ] as const)('%s uses role %s and the label %s', async (tone, role, label) => {
    const { fixture, host, root } = await mount();
    host.tone.set(tone);
    await fixture.whenStable();
    expect(root.querySelector(`[role="${role}"]`)).not.toBeNull();
    expect(root.querySelector('[data-testid="banner-tone"]')?.textContent?.trim()).toBe(label);
  });

  it('emits dismissed once and removes itself when the close button is pressed', async () => {
    const { fixture, host, root } = await mount();
    const button = root.querySelector('button[data-testid="banner-dismiss"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Cerrar aviso');
    button.click();
    await fixture.whenStable();
    expect(host.count()).toBe(1);
    expect(root.querySelector('[data-testid="banner"]')).toBeNull();
  });

  it('has no close button when it is not dismissible', async () => {
    const { fixture, host, root } = await mount();
    host.dismissible.set(false);
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="banner-dismiss"]')).toBeNull();
  });
});
