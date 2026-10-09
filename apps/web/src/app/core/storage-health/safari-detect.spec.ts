import { describe, expect, it } from 'vitest';
import { isSafariNonStandalone, type BrowserProbe } from './safari-detect.ts';

const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/130.0.0.0`;
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0';

const probe = (userAgent: string, over: Partial<BrowserProbe> = {}): BrowserProbe => ({
  userAgent,
  displayModeStandalone: false,
  navigatorStandalone: undefined,
  ...over,
});

describe('isSafariNonStandalone', () => {
  it.each([
    ['Safari macOS tab', probe(SAFARI_MAC), true],
    ['Safari iOS tab', probe(SAFARI_IOS, { navigatorStandalone: false }), true],
    ['Chrome', probe(CHROME), false],
    ['Edge', probe(EDGE), false],
    ['Chrome Android', probe(CHROME_ANDROID), false],
    ['Firefox', probe(FIREFOX), false],
    ['Safari iOS installed (navigator.standalone)', probe(SAFARI_IOS, { navigatorStandalone: true }), false],
    ['Safari macOS installed (display-mode)', probe(SAFARI_MAC, { displayModeStandalone: true }), false],
    ['Chrome installed standalone', probe(CHROME, { displayModeStandalone: true }), false],
    ['empty UA', probe(''), false],
  ])('%s -> %s', (_name, p, expected) => {
    expect(isSafariNonStandalone(p)).toBe(expected);
  });
});
