import { API_URL } from '../playwright.config';
import { apiDeck, counter, expect, openSignedIn, richestDeck, startStudy, test, type DeckInfo } from './fixtures';

test.describe('study', () => {
  let deck: DeckInfo;

  test.beforeEach(async ({ page, request }) => {
    const richest = await richestDeck(request, 'alice');
    test.skip(!richest || richest.counts.new + richest.counts.learning === 0, 'no new/learning cards in the local data');
    deck = richest!;
    await openSignedIn(page, request, 'alice');
    await startStudy(page, deck);
  });

  test('shows position "1 / N" and the three grading buttons', async ({ page }) => {
    await expect(counter(page)).toContainText(/^\s*1\s*\/\s*\d+/);
    for (const name of ['Again', 'Learned', 'Skip']) await expect(page.getByRole('button', { name })).toBeVisible();
  });

  test('space flips the card; ArrowRight / ArrowLeft browse without grading', async ({ page }) => {
    // The counter is based on the cards left, so browsing does not change it: compare the word on the card instead.
    const word = page.locator('.wordbody');
    const counterBefore = (await counter(page).innerText()).trim();
    const headword = (await word.innerText()).split('\n')[0]!.trim(); // the card also shows the meaning once flipped: compare the word only
    await page.keyboard.press('Space');
    await expect(counter(page)).toHaveText(counterBefore); // flipping never moves on
    const total = Number(/\/\s*(\d+)/.exec(counterBefore)![1]);
    if (total > 1) {
      await page.keyboard.press('ArrowRight');
      await expect(word).not.toContainText(headword);
      await expect(counter(page)).toHaveText(counterBefore); // browsing is not grading
      await page.keyboard.press('ArrowLeft');
      await expect(word).toContainText(headword);
    }
  });

  test('grading Learned is saved on the server', async ({ page, request }) => {
    const learnedBefore = (await apiDeck(request, 'alice', deck.id)).counts.learned;
    await page.getByRole('button', { name: 'Learned' }).click();
    // results go through a queue: wait until the server shows one more learned card
    await expect.poll(async () => (await apiDeck(request, 'alice', deck.id)).counts.learned, { timeout: 15_000 }).toBe(learnedBefore + 1);
  });

  test('progress belongs to the user: bob does not see the card alice learned', async ({ page, request }) => {
    const bobBefore = (await apiDeck(request, 'bob', deck.id)).counts;
    const aliceBefore = (await apiDeck(request, 'alice', deck.id)).counts.learned;
    await page.getByRole('button', { name: 'Learned' }).click();
    await expect.poll(async () => (await apiDeck(request, 'alice', deck.id)).counts.learned, { timeout: 15_000 }).toBe(aliceBefore + 1);
    expect((await apiDeck(request, 'bob', deck.id)).counts).toEqual(bobBefore);
  });
});

test('the server rejects an API call without a token', async ({ request }) => {
  expect((await request.get(`${API_URL}/api/decks`)).status()).toBe(401);
});
