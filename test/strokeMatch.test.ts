import { describe, expect, it } from 'vitest';
import { judgeStroke, matchStroke, parsePath, pathLength, resample, strokeDistance, type Pt } from '../src/lib/strokeMatch';

/* Strokes written like KanjiVG's (relative cubic curves, 109 x 109 box). */
const ACROSS = 'M11,54.25c3.19,0.62,6.25,0.75,9.5,0.5c20.5-1.5,50.75-4.25,77.5-4.75c3.25-0.06,5.5,0.25,8.75,0.75'; // 一: left to right
const DOWN = 'M52.5,12c1.5,1.5,2.5,4,2.5,7.5c0,20-0.5,50-0.5,78'; // a stroke from top to bottom
const DOT = 'M60,20c2,1,4,3,5,6'; // a short tick

const ref = (d: string): Pt[] => parsePath(d);
/* What a hand would do: the reference with a small deterministic wobble and `n` points. */
const drawn = (d: string, wobble = 2, n = 18): Pt[] =>
  resample(ref(d), n).map((p, i) => ({ x: p.x + Math.sin(i * 2.1) * wobble, y: p.y + Math.cos(i * 1.7) * wobble }));
const shift = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

describe('parsePath', () => {
  it('reads absolute and relative commands, and extra pairs after a move as lines', () => {
    expect(parsePath('M10,20 L30,40')).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
    expect(parsePath('M10 20 l5 5 h10 v-5')).toEqual([{ x: 10, y: 20 }, { x: 15, y: 25 }, { x: 25, y: 25 }, { x: 25, y: 20 }]);
    expect(parsePath('M0,0 10,0 10,10')).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it('flattens curves: the line ends where the path ends and has many points', () => {
    const pts = parsePath(ACROSS);
    expect(pts.length).toBeGreaterThan(20);
    expect(pts[0]).toEqual({ x: 11, y: 54.25 });
    const last = pts[pts.length - 1]!;
    expect(last.x).toBeCloseTo(11 + 9.5 + 77.5 + 8.75, 5);
    expect(last.y).toBeCloseTo(54.25 + 0.5 - 4.75 + 0.75, 5);
  });

  it('survives numbers glued together and a broken path', () => {
    expect(parsePath('M1.5.5L2.5.5')).toEqual([{ x: 1.5, y: 0.5 }, { x: 2.5, y: 0.5 }]);
    expect(parsePath('M')).toEqual([]);
    expect(parsePath('')).toEqual([]);
  });
});

describe('resample', () => {
  it('gives the wanted number of points, spaced evenly, with the ends kept', () => {
    const pts = resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 11);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[10]!.x).toBeCloseTo(100, 5);
    expect(pts[5]!.x).toBeCloseTo(50, 5);
    expect(pathLength(pts)).toBeCloseTo(100, 5);
  });
});

describe('matchStroke', () => {
  it('accepts a wobbly copy of the right stroke', () => {
    expect(matchStroke(drawn(ACROSS), ref(ACROSS))).toEqual({ ok: true });
    expect(matchStroke(drawn(DOWN, 3), ref(DOWN))).toEqual({ ok: true });
  });

  it('tells a stroke drawn backwards', () => {
    expect(matchStroke([...drawn(ACROSS)].reverse(), ref(ACROSS))).toEqual({ ok: false, reason: 'direction' });
    expect(matchStroke([...drawn(DOWN)].reverse(), ref(DOWN))).toEqual({ ok: false, reason: 'direction' });
  });

  it('tells a stroke in the wrong place, and the wrong stroke', () => {
    expect(matchStroke(shift(drawn(ACROSS), 0, 20), ref(ACROSS))).toMatchObject({ ok: false, reason: 'position' });
    expect(matchStroke(shift(drawn(ACROSS), 0, 45), ref(ACROSS)).ok).toBe(false);
    expect(matchStroke(drawn(DOWN), ref(ACROSS)).ok).toBe(false); // a vertical stroke where a horizontal one belongs
    expect(matchStroke(drawn(ACROSS), ref(DOWN)).ok).toBe(false);
  });

  it('refuses a stroke far too short or far too long', () => {
    const half = drawn(ACROSS).slice(0, 5);
    expect(matchStroke(half, ref(ACROSS))).toEqual({ ok: false, reason: 'short' });
    const zigzag: Pt[] = Array.from({ length: 30 }, (_, i) => ({ x: 10 + (i % 2) * 90, y: 50 + i }));
    expect(matchStroke(zigzag, ref(ACROSS))).toEqual({ ok: false, reason: 'long' });
  });

  it('judges a dot by its place: a tap on it passes, a tap elsewhere does not, a long stroke does not', () => {
    expect(matchStroke([{ x: 62, y: 23 }], ref(DOT))).toEqual({ ok: true });
    expect(matchStroke([{ x: 62, y: 23 }, { x: 63, y: 24 }], ref(DOT))).toEqual({ ok: true });
    expect(matchStroke([{ x: 20, y: 90 }], ref(DOT))).toEqual({ ok: false, reason: 'position' });
    expect(matchStroke(drawn(ACROSS), ref(DOT))).toEqual({ ok: false, reason: 'long' });
  });

  it('a short stroke has a direction too: the same short vertical drawn upwards is refused, a tap on a dot is not', () => {
    const SHORT_DOWN = 'M55,40L55,54'; // 14 long, like the short verticals of the grass radical
    const down: Pt[] = Array.from({ length: 12 }, (_, i) => ({ x: 55 + Math.sin(i) * 0.6, y: 40 + (i * 14) / 11 }));
    expect(matchStroke(down, ref(SHORT_DOWN))).toEqual({ ok: true });
    expect(matchStroke([...down].reverse(), ref(SHORT_DOWN))).toEqual({ ok: false, reason: 'direction' });
    expect(matchStroke([{ x: 55, y: 47 }], ref(SHORT_DOWN))).toEqual({ ok: true }); // a tap is too short to have a direction
  });

  it('a bigger tolerance forgives more', () => {
    const off = shift(drawn(ACROSS), 0, 17);
    expect(matchStroke(off, ref(ACROSS), 1).ok).toBe(false);
    expect(matchStroke(off, ref(ACROSS), 2).ok).toBe(true);
  });

  it('nothing drawn is not a stroke', () => {
    expect(matchStroke([], ref(ACROSS))).toEqual({ ok: false, reason: 'short' });
  });
});

describe('judgeStroke (the stroke is judged among the strokes of the whole kanji)', () => {
  // two lines side by side, 10 units apart (like the top two lines of 三 or 王): either one alone fits the other within the tolerance
  const UPPER = 'M20,40L90,40';
  const LOWER = 'M20,50L90,50';
  const DOWN_LINE = 'M55,15L55,95';
  const refs = [UPPER, LOWER, DOWN_LINE].map(ref);

  it('accepts the expected stroke, wherever it is in the order', () => {
    expect(judgeStroke(drawn(UPPER, 2), refs, 0)).toEqual({ ok: true });
    expect(judgeStroke(drawn(LOWER, 2), refs, 1)).toEqual({ ok: true });
    expect(judgeStroke(drawn(DOWN_LINE, 2), refs, 2)).toEqual({ ok: true });
  });

  it('a later stroke drawn too early is "order", even when it also fits the expected one', () => {
    expect(matchStroke(drawn(LOWER, 2), refs[0]!).ok).toBe(true); // alone, the lower line passes for the upper one ...
    expect(judgeStroke(drawn(LOWER, 2), refs, 0)).toEqual({ ok: false, reason: 'order' }); // ... but it is the lower line
    expect(judgeStroke(drawn(DOWN_LINE, 2), refs, 0)).toEqual({ ok: false, reason: 'order' });
  });

  it('a stroke that is already written, drawn again, is "position"', () => {
    expect(judgeStroke(drawn(UPPER, 2), refs, 1)).toEqual({ ok: false, reason: 'position' });
  });

  it('a stroke that fits nothing keeps the matcher reason; nothing to match is refused', () => {
    expect(judgeStroke([...drawn(UPPER, 1)].reverse(), refs, 0)).toEqual({ ok: false, reason: 'direction' });
    expect(judgeStroke(drawn(UPPER, 1), refs, 5)).toEqual({ ok: false, reason: 'shape' });
  });
});

describe('strokeDistance', () => {
  it('is 0 for the same stroke and grows with the offset', () => {
    const a = ref(ACROSS);
    expect(strokeDistance(a, a)).toBeCloseTo(0, 5);
    expect(strokeDistance(shift(a, 0, 10), a)).toBeCloseTo(10, 1);
    expect(strokeDistance([], a)).toBe(Infinity);
  });
});
