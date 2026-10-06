/**
 * Frozen route table of /app (W0-05; only Opus edits it, planned in W2-02). Loaded lazily from app.routes.ts, so the
 * data providers and every feature stay out of the graph of '/' (ADR-0011 decision 5).
 */
import type { Routes } from '@angular/router';
import { provideStorageHealth } from './core/storage-health/provide-storage-health.ts';
import { provideAppData } from './data/provide-app-data.ts';

export const APP_AREA_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./core/shell/app-shell.component.ts').then((m) => m.AppShellComponent),
    providers: [provideAppData(), provideStorageHealth()],
    children: [
      {
        path: 'prestamos/:id/tabla',
        loadChildren: () => import('./features/schedule/schedule.routes.ts').then((m) => m.SCHEDULE_ROUTES),
      },
      {
        path: 'prestamos/:id/datos-reales',
        loadChildren: () => import('./features/real-data/real-data.routes.ts').then((m) => m.REAL_DATA_ROUTES),
      },
      {
        path: 'prestamos/:id/proyecciones',
        loadChildren: () => import('./features/scenarios/scenarios.routes.ts').then((m) => m.SCENARIOS_ROUTES),
      },
      {
        path: 'prestamos',
        loadChildren: () => import('./features/loans/loans.routes.ts').then((m) => m.LOANS_ROUTES),
      },
      {
        path: 'ajustes',
        loadChildren: () => import('./features/settings/settings.routes.ts').then((m) => m.SETTINGS_ROUTES),
      },
      {
        path: '',
        loadChildren: () => import('./features/dashboard/dashboard.routes.ts').then((m) => m.DASHBOARD_ROUTES),
      },
    ],
  },
];
