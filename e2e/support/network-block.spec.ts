import { expect, test } from './test.ts';

/** Every external http(s) request is aborted by the shared fixture before it can leave the machine. */
for (const url of ['https://example.com/', 'https://oauth2.googleapis.com/x']) {
  test(`a fetch to ${url} is blocked by the client`, async ({ page }) => {
    const failures: string[] = [];
    page.context().on('requestfailed', (request) => {
      if (request.url() === url) failures.push(request.failure()?.errorText ?? '');
    });
    await page.goto('/privacidad');
    await expect(page.evaluate((target) => fetch(target), url)).rejects.toThrow();
    await expect.poll(() => failures.length).toBe(1);
    expect(failures[0]).toMatch(/blocked/i);
  });
}

test('same-origin, data: and blob: requests are not blocked', async ({ page }) => {
  await page.goto('/privacidad');
  const statuses = await page.evaluate(async () => [
    (await fetch('/manifest.webmanifest')).status,
    (await fetch('data:text/plain,hola')).status,
    (await fetch(URL.createObjectURL(new Blob(['hola'])))).status,
  ]);
  expect(statuses).toEqual([200, 200, 200]);
});
