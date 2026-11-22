import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCacheBackend, withCache, type CacheBackend } from '../src/lib/apiCache';

const memory = (): CacheBackend => {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), clear: async () => m.clear() };
};
const status = (e: unknown): number => (e as { status?: number }).status ?? 0;

describe('withCache', () => {
  beforeEach(() => setCacheBackend(() => store));
  let store = memory();
  beforeEach(() => (store = memory()));

  it('returns the live answer and remembers it', async () => {
    expect(await withCache('u', 'k', async () => 1, status)).toBe(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(await store.get('k')).toBe(1);
  });

  it('falls back to the copy when the server is not there (no connection or 5xx)', async () => {
    await store.set('k', 'old');
    expect(await withCache('u', 'k', () => Promise.reject({ status: 0 }), status)).toBe('old');
    expect(await withCache('u', 'k', () => Promise.reject({ status: 503 }), status)).toBe('old');
  });

  it('does not hide a 401 or 404 behind the copy', async () => {
    await store.set('k', 'old');
    await expect(withCache('u', 'k', () => Promise.reject({ status: 401 }), status)).rejects.toEqual({ status: 401 });
    await expect(withCache('u', 'k', () => Promise.reject({ status: 404 }), status)).rejects.toEqual({ status: 404 });
  });

  it('rejects when there is no copy, and keeps nothing without a user', async () => {
    await expect(withCache('u', 'none', () => Promise.reject({ status: 0 }), status)).rejects.toEqual({ status: 0 });
    const set = vi.spyOn(store, 'set');
    await withCache('', 'k2', async () => 2, status);
    expect(set).not.toHaveBeenCalled();
  });
});
