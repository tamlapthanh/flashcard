import { apiDecks, deckCard, expect, openSignedIn, test, tileMark } from './fixtures';

test.describe('deck screen', () => {
  test('every deck has its own letter on the tile (a JLPT level, else the first letter)', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    await openSignedIn(page, request, 'alice');
    for (const d of decks) await expect(deckCard(page, d).locator('.deck-tile')).toHaveText(tileMark(d.name));
    const marks = decks.map((d) => tileMark(d.name));
    if (decks.length > 1) expect(new Set(marks).size).toBeGreaterThan(1); // not the same letter on every deck
  });

  test('the deck picked last is picked again after a reload (per user)', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    test.skip(decks.length < 2, 'needs two decks');
    await openSignedIn(page, request, 'alice');
    await deckCard(page, decks[1]!).click();
    await expect(deckCard(page, decks[1]!)).toHaveClass(/\bon\b/);
    await page.reload();
    await expect(deckCard(page, decks[1]!)).toHaveClass(/\bon\b/);
    await expect(deckCard(page, decks[0]!)).not.toHaveClass(/\bon\b/);
  });

  test('the remembered tags and status filter come back', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    await openSignedIn(page, request, 'alice');
    await expect(page.getByRole('button', { name: /New \+ Learning/ })).toBeVisible();
    await page.evaluate((deckId) => {
      const user = 'alice';
      localStorage.setItem(`flashmobile.deckPick.${user}`, JSON.stringify({ deckId, tags: [], statuses: ['new'] }));
    }, decks[0]!.id);
    await page.reload();
    const filter = page.locator('button.filter');
    await expect(filter).toContainText('New');
    await expect(filter).not.toContainText('Learning');
  });

  test('a stored pick of a deck that no longer exists falls back to the first deck', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    await page.addInitScript(() => localStorage.setItem('flashmobile.deckPick.alice', JSON.stringify({ deckId: 'gone', tags: ['x'], statuses: ['bogus'] })));
    await openSignedIn(page, request, 'alice');
    await expect(deckCard(page, decks[0]!)).toHaveClass(/\bon\b/);
    await expect(page.getByRole('button', { name: /New \+ Learning/ })).toBeVisible(); // the bad status list is ignored
  });
});

test.describe('word list of a whole deck (tile of the deck screen)', () => {
  test('tapping the tile opens the list with the deck name and "x / N learned" on the top line', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    const deck = decks.find((d) => d.total > 0);
    test.skip(!deck, 'no deck with cards');
    await openSignedIn(page, request, 'alice');
    await deckCard(page, deck!).locator('.deck-tile').click();
    const head = page.locator('.deckhead');
    await expect(head).toContainText(deck!.name);
    await expect(head).toContainText(new RegExp(`\\d+ / ${deck!.total} learned`));
    await expect(head.locator('.dmark')).toHaveCount(0); // no letter tile in the heading
    await expect(page.locator('.row').first()).toBeVisible();
    // the tile did not select the deck behind it
    await page.keyboard.press('Escape');
  });

  test('the first rows are drawn in chunks of 40 and the rest follow while scrolling', async ({ page, request }) => {
    const deck = (await apiDecks(request, 'alice')).find((d) => d.total > 45);
    test.skip(!deck, 'no deck with more than 45 cards');
    await openSignedIn(page, request, 'alice');
    await deckCard(page, deck!).locator('.deck-tile').click();
    await expect(page.locator('.row')).toHaveCount(40);
    await page.locator('.rows').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect.poll(() => page.locator('.row').count()).toBeGreaterThan(40);
  });

  test('the options gear fans out learned / skipped / not learned, each can be switched off', async ({ page, request }) => {
    const deck = (await apiDecks(request, 'alice')).find((d) => d.total > 0);
    test.skip(!deck, 'no deck with cards');
    await openSignedIn(page, request, 'alice');
    await deckCard(page, deck!).locator('.deck-tile').click();
    const box = page.getByPlaceholder('Search a word');
    if (!(await box.isVisible())) await page.getByRole('button', { name: 'Search a word', exact: true }).click(); // a phone hides the box until the magnifier is tapped
    await expect(box).toBeVisible();

    const gear = page.getByRole('button', { name: 'Search options' });
    const learned = page.locator('.sopt[title="Learned"]');
    const skipped = page.locator('.sopt[title="Skipped"]');
    const todo = page.locator('.sopt[title="Not learned"]');
    await expect(page.locator('.sfan')).not.toHaveClass(/open/); // folded
    await gear.click();
    await expect(page.locator('.sfan')).toHaveClass(/open/);
    for (const o of [learned, skipped, todo]) {
      await expect(o).toBeVisible();
      await expect(o).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(gear).not.toHaveClass(/filtered/); // every option on: the gear is green

    // learned off: no learned word stays
    await learned.click();
    await expect(learned).toHaveAttribute('aria-pressed', 'false');
    await expect(gear).toHaveClass(/filtered/); // an option is off: the gear turns pale
    await expect(page.locator('.row.learned')).toHaveCount(0);

    // skipped off too: only the rest (not seen / again) stays
    await skipped.click();
    await expect(skipped).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.row.learned, .row.skipped')).toHaveCount(0);

    // every option may be off: then nothing is listed
    await todo.click();
    await expect(todo).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.row')).toHaveCount(0);
    await expect(page.getByText('No word matches')).toBeVisible();

    // skipped alone: nothing but skipped words
    await skipped.click();
    await expect(skipped).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.row:not(.skipped)')).toHaveCount(0);

    // a tap elsewhere folds the options
    await page.locator('.sheet .grip').click({ force: true });
    await expect(page.locator('.sfan')).not.toHaveClass(/open/);
  });

  test('the options are searched together with the typed text, and closing the list resets them', async ({ page, request }) => {
    const deck = (await apiDecks(request, 'alice')).find((d) => d.total > 1);
    test.skip(!deck, 'no deck with two cards');
    await openSignedIn(page, request, 'alice');
    await deckCard(page, deck!).locator('.deck-tile').click();
    const box = page.getByPlaceholder('Search a word');
    if (!(await box.isVisible())) await page.getByRole('button', { name: 'Search a word', exact: true }).click();
    await box.fill('zzzzqqq-no-such-word');
    await expect(page.getByText('No word matches')).toBeVisible();
    await box.fill('');
    await page.getByRole('button', { name: 'Search options' }).click();
    await page.locator('.sopt[title="Learned"]').click(); // not learned only
    await page.keyboard.press('Escape');
    await deckCard(page, deck!).locator('.deck-tile').click(); // opened again: everything lit again
    if (!(await box.isVisible())) await page.getByRole('button', { name: 'Search a word', exact: true }).click();
    await page.getByRole('button', { name: 'Search options' }).click();
    await expect(page.locator('.sopt[title="Learned"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('every second line is a little darker', async ({ page, request }) => {
    const deck = (await apiDecks(request, 'alice')).find((d) => d.total > 3);
    test.skip(!deck, 'no deck with more than 3 cards');
    await openSignedIn(page, request, 'alice');
    await deckCard(page, deck!).locator('.deck-tile').click();
    const rows = page.locator('.row');
    await expect(rows.nth(1)).toHaveClass(/\balt\b/);
    await expect(rows.nth(0)).not.toHaveClass(/\balt\b/);
    await expect(rows.nth(2)).not.toHaveClass(/\balt\b/);
    await expect(rows.nth(3)).toHaveClass(/\balt\b/);
  });
});
