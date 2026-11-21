import type { APIRequestContext, Page } from '@playwright/test';
import { expect, openSignedIn, richestDeck, startStudy, test } from './fixtures';

/*
 * Handwriting practice in the kanji sheet: the strokes are drawn with the real mouse (pointer events) along the faint outline
 * of the kanji, so the check runs on the real stroke data of the local dictionary.
 */
async function openPractice(page: Page, request: APIRequestContext): Promise<number> {
  const deck = await richestDeck(request, 'alice');
  test.skip(!deck || deck.counts.new + deck.counts.learning === 0, 'no new/learning cards in the local data');
  await openSignedIn(page, request, 'alice');
  await startStudy(page, deck!);
  const rows = page.locator('.hvp');
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await page.keyboard.press('ArrowUp');
    found = await rows.first().waitFor({ timeout: 1500 }).then(() => true, () => false);
    if (!found) await page.keyboard.press('ArrowRight');
  }
  test.skip(!found, 'no card with kanji in the first 20 cards of the local data');
  await rows.first().locator('button.k').click();
  await expect(page.locator('.kanji')).toBeVisible();
  await page.getByRole('button', { name: 'Practice writing' }).click();
  const prompt = page.locator('.practice .count');
  await expect(prompt).toHaveText(/Write stroke 1 of \d+/);
  return Number(/of (\d+)/.exec((await prompt.textContent()) ?? '')![1]);
}

/* Draws stroke `index` with the mouse along the faint outline (or backwards), 30 steps. */
async function drawStroke(page: Page, index: number, backwards = false): Promise<void> {
  const pts = await page.evaluate(({ index }) => {
    const svg = document.querySelector('.practice svg')!;
    const path = svg.querySelectorAll('path.stroke.ghost')[index] as SVGPathElement;
    const len = path.getTotalLength();
    const box = svg.getBoundingClientRect();
    return Array.from({ length: 31 }, (_, i) => {
      const q = path.getPointAtLength((len * i) / 30);
      return { x: box.left + (q.x / 109) * box.width, y: box.top + (q.y / 109) * box.height };
    });
  }, { index });
  if (backwards) pts.reverse();
  await page.mouse.move(pts[0]!.x, pts[0]!.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
}

test.describe('kanji handwriting practice', () => {
  test('a stroke drawn right moves on to the next one; the whole kanji ends with "Done"', async ({ page, request }) => {
    const strokes = await openPractice(page, request);
    const prompt = page.locator('.practice .count');
    for (let i = 0; i < strokes; i++) {
      await drawStroke(page, i);
      if (i < strokes - 1) await expect(prompt).toHaveText(`Write stroke ${i + 2} of ${strokes}`);
    }
    // finished with no wrong stroke: shown by a red seal and icons, not by a sentence (the sentence is only for screen readers)
    await expect(page.locator('.practice .hanko')).toHaveText('合');
    await expect(page.locator('.practice .count .mdi-check-circle')).toBeVisible();
    await expect(page.locator('.practice .count .mdi-close-circle')).toHaveCount(0);
    await expect(page.locator('.practice .sr')).toHaveText('Done, no wrong stroke!');
    await expect(page.locator('.practice svg path.stroke:not(.ghost)')).toHaveCount(strokes); // every stroke is now drawn clean
  });

  test('a stroke drawn backwards is refused with the reason, and the same stroke is still expected', async ({ page, request }) => {
    const strokes = await openPractice(page, request);
    const prompt = page.locator('.practice .count');
    // the first stroke of a kanji can be a short dot: judged by its place only, so take a kanji where it can go backwards
    const length = await page.evaluate(() => (document.querySelector('.practice svg path.stroke.ghost') as SVGPathElement).getTotalLength());
    test.skip(length < 30, 'the first stroke of this kanji is too short to have a direction');
    await drawStroke(page, 0, true);
    await expect(page.locator('.practice .why')).toHaveText(/Wrong direction/);
    await expect(prompt).toHaveText(`Write stroke 1 of ${strokes}`);
    // what the user sees: the frame goes red, the right stroke is drawn in green with its number, a start dot and an arrow
    await expect(page.locator('.practice svg.big')).toHaveClass(/bad/);
    await expect(page.locator('.practice svg path.hintp')).toHaveCount(1);
    await expect(page.locator('.practice svg circle.startdot')).toHaveCount(1);
    await expect(page.locator('.practice svg polygon.arrow')).toHaveCount(1);
    await expect(page.locator('.practice svg text.num')).toHaveText('1');
    await drawStroke(page, 0); // then the right way: it is accepted
    await expect(page.locator('.practice .why')).toHaveText('');
    if (strokes > 1) await expect(prompt).toHaveText(`Write stroke 2 of ${strokes}`);
  });

  test('writing from memory (outline off): the right stroke is shown from the second wrong try, not the first', async ({ page, request }) => {
    await openPractice(page, request);
    await page.getByRole('button', { name: 'Show or hide the faint outline' }).click();
    const hint = page.locator('.practice svg path.hintp');
    // a big circle in the middle is no stroke of any kanji
    const scribble = async (): Promise<void> => {
      const box = (await page.locator('.practice svg.big').boundingBox())!;
      const at = (a: number) => ({ x: box.x + box.width * (0.5 + 0.35 * Math.cos(a)), y: box.y + box.height * (0.5 + 0.35 * Math.sin(a)) });
      await page.mouse.move(at(0).x, at(0).y);
      await page.mouse.down();
      for (let i = 1; i <= 24; i++) await page.mouse.move(at((i / 24) * 6.28).x, at((i / 24) * 6.28).y);
      await page.mouse.up();
    };
    await scribble();
    await expect(page.locator('.practice .why')).not.toHaveText('');
    await expect(hint).toHaveCount(0); // once: not yet
    await page.waitForTimeout(700);
    await scribble();
    await expect(hint).toHaveCount(1); // twice: the right stroke is shown
  });

  test('the buttons: hide the outline, show the next stroke, start again, and go back to the player', async ({ page, request }) => {
    const strokes = await openPractice(page, request);
    const ghosts = page.locator('.practice svg path.stroke.ghost');
    await expect(ghosts).toHaveCount(strokes);
    await page.getByRole('button', { name: 'Show or hide the faint outline' }).click();
    await expect(ghosts).toHaveCount(0);

    await page.getByRole('button', { name: 'Show the next stroke' }).click();
    await expect(page.locator('.practice svg path.hintp')).toHaveCount(1);

    await page.getByRole('button', { name: 'Show or hide the faint outline' }).click(); // back on, to draw along it
    await drawStroke(page, 0);
    if (strokes > 1) await expect(page.locator('.practice .count')).toHaveText(`Write stroke 2 of ${strokes}`);
    else await expect(page.locator('.practice .hanko')).toBeVisible();
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('.practice .count')).toHaveText(`Write stroke 1 of ${strokes}`);

    await page.getByRole('button', { name: 'Back to the stroke order' }).click();
    await expect(page.locator('.practice')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Practice writing' })).toBeVisible();
  });
});
