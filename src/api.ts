/*
 * The only place that talks to the server. Calls carry the login token (and the static key, for a server without
 * login). A 401 on any call other than login means the session ended: the user is signed out and sent to the login screen.
 * Study results go through a persistent queue so nothing is lost when the server is asleep or the phone is offline.
 */
import { auth, clearSession, setSession } from './auth';
import { t } from './i18n';
import type { CardDetail, Deck, LightCard, LookupResult, StudyResult } from './types';

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

export const api = {
  /** Resolves with the user name; a wrong name or password rejects with status 401. */
  login: async (username: string, password: string): Promise<string> => {
    const r = await request<{ token: string; user: string }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    // Results still queued belong to the previous user: they must not be credited to someone else.
    if (auth.user && auth.user !== r.user) writeQueue([]);
    setSession(r.token, r.user);
    return r.user;
  },
  decks: () => request<{ decks: Deck[] }>('/api/decks').then((r) => r.decks),
  cards: (params: { deck: string; tags: string[]; status: string[] }) => {
    const q = new URLSearchParams({ deck: params.deck });
    if (params.tags.length) q.set('tags', params.tags.join(','));
    if (params.status.length) q.set('status', params.status.join(','));
    return request<{ total: number; cards: LightCard[] }>('/api/cards?' + q.toString());
  },
  /** The heavy part (furigana, pitch, kanji, note) of up to 30 cards. */
  cardDetails: (ids: string[]) => request<{ details: CardDetail[] }>('/api/cards/detail?ids=' + encodeURIComponent(ids.join(','))).then((r) => r.details),
  lookup: (headword: string, reading: string | null) => {
    const q = new URLSearchParams({ headword });
    if (reading) q.set('reading', reading);
    return request<LookupResult>('/api/lookup?' + q.toString());
  },
  /** The user's saved app settings (null when none yet). */
  getSettings: () => request<{ settings: Record<string, unknown> | null; updatedAt: string | null }>('/api/settings'),
  putSettings: (settings: unknown) => request<{ updatedAt: string }>('/api/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  /** Free servers sleep: ping /health first so the UI can say "waking up". */
  health: () => request<{ ok: boolean }>('/health')
};

/* Where the server got a spoken word from (its x-voice-source header): a paid ElevenLabs call, its memory, or a file on its disk. */
export type ServerVoiceSource = 'elevenlabs' | 'server-memory' | 'server-file' | 'server';

/* The spoken word as an MP3 (ElevenLabs through the server) and where the server got it from. Rejects when the server has no voice or fails. */
export async function fetchSpeech(text: string, deck = ''): Promise<{ blob: Blob; source: ServerVoiceSource }> {
  let res: Response;
  try {
    const query = `text=${encodeURIComponent(text)}${deck ? `&deck=${encodeURIComponent(deck)}` : ''}`;
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
