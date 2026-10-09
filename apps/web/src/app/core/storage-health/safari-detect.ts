/** Injectable view of the browser facts needed to detect Safari running in a tab (ADR-0017). */
export interface BrowserProbe {
  readonly userAgent: string;
  /** matchMedia('(display-mode: standalone)').matches */
  readonly displayModeStandalone: boolean;
  /** iOS-only navigator.standalone; undefined elsewhere. */
  readonly navigatorStandalone: boolean | undefined;
}

const NOT_SAFARI = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|EdgA|OPR|Opera|OPiOS|Android|Firefox/;

/** True for Safari (desktop or iOS) in a normal tab, where ITP can erase script-written storage. */
export function isSafariNonStandalone(probe: BrowserProbe): boolean {
  const ua = probe.userAgent;
  const isSafari = /Safari\//.test(ua) && /Version\//.test(ua) && !NOT_SAFARI.test(ua);
  if (!isSafari) return false;
  return !(probe.displayModeStandalone || probe.navigatorStandalone === true);
}
