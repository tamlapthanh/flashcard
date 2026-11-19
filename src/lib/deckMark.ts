/* The letter(s) on a deck's tile: a JLPT level (N3) when the name has one, else the first letter or character of the name. */
export function tileMark(name: string): string {
  const level = /(?:^|[^A-Za-z0-9])N[1-5](?![A-Za-z0-9])/i.exec(name);
  if (level) return level[0].replace(/^[^A-Za-z]/, '').toUpperCase();
  const first = Array.from(name.trim())[0] ?? '札';
  return first.toUpperCase();
}
