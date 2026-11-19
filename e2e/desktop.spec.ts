import { expect, openSignedIn, richestDeck, startStudy, test, counter, type DeckInfo } from './fixtures';
import type { Page } from '@playwright/test';

/* Desktop only (project "desktop-chromium": a real mouse, hover, a wide window). The phone project skips this file. */
let deck: DeckInfo;

test.beforeEach(async ({ page, request }) => {
  const richest = await richestDeck(request, 'alice');
  test.skip(!richest || richest.counts.new + richest.counts.learning === 0, 'no new/learning cards in the local data');
  deck = richest!;
  await openSignedIn(page, request, 'alice');
});

/** Browses until the details of a card list at least `min` kanji (each is a button.k in a .hvp row); leaves the details open. */
async function findCardWithKanji(page: Page, min: number): Promise<number> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('ArrowUp'); // details
    const found = await page
      .locator('.hvp button.k')
      .first()
      .waitFor({ timeout: 1200 })
      .then(() => true, () => false);
    if (found && (await page.locator('.hvp button.k').count()) >= min) return page.locator('.hvp button.k').count();
    await page.keyboard.press('ArrowRight'); // closes the details and moves on
  }
  return 0;
}

test.describe('mouse hover on the buttons', () => {
  test('a main (green) button turns light green with brown text and sinks', async ({ page }) => {
    await startStudy(page, deck);
    const learned = page.getByRole('button', { name: 'Learned' });
    await learned.hover();
    await expect(learned).toHaveCSS('background-color', 'rgb(155, 227, 95)');
    await expect(learned).toHaveCSS('color', 'rgb(78, 52, 46)');
    await page.mouse.move(5, 400);
    await expect(learned).not.toHaveCSS('background-color', 'rgb(155, 227, 95)');
  });

  test('the round buttons inside the card turn pale mint', async ({ page }) => {
    await startStudy(page, deck);
    const eye = page.locator('.eye4');
    await eye.hover();
    await expect(eye).toHaveCSS('background-color', 'rgb(212, 245, 194)');
  });
});

test.describe('word list on a wide window', () => {
  test.beforeEach(async ({ page }) => {
    await startStudy(page, deck);
  });

  const open = async (page: Page): Promise<void> => {
    await counter(page).click();
    await expect(page.locator('.row').first()).toBeVisible();
  };

  test('the number of columns follows the width: 1 below 1200px, then 2 / 3 / 4 as they fit', async ({ page }) => {
    await open(page);
    const rows = page.locator('.rows');
    for (const [width, cols] of [
      [1000, '1'],
      [1250, '2'],
      [1700, '3'],
      [2300, '4']
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await expect(rows).toHaveCSS('--cols', cols);
      if (width >= 1200) {
        const tracks = await rows.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(tracks).toBe(Number(cols));
      }
    }
  });

  test('the colour changes line by line, not column by column', async ({ page }) => {
    await open(page);
    const rows = page.locator('.row');
    test.skip((await rows.count()) < 7, 'needs 7 rows');
    // 3 columns at 1700px: rows 1-3 light, rows 4-6 darker
    for (const i of [0, 1, 2]) await expect(rows.nth(i)).not.toHaveClass(/\balt\b/);
    for (const i of [3, 4, 5]) await expect(rows.nth(i)).toHaveClass(/\balt\b/);
    await expect(rows.nth(6)).not.toHaveClass(/\balt\b/);
  });

  test('the deck name and "x / N learned" are on the top line, the search box and the options gear show at once', async ({ page }) => {
    await open(page);
    const sheet = await page.locator('.sheet').boundingBox();
    const head = page.locator('.deckhead');
    await expect(head).toContainText(deck.name);
    await expect(head).toContainText(/\d+ \/ \d+ learned/);
    const box = await head.boundingBox();
    expect(box!.y - sheet!.y).toBeLessThan(20); // level with the grip and the magnifier
    await expect(page.getByPlaceholder('Search a word')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search options' })).toBeVisible();
  });
});

test.describe('kanji of a word side by side', () => {
  test.beforeEach(async ({ page }) => {
    await startStudy(page, deck);
  });

  test('every kanji is a column, with no chips, starting at the left edge', async ({ page }) => {
    const n = await findCardWithKanji(page, 2);
    test.skip(n < 2, 'no card with two kanji in the first 40 cards of the local data');
    await page.locator('.hvp button.k').first().click();
    const multi = page.locator('.multi');
    await expect(multi).toBeVisible();
    await expect(multi.locator('.kanji')).toHaveCount(n);
    await expect(page.locator('.sheet .v-chip-group')).toHaveCount(0);
    const fit = Math.max(1, Math.min(4, Math.floor(1700 / 400)));
    const cols = Math.ceil(n / Math.ceil(n / fit));
    const tracks = await multi.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(tracks).toBe(cols);
    const [sheet, first] = await Promise.all([page.locator('.sheet').boundingBox(), multi.locator('.kanji').first().boundingBox()]);
    expect(first!.x - sheet!.x).toBeLessThan(40); // left aligned, not centred
  });

  test('the last stroke of every kanji turns black after it is drawn', async ({ page }) => {
    const n = await findCardWithKanji(page, 1);
    test.skip(n < 1, 'no card with a kanji in the first 40 cards of the local data');
    await page.locator('.hvp button.k').first().click();
    await expect(page.locator('.kanji svg.big').first()).toBeVisible();
    await expect.poll(() => page.locator('.kanji .stroke.current').count(), { timeout: 25_000 }).toBe(0);
  });

  test('on a low window the kanji shrink instead of scrolling', async ({ page }) => {
    const n = await findCardWithKanji(page, 2);
    test.skip(n < 2, 'no card with two kanji in the first 40 cards of the local data');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1700, height: 520 });
    await page.keyboard.press('ArrowUp');
    await page.locator('.hvp button.k').first().click();
    const sheet = page.locator('.sheet');
    await expect(page.locator('.multi')).toBeVisible();
    await expect
      .poll(() => sheet.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 5000 })
      .toBeLessThanOrEqual(1);
    const zoom = Number(await page.locator('.multi').evaluate((el) => getComputedStyle(el).zoom));
    expect(zoom).toBeLessThanOrEqual(1);
    expect(zoom).toBeGreaterThanOrEqual(0.4);
  });

  test('a narrow window (under 800px) goes back to one kanji at a time with chips', async ({ page }) => {
    const n = await findCardWithKanji(page, 2);
    test.skip(n < 2, 'no card with two kanji in the first 40 cards of the local data');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 700, height: 900 });
    await page.keyboard.press('ArrowUp');
    await page.locator('.hvp button.k').first().click();
    await expect(page.locator('.sheet .v-chip-group')).toBeVisible();
    await expect(page.locator('.multi')).toHaveCount(0);
  });
});

test.describe('the same margins on every screen', () => {
  test('decks, settings and the "no study session" page start 12px from the left edge', async ({ page }) => {
    const left = async (selector: string): Promise<number> => (await page.locator(selector).first().boundingBox())!.x;
    await expect(page.locator('button.deck').first()).toBeVisible();
    expect(await left('button.deck')).toBeCloseTo(12, 0);
    await page.evaluate(() => (location.hash = '#/settings'));
    await expect(page.locator('.sechead').first()).toBeVisible();
    expect(await left('.sechead')).toBeCloseTo(12, 0);
    await page.evaluate(() => (location.hash = '#/study'));
    await expect(page.getByRole('button', { name: 'Choose a deck' }).or(page.getByText('Deck finished').first())).toBeVisible();
    const info = page.locator('.infodeck');
    if (await info.count()) expect(await left('.infodeck')).toBeCloseTo(12, 0);
  });
});
