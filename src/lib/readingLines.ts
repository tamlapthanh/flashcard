/** A single-kanji reading is stored as "On: ゴ / Kun: いつ". Returns its [label, value] rows, or null for any other reading (display only, the data is untouched). */
export function readingRows(reading: string): [string, string][] | null {
  const rows: [string, string][] = [];
  for (const part of reading.split(/\s+\/\s+/)) {
    const m = /^(On|Kun)\s*:\s*(.+)$/i.exec(part.trim());
    if (!m) return null;
    rows.push([`${m[1]}:`, m[2] ?? '']);
  }
  return rows.length ? rows : null;
}
