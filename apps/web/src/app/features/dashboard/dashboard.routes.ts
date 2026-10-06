import type { Routes } from '@angular/router';

/** Frozen route table of /app (W0-05). */
export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'Mis préstamos · CuotasCasa',
    loadComponent: () => import('./dashboard-page.component.ts').then((m) => m.DashboardPageComponent),
  },
];
