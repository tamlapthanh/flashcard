import { apiPutSettings, deckCard, openSignedIn, resetSettings, richestDeck, test, expect } from './fixtures';

/* A test with "mark right away" off: choosing an answer shows nothing about right or wrong; the next question comes by itself.
   testInstantCheck is kept per user on the server (synced), so it is set there: a value put in localStorage only is overwritten
   by the server's copy when the app starts. */
test('marking at the end: no verdict on the question, the next question follows', async ({ page, request }) => {
  const deck = await richestDeck(request, 'alice');
  test.skip(!deck || deck.total < 4, 'needs a deck with at least four cards');
  await apiPutSettings(request, 'alice', { testInstantCheck: false });
  try {
    await openSignedIn(page, request, 'alice');
    await deckCard(page, deck!).locator('.tagbtn.testc').click();
    await page.getByRole('button', { name: 'Start the test' }).click();
    const progress = page.locator('.progress .count');
    await expect(progress).toContainText(/^1\b/);
    await page.locator('.opt').first().click();
    await expect(page.locator('.feedback')).toHaveCount(0); // no verdict card
    await expect(page.locator('.opt.right, .opt.bad')).toHaveCount(0); // nothing marked right or wrong
    await expect(progress).toContainText(/^2\b/); // on to the next question by itself
  } finally {
    await resetSettings(request, 'alice');
  }
});
