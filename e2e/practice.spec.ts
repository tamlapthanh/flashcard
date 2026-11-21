import type { APIRequestContext, Page } from '@playwright/test';
import { expect, openSignedIn, richestDeck, startStudy, test } from './fixtures';

/*
 * Handwriting practice: the pencil button of the kanji sheet opens a screen of its own (like a component opened from the graph) with
 * the question (sound, meaning, readings, parts) and a big drawing area, but not the kanji itself. The strokes are drawn with the real
 * mouse (pointer events), along the stroke data the player of the same kanji had just drawn, so the check runs on the real data.
 */
interface Opened {
  literal: string; // the kanji, read before the practice screen hides it
  paths: string[]; // its strokes (SVG paths in the 109 x 109 box)
}

async function openPractice(page: Page, request: APIRequestContext): Promise<Opened> {
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
  const literal = ((await page.locator('.kanji .glyph').first().textContent()) ?? '').trim();
  const paths = await page.locator('.kanji .canvas svg.big path.ghost').evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''));
  await page.getByRole('button', { name: 'Practice writing' }).click();
  await expect(page.locator('.kp')).toBeVisible();
  await expect(page.locator('.practice .count')).toHaveText(`Write stroke 1 of ${paths.length}`);
  return { literal, paths };
}

/* Draws the stroke `d` with the mouse along its line (or backwards), 30 steps, on the drawing area. */
async function drawStroke(page: Page, d: string, backwards = false): Promise<void> {
  const pts = await page.evaluate(({ d }) => {
    const ns = 'http://www.w3.org/2000/svg';
    const tmp = document.createElementNS(ns, 'svg');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    tmp.appendChild(path);
    document.body.appendChild(tmp); // a path has a length only inside the document
    const len = path.getTotalLength();
    const box = document.querySelector('.practice svg.big')!.getBoundingClientRect();
    const out = Array.from({ length: 31 }, (_, i) => {
      const q = path.getPointAtLength((len * i) / 30);
      return { x: box.left + (q.x / 109) * box.width, y: box.top + (q.y / 109) * box.height };
    });
    tmp.remove();
    return out;
  }, { d });
  if (backwards) pts.reverse();
  await page.mouse.move(pts[0]!.x, pts[0]!.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
}

test.describe('kanji handwriting practice', () => {
  test('the pencil opens a screen of its own: the question is there, the kanji is not, and Back returns to the same kanji', async ({ page, request }) => {
    const { literal, paths } = await openPractice(page, request);
    const screen = page.locator('.kp');
    await expect(screen).not.toContainText(literal); // the answer is not on screen
    await expect(screen.locator('.glyph')).toHaveText('?');
    // the parts (Memory hint) are a help the user asks for: folded at first
    const toggle = screen.getByRole('button', { name: 'Memory hint' });
    if (await toggle.count()) {
      await expect(screen.locator('.part')).toHaveCount(0);
      await toggle.click();
      await expect(screen.locator('.part').first()).toBeVisible();
      await toggle.click();
      await expect(screen.locator('.part')).toHaveCount(0);
    }
    await expect(page.locator('.kanji')).toHaveCount(0); // the kanji block (with its big kanji, formula and graph) is gone
    await expect(page.locator('.practice svg.big')).toBeVisible();
    const box = (await page.locator('.practice svg.big').boundingBox())!;
    expect(box.width).toBeGreaterThan(220); // a big drawing area, not the 210px column of the player
    expect(paths.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.kp')).toHaveCount(0);
    await expect(page.locator('.kanji .glyph').first()).toHaveText(literal);
    await expect(page.getByRole('button', { name: 'Practice writing' })).toBeVisible();
  });

  test('on a wide window the question is not squeezed: the sheet is narrower than the window, and the layout follows the sheet', async ({ page, request }) => {
    await page.setViewportSize({ width: 1207, height: 990 });
    await openPractice(page, request);
    const cue = (await page.locator('.cue').boundingBox())!;
    const info = (await page.locator('.cue .info').boundingBox())!;
    expect(cue.width).toBeGreaterThan(300); // it once got ~60px, with the meaning written one letter per line
    expect(info.width).toBeGreaterThan(150);
    expect(info.height).toBeLessThan(120);
    const board = (await page.locator('.practice svg.big').boundingBox())!;
    expect(board.width).toBeGreaterThan(300);
  });

  test('written from memory, all strokes right: the kanji appears and the seal is 合; the sentence is only for screen readers', async ({ page, request }) => {
    const { literal, paths } = await openPractice(page, request);
    const prompt = page.locator('.practice .count');
    for (let i = 0; i < paths.length; i++) {
      await drawStroke(page, paths[i]!);
      if (i < paths.length - 1) await expect(prompt).toHaveText(`Write stroke ${i + 2} of ${paths.length}`);
    }
    await expect(page.locator('.practice .hanko')).toHaveText('合');
    await expect(page.locator('.practice .count .mdi-check-circle')).toBeVisible();
    await expect(page.locator('.practice .count .mdi-close-circle')).toHaveCount(0);
    await expect(page.locator('.practice .sr')).toHaveText('Done, no wrong stroke!');
    await expect(page.locator('.kp .glyph')).toHaveText(literal); // revealed
    await expect(page.locator('.practice svg path.stroke:not(.ghost)')).toHaveCount(paths.length); // every stroke drawn clean
  });

  test('looking at the outline reveals the kanji and the seal is only 済', async ({ page, request }) => {
    const { literal, paths } = await openPractice(page, request);
    await page.getByRole('button', { name: 'Show or hide the faint outline' }).click();
    await expect(page.locator('.practice svg path.stroke.ghost')).toHaveCount(paths.length);
    await expect(page.locator('.kp .glyph')).toHaveText(literal);
    for (const d of paths) await drawStroke(page, d);
    await expect(page.locator('.practice .hanko')).toHaveText('済');
    // outline off again, and starting again: back to writing from memory, the kanji hidden
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('.practice svg path.stroke.ghost')).toHaveCount(0);
    await expect(page.locator('.kp .glyph')).toHaveText('?');
  });

  test('a stroke drawn backwards: refused with the reason; the right stroke is shown from the second wrong try; then the right way is accepted', async ({ page, request }) => {
    const { paths } = await openPractice(page, request);
    // the first stroke long enough to have a direction (a dot or a tick has none); the strokes before it are written right
    const lengths = await page.evaluate((all) => {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      document.body.appendChild(svg);
      const out = all.map((d) => {
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        return path.getTotalLength();
      });
      svg.remove();
      return out;
    }, paths);
    const k = lengths.findIndex((length) => length >= 30);
    test.skip(k < 0, 'no stroke of this kanji is long enough to have a direction');
    for (let i = 0; i < k; i++) await drawStroke(page, paths[i]!);
    await expect(page.locator('.practice .count')).toHaveText(`Write stroke ${k + 1} of ${paths.length}`);

    const hint = page.locator('.practice svg path.hintp');
    await drawStroke(page, paths[k]!, true);
    await expect(page.locator('.practice .why')).toHaveText(/Wrong direction/);
    await expect(page.locator('.practice svg.big')).toHaveClass(/bad/);
    await expect(hint).toHaveCount(0); // writing from memory: the first wrong try gets no help yet
    await page.waitForTimeout(700);
    await drawStroke(page, paths[k]!, true);
    // the second: the right stroke in green with its number, a start dot and an arrow
    await expect(hint).toHaveCount(1);
    await expect(page.locator('.practice svg circle.startdot')).toHaveCount(1);
    await expect(page.locator('.practice svg polygon.arrow')).toHaveCount(1);
    await expect(page.locator('.practice svg text.num')).toHaveText(String(k + 1));
    await expect(page.locator('.practice .count')).toHaveText(`Write stroke ${k + 1} of ${paths.length}`);
    await drawStroke(page, paths[k]!); // the right way
    await expect(page.locator('.practice .why')).toHaveText('');
    if (k + 1 < paths.length) await expect(page.locator('.practice .count')).toHaveText(`Write stroke ${k + 2} of ${paths.length}`);
  });

  test('the buttons: show the next stroke (and it is no longer entirely from memory), start again', async ({ page, request }) => {
    const { paths } = await openPractice(page, request);
    await page.getByRole('button', { name: 'Show the next stroke' }).click();
    await expect(page.locator('.practice svg path.hintp')).toHaveCount(1);
    for (const d of paths) await drawStroke(page, d);
    await expect(page.locator('.practice .hanko')).toHaveText('済'); // the hint button was used
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('.practice .count')).toHaveText(`Write stroke 1 of ${paths.length}`);
    await expect(page.locator('.practice svg path.hintp')).toHaveCount(0);
  });
});
