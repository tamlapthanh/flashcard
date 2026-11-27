import type { APIRequestContext, Page } from '@playwright/test';
import { API_URL } from '../playwright.config';
import { apiLogin, deckCard, openSignedIn, richestDeck, test, expect, type DeckInfo, type User } from './fixtures';

/*
 * The test screens, end to end against the real local server: the Test button of a deck (TestSheet), /test and /tests.
 * Covers what had no spec yet: making a test, answering and skipping, the score and the missed words, leaving a test and
 * continuing it from the list, ending it early, and deleting an attempt from the history.
 *
 * The server keeps tests in memory (playwright.config.ts), so every run starts from an empty history. Alice and Bob are
 * used for different tests so that "words already answered right are left out" (tests/correct) cannot change what a later
 * test in this file is asked.
 */

type Kind = 'meaning' | 'listen' | 'reading';
const KIND_CHIP: Record<Kind, string> = {
  meaning: 'See a word, pick the meaning',
  listen: 'Hear a word, pick the word',
  reading: 'See a word, pick the reading'
};

/** Opens the test sheet of a deck, picks the number of questions and the kinds, starts, and returns how many questions the test has. */
async function startTest(page: Page, deck: DeckInfo, kinds: Kind[] = ['meaning'], questions = 10): Promise<number> {
  await deckCard(page, deck).locator('.tagbtn.testc').click();
  const sheet = page.locator('.tsheet');
  await expect(sheet).toBeVisible();
  await sheet.locator('.v-chip').filter({ hasText: new RegExp(`^\\s*${questions}\\s*$`) }).click(); // 10 (the chips are 10, 20, 50, All)
  // Every kind starts chosen: tapping one that should not be asked turns it off (the last one cannot be turned off).
  for (const kind of Object.keys(KIND_CHIP) as Kind[]) {
    if (!kinds.includes(kind)) await sheet.locator('.v-chip').filter({ hasText: KIND_CHIP[kind] }).click();
  }
  await page.getByRole('button', { name: 'Start the test' }).click();
  const count = page.locator('.progress .count');
  await expect(count).toContainText(/^\s*1\s*\/\s*\d+/);
  const m = /(\d+)\s*\/\s*(\d+)/.exec(await count.innerText());
  return Number(m![2]);
}

/** Answers the question on screen: the first option, or Skip. A wrong answer (or a skip) shows the verdict card, whose button goes on; a right one moves on by itself. */
async function answerOne(page: Page, how: 'first' | 'skip' = 'first'): Promise<void> {
  if (how === 'skip') await page.getByRole('button', { name: 'Skip' }).click();
  else await page.locator('.options .opt').first().click();
  const feedback = page.locator('.feedback');
  // The verdict card is drawn at once; with a right answer there is none and the next question comes after ~1.2 s.
  // isVisible() does not wait (its timeout is ignored): on a busy machine the card could come a moment later and be missed
  if (await feedback.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await feedback.getByRole('button').last().click();
}

/** Waits until the test being taken is saved on the server with `answered` answers (the client's queue may still be sending it). */
async function waitForOpenTest(request: APIRequestContext, user: User, answered: number): Promise<void> {
  const token = await apiLogin(request, user);
  await expect
    .poll(
      async () => {
        const res = await request.get(`${API_URL}/api/tests?status=open`, { headers: { authorization: `Bearer ${token}` } });
        if (!res.ok()) return -1;
        const body = (await res.json()) as { sessions: { answered: number }[] };
        return body.sessions[0]?.answered ?? -1; // newest first
      },
      { timeout: 15_000, message: 'the open test is saved on the server' }
    )
    .toBe(answered);
}

test.describe('Test screens', () => {
  test.describe.configure({ timeout: 90_000 }); // the first test of a run waits for Vite's cold start

  test('answers, a skip, the score, the words missed; the test is saved', async ({ page, request }) => {
    const deck = await richestDeck(request, 'alice');
    test.skip(!deck || deck.total < 4, 'needs a deck with at least four cards');
    await openSignedIn(page, request, 'alice');

    const total = await startTest(page, deck!, ['meaning']);
    const count = page.locator('.progress .count');
    for (let i = 1; i <= total; i++) {
      await expect(count).toContainText(new RegExp(`^\\s*${i}\\s*/\\s*${total}\\s*$`));
      await answerOne(page, i === 2 ? 'skip' : 'first'); // the second question is skipped: it counts as missed
    }

    await expect(page.locator('.bigscore')).toHaveText(new RegExp(`^\\d+ / ${total}$`));
    await expect(page.locator('.savestate')).toContainText('Saved to your history');
    // The skipped question is listed among the missed words, with no answer chosen.
    await expect(page.locator('.missed .mrow').filter({ hasText: 'No answer' })).toHaveCount(1);
  });

  test('leaving keeps it: continued from the list, ended early, then deleted from the history', async ({ page, request }) => {
    const deck = await richestDeck(request, 'bob');
    test.skip(!deck || deck.total < 4, 'needs a deck with at least four cards');
    await openSignedIn(page, request, 'bob');

    const total = await startTest(page, deck!, ['meaning']);
    await answerOne(page);
    await waitForOpenTest(request, 'bob', 1); // the test and its first answer reached the server

    // The X of the test screen asks first; the test is kept (the box is ticked by default).
    await page.getByRole('button', { name: 'Leave the test' }).click();
    const leave = page.getByRole('alertdialog', { name: 'Test in progress' });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/#\/tests/);

    // It shows under "In progress", with the one answer done, and Continue opens it at the first question not done.
    const openCard = page.locator('.paper-card.row.open').filter({ hasText: deck!.name });
    await expect(openCard).toBeVisible();
    await expect(openCard).toContainText(`1/${total}`);
    await openCard.locator('.resumebtn').click();
    await expect(page.locator('.progress .count')).toContainText(new RegExp(`^\\s*2\\s*/\\s*${total}\\s*$`));

    // Ending now: the questions left stay not done and are not counted as wrong.
    await page.getByRole('button', { name: 'End the test' }).click();
    const end = page.getByRole('alertdialog', { name: 'End the test?' });
    await expect(end).toBeVisible();
    await end.getByRole('button', { name: 'End the test' }).click();
    await expect(page.locator('.bigscore')).toHaveText(/^[01] \/ 1$/); // one answer, right or not
    await expect(page.locator('.scorecard')).toContainText(`${total - 1} not done`);
    await expect(page.locator('.savestate')).toContainText('Saved to your history'); // the finish reached the server

    // The finished test is in the history; opening it and deleting it removes the card.
    await page.getByRole('button', { name: 'History test' }).click();
    await expect(page).toHaveURL(/#\/tests/);
    const doneCard = page.locator('.paper-card.row').filter({ hasText: deck!.name });
    await expect(doneCard).toHaveCount(1);
    await doneCard.click();
    await page.getByRole('button', { name: 'Delete this test' }).click();
    const del = page.getByRole('alertdialog', { name: 'Delete this test' });
    await expect(del).toBeVisible();
    await del.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.paper-card.row').filter({ hasText: deck!.name })).toHaveCount(0);
  });

  test('a listening-only test asks with the speaker and never shows the word', async ({ page, request }) => {
    const deck = await richestDeck(request, 'bob');
    test.skip(!deck || deck.total < 4, 'needs a deck with at least four cards');
    await openSignedIn(page, request, 'bob');

    await startTest(page, deck!, ['listen']);
    await expect(page.locator('.qcard .ask')).toHaveText('Listen, then pick the word');
    await expect(page.locator('.qcard .qword')).toHaveCount(0); // no word on the screen: it has to be heard
    await expect(page.locator('.qcard .speak')).toBeVisible();

    // End it straight away: nothing answered, so the score is 0 / 0 and every question stays not done.
    await page.getByRole('button', { name: 'End the test' }).click();
    const end = page.getByRole('alertdialog', { name: 'End the test?' });
    await expect(end).toBeVisible();
    await end.getByRole('button', { name: 'End the test' }).click();
    await expect(page.locator('.bigscore')).toHaveText('0 / 0');
    await expect(page.locator('.scorecard')).toContainText('not done');
  });
});
