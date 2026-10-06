import type { Routes } from '@angular/router';

/** Frozen route table of /app/prestamos/:id/proyecciones (W0-05). */
export const SCENARIOS_ROUTES: Routes = [
  {
    path: '',
    title: 'Proyecciones · CuotasCasa',
    loadComponent: () => import('./scenarios-page.component.ts').then((m) => m.ScenariosPageComponent),
  },
];
