import { expect, gridIsSquare, openSignedIn, richestDeck, startStudy, test, counter, type DeckInfo } from './fixtures';
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
  test('a main (green) button turns light green and sinks (the top-bar buttons keep their white text)', async ({ page }) => {
    await startStudy(page, deck);
    const learned = page.getByRole('button', { name: 'Learned' });
    await learned.hover();
    await expect(learned).toHaveCSS('background-color', 'rgb(155, 227, 95)');
    await expect(learned).toHaveCSS('color', 'rgb(255, 255, 255)'); // .act buttons have a colour of their own (StudyView); only the plain green buttons (Start, ...) turn the text brown
    await page.mouse.move(5, 400);
    await expect(learned).not.toHaveCSS('background-color', 'rgb(155, 227, 95)');
  });

  test('the round buttons inside the card turn pale mint', async ({ page }) => {
    await startStudy(page, deck);
    const eye = page.locator('.eye4:not(.speak)'); // the speaker button is an .eye4 too
    await eye.hover();
    await expect(eye).toHaveCSS('background-color', 'rgb(212, 245, 194)');
  });
});

test.describe('word list on a wide window', () => {
  test.beforeEach(async ({ page }) => {
    await startStudy(page, deck);
  });

  /* The word list is a grid of squares (.ktile in .rows.kgrid), one per word. */
  const open = async (page: Page): Promise<void> => {
    await counter(page).click();
    await expect(page.locator('.rows.kgrid .ktile').first()).toBeVisible();
  };

  test('at every window width the squares stay square, of one size, and fill the width of the list', async ({ page }) => {
    await open(page);
    const grid = page.locator('.rows.kgrid');
    for (const width of [1000, 1250, 1700, 2300]) {
      await page.setViewportSize({ width, height: 900 });
      await gridIsSquare(page);
      // one row of squares (and the 1px gaps) spans the inner width of the list: no empty band on the right
      const { inner, used } = await grid.evaluate((el) => {
        const cs = getComputedStyle(el);
        const cols = Number(cs.getPropertyValue('--kcols'));
        const size = (el.querySelector('.ktile') as HTMLElement).getBoundingClientRect().width;
        return { inner: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), used: cols * size + (cols - 1) };
      });
      expect(Math.abs(inner - used)).toBeLessThan(2); // the square size is rounded down to 0.01px
    }
  });

  test('a click on a square marks it as the one looked at last (another background)', async ({ page }) => {
    await open(page);
    const tiles = page.locator('.ktile');
    test.skip((await tiles.count()) < 2, 'needs two words');
    await tiles.nth(1).click();
    await expect(tiles.nth(1)).toHaveClass(/\bseen\b/);
    await expect(tiles.nth(0)).not.toHaveClass(/\bseen\b/);
  });

  test('the deck name and "N cards" are on the top line; the magnifier shows the search box and the options gear', async ({ page }) => {
    await open(page);
    const sheet = await page.locator('.sheet').boundingBox();
    const head = page.locator('.deckhead');
    await expect(head.locator('.dname')).toHaveText(deck.name);
    await expect(head.locator('.dcount').first()).toHaveText(/^\d+ cards$/);
    const box = await head.boundingBox();
    expect(box!.y - sheet!.y).toBeLessThan(20); // level with the grip and the magnifier
    const search = page.getByPlaceholder('Search a word');
    await expect(search).toHaveCount(0); // hidden from the start, on the web too
    await page.getByRole('button', { name: 'Search a word', exact: true }).click();
    await expect(search).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search options' })).toBeVisible();
  });
});

test.describe('kanji of a word side by side', () => {
  test.beforeEach(async ({ page }) => {
    await startStudy(page, deck);
  });

  test('every kanji is a column, with no chips, the first one in the left half', async ({ page }) => {
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
    expect(first!.x).toBeLessThan(sheet!.x + sheet!.width / 2); // the first kanji is in the left half; each kanji is centred in its own column (max 520px), so it is not at the very edge
  });

  test('the last stroke of every kanji turns black after it is drawn', async ({ page }) => {
    const n = await findCardWithKanji(page, 1);
    test.skip(n < 1, 'no card with a kanji in the first 40 cards of the local data');
    await page.locator('.hvp button.k').first().click();
    await expect(page.locator('.kanji svg.big').first()).toBeVisible();
    await expect.poll(() => page.locator('.kanji .stroke.current').count(), { timeout: 25_000 }).toBe(0);
  });

  test('on a low window the sheet stays inside the screen and scrolls (the kanji are not shrunk)', async ({ page }) => {
    // The details of a kanji are long now (stroke strip, memory hint, component graph): the sheet scrolls instead of the kanji shrinking.
    // the low window first, then the card: closing and opening the details again could land on another card (with one kanji)
    await page.setViewportSize({ width: 1700, height: 360 }); // the compact sheet fits in 520px now, so use a window it cannot fit in
    const n = await findCardWithKanji(page, 2);
    test.skip(n < 2, 'no card with two kanji in the first 40 cards of the local data');
    await page.locator('.hvp button.k').first().click();
    const sheet = page.locator('.sheet');
    await expect(page.locator('.multi')).toBeVisible();
    await expect.poll(() => sheet.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 5000 }).toBeGreaterThan(1); // it scrolls
    const box = await sheet.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(360 * 0.95 + 1); // never taller than 95% of the window
    const zoom = Number(await page.locator('.multi').evaluate((el) => getComputedStyle(el).zoom));
    expect(zoom).toBe(1);
  });

  test('a narrow window (under 800px) goes back to one kanji at a time with chips', async ({ page }) => {
    // the narrow window first, then the card: closing and opening the details again can land on another card (with one kanji: no chips)
    await page.setViewportSize({ width: 700, height: 900 });
    const n = await findCardWithKanji(page, 2);
    test.skip(n < 2, 'no card with two kanji in the first 40 cards of the local data');
    await page.locator('.hvp button.k').first().click();
    await expect(page.locator('.sheet .v-chip-group')).toBeVisible();
    await expect(page.locator('.multi')).toHaveCount(0);
  });
});

test.describe('the same margins on every screen', () => {
  test('decks start 6px from the left edge; settings and the "no study session" page start 12px', async ({ page }) => {
    const left = async (selector: string): Promise<number> => (await page.locator(selector).first().boundingBox())!.x;
    await expect(page.locator('.deck').first()).toBeVisible();
    expect(await left('.deck')).toBeCloseTo(6, 0); // the deck cards run almost to the edge (the same 6px as the gap between two cards)
    await page.evaluate(() => (location.hash = '#/settings'));
    await expect(page.locator('.sechead').first()).toBeVisible();
    expect(await left('.sechead')).toBeCloseTo(12, 0);
    await page.evaluate(() => (location.hash = '#/study'));
    await expect(page.getByRole('button', { name: 'Choose a deck' }).or(page.getByText('Deck finished').first())).toBeVisible();
    const info = page.locator('.infodeck');
    if (await info.count()) expect(await left('.infodeck')).toBeCloseTo(12, 0);
  });
});
