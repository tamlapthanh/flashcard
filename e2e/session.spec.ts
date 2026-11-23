import { apiPutSettings, counter, expect, openSignedIn, resetSettings, richestDeck, startStudy, test, type DeckInfo } from './fixtures';

/* The study run is kept on this device (per user), the study screen is never an empty page, and the card turns over with a fade. */
test.describe('study run kept across a reload', () => {
  let deck: DeckInfo;

  test.beforeEach(async ({ page, request }) => {
    const richest = await richestDeck(request, 'alice');
    test.skip(!richest || richest.counts.new + richest.counts.learning < 2, 'needs at least two new/learning cards');
    deck = richest!;
    await openSignedIn(page, request, 'alice');
    await startStudy(page, deck);
  });

  const savedRun = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const raw = localStorage.getItem('flashmobile.run.alice');
      return raw ? (JSON.parse(raw) as { queue: string[]; deckName: string; tags: string[]; cards: unknown[] }) : null;
    });

  test('the run is written down when it starts and carries the deck name', async ({ page }) => {
    await expect.poll(() => savedRun(page)).not.toBeNull();
    const run = await savedRun(page);
    expect(run!.deckName).toBe(deck.name);
    expect(run!.queue.length).toBeGreaterThan(1);
  });

  test('after a reload the study screen comes back on the same card and position', async ({ page }) => {
    const word = page.locator('.wordbody');
    await expect.poll(() => savedRun(page)).not.toBeNull();
    const first = (await savedRun(page))!.queue[0];
    await page.keyboard.press('ArrowRight'); // browse one card (does not grade)
    await expect.poll(async () => (await savedRun(page))!.queue[0]).not.toBe(first);
    const headword = (await word.innerText()).split('\n')[0]!.trim();
    const counterText = (await counter(page).innerText()).trim();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Learned' })).toBeVisible();
    await expect(counter(page)).toHaveText(counterText);
    await expect(page.locator('.wordbody')).toContainText(headword);
  });
});

test.describe('study screen without a run', () => {
  test('shows the deck picked last, with its progress, instead of an empty page', async ({ page, request }) => {
    await openSignedIn(page, request, 'bob');
    await expect(page.locator('.deck').first()).toBeVisible(); // deck screen loaded
    await page.evaluate(() => (location.hash = '#/study'));
    const finished = page.getByText('Every word of this deck is learned.');
    const info = page.locator('.infodeck');
    await expect(info.or(page.getByText('Deck finished'))).toBeVisible();
    if (await info.isVisible()) {
      await expect(info).toContainText(/\d+ \/ \d+ learned/);
      await expect(info).toContainText('New');
      await expect(info).toContainText('Learned');
      await expect(finished).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Choose a deck' })).toBeVisible();
  });

  test('a deck with nothing left to study shows the "Deck finished" screen from its saved progress', async ({ page, request }) => {
    // the first deck of bob, with every card marked learned on the screen (the deck list is stubbed: the server data is not touched)
    await page.route('**/api/decks', async (route) => {
      try {
        const res = await route.fetch();
        const body = (await res.json()) as { decks: { id: string; total: number; counts: Record<string, number> }[] };
        for (const d of body.decks) d.counts = { new: 0, learning: 0, learned: d.total, skipped: 0 };
        await route.fulfill({ response: res, json: body });
      } catch {
        // The page reloaded while the request was in flight (Vite re-optimises its dependencies on a cold start and reloads): the retry is stubbed again.
        await route.abort().catch(() => undefined);
      }
    });
    await openSignedIn(page, request, 'bob');
    await expect(page.locator('.deck').first()).toBeVisible();
    await page.evaluate(() => (location.hash = '#/study'));
    await expect(page.getByText('Deck finished').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to decks' })).toBeVisible();
    await expect(page.getByText(/^Finished \d+ cards$/)).toBeVisible();
    await page.getByRole('button', { name: 'Back to decks' }).click();
    await expect(page).toHaveURL(/#\/$/);
  });
});

test.describe('study card layout', () => {
  let deck: DeckInfo;

  test.beforeEach(async ({ page, request }) => {
    const richest = await richestDeck(request, 'bob');
    test.skip(!richest || richest.counts.new + richest.counts.learning === 0, 'no new/learning cards in the local data');
    deck = richest!;
    // the sizes come with the user, from the server (an empty saved copy would replace anything seeded on the device)
    await apiPutSettings(request, 'bob', { cardText: { word: { size: 90, color: '#123456' }, counter: { size: 14, color: '' } } });
    await openSignedIn(page, request, 'bob');
    await startStudy(page, deck);
  });

  test.afterEach(async ({ request }) => {
    await resetSettings(request, 'bob');
  });

  test('the size and colour of every text come from the settings (custom properties of the card)', async ({ page }) => {
    const stage = page.locator('.stage');
    await expect(stage).toHaveCSS('--s-word', '90px');
    await expect(stage).toHaveCSS('--c-word', '#123456');
    await expect(stage).toHaveCSS('--s-counter', '14px');
    // texts that were never changed keep their default (the look before the settings existed)
    await expect(stage).toHaveCSS('--s-meaning', /px$/);
  });

  test('the counter sits at the bottom centre, between the eye button and the speaker', async ({ page }) => {
    const eye = page.locator('.eye4:not(.speak)'); // the speaker button is an .eye4 too (it has the same tiny marks)
    const speaker = page.locator('.speak');
    test.skip(!(await speaker.isVisible()), 'the speaker button only shows when the browser can speak');
    const [e, c, s] = await Promise.all([eye.boundingBox(), counter(page).boundingBox(), speaker.boundingBox()]);
    expect(e!.x + e!.width).toBeLessThanOrEqual(c!.x + 1);
    expect(c!.x + c!.width).toBeLessThanOrEqual(s!.x + 1);
    expect(Math.abs(c!.y + c!.height / 2 - (e!.y + e!.height / 2))).toBeLessThan(30); // on the same bottom line
    await expect(counter(page)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)'); // no background
  });

  test('the details side fades in (no 3D turn): both faces stay flat and only one is shown', async ({ page }) => {
    const flipper = page.locator('.flipper');
    const front = page.locator('.flipper > .face:not(.back-face)');
    const back = page.locator('.back-face');
    await expect(flipper).not.toHaveClass(/back/);
    await expect(back).toBeHidden();
    await page.keyboard.press('ArrowUp'); // Details
    await expect(flipper).toHaveClass(/back/);
    await expect(back).toBeVisible();
    await expect(front).toBeHidden();
    expect(await flipper.evaluate((el) => getComputedStyle(el).transform)).toBe('none'); // no rotateY any more
    expect(await flipper.evaluate((el) => getComputedStyle(el).transformStyle)).not.toBe('preserve-3d');
    await back.click({ position: { x: 6, y: 150 } }); // a tap on the back turns back (the left padding: a straight edge, the top corner is rounded and the tap would go through it)
    await expect(flipper).not.toHaveClass(/back/);
    await expect(front).toBeVisible();
  });

  test('the details header: the word with its Sino-Vietnamese, then Vietnamese as its own item like English', async ({ page }) => {
    await page.keyboard.press('ArrowUp');
    const head = page.locator('.back-head .bline');
    await expect(head).toBeVisible();
    await expect(head.locator('.bwcol')).toBeVisible();
    // the Sino-Vietnamese reading (under each kanji, or beside a word without furigana) is always UPPER CASE
    for (const loc of [head.locator('.bhv'), head.locator('.hvr')]) {
      for (let i = 0; i < (await loc.count()); i++) {
        const text = (await loc.nth(i).innerText()).trim();
        expect(text).toBe(text.toUpperCase());
      }
    }
    // the Vietnamese meaning is a labelled item (icon + "Vietnamese"), not part of the header; no line under the header
    const vi = page.locator('.detail .item').filter({ has: page.locator('.label', { hasText: /^Vietnamese$/ }) });
    await expect(vi).toHaveCount(1);
    await expect(vi.locator('.bm')).not.toBeEmpty();
    await expect(page.locator('.back-head')).toHaveCSS('border-bottom-width', '0px');
  });
});

test.describe('Start with nothing to study', () => {
  test('tapping a deck with nothing to study opens the "Deck finished" screen', async ({ page, request }) => {
    await page.route('**/api/decks', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { decks: { total: number; counts: Record<string, number> }[] };
      for (const d of body.decks) d.counts = { new: 0, learning: 0, learned: d.total, skipped: 0 };
      await route.fulfill({ response: res, json: body });
    });
    await page.route('**/api/cards?*', (route) => route.fulfill({ json: { total: 0, cards: [] } }));
    await openSignedIn(page, request, 'bob');
    const deck = page.locator('.deck').first();
    await expect(deck).toBeVisible();
    await expect(deck.locator('.deckhit')).toBeEnabled(); // not greyed out although there is nothing new or learning
    await deck.click();
    await expect(page).toHaveURL(/#\/study/);
    await expect(page.getByText('Deck finished').first()).toBeVisible();
    await expect(page.getByText(/^Finished \d+ cards$/)).toBeVisible();
    await expect(page.getByText('No cards match the filter.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to decks' }).click();
    await expect(page).toHaveURL(/#\/$/);
  });
});
