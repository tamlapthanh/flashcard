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

  test('a saved change reaches the server about a second later', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Card Style' }).click();
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    const size = page.locator('.ced .bar input.num');
    const before = Number(await size.inputValue());
    await page.getByRole('button', { name: '+', exact: true }).click();
    await page.locator('.ced .save').click(); // nothing is sent until Save
    await expect.poll(async () => ((await apiSettings(request, 'bob')).settings?.cardText as any)?.word?.size, { timeout: 10_000 }).toBeCloseTo(before + 1, 1);
  });
});

test.describe('auto play: save voice files', () => {
  /* The e2e server has no SPEECH_SAVE_DIR, so it says saveVoice: false in /health; the switch only exists on a server that keeps voice files. */
  const healthSaysSaveVoice = (page: import('@playwright/test').Page, saveVoice: boolean) =>
    page.route('**/health', (route) => route.fulfill({ json: { ok: true, saveVoice } }));

  test('on a server that cannot save voice files the switch is not shown', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Auto play' }).click();
    await expect(page.getByRole('checkbox', { name: 'Read the word aloud' })).toBeVisible(); // the section is open ...
    await expect(page.getByRole('checkbox', { name: 'Save voice files' })).toHaveCount(0); // ... and the option is not in it
  });

  test('the switch is on by default, is saved with the other settings, and can be turned off', async ({ page, request }) => {
    await healthSaysSaveVoice(page, true);
    // the app pulls the saved settings once after sign-in and they replace the local ones: click only after that, or the pull can switch it back on
    const pulled = page.waitForResponse((r) => r.url().includes('/api/settings') && r.request().method() === 'GET');
    await openSignedIn(page, request, 'bob');
    await pulled;
    await page.waitForTimeout(300); // the pulled settings are applied right after the response
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Auto play' }).click();
    const sw = page.getByRole('checkbox', { name: 'Save voice files' });
    await expect(sw).toBeChecked();
    // a click that lands while the section is still opening can be lost: click again until the switch really is off
    await expect(async () => {
      if (await sw.isChecked()) await sw.click({ force: true });
      await expect(sw).not.toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    expect((await stored(page)).autoSaveVoice).toBe(false);
    await expect.poll(async () => (await apiSettings(request, 'bob')).settings?.autoSaveVoice, { timeout: 10_000 }).toBe(false);
  });
});

test.describe('handwriting: how strictly strokes are checked', () => {
  test('a setting of this device: chosen in Settings, kept after a reload, and not sent to the server', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Handwriting' }).click();
    const toggle = page.getByTestId('stroke-strictness');
    await expect(toggle.getByRole('button', { name: 'Normal' })).toHaveClass(/v-btn--active/); // the default
    await toggle.getByRole('button', { name: 'Loose' }).click();
    await expect(toggle.getByRole('button', { name: 'Loose' })).toHaveClass(/v-btn--active/);
    expect((await stored(page)).strokeStrictness).toBe('loose');

    // the change is pushed like any other, but without this key
    await expect.poll(async () => (await apiSettings(request, 'bob')).updatedAt, { timeout: 10_000 }).not.toBeNull();
    const onServer = (await apiSettings(request, 'bob')).settings ?? {};
    expect('strokeStrictness' in onServer).toBe(false);

    // after a reload (the settings are pulled from the server again) the choice is still there
    await page.reload();
    await page.locator('.sechead').filter({ hasText: 'Handwriting' }).click();
    await expect(page.getByTestId('stroke-strictness').getByRole('button', { name: 'Loose' })).toHaveClass(/v-btn--active/);
    expect((await stored(page)).strokeStrictness).toBe('loose');
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
    const kept = (await stored(page)).cardText?.word?.size;
    expect(kept === undefined || Math.abs(kept - start) < 0.01).toBe(true); // a draft: not stored yet
    await page.locator('.ced .save').click();
    expect((await stored(page)).cardText.word.size).toBeCloseTo(start + 1, 1);
    await kanji.click(); // Save closed the bar
    await page.getByRole('button', { name: 'reset', exact: true }).click();
    await expect(size).toHaveValue(String(start));
  });

  test('edits are a draft: Save and Cancel are off until something changes; Cancel drops the edit, Save keeps it once', async ({ page, request }) => {
    const save = page.locator('.ced .save');
    const cancel = page.locator('.ced .cancel');
    await expect(save).toBeDisabled();
    await expect(cancel).toBeDisabled();
    const kanji = page.locator('.ced .ed').filter({ hasText: '香り' }).first();
    await kanji.click();
    const size = page.locator('.ced .bar input.num');
    const start = Number(await size.inputValue());
    await page.getByRole('button', { name: '+', exact: true }).click();
    await expect(save).toBeEnabled();
    await expect(cancel).toBeEnabled();
    await cancel.click(); // back to what is saved
    await expect(save).toBeDisabled();
    await kanji.click();
    await expect(size).toHaveValue(String(start));
    const onServer = ((await apiSettings(request, 'bob')).settings?.cardText as any)?.word?.size;
    expect(onServer === undefined || Math.abs(onServer - start) < 0.01).toBe(true); // the dropped edit never reached the server
    await page.getByRole('button', { name: '+', exact: true }).click();
    await save.click();
    await expect(save).toBeDisabled(); // saved: nothing left to save
    await expect.poll(async () => ((await apiSettings(request, 'bob')).settings?.cardText as any)?.word?.size, { timeout: 10_000 }).toBeCloseTo(start + 1, 1);
  });

  test('the Full screen button makes the sample fill the window; a size can still be changed there; Esc leaves', async ({ page }) => {
    await page.locator('.ced .fullbtn').click();
    const ced = page.locator('.ced.full');
    await expect(ced).toBeVisible();
    const vp = page.viewportSize()!;
    const box = (await ced.boundingBox())!;
    expect(Math.round(box.width)).toBe(vp.width);
    expect(Math.round(box.height)).toBe(vp.height);
    const card = (await page.locator('.ced .pcard').boundingBox())!;
    expect(card.height).toBeGreaterThan(vp.height * 0.7); // the card takes the room that is left
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    await expect(page.locator('.ced .bar input.num')).toBeVisible();
    // the counter sits at the bottom of the screen: its bar opens above it and stays inside the window
    await page.locator('.ced .tools .ed').click();
    const bar = page.locator('.ced .bar');
    await expect(bar).toBeVisible();
    const b = (await bar.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ced.full')).toHaveCount(0);
  });

  test('the italic switch slants the text, is saved, and the English meaning starts italic', async ({ page }) => {
    const english = page.locator('.ced .ed').filter({ hasText: 'scent; aroma' }).first();
    await expect(english).toHaveCSS('font-style', 'italic');
    const kanji = page.locator('.ced .ed').filter({ hasText: '香り' }).first();
    await expect(kanji).toHaveCSS('font-style', 'normal');
    await kanji.click();
    await page.getByRole('button', { name: 'italic', exact: true }).click();
    await expect(kanji).toHaveCSS('font-style', 'italic');
    await page.locator('.ced .save').click();
    expect((await stored(page)).cardText.word.italic).toBe(true);
    await kanji.click(); // Save closed the bar
    await page.getByRole('button', { name: 'italic', exact: true }).click();
    await expect(kanji).toHaveCSS('font-style', 'normal');
  });

  test('the sample has what the study screen has: menu, Auto play, the eye marks, and labelled details on the back (Vietnamese is its own item, Sino-Vietnamese goes under each kanji)', async ({ page }) => {
    await expect(page.locator('.ced .top .gbtn')).toHaveCount(5); // menu + again / learned / skip / list
    await expect(page.locator('.ced .abtn')).toBeVisible();
    await expect(page.locator('.ced .tools .mk')).toHaveText(['あ', '漢', 'V', 'E']);
    await page.locator('.ced .chips .chip').first().click(); // Front -> Back
    await expect(page.locator('.ced .detail .lbl')).toHaveCount(8); // Sino-Viet, part of speech, Vietnamese, English, example, pitch, notes, related
    await expect(page.locator('.ced .detail .lbl').filter({ hasText: 'Vietnamese' })).toHaveCount(1);
    await page.locator('.ced .chips .chip', { hasText: 'Furigana' }).click(); // furigana on: the Sino-Vietnamese sits under the kanji
    await expect(page.locator('.ced .detail .back-head .hvr').first()).toHaveText('HƯƠNG');
    await expect(page.locator('.ced .detail .back-head .bside')).toHaveCount(0);
  });

  test('the Kanji sheet sample has the real sheet: no big kanji, the stroke player, On / Kun with values in one column, the info icon', async ({ page }) => {
    await page.locator('.ced .chips .chip', { hasText: 'Kanji sheet' }).click();
    await expect(page.locator('.ced .ksheet .kplayer')).toBeVisible();
    await expect(page.locator('.ced .ksheet .kglyph')).toHaveCount(0);
    await expect(page.locator('.ced .ksheet .kinfoico .mdi-information-outline')).toBeVisible();
    const [on, kun] = await Promise.all([
      page.locator('.ced .kreads .ed').nth(1).boundingBox(),
      page.locator('.ced .kreads .ed').nth(3).boundingBox()
    ]);
    expect(Math.abs(on!.x - kun!.x)).toBeLessThanOrEqual(1); // the two values start in the same column
  });

  test('the colour picker sets the colour of the text and of the saved setting', async ({ page }) => {
    await page.locator('.ced .ed').filter({ hasText: '香り' }).first().click();
    await page.locator('.ced .bar input.clr').fill('#336699');
    await expect(page.locator('.ced .ed').filter({ hasText: '香り' }).first()).toHaveCSS('color', 'rgb(51, 102, 153)');
    expect((await stored(page)).cardText.word.color).toBe(''); // still a draft
    await page.locator('.ced .save').click();
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
    await page.locator('.ced .save').click();
    expect((await stored(page)).cardText.word).toEqual({ size: 90, color: '#123456', italic: false });
    // the study screen reads the same settings into its custom properties (checked in session.spec.ts)
    await expect.poll(async () => ((await apiSettings(request, 'bob')).settings?.cardText as any)?.word?.size, { timeout: 10_000 }).toBe(90);
  });
});

test.describe('test: marking right away or at the end', () => {
  const sw = (page: import('@playwright/test').Page) => page.locator('.v-list-item').filter({ hasText: 'Mark test answers right away' }).locator('input[type=checkbox]');

  test('a setting of the user: on by default, switched off in Settings, saved on the server, kept after a reload', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'View' }).click();
    await expect(sw(page)).toBeChecked(); // the default: marked at once
    // a settings pull that is still on its way would put the old value back: switch off again until it holds
    await expect(async () => {
      await sw(page).setChecked(false, { force: true });
      await expect(sw(page)).not.toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    expect((await stored(page)).testInstantCheck).toBe(false);

    await expect.poll(async () => (await apiSettings(request, 'bob')).settings?.testInstantCheck, { timeout: 10_000 }).toBe(false);

    await page.reload();
    await page.locator('.sechead').filter({ hasText: 'View' }).click();
    await expect(sw(page)).not.toBeChecked();
  });
});
