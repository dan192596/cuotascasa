/** Frozen central route table (W0-05; only Opus edits it). Every page is a lazy route. */
import type { Routes } from '@angular/router';
import { ISSUES_URL } from '../environments/build-constants.ts';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'CuotasCasa',
    loadComponent: () => import('./public/landing/landing-page.component.ts').then((m) => m.LandingPageComponent),
  },
  {
    path: 'privacidad',
    title: 'Privacidad · CuotasCasa',
    // withComponentInputBinding() hands it to PrivacyPageComponent.issuesUrl: public/ cannot import environments/.
    data: { issuesUrl: ISSUES_URL },
    loadComponent: () => import('./public/privacy/privacy-page.component.ts').then((m) => m.PrivacyPageComponent),
  },
  {
    path: 'app',
    loadChildren: () => import('./app-area.routes.ts').then((m) => m.APP_AREA_ROUTES),
  },
  {
    path: '**',
    title: 'Página no encontrada · CuotasCasa',
    loadComponent: () => import('./public/not-found/not-found-page.component.ts').then((m) => m.NotFoundPageComponent),
  },
];
