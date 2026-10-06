import type { Routes } from '@angular/router';

/** Frozen route table of /app/prestamos/:id/datos-reales (W0-05). */
export const REAL_DATA_ROUTES: Routes = [
  {
    path: '',
    title: 'Datos reales · CuotasCasa',
    loadComponent: () => import('./real-data-page.component.ts').then((m) => m.RealDataPageComponent),
  },
];
