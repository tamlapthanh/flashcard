import type { Page } from '@playwright/test';
import { apiDecks, deckCard, escapeRegex, expect, openSignedIn, richestDeck, startStudy, tagButton, test, tileMark } from './fixtures';


const pickKey = 'flashmobile.deckPick.alice';
const readPick = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as { deckId?: string; statuses?: string[]; tagsByDeck?: Record<string, string[]> } | null, pickKey);

test.describe('deck screen', () => {
  test('every deck has its own letter on the tile (a JLPT level, else the first letter)', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    await openSignedIn(page, request, 'alice');
    for (const d of decks) await expect(deckCard(page, d).locator('.deck-tile')).toHaveText(tileMark(d.name));
    const marks = decks.map((d) => tileMark(d.name));
    if (decks.length > 1) expect(new Set(marks).size).toBeGreaterThan(1); // not the same letter on every deck
  });

  test('tapping a deck studies it at once, and the deck studied last is remembered (per user)', async ({ page, request }) => {
    const deck = await richestDeck(request, 'alice');
    test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the local data');
    await openSignedIn(page, request, 'alice');
    await expect(page.getByRole('button', { name: /始める/ })).toHaveCount(0); // nothing to start from: the tap is the start
    await startStudy(page, deck!);
    await expect(page).toHaveURL(/#\/study/);
    expect((await readPick(page))?.deckId).toBe(deck!.id);
  });

  test('a deck being loaded shows a spinner and cannot be started twice', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    test.skip(decks.length < 2, 'needs two decks');
    await openSignedIn(page, request, 'alice');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/cards?*', async (route) => {
      await held; // the cards come late
      await route.continue();
    });
    await deckCard(page, decks[0]!).click();
    await expect(deckCard(page, decks[0]!)).toHaveClass(/\bbusy\b/);
    await expect(deckCard(page, decks[0]!).locator('.play .v-progress-circular')).toBeVisible();
    await expect(deckCard(page, decks[1]!).locator('.deckhit')).toBeDisabled();
    release();
    await expect(page).toHaveURL(/#\/(study|study\?.*)/);
  });

  test('the remembered status filter comes back', async ({ page, request }) => {
    const decks = await apiDecks(request, 'alice');
    await openSignedIn(page, request, 'alice');
    await expect(page.getByRole('button', { name: /New \+ Learning/ })).toBeVisible();
    await page.evaluate((deckId) => {
      const user = 'alice';
      localStorage.setItem(`flashmobile.deckPick.${user}`, JSON.stringify({ deckId, statuses: ['new'], tagsByDeck: {} }));
    }, decks[0]!.id);
    await page.reload();
    const filter = page.locator('button.filter');
    await expect(filter).toContainText('New');
    await expect(filter).not.toContainText('Learning');
  });

  test('a stored pick that is damaged or names things that no longer exist is read as far as it makes sense', async ({ page, request }) => {
    await page.addInitScript(() => localStorage.setItem('flashmobile.deckPick.alice', JSON.stringify({ deckId: 'gone', tags: ['x'], statuses: ['bogus'], tagsByDeck: { gone: ['x'] } })));
    await openSignedIn(page, request, 'alice');
    await expect(page.locator('.deck').first()).toBeVisible();
    await expect(page.locator('.tc')).toHaveCount(0); // no tags on any card
    await expect(page.getByRole('button', { name: /New \+ Learning/ })).toBeVisible(); // the bad status list is ignored
  });
});

test.describe('tags of a deck', () => {
  const withTags = async (request: import('@playwright/test').APIRequestContext) => (await apiDecks(request, 'alice')).filter((d) => d.tags.length > 0);

  test('each deck keeps its own tags: opening the tags of one deck and choosing none leaves it empty, choosing in another deck is remembered for that deck', async ({ page, request }) => {
    const [a, b] = await withTags(request);
    test.skip(!b, 'needs two decks with tags');
    await openSignedIn(page, request, 'alice');

    await tagButton(page, a!).click(); // deck A: look at its tags, choose none
    await expect(page.getByRole('button', { name: /始める/ })).toBeVisible();
    await page.keyboard.press('Escape');

    await tagButton(page, b!).click(); // deck B: choose a tag
    const firstB = b!.tags[0]!.tag;
    await page.locator('.v-chip').filter({ hasText: new RegExp(`^\\s*${escapeRegex(firstB)} \\(`) }).click();
    await page.keyboard.press('Escape');

    await expect(deckCard(page, b!).locator('.tc')).toContainText(firstB.slice(0, 4)); // B shows its tag (a long one may be cut)
    await expect(deckCard(page, b!).locator('.tagn')).toHaveText('1');
    await expect(deckCard(page, a!).locator('.tc')).toHaveCount(0); // A has none
    expect((await readPick(page))?.tagsByDeck).toEqual({ [b!.id]: [firstB] });

    await page.reload(); // still there, and still only on B
    await expect(deckCard(page, b!).locator('.tagn')).toHaveText('1');
    await expect(deckCard(page, a!).locator('.tagn')).toHaveCount(0);
    await tagButton(page, a!).click();
    await expect(page.locator('.v-chip--selected')).toHaveCount(0); // A's sheet: nothing chosen
    await page.keyboard.press('Escape');
    await tagButton(page, b!).click();
    await expect(page.locator('.v-chip--selected')).toHaveCount(1); // B's sheet: its tag is chosen
  });

  test('the Start button of the tag sheet studies the deck with the tags chosen, and tapping the card studies it with the remembered ones', async ({ page, request }) => {
    const deck = (await withTags(request)).find((d) => d.counts.new + d.counts.learning > 0);
    test.skip(!deck, 'no deck with tags and cards to study');
    await openSignedIn(page, request, 'alice');
    await tagButton(page, deck!).click();
    const tag = deck!.tags[0]!.tag;
    await page.locator('.v-chip').filter({ hasText: new RegExp(`^\\s*${escapeRegex(tag)} \\(`) }).click();
    const carriesTag = (r: import('@playwright/test').Request): boolean => {
      const u = new URL(r.url());
      return u.pathname === '/api/cards' && (u.searchParams.get('tags') ?? '').split(',').includes(tag);
    };
    const asked = page.waitForRequest(carriesTag);
    await page.getByRole('button', { name: /始める/ }).click();
    await asked; // the sheet's button studied the deck with the tag chosen
    await expect(page).toHaveURL(/#\/study/);

    // back on the deck screen the tag is remembered for that deck: a tap on its card studies it with the same tag
    await page.evaluate(() => (location.hash = '#/'));
    await expect(deckCard(page, deck!).locator('.tagn')).toHaveText('1');
    const askedAgain = page.waitForRequest(carriesTag);
    await deckCard(page, deck!).click();
    await askedAgain;
  });

  test('an older stored pick (one deck, one list of tags) is read: the tags go to its deck, unknown ones are dropped', async ({ page, request }) => {
    const deck = (await withTags(request))[0];
    test.skip(!deck, 'no deck with tags');
    const tag = deck!.tags[0]!.tag;
    await page.addInitScript(([id, t]) => localStorage.setItem('flashmobile.deckPick.alice', JSON.stringify({ deckId: id, tags: [t, 'no-such-tag'], statuses: ['new', 'learning'] })), [deck!.id, tag]);
    await openSignedIn(page, request, 'alice');
    await expect(deckCard(page, deck!).locator('.tagn')).toHaveText('1');
    await expect.poll(async () => (await readPick(page))?.tagsByDeck).toEqual({ [deck!.id]: [tag] }); // written back in the new form
  });

  test('chosen tags are on one line of the card: as many as fit, the rest as "+N"', async ({ page, request }) => {
    const deck = (await withTags(request)).sort((x, y) => y.tags.length - x.tags.length)[0];
    test.skip(!deck || deck.tags.length < 4, 'needs a deck with four tags');
    const all = deck!.tags.map((t) => t.tag);
    await page.addInitScript(([id, tags]) => localStorage.setItem('flashmobile.deckPick.alice', JSON.stringify({ deckId: id, statuses: ['new', 'learning'], tagsByDeck: { [id as string]: tags } })), [deck!.id, all]);
    await openSignedIn(page, request, 'alice');
    const row = deckCard(page, deck!).locator('.tc');
    const chips = row.locator('> .tcchip');
    await expect(row).toBeVisible();
    const shownNarrow = await chips.count();
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(22); // one line, never two
    const rowBox = (await row.boundingBox())!;
    const lastBox = (await chips.last().boundingBox())!;
    expect(lastBox.x + lastBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1); // the last chip ends inside the row: nothing is cut off
    if (shownNarrow - 1 < all.length) await expect(row.locator('.tcmore')).toHaveText(`+${all.length - (shownNarrow - 1)}`);

    await page.setViewportSize({ width: 1500, height: 900 }); // more room: at least as many chips fit
    await expect.poll(async () => chips.count()).toBeGreaterThanOrEqual(shownNarrow);
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(22);
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
    // the tile did not start the deck behind it
    await expect(page).not.toHaveURL(/#\/study/);
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
