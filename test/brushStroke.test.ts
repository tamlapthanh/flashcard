import { describe, expect, it } from 'vitest';
import { BRUSH_MAX, BRUSH_MIN, brushOutline, brushWidths, type InkPt } from '../src/lib/brushStroke';

/* A straight line to the right, `n` points, `ms` milliseconds between the points, `gap` units between them. */
const line = (n: number, ms: number, gap: number): InkPt[] => Array.from({ length: n }, (_, i) => ({ x: 10 + i * gap, y: 50, t: i * ms }));

describe('brushWidths', () => {
  it('starts thin and swells to the full width (the brush touching down)', () => {
    const w = brushWidths(line(30, 40, 1)); // slow: 0.025 units / ms
    expect(w[0]).toBeLessThan(BRUSH_MAX * 0.4);
    expect(w[0]).toBeLessThan(w[5]!);
    expect(w[25]).toBeGreaterThan(BRUSH_MAX * 0.85);
  });

  it('is thick where the hand is slow and thin where it is fast', () => {
    const slow = brushWidths(line(30, 40, 1));
    const fast = brushWidths(line(30, 4, 4)); // 1 unit / ms
    expect(slow[25]!).toBeGreaterThan(fast[25]! + 1);
    expect(fast[25]!).toBeGreaterThanOrEqual(BRUSH_MIN * 0.99);
    expect(fast[25]!).toBeLessThan(BRUSH_MIN * 1.5);
  });

  it('changes gradually: no jump between two neighbouring points', () => {
    const pts = [...line(15, 40, 1), ...line(15, 3, 4).map((p, i) => ({ ...p, x: 25 + i * 4, t: 600 + i * 3 }))];
    const w = brushWidths(pts);
    for (let i = 2; i < w.length; i++) expect(Math.abs(w[i]! - w[i - 1]!)).toBeLessThan(2);
  });
});

describe('brushOutline', () => {
  it('is one closed shape that goes round both ends', () => {
    const d = brushOutline(line(20, 16, 2));
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect((d.match(/A/g) ?? []).length).toBe(2); // the round end and the round start
    expect(d).not.toMatch(/NaN|Infinity/);
  });

  it('a tap, or a stroke of no length, is a small round blot', () => {
    for (const pts of [[{ x: 20, y: 20, t: 0 }], [{ x: 20, y: 20, t: 0 }, { x: 20, y: 20, t: 30 }]]) {
      const d = brushOutline(pts);
      expect(d).toMatch(/^M[\d.]+ 20a/);
      expect(d).not.toMatch(/NaN/);
    }
    expect(brushOutline([])).toBe('');
  });

  it('survives repeated points (a pause) without NaN', () => {
    const pts: InkPt[] = [...line(5, 16, 2), { x: 18, y: 50, t: 200 }, { x: 18, y: 50, t: 400 }, { x: 20, y: 51, t: 420 }];
    expect(brushOutline(pts)).not.toMatch(/NaN|Infinity/);
  });

  it('the outline hugs the line: every drawn point is inside the box the outline spans, widened by the brush', () => {
    const pts = line(20, 16, 2);
    const nums = [...brushOutline(pts).matchAll(/([ML])([\d.]+) ([\d.]+)/g)].map((m) => ({ x: Number(m[2]), y: Number(m[3]) }));
    const ys = nums.map((p) => p.y);
    expect(Math.min(...ys)).toBeGreaterThan(50 - BRUSH_MAX);
    expect(Math.max(...ys)).toBeLessThan(50 + BRUSH_MAX);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(BRUSH_MIN * 0.5); // it has some width
  });
});
