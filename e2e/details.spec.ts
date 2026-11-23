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

/* On a phone (touch) the Notes are folded but open by themselves when the screen has room; the Memory hint of the kanji sheet is always folded at first. */
test.describe('auto-open of Notes when there is room, Memory hint folded at first', () => {
  const TALL = { width: 412, height: 1600 };
  const SHORT = { width: 412, height: 420 };

  test('Notes open by themselves on a tall screen and fold on a short one; a tap wins', async ({ page, request }) => {
    const deck = await richestDeck(request, 'alice');
    test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the local data');
    await page.setViewportSize(TALL);
    await openSignedIn(page, request, 'alice');
    await startStudy(page, deck!);

    const toggle = page.locator('.notes-toggle');
    let found = false;
    for (let i = 0; i < 25 && !found; i++) {
      await page.keyboard.press('ArrowUp');
      found = await toggle.waitFor({ timeout: 1500 }).then(() => true, () => false);
      if (!found) await page.keyboard.press('ArrowRight');
    }
    test.skip(!found, 'no card with notes in the first 25 cards of the local data');

    await expect(toggle).toHaveAttribute('aria-expanded', 'true'); // room: opened without a tap
    await page.setViewportSize(SHORT);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false'); // no room: folded again
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true'); // the user's tap is respected
  });

  test('the Memory hint is folded at first, even on a tall screen, and a tap opens it', async ({ page, request }) => {
    const deck = await richestDeck(request, 'alice');
    test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the local data');
    await page.setViewportSize(TALL);
    await openSignedIn(page, request, 'alice');
    await startStudy(page, deck!);

    const hintToggle = page.locator('.hint-toggle').first();
    let found = false;
    for (let i = 0; i < 25 && !found; i++) {
      await page.keyboard.press('ArrowUp');
      const row = page.locator('.hvp').first();
      if (await row.waitFor({ timeout: 1500 }).then(() => true, () => false)) {
        await row.locator('button.k').click();
        found = await hintToggle.waitFor({ timeout: 1500 }).then(() => true, () => false);
        if (!found) await page.keyboard.press('Escape');
      }
      if (!found) await page.keyboard.press('ArrowRight');
    }
    test.skip(!found, 'no kanji with a memory hint in the first 25 cards of the local data');

    await expect(hintToggle).toHaveAttribute('aria-expanded', 'false'); // folded: Memory hint, Compounds and Components wait for a tap
    await hintToggle.click();
    await expect(hintToggle).toHaveAttribute('aria-expanded', 'true');
  });
});

/* On a phone (touch) a word with several kanji still shows one kanji at a time, switched with chips (the side-by-side view is desktop only). */
test.describe('kanji sheet on a phone', () => {
  test('two or more kanji: chips, one stroke player, and the last stroke turns black when drawn', async ({ page, request }) => {
    const deck = await richestDeck(request, 'alice');
    test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the local data');
    await openSignedIn(page, request, 'alice');
    await startStudy(page, deck!);

    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await page.keyboard.press('ArrowUp');
      const first = await page.locator('.hvp button.k').first().waitFor({ timeout: 1200 }).then(() => true, () => false);
      found = first && (await page.locator('.hvp button.k').count()) >= 2;
      if (!found) await page.keyboard.press('ArrowRight');
    }
    test.skip(!found, 'no card with two kanji in the first 40 cards of the local data');

    await page.locator('.hvp button.k').first().click();
    await expect(page.locator('.sheet .v-chip-group')).toBeVisible();
    await expect(page.locator('.multi')).toHaveCount(0);
    await expect(page.locator('.sheet .kanji')).toHaveCount(1); // one kanji at a time
    await expect.poll(() => page.locator('.kanji .stroke.current').count(), { timeout: 25_000 }).toBe(0);
    // the second chip switches to the second kanji
    await page.locator('.sheet .v-chip').nth(1).click();
    await expect(page.locator('.sheet .kanji')).toHaveCount(1);
  });
});
