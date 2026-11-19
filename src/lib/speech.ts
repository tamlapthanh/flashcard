/*
 * Reads a word aloud. First choice: the natural ElevenLabs voice (an MP3). Where a word's MP3 comes from, in this order:
 *   1. this deck's cache in the browser (Cache Storage: one cache per deck, one entry per word) - instant, works offline;
 *   2. the cache of ANOTHER deck that already has the same word (copied into this deck) - never fetched twice;
 *   3. a voice file shipped with the app (public/voices/<deck>/<word>.mp3, listed in voices/index.json) - no server needed;
 *   4. the server, which uses its own memory, a file on its disk, or finally ElevenLabs (the only paid step).
 * Whatever is found is kept in this deck's cache. When there is no natural voice (no server voice, asleep, out of credits, the
 * Settings switch is off) the device's own Japanese voice (Web Speech API) reads it.
 * `voiceSource` always says where the last word came from, so the screen can show it.
 * Only the word itself is read: the kana reading when there is one, otherwise the headword.
 */
import { ref } from 'vue';
import { fetchSpeech, type ServerVoiceSource } from '../api';
import { settings } from '../settings';

const CACHE_PREFIX = 'flashmobile-speech-v4:'; // + the deck name; bump the number when the server's voice or speed changes, so old recordings are not replayed

/** browser = this deck's cache, browser-other = another deck's cache, file = shipped with the app, the rest = what the server said, device = the phone's own voice. */
export type VoiceSource = 'browser' | 'browser-other' | 'file' | ServerVoiceSource | 'device';

/** The source of the word that was spoken last (a new object every time, so the same source twice is still noticed). */
export const voiceSource = ref<{ source: VoiceSource; n: number } | null>(null);
let announced = 0;
const announce = (source: VoiceSource): void => {
  voiceSource.value = { source, n: ++announced };
};

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || typeof Audio !== 'undefined');
}

let current = 0; // bumped by every speak/stop, so a late answer of an older request never plays
let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;

function release(): void {
  audio?.pause();
  audio = null;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

/* ---- the voice files shipped with the app ---- */

type VoiceIndex = Record<string, Record<string, string>>; // deck -> word -> path under voices/
let voiceIndex: Promise<VoiceIndex> | null = null;
const siteBase = (): string => import.meta.env.BASE_URL ?? '/';

function loadVoiceIndex(): Promise<VoiceIndex> {
  voiceIndex ??= fetch(`${siteBase()}voices/index.json`)
    .then((res) => (res.ok ? (res.json() as Promise<{ decks?: VoiceIndex }>) : { decks: {} }))
    .then((json) => (json && typeof json.decks === 'object' && json.decks ? json.decks : {}))
    .catch(() => ({})); // no index (not deployed, offline, or the dev server answered with a page): nothing is shipped
  return voiceIndex;
}

async function shippedFile(text: string, deck: string): Promise<Blob | null> {
  const decks = await loadVoiceIndex();
  const rel = decks[deck]?.[text] ?? Object.values(decks).map((words) => words[text]).find(Boolean); // the same word of another deck will do
  if (!rel) return null;
  try {
    const res = await fetch(`${siteBase()}voices/${rel.split('/').map(encodeURIComponent).join('/')}`);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/* ---- the browser's cache, one per deck ---- */

const entryUrl = (text: string, deck?: string): string => `/speech/${encodeURIComponent(text)}${deck === undefined ? '' : `?deck=${encodeURIComponent(deck)}`}`;

async function remember(store: Cache | null, key: Request, blob: Blob): Promise<void> {
  await store?.put(key, new Response(blob, { headers: { 'content-type': 'audio/mpeg' } })).catch(() => undefined);
}

async function cachedSpeech(text: string, deck: string): Promise<{ blob: Blob; source: VoiceSource }> {
  const hasCaches = typeof caches !== 'undefined';
  const key = new Request(entryUrl(text, deck));
  const store = hasCaches ? await caches.open(CACHE_PREFIX + (deck || '_')).catch(() => null) : null;

  const own = await store?.match(key);
  if (own) return { blob: await own.blob(), source: 'browser' };

  // the same word in another deck's cache (a search by address only, whatever the deck): a few milliseconds, no download
  const other = hasCaches ? await caches.match(new Request(entryUrl(text)), { ignoreSearch: true }).catch(() => undefined) : undefined;
  if (other) {
    const blob = await other.blob();
    await remember(store, key, blob);
    return { blob, source: 'browser-other' };
  }

  const file = await shippedFile(text, deck);
  if (file) {
    await remember(store, key, file);
    return { blob: file, source: 'file' };
  }

  const served = await fetchSpeech(text, deck);
  await remember(store, key, served.blob);
  return { blob: served.blob, source: served.source };
}

function speakWithDevice(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  announce('device');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja'));
  if (voice) utterance.voice = voice;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

/** `deck` is the name of the deck the word is studied in; without it the word is kept in a common cache. */
export function speakJapanese(text: string, onEnd?: () => void, deck = ''): void {
  const id = ++current;
  stopOutput();
  if (!text) {
    onEnd?.();
    return;
  }
  if (!settings.naturalVoice || typeof Audio === 'undefined') {
    speakWithDevice(text, onEnd);
    return;
  }
  void cachedSpeech(text, deck).then(
    ({ blob, source }) => {
      if (id !== current) return; // stopped or replaced while the voice was loading
      announce(source); // known as soon as the file is in hand (a failing player below then says "device" instead)
      audioUrl = URL.createObjectURL(blob);
      audio = new Audio(audioUrl);
      audio.onended = () => onEnd?.();
      audio.onerror = () => {
        release();
        if (id === current) speakWithDevice(text, onEnd);
      };
      audio.play().catch(() => {
        release();
        if (id === current) speakWithDevice(text, onEnd);
      });
    },
    () => {
      if (id === current) speakWithDevice(text, onEnd); // no ElevenLabs voice available: device voice instead
    }
  );
}

/** Gets a word ready (into the browser's cache) without playing it, so it starts at once when its turn comes. */
export function prefetchSpeech(text: string, deck = ''): void {
  if (!text || !settings.naturalVoice || typeof Audio === 'undefined') return;
  void cachedSpeech(text, deck).catch(() => undefined);
}

function stopOutput(): void {
  release();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function stopSpeaking(): void {
  current++;
  stopOutput();
}
