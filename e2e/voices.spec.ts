import type { Page } from '@playwright/test';
import { expect, openSignedIn, richestDeck, startStudy, test, type DeckInfo } from './fixtures';

/*
 * Where a spoken word comes from, and the badge that says so: this deck's browser cache -> another deck's cache -> a voice file
 * shipped with the app -> the server (its memory, its disk, or a paid ElevenLabs call) -> the device's own voice.
 * The server's answers are stubbed: no real ElevenLabs call, and a tiny silent WAV is the "audio".
 */
function silentWav(): Buffer {
  const data = Buffer.alloc(800 * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(16000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
const WAV = silentWav();

let deck: DeckInfo;
let requests: string[]; // the /api/speech requests that reached the (stubbed) server
let serverSource: string | null; // what the stub says in x-voice-source

test.beforeEach(async ({ page, request }) => {
  const richest = await richestDeck(request, 'bob');
  test.skip(!richest || richest.counts.new + richest.counts.learning < 2, 'needs at least two new/learning cards');
  deck = richest!;
  requests = [];
  serverSource = 'elevenlabs';
  await page.route('**/api/speech*', async (route) => {
    requests.push(route.request().url());
    const headers: Record<string, string> = { 'content-type': 'audio/mpeg', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-voice-source' };
    if (serverSource) headers['x-voice-source'] = serverSource;
    await route.fulfill({ status: 200, headers, body: WAV });
  });
  await openSignedIn(page, request, 'bob');
  await startStudy(page, deck);
});

/* The read-aloud button carries the source of the word (data-voice) while it plays, and its colour follows. */
const badge = (page: Page) => page.locator('.speakc[data-voice]');
const speaker = (page: Page) => page.locator('.speakc');

/** The text the speaker reads for the card on screen (the reading when there is one), from the saved run. */
const spokenText = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const run = JSON.parse(localStorage.getItem('flashmobile.run.bob') ?? '{}') as { queue: string[]; cards: { id: string; reading: string | null; headword: string }[] };
    const card = run.cards.find((c) => c.id === run.queue[0])!;
    return card.reading || card.headword;
  });

/** Speaks the card on screen and waits for the badge to appear and fade away again. */
async function play(page: Page): Promise<void> {
  await speaker(page).click();
  await expect(badge(page)).toBeVisible();
}

test.describe('where a spoken word comes from', () => {
  test.beforeEach(async ({ page }) => {
    await expect.poll(() => page.evaluate(() => localStorage.getItem('flashmobile.run.bob'))).not.toBeNull();
    test.skip(!(await speaker(page).isVisible()), 'the speaker button only shows when the browser can speak');
  });

  test('the first play asks the server with the deck name and shows that it was a new ElevenLabs call', async ({ page }) => {
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'ElevenLabs (new)');
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!);
    expect(url.searchParams.get('deck')).toBe(deck.name);
    expect(url.searchParams.get('text')).toBe(await spokenText(page));
  });

  test('the second play of the same word comes from the browser cache: no request, badge "Browser cache"', async ({ page }) => {
    await play(page);
    await expect(badge(page)).toBeHidden({ timeout: 6000 }); // the badge fades after a moment
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Browser cache · ElevenLabs (new)'); // and where it was fetched from in the first place
    expect(requests).toHaveLength(1);
  });

  test('the browser cache is organised by deck: one cache per deck, one entry per word', async ({ page }) => {
    await play(page);
    const entries = await page.evaluate(async (name) => {
      const store = await caches.open(`flashmobile-speech-v5:elevenlabs:0:${name}`);
      return (await store.keys()).map((k) => decodeURIComponent(k.url));
    }, deck.name);
    const text = await spokenText(page);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain(text);
    expect(entries[0]).toContain(`deck=${deck.name}`);
  });

  test('a word that another deck already cached is reused, not fetched again, and then belongs to this deck too', async ({ page }) => {
    const text = await spokenText(page);
    await page.evaluate(
      async ([word, wav]) => {
        const store = await caches.open('flashmobile-speech-v5:elevenlabs:0:Some other deck');
        await store.put(new Request(`/speech/${encodeURIComponent(word!)}?deck=${encodeURIComponent('Some other deck')}`), new Response(new Uint8Array(JSON.parse(wav!) as number[]), { headers: { 'content-type': 'audio/mpeg' } }));
      },
      [text, JSON.stringify([...WAV])]
    );
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Browser cache (other deck)');
    expect(requests).toHaveLength(0); // nothing was asked of the server
    await expect(badge(page)).toBeHidden({ timeout: 6000 });
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Browser cache'); // copied into this deck's own cache
    const own = await page.evaluate(async (name) => (await (await caches.open(`flashmobile-speech-v5:elevenlabs:0:${name}`)).keys()).length, deck.name);
    expect(own).toBe(1);
  });

  test('a voice file shipped with the app (voices/index.json) is played without any server request', async ({ page }) => {
    const text = await spokenText(page);
    await page.route('**/voices/index.json', (route) =>
      route.fulfill({ json: { version: 1, decks: { [deck.name]: { [text]: `${deck.name}/word.mp3` } } } })
    );
    let fileAsked = '';
    await page.route('**/voices/**/*.mp3', async (route) => {
      fileAsked = decodeURIComponent(route.request().url());
      await route.fulfill({ status: 200, headers: { 'content-type': 'audio/mpeg' }, body: WAV });
    });
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Saved file');
    expect(fileAsked).toContain(`${deck.name}/word.mp3`);
    expect(requests).toHaveLength(0);
    await expect(badge(page)).toBeHidden({ timeout: 6000 });
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Browser cache · Saved file'); // kept in the cache after the first play, with its origin
  });

  test('the server says where its audio came from: its memory, its disk, or unknown', async ({ page }) => {
    serverSource = 'server-memory';
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Server cache');
    await expect(badge(page)).toBeHidden({ timeout: 6000 });

    await page.keyboard.press('ArrowRight'); // another word, not in the cache yet
    serverSource = 'server-file';
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Server file');
    await expect(badge(page)).toBeHidden({ timeout: 6000 });

    await page.keyboard.press('ArrowRight');
    serverSource = null; // an older server sends no header
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Server');
  });

  test('without a natural voice from the server, the device voice reads it and the badge says so', async ({ page }) => {
    await page.unroute('**/api/speech*');
    await page.route('**/api/speech*', (route) => route.fulfill({ status: 404, json: { error: 'speech is not enabled' } }));
    await play(page);
    await expect(badge(page)).toHaveAttribute('data-voice', 'Device voice');
  });
});
