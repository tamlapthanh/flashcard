import { counter, expect, openSignedIn, richestDeck, startStudy, test } from './fixtures';

test.describe('details: Sino-Vietnamese kanji rows', () => {
  test('only the kanji opens the stroke order; the rest of the row does not', async ({ page, request }) => {
    const deck = await richestDeck(request, 'alice');
    test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the local data');
    await openSignedIn(page, request, 'alice');
    await startStudy(page, deck!);

    const rows = page.locator('.hvp');
    const strokeSheet = page.locator('.kanji'); // the KanjiBlock inside the bottom sheet; only rendered while the sheet is open

    // Browse until a card whose Details list kanji rows (Details load in the background, so give each card a moment).
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      await page.keyboard.press('ArrowUp');
      found = await rows.first().waitFor({ timeout: 1500 }).then(() => true, () => false);
      if (!found) await page.keyboard.press('ArrowRight'); // closes Details and moves to the next card
    }
    test.skip(!found, 'no card with kanji in the first 20 cards of the local data');

    // Text of the row (Sino-Vietnamese sound or meaning): no stroke order.
    await rows.locator('.hm').filter({ hasText: /\S/ }).first().click();
    await page.waitForTimeout(600);
    await expect(strokeSheet).toHaveCount(0);

    // The kanji itself: stroke order opens.
    await page.keyboard.press('ArrowUp'); // make sure Details are open (a click on the row text may have closed them)
    await rows.first().locator('button.k').click();
    await expect(strokeSheet).toBeVisible();
    await expect(counter(page)).toBeAttached();
  });
});
