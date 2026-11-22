/*
 * The look of a stroke written with a brush (fude): the line is thick where the hand is slow and thin where it is fast, and it starts
 * thin and swells (the brush touching down). The outline of the stroke is one closed shape, to be filled with ink.
 * Units are those of the drawing (the 109 x 109 box of a KanjiVG kanji).
 */
export interface InkPt {
  x: number;
  y: number;
  t: number; // time of the point in ms (any origin)
}

export const BRUSH_MAX = 4.6; // widest the stroke gets (a slow hand)
export const BRUSH_MIN = 1.5; // thinnest while moving (a fast hand)
const SPEED_FALL = 2.2; // how fast the width falls with the speed (units per ms)
const SMOOTH = 0.7; // how much of the previous width stays: the width changes gradually
const ATTACK = 7; // the stroke reaches its full width after this much length (the brush touching down)
const ATTACK_START = 0.3; // a share of the full width at the very first point

const dist = (a: InkPt, b: InkPt): number => Math.hypot(a.x - b.x, a.y - b.y);

/* Cuts the corners once (Chaikin): a hand that moved in a few big steps gets a rounder line. The two ends stay where they are. */
function round(pts: InkPt[]): InkPt[] {
  if (pts.length < 3) return pts;
  const mix = (a: InkPt, b: InkPt, k: number): InkPt => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, t: a.t + (b.t - a.t) * k });
  const out: InkPt[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push(mix(pts[i]!, pts[i + 1]!, 0.25), mix(pts[i]!, pts[i + 1]!, 0.75));
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/* The width of the stroke at every point. */
export function brushWidths(pts: InkPt[]): number[] {
  const widths: number[] = [];
  let walked = 0;
  let width = BRUSH_MAX;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const step = dist(pts[i - 1]!, pts[i]!);
      walked += step;
      const speed = step / Math.max(1, pts[i]!.t - pts[i - 1]!.t); // units per ms
      const target = BRUSH_MIN + (BRUSH_MAX - BRUSH_MIN) * Math.exp(-speed * SPEED_FALL);
      width = i === 1 ? target : width * SMOOTH + target * (1 - SMOOTH);
    }
    const attack = ATTACK_START + (1 - ATTACK_START) * Math.min(1, walked / ATTACK);
    widths.push(width * attack);
  }
  return widths;
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

/* A dot (a stroke of one point, or of no length): a small round blot. */
function blot(p: InkPt, r: number): string {
  return `M${f(p.x - r)} ${f(p.y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
}

/* The closed outline (an SVG path) of the stroke: along one side, round over the end, back along the other side, round over the start. */
export function brushOutline(drawn: InkPt[]): string {
  if (drawn.length === 0) return '';
  let pts = round(drawn);
  if (pts.length < 60) pts = round(pts); // a hand that moved in few big steps: cut the corners a second time
  const widths = brushWidths(pts);
  const length = pts.reduce((sum, p, i) => (i ? sum + dist(pts[i - 1]!, p) : 0), 0);
  if (pts.length === 1 || length < 0.5) return blot(pts[0]!, (BRUSH_MAX * 0.85) / 2);

  // the direction at every point (from its neighbours); a point on the spot of its neighbour keeps the previous direction
  const dirs: { x: number; y: number }[] = [];
  let last = { x: 1, y: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) last = { x: dx / len, y: dy / len };
    dirs.push(last);
  }

  const side = (sign: 1 | -1): { x: number; y: number }[] =>
    pts.map((p, i) => ({ x: p.x - dirs[i]!.y * sign * (widths[i]! / 2), y: p.y + dirs[i]!.x * sign * (widths[i]! / 2) }));
  const left = side(1);
  const right = side(-1);
  const n = pts.length - 1;
  const rEnd = widths[n]! / 2;
  const rStart = widths[0]! / 2;

  let d = `M${f(left[0]!.x)} ${f(left[0]!.y)}`;
  for (let i = 1; i <= n; i++) d += `L${f(left[i]!.x)} ${f(left[i]!.y)}`;
  d += `A${f(rEnd)} ${f(rEnd)} 0 0 0 ${f(right[n]!.x)} ${f(right[n]!.y)}`;
  for (let i = n - 1; i >= 0; i--) d += `L${f(right[i]!.x)} ${f(right[i]!.y)}`;
  d += `A${f(rStart)} ${f(rStart)} 0 0 0 ${f(left[0]!.x)} ${f(left[0]!.y)}Z`;
  return d;
}
