import { apiDecks, expect, openSignedIn, tagButton, test } from './fixtures';

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('decks', () => {
  test('lists the decks the server returns, with their card counts', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    expect(decks.length).toBeGreaterThan(0);
    await openSignedIn(page, request, 'alice');
    for (const d of decks) {
      await expect(page.getByRole('button', { name: new RegExp(`${escapeRegex(d.name)}.*${d.total} cards`, 's') })).toBeVisible();
    }
  });

  test('there is no Start button on the deck screen: a deck is studied by tapping it', async ({ page, request }) => {
    await openSignedIn(page, request, 'alice');
    await expect(page.locator('.deck').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Start\s·\s\d+ cards/ })).toHaveCount(0);
  });

  test('the tag sheet has the Start button, which shows how many cards will load (default filter: new + learning)', async ({ page, request }) => {
    const first = (await apiDecks(request, 'alice')).find((d) => d.tags.length > 0);
    test.skip(!first, 'no deck with tags in the local data');
    await openSignedIn(page, request, 'alice');
    await tagButton(page, first!).click();
    const start = page.getByRole('button', { name: /^Start\s·\s\d+ cards/ });
    await expect(start).toContainText(`${first!.counts.new + first!.counts.learning} cards`);
    await expect(start).toBeEnabled(); // always: with nothing to study it opens the "Deck finished" screen
  });

  test('the four study statuses are on the deck screen to tick (no popup): New and Learning are ticked by default', async ({ page, request }) => {
    await openSignedIn(page, request, 'alice');
    for (const s of ['New', 'Learning', 'Learned', 'Skipped']) {
      await expect(page.locator('.filter .stchip', { hasText: new RegExp(`^${s} \\(\\d+\\)$`) })).toBeVisible();
    }
    const ticked = page.locator('.filter .stchip.v-chip--selected');
    await expect(ticked).toHaveCount(2);
    await expect(ticked.nth(0)).toContainText('New');
    await expect(ticked.nth(1)).toContainText('Learning');
  });

  test('ticking a status changes the filter at once and is remembered after a reload', async ({ page, request }) => {
    await openSignedIn(page, request, 'alice');
    const learned = page.locator('.filter .stchip', { hasText: /^Learned/ });
    await learned.click();
    await expect(learned).toHaveClass(/v-chip--selected/);
    await expect(page.locator('.filter .stchip.v-chip--selected')).toHaveCount(3);
    await page.reload();
    await expect(page.locator('.filter .stchip', { hasText: /^Learned/ })).toHaveClass(/v-chip--selected/);
  });
});
