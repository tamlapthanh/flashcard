/* The letter(s) on a deck's tile: a JLPT level (N3) when the name has one, else the first letter or character of the name. */
export function tileMark(name: string): string {
  const level = /(?:^|[^A-Za-z0-9])N[1-5](?![A-Za-z0-9])/i.exec(name);
  if (level) return level[0].replace(/^[^A-Za-z]/, '').toUpperCase();
  const first = Array.from(name.trim())[0] ?? '札';
  return first.toUpperCase();
}

/* Each deck has its own tile colour: picked from the name, so it stays the same on every visit. All are deep enough for the white mark. */
const TILE_COLORS = ['#2e7d32', '#1565c0', '#c62828', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#4e6e1f', '#5d4037', '#3949ab'];
export function tileColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length]!;
}
