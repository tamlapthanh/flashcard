/*
 * Handwriting practice: is a stroke the user drew the stroke that should come next?
 *
 * The reference strokes are KanjiVG paths in a 109 x 109 box. A path is flattened into points; the stroke the user drew (also in
 * 109 x 109 units) is compared with it point by point after both are resampled to the same number of evenly spaced points.
 * It checks the direction, the position and the rough shape, not the beauty: a crooked but recognisable stroke passes.
 * `tolerance` scales every limit (1 = the default; above 1 is more forgiving).
 */
export interface Pt {
  x: number;
  y: number;
}

export type Verdict = { ok: true } | { ok: false; reason: 'direction' | 'shape' | 'position' | 'short' | 'long' | 'order' };

const RESAMPLE = 24;
const CURVE_STEPS = 12;
const SHORT_STROKE = 16; // a dot or tick: too short to judge by shape, only its place counts
const MEAN_LIMIT = 14; // average distance between matching points (of 109)
const END_LIMIT = 22; // how far the start and the end may be from the reference's
const NEAR_LIMIT = 24; // close but not close enough: the stroke is in the wrong place rather than the wrong shape
const DOT_LIMIT = 18; // a dot may be this far from where it belongs
const SHORT_DIRECTION_MIN = 8; // a short reference at least this long has a direction that is checked (shorter ones are dots)
const REVERSED_COS = 0.5; // a short stroke is "the other way" when its direction is this far against the reference's (cosine)
const LONG_SLACK = 12; // units a stroke may be longer than 1.8 times the reference
const BETTER = 0.6; // another stroke that fits this much better than the expected one is the stroke that was drawn

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!);
  return total;
}

const PARAMS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }; // numbers each command reads

/* The path "M31.5,37.5c..." as a polyline. Handles M L H V C S Q T Z (relative and absolute); an arc is cut to a straight line to its end. */
export function parsePath(d: string): Pt[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: Pt[] = [];
  let cmd = '';
  let i = 0;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null; // the previous control point, reflected by S / T
  let lastCmd = '';
  const num = (): number => Number(tokens[i++]);
  const isCmd = (tok: string | undefined): boolean => tok !== undefined && /^[A-Za-z]$/.test(tok);
  const push = (p: Pt): void => {
    out.push(p);
    cur = p;
  };
  const cubic = (p0: Pt, p1: Pt, p2: Pt, p3: Pt): void => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS;
      const u = 1 - t;
      push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
      });
    }
  };
  const quad = (p0: Pt, p1: Pt, p2: Pt): void => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS;
      const u = 1 - t;
      push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y });
    }
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++]!;
    else if (cmd === 'M') cmd = 'L'; // extra pairs after a move are lines
    else if (cmd === 'm') cmd = 'l';
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const base = rel ? cur : { x: 0, y: 0 };
    const upper = cmd.toUpperCase();
    const before = i;
    const need = PARAMS[upper] ?? 0;
    if (tokens.slice(i, i + need).filter((tok) => !isCmd(tok)).length < need) break; // a broken path: not enough numbers for this command
    let ctrl: Pt | null = null;
    switch (upper) {
      case 'M': {
        const p = { x: base.x + num(), y: base.y + num() };
        push(p);
        start = p;
        break;
      }
      case 'L':
        push({ x: base.x + num(), y: base.y + num() });
        break;
      case 'H':
        push({ x: (rel ? cur.x : 0) + num(), y: cur.y });
        break;
      case 'V':
        push({ x: cur.x, y: (rel ? cur.y : 0) + num() });
        break;
      case 'C': {
        const p0 = cur;
        const p1 = { x: base.x + num(), y: base.y + num() };
        const p2 = { x: base.x + num(), y: base.y + num() };
        const p3 = { x: base.x + num(), y: base.y + num() };
        cubic(p0, p1, p2, p3);
        ctrl = p2;
        break;
      }
      case 'S': {
        const p0 = cur;
        const p1: Pt = lastCtrl && /[CS]/i.test(lastCmd) ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const p2 = { x: base.x + num(), y: base.y + num() };
        const p3 = { x: base.x + num(), y: base.y + num() };
        cubic(p0, p1, p2, p3);
        ctrl = p2;
        break;
      }
      case 'Q': {
        const p0 = cur;
        const p1 = { x: base.x + num(), y: base.y + num() };
        const p2 = { x: base.x + num(), y: base.y + num() };
        quad(p0, p1, p2);
        ctrl = p1;
        break;
      }
      case 'T': {
        const p0 = cur;
        const p1: Pt = lastCtrl && /[QT]/i.test(lastCmd) ? { x: 2 * cur.x - lastCtrl.x, y: 2 * cur.y - lastCtrl.y } : cur;
        const p2 = { x: base.x + num(), y: base.y + num() };
        quad(p0, p1, p2);
        ctrl = p1;
        break;
      }
      case 'A':
        i += 5; // rx ry rotation large-arc sweep
        push({ x: base.x + num(), y: base.y + num() });
        break;
      case 'Z':
        push(start);
        break;
    }
    lastCtrl = ctrl;
    lastCmd = cmd;
    if (i === before && upper !== 'Z') break; // nothing was read: a broken path, stop instead of looping
    if (upper === 'Z') cmd = '';
  }
  return out;
}

/* `n` points evenly spaced along the polyline (the first and the last point of the line are kept). */
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0]! }));
  const total = pathLength(pts);
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0]! }));
  const out: Pt[] = [{ ...pts[0]! }];
  const step = total / (n - 1);
  let walked = 0;
  let next = step;
  for (let i = 1; i < pts.length && out.length < n - 1; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = dist(a, b);
    while (seg > 0 && walked + seg >= next && out.length < n - 1) {
      const f = (next - walked) / seg;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      next += step;
    }
    walked += seg;
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
}

const mean = (a: Pt[], b: Pt[]): number => a.reduce((sum, p, i) => sum + dist(p, b[i]!), 0) / a.length;
const centre = (pts: Pt[]): Pt => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

/* Cosine of the angle between two strokes, taken from their first point to their last (1 = same way, -1 = opposite, 0 = no direction). */
function direction(a: Pt[], b: Pt[]): number {
  const va = { x: a[a.length - 1]!.x - a[0]!.x, y: a[a.length - 1]!.y - a[0]!.y };
  const vb = { x: b[b.length - 1]!.x - b[0]!.x, y: b[b.length - 1]!.y - b[0]!.y };
  const lengths = Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y);
  return lengths === 0 ? 0 : (va.x * vb.x + va.y * vb.y) / lengths;
}

/* Is `user` (what was drawn, 109 x 109 units) the stroke `reference` (a flattened KanjiVG stroke)? */
export function matchStroke(user: Pt[], reference: Pt[], tolerance = 1): Verdict {
  if (user.length === 0 || reference.length === 0) return { ok: false, reason: 'short' };
  const refLen = pathLength(reference);
  const userLen = pathLength(user);

  if (refLen < SHORT_STROKE) {
    // a dot or a tick: judged by its place and by not being a long stroke instead
    if (userLen > Math.max(30, refLen * 3) * tolerance) return { ok: false, reason: 'long' };
    // a short stroke still has a direction (the two short verticals of 艹): told when it is long enough to have one and drawn clearly the other way
    if (refLen >= SHORT_DIRECTION_MIN && userLen >= 6 && direction(user, reference) < -REVERSED_COS) return { ok: false, reason: 'direction' };
    return dist(centre(user), centre(reference)) <= DOT_LIMIT * tolerance ? { ok: true } : { ok: false, reason: 'position' };
  }

  if (userLen < refLen * 0.5 / tolerance) return { ok: false, reason: 'short' };
  if (userLen > (refLen * 1.8 + LONG_SLACK) * tolerance) return { ok: false, reason: 'long' }; // a hand overshoots: a short stroke gets some absolute room too

  const U = resample(user, RESAMPLE);
  const R = resample(reference, RESAMPLE);
  const forward = mean(U, R);
  const ends = dist(U[0]!, R[0]!) <= END_LIMIT * tolerance && dist(U[RESAMPLE - 1]!, R[RESAMPLE - 1]!) <= END_LIMIT * tolerance;
  if (forward <= MEAN_LIMIT * tolerance && ends) return { ok: true };
  if (mean(U, [...R].reverse()) <= MEAN_LIMIT * tolerance) return { ok: false, reason: 'direction' };
  return { ok: false, reason: forward <= NEAR_LIMIT * tolerance ? 'position' : 'shape' };
}

/* Average distance between the drawn stroke and a reference, point by point (the smaller the closer; 0 = the same). */
export function strokeDistance(user: Pt[], reference: Pt[]): number {
  if (user.length === 0 || reference.length === 0) return Infinity;
  return mean(resample(user, RESAMPLE), resample(reference, RESAMPLE));
}

/*
 * The verdict for a stroke drawn when stroke `step` of `refs` is expected. Besides matchStroke it notices the stroke of another place in
 * the order: one that fits clearly better than the expected one (or fits while the expected one does not) is the wrong stroke:
 * 'order' for a later stroke, 'position' for one that is already written (lines side by side look alike, and only the place tells them apart).
 */
export function judgeStroke(user: Pt[], refs: Pt[][], step: number, tolerance = 1): Verdict {
  const expected = refs[step];
  if (!expected) return { ok: false, reason: 'shape' };
  const here = matchStroke(user, expected, tolerance);
  const hereDistance = strokeDistance(user, expected);
  for (let k = 0; k < refs.length; k++) {
    if (k === step) continue;
    if (!matchStroke(user, refs[k]!, tolerance).ok) continue;
    if (!here.ok || strokeDistance(user, refs[k]!) < hereDistance * BETTER) return { ok: false, reason: k > step ? 'order' : 'position' };
  }
  return here;
}
