/*
 * The only place that talks to the server. Calls carry the login token (and the static key, for a server without
 * login). A 401 on any call other than login means the session ended: the user is signed out and sent to the login screen.
 * Study results go through a persistent queue so nothing is lost when the server is asleep or the phone is offline.
 */
import { reactive } from 'vue';
import { auth, clearSession, setSession } from './auth';
import { t } from './i18n';
import { isOfflineFailure, readCached, withCache, writeCached } from './lib/apiCache';
import type { CardDetail, Deck, KanjiInfo, LightCard, LookupResult, StudyResult } from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const KEY = import.meta.env.VITE_API_KEY ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  return { ...(KEY ? { 'x-api-key': KEY } : {}), ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { 'content-type': 'application/json', ...authHeaders(), ...init?.headers }
    });
  } catch {
    throw new ApiError(t('api.conn'), 0);
  }
  if (res.status === 401 && path !== '/api/login') clearSession();
  if (!res.ok) throw new ApiError(t('api.server', { status: res.status }), res.status);
  return (await res.json()) as T;
}

/* The answer of a GET, kept on this device and used when the server cannot be reached (lib/apiCache.ts). */
const cached = <T>(key: string, live: () => Promise<T>): Promise<T> =>
  withCache(auth.user, key, live, (e) => (e instanceof ApiError ? e.status : 0));

const ALL_STATUSES = ['new', 'learning', 'learned', 'skipped'];
const cardsKey = (p: { deck: string; tags: string[]; status: string[] }): string => `cards:${p.deck}|${p.tags.join(',')}|${p.status.join(',')}`;

/* Offline and this exact list was never loaded: build it from the copy of the whole deck, with the results still waiting in the queue
   applied (a word learned offline is learned here too). */
function filterCopy(all: { total: number; cards: LightCard[] }, p: { tags: string[]; status: string[] }): { total: number; cards: LightCard[] } {
  const pending = new Map<string, StudyResult>(readQueue().map((q) => [q.wordId, q.result]));
  const cards = all.cards
    .map((c) => {
      const r = pending.get(c.id);
      return r ? { ...c, progress: { ...c.progress, status: (r === 'learned' ? 'learned' : r === 'skip' ? 'skipped' : 'learning') as LightCard['progress']['status'] } } : c;
    })
    .filter((c) => (!p.tags.length || c.tags.some((tag) => p.tags.includes(tag))) && (!p.status.length || p.status.includes(c.progress.status)));
  return { total: cards.length, cards };
}

async function cardsFor(params: { deck: string; tags: string[]; status: string[] }): Promise<{ total: number; cards: LightCard[] }> {
  const q = new URLSearchParams({ deck: params.deck });
  if (params.tags.length) q.set('tags', params.tags.join(','));
  if (params.status.length) q.set('status', params.status.join(','));
  try {
    return await cached(cardsKey(params), () => request<{ total: number; cards: LightCard[] }>('/api/cards?' + q.toString()));
  } catch (e) {
    if (!(e instanceof ApiError) || !isOfflineFailure(e.status)) throw e;
    const all = await readCached<{ total: number; cards: LightCard[] }>(auth.user, cardsKey({ deck: params.deck, tags: [], status: ALL_STATUSES }));
    if (!all) throw e;
    return filterCopy(all, params);
  }
}

/* Warms the on-device copy of the details of many cards (a deck studied once online can then be studied offline). Stops at the first failure. */
export async function prefetchDetails(ids: string[], batch = 30): Promise<void> {
  for (let i = 0; i < ids.length; i += batch) {
    try {
      await api.cardDetails(ids.slice(i, i + batch));
    } catch {
      return;
    }
  }
}

export const api = {
  /** Resolves with the user name; a wrong name or password rejects with status 401. */
  login: async (username: string, password: string): Promise<string> => {
    const r = await request<{ token: string; user: string }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    // Results still queued belong to the previous user: they must not be credited to someone else.
    if (auth.user && auth.user !== r.user) writeQueue([]);
    setSession(r.token, r.user);
    return r.user;
  },
  decks: () => cached('decks', () => request<{ decks: Deck[] }>('/api/decks')).then((r) => r.decks),
  cards: (params: { deck: string; tags: string[]; status: string[] }) => cardsFor(params),
  /** The heavy part (furigana, pitch, kanji, note) of up to 30 cards. Each card is also kept on its own, so any mix of ids can be rebuilt offline. */
  cardDetails: async (ids: string[]): Promise<CardDetail[]> => {
    try {
      const { details } = await request<{ details: CardDetail[] }>('/api/cards/detail?ids=' + encodeURIComponent(ids.join(',')));
      for (const d of details) void writeCached(auth.user, 'detail:' + d.id, d);
      return details;
    } catch (e) {
      if (!(e instanceof ApiError) || !isOfflineFailure(e.status)) throw e;
      const found = (await Promise.all(ids.map((id) => readCached<CardDetail>(auth.user, 'detail:' + id)))).filter((d): d is CardDetail => !!d);
      if (found.length === 0) throw e;
      return found;
    }
  },
  /** Kanji records (with parts) for the given characters. */
  kanji: (chars: string) => cached('kanji:' + chars, () => request<{ kanji: KanjiInfo[] }>('/api/kanji?chars=' + encodeURIComponent(chars))).then((r) => r.kanji),
  lookup: (headword: string, reading: string | null) => {
    const q = new URLSearchParams({ headword });
    if (reading) q.set('reading', reading);
    return cached('lookup:' + q.toString(), () => request<LookupResult>('/api/lookup?' + q.toString()));
  },
  /** The user's saved app settings (null when none yet). */
  getSettings: () => request<{ settings: Record<string, unknown> | null; updatedAt: string | null }>('/api/settings'),
  putSettings: (settings: unknown) => request<{ updatedAt: string }>('/api/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  /** Free servers sleep: ping /health first so the UI can say "waking up". */
  health: () => request<{ ok: boolean; saveVoice?: boolean }>('/health')
};

/* What the server can do, learned from /health: saveVoice = it keeps spoken words as files (a local run with SPEECH_SAVE_DIR).
   False until the server has answered (or when it never does), so the "Save voice files" option stays hidden unless it is really there. */
export const serverInfo = reactive({ saveVoice: false });
export async function loadServerInfo(): Promise<void> {
  try {
    serverInfo.saveVoice = (await api.health()).saveVoice === true;
  } catch {
    /* server asleep or offline: the option stays hidden */
  }
}

/* Where the server got a spoken word from (its x-voice-source header): a paid ElevenLabs call, its memory, or a file on its disk. */
export type ServerVoiceSource = 'elevenlabs' | 'server-memory' | 'server-file' | 'server';

/* The spoken word as an MP3 (ElevenLabs through the server) and where the server got it from. Rejects when the server has no voice or fails. */
/* `save` false asks the server not to keep a file of this word (it still plays files it already has). */
export async function fetchSpeech(text: string, deck = '', save = true): Promise<{ blob: Blob; source: ServerVoiceSource }> {
  let res: Response;
  try {
    const query = `text=${encodeURIComponent(text)}${deck ? `&deck=${encodeURIComponent(deck)}` : ''}${save ? '' : '&save=0'}`;
    res = await fetch(`${BASE}/api/speech?${query}`, { headers: authHeaders() });
  } catch {
    throw new ApiError(t('api.conn'), 0);
  }
  if (res.status === 401) clearSession();
  if (!res.ok) throw new ApiError(t('api.server', { status: res.status }), res.status);
  const header = res.headers.get('x-voice-source');
  const source: ServerVoiceSource = header === 'elevenlabs' || header === 'server-memory' || header === 'server-file' ? header : 'server'; // an older server sends none
  return { blob: await res.blob(), source };
}

/* ---- result queue ---- */

interface QueuedResult {
  wordId: string;
  result: StudyResult;
  at: string;
}

const QUEUE_KEY = 'flashmobile.queue';
let flushing = false;

function readQueue(): QueuedResult[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedResult[];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedResult[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* storage unavailable: results still go out while the page stays open */
  }
}

export function pendingResults(): number {
  return readQueue().length;
}

/* Queue a result and try to send everything now. Resolves true when the queue is empty. */
export async function submitResult(wordId: string, result: StudyResult): Promise<boolean> {
  writeQueue([...readQueue(), { wordId, result, at: new Date().toISOString() }]);
  return flushResults();
}

export async function flushResults(): Promise<boolean> {
  if (flushing) return false;
  flushing = true;
  try {
    for (;;) {
      const [next] = readQueue();
      if (!next) return true;
      try {
        await request('/api/progress', { method: 'POST', body: JSON.stringify(next) });
      } catch (e) {
        // A word that no longer exists would block the queue forever: drop it. Anything else: keep and retry later.
        if (e instanceof ApiError && e.status === 404) {
          writeQueue(readQueue().slice(1));
          continue;
        }
        return false;
      }
      writeQueue(readQueue().slice(1));
    }
  } finally {
    flushing = false;
  }
}
