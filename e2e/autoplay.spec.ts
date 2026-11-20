import type { Page } from '@playwright/test';
import { apiDeck, apiPutSettings, apiSettings, counter, expect, openSignedIn, resetSettings, richestDeck, startStudy, test, type DeckInfo } from './fixtures';

/* Auto play: front for N seconds, answer side for M seconds, next card; browsing only, nothing is graded. bob is used, with short
   times and the voice off so the tests are quick and quiet; every test leaves bob with nothing saved. */
const play = (page: Page) => page.getByRole('button', { name: /^(Auto play|Pause auto play)$/ });
/* Auto play lives in the fan of the speaker button: open it, then tap the option. */
const tapPlay = async (page: Page) => {
  await page.getByRole('button', { name: 'Auto play options' }).click();
  await play(page).click();
};
const pause = (page: Page) => page.getByRole('button', { name: 'Pause auto play' });
const headword = async (page: Page): Promise<string> => ((await page.locator('.wordbody').innerText()).split('\n')[0] ?? '').trim();

test.describe('auto play', () => {
  let deck: DeckInfo;

  test.beforeEach(async ({ page, request }) => {
    const richest = await richestDeck(request, 'bob');
    test.skip(!richest || richest.counts.new + richest.counts.learning < 3, 'needs at least three new/learning cards');
    deck = richest!;
    await apiPutSettings(request, 'bob', { autoFrontSec: 1, autoBackSec: 1, autoSpeak: false });
    await openSignedIn(page, request, 'bob');
    await startStudy(page, deck);
  });

  test.afterEach(async ({ request }) => {
    await resetSettings(request, 'bob');
  });

  test('the play button starts it, the cards change by themselves, the pause button stops it', async ({ page }) => {
    const first = await headword(page);
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false');
    await tapPlay(page);
    await expect(pause(page)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => headword(page), { timeout: 12_000 }).not.toBe(first); // moved on to another card

    await pause(page).click();
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false');
    const stopped = await headword(page);
    await page.waitForTimeout(2800); // longer than a whole front + answer cycle
    expect(await headword(page)).toBe(stopped); // really stopped
  });

  test('the A key plays and pauses', async ({ page }) => {
    await page.keyboard.press('a');
    await expect(pause(page)).toBeVisible();
    await page.keyboard.press('a');
    await expect(play(page)).toBeVisible();
  });

  test('a browse key, the word list or a tap on the card stops it', async ({ page }) => {
    await tapPlay(page);
    await expect(pause(page)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(play(page)).toBeVisible();

    await tapPlay(page);
    await expect(pause(page)).toBeVisible();
    await counter(page).click(); // opens the word list
    await expect(play(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await tapPlay(page);
    await expect(pause(page)).toBeVisible();
    await page.locator('.wordarea').click({ position: { x: 10, y: 10 } });
    await expect(play(page)).toBeVisible();
  });

  test('it only browses: nothing is graded on the server', async ({ page, request }) => {
    const before = (await apiDeck(request, 'bob', deck.id)).counts;
    const position = (await counter(page).innerText()).trim();
    await tapPlay(page);
    await page.waitForTimeout(4500); // two or three cards go by
    await pause(page).click();
    expect((await apiDeck(request, 'bob', deck.id)).counts).toEqual(before);
    const after = (await counter(page).innerText()).trim();
    expect(after).not.toBe(position); // the counter follows the browsing: "n" is the card on screen
    expect(after.split('/')[1]!.trim()).toBe(position.split('/')[1]!.trim()); // the total of the run stays
  });
});

test.describe('auto play: one pass, then it stops', () => {
  test('after every card was shown once it stops and says so', async ({ page, request }) => {
    const richest = await richestDeck(request, 'bob');
    test.skip(!richest || richest.counts.new + richest.counts.learning < 2, 'needs at least two new/learning cards');
    await apiPutSettings(request, 'bob', { autoFrontSec: 1, autoBackSec: 1, autoSpeak: false });
    // a run of only two cards: a whole pass takes about four seconds
    await page.route('**/api/cards?*', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { total: number; cards: unknown[] };
      await route.fulfill({ response: res, json: { ...body, total: 2, cards: body.cards.slice(0, 2) } });
    });
    await openSignedIn(page, request, 'bob');
    await startStudy(page, richest!);
    await expect(counter(page)).toContainText('/ 2');
    await tapPlay(page);
    await expect(page.getByText('Auto play finished')).toBeVisible({ timeout: 15_000 });
    await expect(play(page)).toHaveAttribute('aria-pressed', 'false');
    await resetSettings(request, 'bob');
  });
});

test.describe('auto play settings', () => {
  test.afterEach(async ({ request }) => {
    await resetSettings(request, 'bob');
  });

  test('the times and the voice switch are in Settings, saved with the user, and kept within 1 to 30 seconds', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await page.goto('/#/settings');
    await page.locator('.sechead').filter({ hasText: 'Auto play' }).click();
    const front = page.getByTestId('auto-front');
    const back = page.getByTestId('auto-back');
    await expect(front).toHaveText('3 s'); // defaults: 3 s on the front, 4 s on the answer
    await expect(back).toHaveText('4 s');

    await page.getByRole('button', { name: 'Front side +' }).click();
    await expect(front).toHaveText('4 s');
    await page.getByRole('button', { name: 'Answer side −' }).click();
    await expect(back).toHaveText('3 s');
    await expect.poll(async () => (await apiSettings(request, 'bob')).settings?.autoFrontSec, { timeout: 10_000 }).toBe(4);
    expect((await apiSettings(request, 'bob')).settings?.autoBackSec).toBe(3);

    const voice = page.getByRole('checkbox', { name: 'Read the word aloud' });
    await expect(voice).toBeChecked();
    await voice.click({ force: true });
    await expect.poll(async () => (await apiSettings(request, 'bob')).settings?.autoSpeak, { timeout: 10_000 }).toBe(false);

    // the limits: the minus button is disabled at 1 s, the plus button at 30 s
    await apiPutSettings(request, 'bob', { autoFrontSec: 1, autoBackSec: 30 });
    await page.reload();
    await page.locator('.sechead').filter({ hasText: 'Auto play' }).click();
    await expect(page.getByRole('button', { name: 'Front side −' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Answer side +' })).toBeDisabled();
  });

  test('values outside the limits are clamped when the app loads them', async ({ page, request }) => {
    await apiPutSettings(request, 'bob', { autoFrontSec: 999, autoBackSec: -5 });
    await openSignedIn(page, request, 'bob');
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('flashmobile.settings') ?? '{}') as { autoFrontSec?: number; autoBackSec?: number }), { timeout: 10_000 })
      .toMatchObject({ autoFrontSec: 30, autoBackSec: 1 });
  });
});

/* "Save voice files": with the switch off, auto play asks the server for each word with save=0 (the server plays it but keeps no file);
   with it on (the default) there is no such parameter. The speaker button is not affected. The server is stubbed: no real voice. */
test.describe('auto play: save voice files', () => {
  let deck: DeckInfo;
  let speechUrls: string[];

  test.beforeEach(async ({ page, request }) => {
    const richest = await richestDeck(request, 'bob');
    test.skip(!richest || richest.counts.new + richest.counts.learning < 3, 'needs at least three new/learning cards');
    deck = richest!;
    speechUrls = [];
    await page.route('**/api/speech*', async (route) => {
      speechUrls.push(route.request().url());
      await route.fulfill({ status: 404, json: { error: 'speech is not enabled' } }); // the device voice takes over
    });
  });

  test.afterEach(async ({ request }) => {
    await resetSettings(request, 'bob');
  });

  async function runAutoPlay(page: Page, request: import('@playwright/test').APIRequestContext, autoSaveVoice: boolean): Promise<void> {
    await apiPutSettings(request, 'bob', { autoFrontSec: 1, autoBackSec: 1, autoSpeak: true, naturalVoice: true, autoSaveVoice });
    await openSignedIn(page, request, 'bob');
    await startStudy(page, deck);
    test.skip(!(await page.locator('.speak').isVisible()), 'the speaker button only shows when the browser can speak');
    await tapPlay(page);
    await expect.poll(() => speechUrls.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await pause(page).click();
  }

  test('switched off: every word auto play asks for carries save=0', async ({ page, request }) => {
    await runAutoPlay(page, request, false);
    expect(speechUrls.every((u) => new URL(u).searchParams.get('save') === '0')).toBe(true);
  });

  test('switched on (the default): no save parameter, so the server keeps its files as before', async ({ page, request }) => {
    await runAutoPlay(page, request, true);
    expect(speechUrls.every((u) => !new URL(u).searchParams.has('save'))).toBe(true);
  });
});
