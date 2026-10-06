/**
 * Build-time constants (W0-05; only W3-17 edits this file). angular.json defines GOOGLE_CLIENT_ID and
 * REPOSITORY_ISSUES_URL as '' in every configuration; the deploy (W3-17) overrides them with
 * `ng build --define GOOGLE_CLIENT_ID="'<id>'"`. Never commit a real value (ADR-0015).
 */
declare const GOOGLE_CLIENT_ID: string | undefined;
declare const REPOSITORY_ISSUES_URL: string | undefined;

/** OAuth web client ID for Google Identity Services. '' means Drive is 'no configurado' (W4-09). */
export const GOOGLE_OAUTH_CLIENT_ID: string = typeof GOOGLE_CLIENT_ID === 'string' ? GOOGLE_CLIENT_ID : '';

/** Public GitHub Issues URL shown as the contact on /privacidad (W4-05). '' until the deploy injects it. */
export const ISSUES_URL: string = typeof REPOSITORY_ISSUES_URL === 'string' ? REPOSITORY_ISSUES_URL : '';
