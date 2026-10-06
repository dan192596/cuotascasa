import type { Routes } from '@angular/router';

/** Frozen route table of /app/prestamos/:id/tabla (W0-05). */
export const SCHEDULE_ROUTES: Routes = [
  {
    path: '',
    title: 'Tabla de amortización · CuotasCasa',
    loadComponent: () => import('./schedule-page.component.ts').then((m) => m.SchedulePageComponent),
  },
];
