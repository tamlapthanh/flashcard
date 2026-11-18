import { apiDecks, expect, openSignedIn, test } from './fixtures';

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

  test('Start shows how many cards will load (default filter: new + learning)', async ({ page, request }) => {
    const [first] = await apiDecks(request, 'alice');
    await openSignedIn(page, request, 'alice');
    const eligible = first!.counts.new + first!.counts.learning;
    const start = page.getByRole('button', { name: /始める/ });
    await expect(start).toContainText(`${eligible} cards`);
    if (eligible === 0) await expect(start).toBeDisabled();
    else await expect(start).toBeEnabled();
  });

  test('the filter sheet lists the four study statuses', async ({ page, request }) => {
    await openSignedIn(page, request, 'alice');
    await page.getByRole('button', { name: /New \+ Learning/ }).click();
    for (const s of ['New', 'Learning', 'Learned', 'Skipped']) {
      await expect(page.getByText(new RegExp(`^${s} \\(\\d+\\)$`))).toBeVisible();
    }
  });
});
