import { beforeEach, describe, expect, it, vi } from 'vitest';

/* The samples live in localStorage: a small fake one stands in for it (the tests run in Node). */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    }
  } as Storage;
}

const sample = (n: number) => ({
  at: `2026-11-21T10:00:${String(n % 60).padStart(2, '0')}Z`,
  reason: 'shape',
  strokeIndex: n,
  strokes: 12,
  reference: 'M10,10L20,20',
  strictness: 'normal',
  points: [{ x: 1, y: 2, t: 0 }]
});

async function load() {
  vi.resetModules();
  vi.stubGlobal('localStorage', fakeStorage());
  return import('../src/lib/strokeSamples');
}

describe('strokeSamples', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('keeps a sample, counts it, and gives it back as JSON', async () => {
    const m = await load();
    expect(m.sampleStats.count).toBe(0);
    m.addSample(sample(1));
    expect(m.sampleStats.count).toBe(1);
    expect(JSON.parse(m.samplesJson())).toEqual([sample(1)]);
  });

  it('keeps only the newest 300', async () => {
    const m = await load();
    for (let i = 0; i < 305; i++) m.addSample(sample(i));
    const kept = JSON.parse(m.samplesJson()) as { strokeIndex: number }[];
    expect(kept).toHaveLength(300);
    expect(kept[0]!.strokeIndex).toBe(5); // the first five went
    expect(kept[299]!.strokeIndex).toBe(304);
    expect(m.sampleStats.count).toBe(300);
  });

  it('clears them', async () => {
    const m = await load();
    m.addSample(sample(1));
    m.clearSamples();
    expect(m.sampleStats.count).toBe(0);
    expect(m.samplesJson()).toBe('[]');
  });

  it('a damaged store is an empty one, and storage that fails does not throw', async () => {
    vi.resetModules();
    const broken = fakeStorage();
    broken.setItem('flashmobile.strokeSamples', '{not json');
    vi.stubGlobal('localStorage', broken);
    const m = await import('../src/lib/strokeSamples');
    expect(m.sampleStats.count).toBe(0);
    m.addSample(sample(1)); // overwrites the damage
    expect(m.sampleStats.count).toBe(1);

    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('full'); } });
    expect(() => m.addSample(sample(2))).not.toThrow();
  });

  it('thin: at most 40 points, the first and the last kept, times from the first point, one decimal', async () => {
    const m = await load();
    const line = Array.from({ length: 200 }, (_, i) => ({ x: i + 0.123, y: 50.678, t: 1000 + i * 8 }));
    const thinned = m.thin(line);
    expect(thinned).toHaveLength(40);
    expect(thinned[0]).toEqual({ x: 0.1, y: 50.7, t: 0 });
    expect(thinned[39]).toEqual({ x: 199.1, y: 50.7, t: 199 * 8 });
    expect(m.thin(line.slice(0, 5))).toHaveLength(5); // short strokes are kept whole
    expect(m.thin([])).toEqual([]);
  });
});
