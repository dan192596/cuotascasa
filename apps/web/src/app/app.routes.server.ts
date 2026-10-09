import { PrerenderFallback, RenderMode, type ServerRoute } from '@angular/ssr';

/** Render mode of each route (ADR-0011 decision 3). Only Opus edits it (planned in W2-02). */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'privacidad', renderMode: RenderMode.Prerender },
  { path: 'app', renderMode: RenderMode.Client },
  { path: 'app/**', renderMode: RenderMode.Client },
  {
    // The wildcard route of app.routes.ts renders the 404 page. Prerendering it once, as '/404', gives the edge its
    // static not-found document (ADR-0022 as amended by W2-02): the build emits 404/index.html and the post-build
    // step promotes it to /404.html. Every other unknown URL stays client-rendered.
    path: '**',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => [{ '**': '404' }],
    fallback: PrerenderFallback.Client,
  },
];
