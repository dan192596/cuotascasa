import type { Routes } from '@angular/router';

/** Frozen route table of /app/ajustes (W0-05). */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    title: 'Ajustes · CuotasCasa',
    loadComponent: () => import('./settings-page.component.ts').then((m) => m.SettingsPageComponent),
  },
];
