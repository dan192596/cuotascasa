/** True for `/app` and everything under it (`/app/…`, `/app?…`, `/app#…`); false for `/application`, `/` and the rest. */
export function isAppUrl(url: string): boolean {
  return url === '/app' || url.startsWith('/app/') || url.startsWith('/app?') || url.startsWith('/app#');
}
