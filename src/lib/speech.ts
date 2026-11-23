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

/** Where a word first came from, kept with its entry in the browser's cache (a word got there from a saved file, the server, ...). */
export type VoiceOrigin = 'file' | ServerVoiceSource;
const ORIGINS: readonly string[] = ['file', 'elevenlabs', 'server-memory', 'server-file', 'server'];
const originOf = (response: Response): VoiceOrigin | undefined => {
  const value = response.headers.get('x-voice-origin');
  return value && ORIGINS.includes(value) ? (value as VoiceOrigin) : undefined;
};

/** The source of the word that was spoken last (a new object every time, so the same source twice is still noticed). `origin` is
    set when the word came out of the browser's cache: where it was fetched from in the first place (e.g. fetched ahead by auto play). */
export const voiceSource = ref<{ source: VoiceSource; origin?: VoiceOrigin; n: number } | null>(null);
let announced = 0;
const announce = (source: VoiceSource, origin?: VoiceOrigin): void => {
  voiceSource.value = { source, origin, n: ++announced };
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

async function remember(store: Cache | null, key: Request, blob: Blob, origin?: VoiceOrigin): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'audio/mpeg' };
  if (origin) headers['x-voice-origin'] = origin;
  await store?.put(key, new Response(blob, { headers })).catch(() => undefined);
}

async function cachedSpeech(text: string, deck: string, save = true): Promise<{ blob: Blob; source: VoiceSource; origin?: VoiceOrigin }> {
  const hasCaches = typeof caches !== 'undefined';
  const key = new Request(entryUrl(text, deck));
  const store = hasCaches ? await caches.open(CACHE_PREFIX + (deck || '_')).catch(() => null) : null;

  const own = await store?.match(key);
  if (own) return { blob: await own.blob(), source: 'browser', origin: originOf(own) };

  // the same word in another deck's cache (a search by address only, whatever the deck): a few milliseconds, no download
  const other = hasCaches ? await caches.match(new Request(entryUrl(text)), { ignoreSearch: true }).catch(() => undefined) : undefined;
  if (other) {
    const blob = await other.blob();
    const origin = originOf(other);
    await remember(store, key, blob, origin);
    return { blob, source: 'browser-other', origin };
  }

  const file = await shippedFile(text, deck);
  if (file) {
    await remember(store, key, file, 'file');
    return { blob: file, source: 'file' };
  }

  const served = await fetchSpeech(text, deck, save);
  await remember(store, key, served.blob, served.source);
  return { blob: served.blob, source: served.source };
}

/* The sound device sleeps when nothing played for a while (and a Bluetooth one takes a moment to wake): the start of the first word is then
   swallowed. After a pause a quarter second of silence is played first, so the device is awake when the word begins. */
const IDLE_MS = 4000;
const WAKE_MS = 250;
let lastSoundAt = 0;
let silenceUrl = '';
function silence(): string {
  if (silenceUrl) return silenceUrl;
  const samples = 8000 * (WAKE_MS / 1000); // 8 kHz, 16 bit, mono
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string): void => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples * 2, true);
  silenceUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  return silenceUrl;
}
function wakeOutput(): Promise<void> {
  if (Date.now() - lastSoundAt < IDLE_MS) return Promise.resolve();
  return new Promise((resolve) => {
    const quiet = new Audio(silence());
    const done = (): void => resolve();
    quiet.onended = done;
    quiet.onerror = done;
    setTimeout(done, WAKE_MS + 300); // never wait longer than this
    quiet.play().catch(done);
  });
}

function speakWithDevice(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  announce('device');
  window.speechSynthesis.cancel();
  const id = current;
  // Speaking in the same instant as cancel() makes some browsers (Chrome) swallow the start of the word: wait a moment.
  setTimeout(() => {
    if (id === current) speakNow(text, onEnd);
  }, 80);
}

function speakNow(text: string, onEnd?: () => void): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja'));
  if (voice) utterance.voice = voice;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

/** `deck` is the name of the deck the word is studied in; without it the word is kept in a common cache. `save` false: the server
    plays the word without keeping a file of it (the browser's own cache still keeps it). */
export function speakJapanese(text: string, onEnd?: () => void, deck = '', save = true): void {
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
  void cachedSpeech(text, deck, save).then(
    ({ blob, source, origin }) => {
      if (id !== current) return; // stopped or replaced while the voice was loading
      announce(source, origin); // known as soon as the file is in hand (a failing player below then says "device" instead)
      audioUrl = URL.createObjectURL(blob);
      const player = new Audio(audioUrl);
      audio = player;
      player.preload = 'auto';
      player.onended = () => {
        lastSoundAt = Date.now();
        onEnd?.();
      };
      player.onerror = () => {
        release();
        if (id === current) speakWithDevice(text, onEnd);
      };
      void wakeOutput().then(() => {
        if (id !== current || audio !== player) return; // stopped or replaced while the device woke up
        lastSoundAt = Date.now();
        player.play().catch(() => {
          release();
          if (id === current) speakWithDevice(text, onEnd);
        });
      });
    },
    () => {
      if (id === current) speakWithDevice(text, onEnd); // no ElevenLabs voice available: device voice instead
    }
  );
}

/** Gets a word ready (into the browser's cache) without playing it, so it starts at once when its turn comes. */
export function prefetchSpeech(text: string, deck = '', save = true): void {
  if (!text || !settings.naturalVoice || typeof Audio === 'undefined') return;
  void cachedSpeech(text, deck, save).catch(() => undefined);
}

function stopOutput(): void {
  release();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function stopSpeaking(): void {
  current++;
  stopOutput();
}
