/*
 * The only place that talks to the server. Calls carry the login token (and the static key, for a server without
 * login). A 401 on any call other than login means the session ended: the user is signed out and sent to the login screen.
 * Study results go through a persistent queue so nothing is lost when the server is asleep or the phone is offline.
 */
import { reactive } from 'vue';
import { auth, clearSession, setSession } from './auth';
import { t } from './i18n';
import { isOfflineFailure, readCached, withCache, writeCached } from './lib/apiCache';
import type { CardDetail, Deck, KanjiInfo, LightCard, LookupResult, PaperCreateBody, PaperInfo, PaperQuestionStat, PaperResult, StudyResult, TestAnswerDetail, TestCreateBody, TestSessionInfo } from './types';

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
      // content-type only with a body: the server answers 400 to a DELETE (or any call) that says "JSON" and sends nothing
      headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...authHeaders(), ...init?.headers }
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

/* Warms the on-device copy of the details of many cards (a deck studied once online can then be studied offline).
   Gentle on purpose: the server allows about 240 calls a minute and the study screen needs its share, so cards already kept are skipped,
   one batch goes out every `gapMs` (about 20 a minute), and it stops at the first failure (a 429 included). */
export async function prefetchDetails(ids: string[], batch = 30, gapMs = 3000): Promise<void> {
  const user = auth.user;
  const missing: string[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const have = await Promise.all(part.map((id) => readCached(user, 'detail:' + id)));
    part.forEach((id, k) => have[k] === undefined && missing.push(id));
  }
  for (let i = 0; i < missing.length; i += batch) {
    if (auth.user !== user || (typeof navigator !== 'undefined' && navigator.onLine === false)) return; // signed out or switched user, or gone offline
    try {
      await api.cardDetails(missing.slice(i, i + batch));
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, gapMs));
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
  /** The user's tests, newest first (`status` limits them to the open or the done ones). Never cached: they live in the database and are read from there. */
  tests: (before?: string, status?: 'open' | 'done') => {
    const q = new URLSearchParams();
    if (before) q.set('before', before);
    if (status) q.set('status', status);
    return request<{ sessions: TestSessionInfo[] }>('/api/tests' + (q.size ? `?${q}` : '')).then((r) => r.sessions);
  },
  /** The words of a deck whose latest answer in a finished test was right: a new test leaves them out. */
  correctTestWords: (deckId: string) => request<{ wordIds: string[] }>(`/api/tests/correct?deck=${encodeURIComponent(deckId)}`).then((r) => r.wordIds),
  /** Every question of one test, answered or not. */
  testAnswers: (sessionId: string) => request<{ answers: TestAnswerDetail[] }>(`/api/tests/${encodeURIComponent(sessionId)}`).then((r) => r.answers),
  deleteTest: (sessionId: string) => request<{ ok: boolean }>(`/api/tests/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  /** Who is signed in and whether they are an admin (the server checks it again on every admin call). */
  me: () => request<{ user: string; admin: boolean }>('/api/me'),
  /** Every paper (a test an admin made), newest first, with what this user did with it. */
  papers: () => request<{ papers: PaperInfo[] }>('/api/papers').then((r) => r.papers),
  /** Admin: saves a paper whole. */
  createPaper: (body: PaperCreateBody) => request<{ saved: number }>('/api/papers', { method: 'POST', body: JSON.stringify(body) }),
  /** A new test of the user's own from the paper (any number of times). Continue and score it like any test. */
  startPaper: (paperId: string, sessionId: string) =>
    request<{ sessionId: string }>(`/api/papers/${encodeURIComponent(paperId)}/start`, { method: 'POST', body: JSON.stringify({ sessionId, at: new Date().toISOString() }) }),
  /** Admin: every attempt of every user. */
  paperResults: (paperId: string) => request<{ results: PaperResult[] }>(`/api/papers/${encodeURIComponent(paperId)}/results`).then((r) => r.results),
  /** Admin: per question of the paper, how many attempts answered it, got it right, skipped it. */
  paperStats: (paperId: string) => request<{ questions: PaperQuestionStat[] }>(`/api/papers/${encodeURIComponent(paperId)}/stats`).then((r) => r.questions),
  /** Admin: deletes the paper only; attempts already made stay. */
  deletePaper: (paperId: string) => request<{ ok: boolean }>(`/api/papers/${encodeURIComponent(paperId)}`, { method: 'DELETE' }),
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

/* Whether the signed-in user is an admin (makes papers, sees everyone's results). Only decides what the app shows: the server decides what is allowed.
   False until the server has answered, and again when it cannot be reached. */
/* `ready`: the server has answered (or there is nobody signed in): a screen that is only for admins waits for it, so a reload does not take the admin for somebody else. */
export const me = reactive({ admin: false, ready: false });
export async function loadMe(): Promise<void> {
  if (!auth.token && import.meta.env.VITE_LOGIN !== 'false') {
    me.admin = false;
    me.ready = true;
    return;
  }
  try {
    me.admin = (await api.me()).admin === true;
  } catch {
    /* asleep or offline: not an admin until it answers */
  } finally {
    me.ready = true;
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

/* ---- tests ----
   A test is saved on the server (D1) whole when it is made, each answer as it is given, and it is marked done at the end, so an unfinished test can
   be continued from any device. The database is the only place tests are kept: this queue only holds what could not be sent yet (server asleep, no
   signal), in order, and drops each step as soon as it is sent. One queue per user. */

export type TestOp =
  | { op: 'create'; body: TestCreateBody }
  | { op: 'answer'; sessionId: string; n: number; pickedId: string | null; at: string }
  | { op: 'finish'; sessionId: string; at: string };

const TEST_QUEUE_KEY = (): string => `flashmobile.testQueue.${auth.user ?? ''}`;
let flushingTests = false;

function readTestQueue(): TestOp[] {
  try {
    const list = JSON.parse(localStorage.getItem(TEST_QUEUE_KEY()) ?? '[]') as unknown;
    return Array.isArray(list) ? (list as TestOp[]).filter((o) => o && typeof o === 'object' && 'op' in o) : []; // an older shape of the queue is dropped
  } catch {
    return [];
  }
}

function writeTestQueue(queue: TestOp[]): void {
  try {
    if (queue.length === 0) localStorage.removeItem(TEST_QUEUE_KEY());
    else localStorage.setItem(TEST_QUEUE_KEY(), JSON.stringify(queue));
  } catch {
    /* storage unavailable: the steps still go out while the page stays open */
  }
}

export function pendingTests(): number {
  return readTestQueue().length;
}

const sendTestOp = (o: TestOp): Promise<unknown> => {
  const id = (sessionId: string): string => encodeURIComponent(sessionId);
  if (o.op === 'create') return request('/api/tests', { method: 'POST', body: JSON.stringify(o.body) });
  if (o.op === 'answer') return request(`/api/tests/${id(o.sessionId)}/answers/${o.n}`, { method: 'PUT', body: JSON.stringify({ pickedId: o.pickedId, at: o.at }) });
  return request(`/api/tests/${id(o.sessionId)}/finish`, { method: 'POST', body: JSON.stringify({ at: o.at }) });
};

/* Queue a step of a test and try to send everything now. Resolves true when nothing is left waiting. */
export function queueTestOp(o: TestOp): Promise<boolean> {
  writeTestQueue([...readTestQueue(), o]);
  return flushTests();
}

export async function flushTests(): Promise<boolean> {
  if (flushingTests) return false; // the running loop reads the queue again after each step, so a step added meanwhile is sent too
  flushingTests = true;
  try {
    for (;;) {
      const [next] = readTestQueue();
      if (!next) return true;
      try {
        await sendTestOp(next);
      } catch (e) {
        // A step the server will never accept (a word or deck that no longer exists) would block the queue forever: drop it. Anything else: keep and retry later.
        if (e instanceof ApiError && (e.status === 400 || e.status === 404)) {
          writeTestQueue(readTestQueue().slice(1));
          continue;
        }
        return false;
      }
      writeTestQueue(readTestQueue().slice(1));
    }
  } finally {
    flushingTests = false;
  }
}
