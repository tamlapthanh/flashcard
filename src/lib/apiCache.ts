/*
 * A copy of what the server answered, kept on this device (Cache Storage, one cache per user), so the app still works when
 * the server is asleep, unreachable or the phone is offline. Network first: a live answer always wins and refreshes the copy;
 * the copy is used only when the network call fails (no connection, or a 5xx from a server that is down or waking up).
 * Study results do not go through here: they have their own queue (api.ts).
 */
export interface CacheBackend {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

const NAME_PREFIX = 'flashmobile-api-v1:';
const fakeUrl = (key: string): string => `/__api_cache/${encodeURIComponent(key)}`;

/* Cache Storage as a backend (undefined where it does not exist, e.g. an insecure page or a test run in Node). */
export function cacheStorageBackend(user: string): CacheBackend | undefined {
  if (typeof caches === 'undefined') return undefined;
  const open = (): Promise<Cache> => caches.open(NAME_PREFIX + user);
  return {
    async get(key) {
      const hit = await (await open()).match(fakeUrl(key));
      return hit ? ((await hit.json()) as unknown) : undefined;
    },
    async set(key, value) {
      await (await open()).put(fakeUrl(key), new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
    },
    async clear() {
      await caches.delete(NAME_PREFIX + user);
    }
  };
}

let backendFor: (user: string) => CacheBackend | undefined = cacheStorageBackend;
/** Tests plug in their own storage. */
export function setCacheBackend(factory: (user: string) => CacheBackend | undefined): void {
  backendFor = factory;
}

/* True for a failure that says "the server is not there" (as opposed to "the server said no"). */
export const isOfflineFailure = (status: number): boolean => status === 0 || status >= 500;

/** Runs `fetchLive`; remembers its answer; when it fails because the server is not there, returns the remembered answer, if any. */
export async function withCache<T>(user: string, key: string, fetchLive: () => Promise<T>, failedStatus: (e: unknown) => number): Promise<T> {
  const store = user ? backendFor(user) : undefined;
  try {
    const live = await fetchLive();
    if (store) void store.set(key, live).catch(() => undefined); // a full disk must not break a good answer
    return live;
  } catch (e) {
    if (store && isOfflineFailure(failedStatus(e))) {
      const copy = await store.get(key).catch(() => undefined);
      if (copy !== undefined) return copy as T;
    }
    throw e;
  }
}

/** Reads a remembered answer without asking the network. */
export async function readCached<T>(user: string, key: string): Promise<T | undefined> {
  const store = user ? backendFor(user) : undefined;
  return (await store?.get(key).catch(() => undefined)) as T | undefined;
}

export async function writeCached(user: string, key: string, value: unknown): Promise<void> {
  const store = user ? backendFor(user) : undefined;
  await store?.set(key, value).catch(() => undefined);
}

/** Forget everything kept for a user. */
export async function clearApiCache(user: string): Promise<void> {
  await backendFor(user)?.clear().catch(() => undefined);
}
