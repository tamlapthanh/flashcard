/*
 * The only place that talks to the server: swap the auth here (token from a login screen) when login exists.
 * Study results go through a persistent queue so nothing is lost when the server is asleep or the phone is offline.
 */
import { t } from './i18n';
import type { Card, Deck, LookupResult, StudyResult } from './types';

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
  return KEY ? { 'x-api-key': KEY } : {};
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
  if (!res.ok) throw new ApiError(t('api.server', { status: res.status }), res.status);
  return (await res.json()) as T;
}

export const api = {
  decks: () => request<{ decks: Deck[] }>('/api/decks').then((r) => r.decks),
  cards: (params: { deck: string; tags: string[]; status: string[]; limit: number }) => {
    const q = new URLSearchParams({ deck: params.deck, limit: String(params.limit) });
    if (params.tags.length) q.set('tags', params.tags.join(','));
    if (params.status.length) q.set('status', params.status.join(','));
    return request<{ total: number; cards: Card[] }>('/api/cards?' + q.toString());
  },
  lookup: (headword: string, reading: string | null) => {
    const q = new URLSearchParams({ headword });
    if (reading) q.set('reading', reading);
    return request<LookupResult>('/api/lookup?' + q.toString());
  },
  /** Free servers sleep: ping /health first so the UI can say "waking up". */
  health: () => request<{ ok: boolean }>('/health')
};

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
