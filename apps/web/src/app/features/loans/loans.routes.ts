import type { Routes } from '@angular/router';

/** Frozen route table of /app/prestamos (W0-05): '' → /app, nuevo → wizard/ (W4-07), :id → detail/ (W5-01). */
export const LOANS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/app' },
  {
    path: 'nuevo',
    title: 'Nuevo préstamo · CuotasCasa',
    loadComponent: () => import('./wizard/loan-wizard-page.component.ts').then((m) => m.LoanWizardPageComponent),
  },
  {
    path: ':id',
    title: 'Préstamo · CuotasCasa',
    loadComponent: () => import('./detail/loan-detail-page.component.ts').then((m) => m.LoanDetailPageComponent),
  },
];
