import { API_URL } from '../playwright.config';
import { apiDecks, counter, expect, openSignedIn, startStudy, test } from './fixtures';

test.describe('study', () => {
  test.beforeEach(async ({ page, request }) => {
    const [deck] = await apiDecks(request, 'alice');
    test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the first deck of the local data');
    await openSignedIn(page, request, 'alice');
    await startStudy(page);
  });

  test('shows position "1 / N" and the three grading buttons', async ({ page }) => {
    await expect(counter(page)).toContainText(/^\s*1\s*\/\s*\d+/);
    for (const name of ['Again', 'Learned', 'Skip']) await expect(page.getByRole('button', { name })).toBeVisible();
  });

  test('space flips the card; ArrowRight / ArrowLeft browse without grading', async ({ page }) => {
    const before = (await counter(page).innerText()).trim();
    await page.keyboard.press('Space');
    await expect(counter(page)).toHaveText(before); // flipping never moves on
    const total = Number(/\/\s*(\d+)/.exec(before)![1]);
    if (total > 1) {
      await page.keyboard.press('ArrowRight');
      await expect(counter(page)).not.toHaveText(before);
      await page.keyboard.press('ArrowLeft');
      await expect(counter(page)).toHaveText(before);
    }
  });

  test('grading Learned is saved on the server', async ({ page, request }) => {
    const learnedBefore = (await apiDecks(request, 'alice'))[0]!.counts.learned;
    await page.getByRole('button', { name: 'Learned' }).click();
    // results go through a queue: wait until the server shows one more learned card
    await expect.poll(async () => (await apiDecks(request, 'alice'))[0]!.counts.learned, { timeout: 15_000 }).toBe(learnedBefore + 1);
  });

  test('progress belongs to the user: bob does not see the card alice learned', async ({ page, request }) => {
    const bobBefore = (await apiDecks(request, 'bob'))[0]!.counts;
    const aliceBefore = (await apiDecks(request, 'alice'))[0]!.counts.learned;
    await page.getByRole('button', { name: 'Learned' }).click();
    await expect.poll(async () => (await apiDecks(request, 'alice'))[0]!.counts.learned, { timeout: 15_000 }).toBe(aliceBefore + 1);
    expect((await apiDecks(request, 'bob'))[0]!.counts).toEqual(bobBefore);
  });
});

test('the server rejects an API call without a token', async ({ request }) => {
  expect((await request.get(`${API_URL}/api/decks`)).status()).toBe(401);
});
