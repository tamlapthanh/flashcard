import { apiSettings, apiPutSettings, expect, openSignedIn, resetSettings, test } from './fixtures';

/* Settings are kept per user on the server (the "settings" tab of the Google Sheet in production). bob is used for everything
   that writes, and every test leaves bob with nothing saved. */
test.afterEach(async ({ request }) => {
  await resetSettings(request, 'bob');
});

const stored = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('flashmobile.settings') ?? '{}') as Record<string, any>);

test.describe('settings on the server', () => {
  test('PUT keeps only the known keys (not the web-only tooltip switch) and GET gives them back', async ({ request }) => {
    expect(await apiPutSettings(request, 'bob', { dark: true, language: 'vi', showTooltips: false, evil: 1 })).toBe(200);
    const saved = await apiSettings(request, 'bob');
    expect(saved.settings).toEqual({ dark: true, language: 'vi' });
    expect(saved.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/); // stamped by the server
  });

  test('a body that is not an object is refused', async ({ request }) => {
    expect(await apiPutSettings(request, 'bob', [1, 2])).toBe(400);
    expect(await apiPutSettings(request, 'bob', 'x')).toBe(400);
  });

  test('every user has their own settings', async ({ request }) => {
    await apiPutSettings(request, 'bob', { language: 'vi' });
    const alice = await apiSettings(request, 'alice');
    expect(alice.settings?.language).not.toBe('vi');
  });

  test('without a token the server refuses', async ({ request }) => {
    const { API_URL } = await import('../playwright.config');
    expect((await request.get(`${API_URL}/api/settings`)).status()).toBe(401);
    expect((await request.put(`${API_URL}/api/settings`, { data: { settings: {} } })).status()).toBe(401);
  });
});

test.describe('settings sync in the app', () => {
  test('after login the settings saved on the server are pulled and kept on this device', async ({ page, request }) => {
    await apiPutSettings(request, 'bob', { dark: true, language: 'vi', cardText: { word: { size: 77, color: '' } } });
    await openSignedIn(page, request, 'bob');
    await expect.poll(async () => (await stored(page)).dark, { timeout: 10_000 }).toBe(true);
    const local = await stored(page);
    expect(local.language).toBe('vi');
    expect(local.cardText.word.size).toBe(77);
  });

  test('a change made in the app reaches the server about a second later', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Card Style' }).click();
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    const size = page.locator('.ced .bar input.num');
    const before = Number(await size.inputValue());
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect.poll(async () => ((await apiSettings(request, 'bob')).settings?.cardText as any)?.word?.size, { timeout: 10_000 }).toBeCloseTo(before + 1, 1);
  });
});

test.describe('card text size and colour editor', () => {
  test.beforeEach(async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Card Style' }).click();
  });

  test('tapping a text shows its bar; + and the reset button change and restore the size', async ({ page }) => {
    const kanji = page.locator('.ced .ed').filter({ hasText: '香り' }).first();
    await expect(page.locator('.ced .bar')).toHaveCount(0);
    await kanji.click();
    const size = page.locator('.ced .bar input.num');
    await expect(size).toBeVisible();
    const start = Number(await size.inputValue());
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(size).toHaveValue(String(Math.round((start + 1) * 10) / 10));
    expect((await stored(page)).cardText.word.size).toBeCloseTo(start + 1, 1);
    await page.getByRole('button', { name: 'reset' }).click();
    await expect(size).toHaveValue(String(start));
  });

  test('the colour picker sets the colour of the text and of the saved setting', async ({ page }) => {
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    await page.locator('.ced .bar input.clr').fill('#336699');
    await expect(page.locator('.ced .ed').filter({ hasText: '香り' }).first()).toHaveCSS('color', 'rgb(51, 102, 153)');
    expect((await stored(page)).cardText.word.color).toBe('#336699');
  });

  test('the main kanji has one size for the front and the back of the card', async ({ page }) => {
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    const size = page.locator('.ced .bar input.num');
    await page.getByRole('button', { name: '+', exact: true }).click();
    const changed = await size.inputValue();
    await page.locator('.ced .chips .chip').first().click(); // Front -> Back
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    await expect(page.locator('.ced .bar input.num')).toHaveValue(changed);
  });

  test('the sample is a copy of the study screen: counter between the eye and the speaker', async ({ page }) => {
    await expect(page.locator('.ced .pcard')).toBeVisible();
    const [eye, counter, speaker] = await Promise.all(
      [page.locator('.ced .tools .gbtn').first(), page.locator('.ced .tools .ed'), page.locator('.ced .tools .gbtn').last()].map((l) => l.boundingBox())
    );
    expect(eye!.x + eye!.width).toBeLessThanOrEqual(counter!.x + 1);
    expect(counter!.x + counter!.width).toBeLessThanOrEqual(speaker!.x + 1);
  });

  test('size and colour changed here are what the study screen uses', async ({ page, request }) => {
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    await page.locator('.ced .bar input.clr').fill('#123456');
    await page.locator('.ced .bar input.num').fill('90');
    await page.locator('.ced .bar input.num').dispatchEvent('change');
    expect((await stored(page)).cardText.word).toEqual({ size: 90, color: '#123456' });
    // the study screen reads the same settings into its custom properties (checked in session.spec.ts)
    await expect.poll(async () => ((await apiSettings(request, 'bob')).settings?.cardText as any)?.word?.size, { timeout: 10_000 }).toBe(90);
  });
});
