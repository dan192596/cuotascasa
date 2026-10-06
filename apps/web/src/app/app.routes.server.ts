import { RenderMode, type ServerRoute } from '@angular/ssr';

/** Render mode of each route (ADR-0011 decision 3). Only Opus edits it (planned in W2-02). */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  { path: 'app', renderMode: RenderMode.Client },
  { path: 'app/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Client },
];
