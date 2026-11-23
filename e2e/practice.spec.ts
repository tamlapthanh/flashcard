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
  const literal = ((await page.locator('.kanji').first().getAttribute('data-literal')) ?? '').trim();
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
  test.describe.configure({ timeout: 60_000 }); // the first page load of a run (the dev server compiling) can take half a minute
  test('the pencil opens a screen of its own: the question is there, the kanji is not, and Back returns to the same kanji', async ({ page, request }) => {
    const { literal, paths } = await openPractice(page, request);
    const screen = page.locator('.kp');
    await expect(screen).not.toContainText(literal); // the answer is not on screen
    await expect(screen).toHaveAttribute('data-revealed', 'false');
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
    await expect(page.locator('.kanji').first()).toHaveAttribute('data-literal', literal);
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
    await expect(page.locator('.kp')).toHaveAttribute('data-revealed', 'true'); // revealed
    await expect(page.locator('.practice svg path.stroke:not(.ghost)')).toHaveCount(paths.length); // every stroke drawn clean
  });

  test('looking at the outline reveals the kanji and the seal is only 済', async ({ page, request }) => {
    const { literal, paths } = await openPractice(page, request);
    await page.getByRole('button', { name: 'Show or hide the faint outline' }).click();
    await expect(page.locator('.practice svg path.stroke.ghost')).toHaveCount(paths.length);
    await expect(page.locator('.kp')).toHaveAttribute('data-revealed', 'true');
    for (const d of paths) await drawStroke(page, d);
    await expect(page.locator('.practice .hanko')).toHaveText('済');
    // outline off again, and starting again: back to writing from memory, the kanji hidden
    await page.getByRole('button', { name: 'Start again' }).click();
    await expect(page.locator('.practice svg path.stroke.ghost')).toHaveCount(0);
    await expect(page.locator('.kp')).toHaveAttribute('data-revealed', 'false');
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

  test('with a mouse the pointer is a brush: it follows the mouse over the drawing area, is gone when the mouse leaves, and the stroke is written like with a brush', async ({ page, request }) => {
    await openPractice(page, request);
    const board = page.locator('.practice svg.big');
    const box = (await board.boundingBox())!;
    const brush = page.locator('.practice .brush');
    await page.mouse.move(2, 2); // the mouse is where the pencil button was, which is now under the drawing area: take it away first
    await expect(brush).toHaveCount(0); // no brush while the mouse is not over the area

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await expect(brush).toBeVisible();
    await expect(board).toHaveClass(/nocursor/);
    expect(await board.evaluate((el) => getComputedStyle(el).cursor)).toBe('none'); // the brush in the picture is the pointer
    const before = await brush.getAttribute('transform');
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect.poll(() => brush.getAttribute('transform')).not.toBe(before); // it follows the mouse

    // writing: the brush is down, and the stroke is one closed shape with round ends (thick where slow, thin where fast), not a thin line
    await page.mouse.down();
    await expect(brush).toHaveClass(/down/);
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.6 + i * 0.02), box.y + box.height * (0.5 + i * 0.02), { steps: 2 });
    const ink = page.locator('.practice path.ink');
    await expect(ink).toHaveCount(1);
    const d = (await ink.getAttribute('d'))!;
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/A/g) ?? []).length).toBe(2);
    await page.mouse.up();
    await expect(brush).not.toHaveClass(/down/);

    await page.mouse.move(box.x - 20, box.y - 20); // out of the area
    await expect(brush).toHaveCount(0);
  });

  test('"my stroke was right": a refused stroke can be accepted, it is kept on this device, and Settings shows it', async ({ page, request }) => {
    const { paths } = await openPractice(page, request);
    const agree = page.getByRole('button', { name: 'My stroke was right' });
    await expect(agree).toHaveCount(0); // nothing refused yet
    // a big circle in the middle is no stroke of any kanji
    const box = (await page.locator('.practice svg.big').boundingBox())!;
    const at = (a: number) => ({ x: box.x + box.width * (0.5 + 0.35 * Math.cos(a)), y: box.y + box.height * (0.5 + 0.35 * Math.sin(a)) });
    await page.mouse.move(at(0).x, at(0).y);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) await page.mouse.move(at((i / 24) * 6.28).x, at((i / 24) * 6.28).y);
    await page.mouse.up();
    await expect(page.locator('.practice .why')).not.toHaveText('');
    await expect(agree).toBeVisible();

    await agree.click();
    await expect(agree).toHaveCount(0);
    if (paths.length > 1) await expect(page.locator('.practice .count')).toHaveText(`Write stroke 2 of ${paths.length}`);
    else await expect(page.locator('.practice .hanko')).toBeVisible();
    await expect(page.locator('.practice .why')).toHaveText('');
    if (paths.length === 1) await expect(page.locator('.practice .count .mdi-close-circle')).toHaveCount(0); // it was not a mistake

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('flashmobile.strokeSamples') ?? '[]') as { reason: string; strokeIndex: number; strokes: number; reference: string; strictness: string; points: unknown[] }[]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ strokeIndex: 0, strokes: paths.length, reference: paths[0], strictness: 'normal' });
    expect(saved[0]!.reason).toMatch(/shape|long|position|short|direction|order/);
    expect(saved[0]!.points.length).toBeGreaterThan(5);
    expect(saved[0]!.points.length).toBeLessThanOrEqual(40);

    // Settings in another tab of the same browser (same storage; the study screen stays as it is)
    const settingsTab = await page.context().newPage();
    await settingsTab.goto('/#/settings');
    await settingsTab.locator('.sechead').filter({ hasText: 'Handwriting' }).click();
    await expect(settingsTab.getByTestId('stroke-samples')).toHaveText('1 saved');
    await settingsTab.getByRole('button', { name: 'Clear' }).click();
    await expect(settingsTab.getByTestId('stroke-samples')).toHaveText('0 saved');
    expect(await settingsTab.evaluate(() => localStorage.getItem('flashmobile.strokeSamples'))).toBe('[]');
    await settingsTab.close();
  });
});
