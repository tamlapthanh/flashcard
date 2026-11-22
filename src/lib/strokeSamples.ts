/*
 * "My stroke was right": when the check refuses a stroke and the user says it was right, the stroke is kept on this device (and nowhere
 * else) with the reason it was refused and the stroke it should have matched. A few days of these show where the check is wrong for a
 * real hand, which is what its limits are tuned with. Settings can copy them out as JSON or clear them.
 */
import { reactive } from 'vue';

const KEY = 'flashmobile.strokeSamples';
const MAX_SAMPLES = 300; // the oldest go first
const MAX_POINTS = 40; // a stroke is thinned to this many points

export interface StrokeSample {
  at: string; // when (ISO time)
  reason: string; // why the check refused it
  strokeIndex: number; // which stroke of the kanji it was meant to be (0 = the first)
  strokes: number; // how many strokes the kanji has
  reference: string; // the KanjiVG path of the stroke it was meant to be
  strictness: string; // the setting at the time
  points: { x: number; y: number; t: number }[]; // what was drawn (109 x 109 units; t = ms from the first point)
}

export const sampleStats = reactive({ count: 0 });

function read(): StrokeSample[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? (list as StrokeSample[]) : [];
  } catch {
    return [];
  }
}

function write(list: StrokeSample[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or unavailable: the samples are just not kept */
  }
  sampleStats.count = list.length;
}

/* At most MAX_POINTS points, the first and the last kept, one decimal. */
export function thin(points: { x: number; y: number; t: number }[]): StrokeSample['points'] {
  if (points.length === 0) return [];
  const t0 = points[0]!.t;
  const keep = points.length <= MAX_POINTS ? points : Array.from({ length: MAX_POINTS }, (_, i) => points[Math.round((i * (points.length - 1)) / (MAX_POINTS - 1))]!);
  return keep.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, t: Math.round(p.t - t0) }));
}

export function addSample(sample: StrokeSample): void {
  write([...read(), sample].slice(-MAX_SAMPLES));
}

export function clearSamples(): void {
  write([]);
}

export function samplesJson(): string {
  return JSON.stringify(read(), null, 1);
}

sampleStats.count = read().length;
