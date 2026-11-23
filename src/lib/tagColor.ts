/* Every tag has its own soft colour, the same everywhere (deck list, tag sheet, test sheet, word list): a hue taken from the tag's name, so it is
   stable between visits but looks random. Only the hue is set (--th); the .tagtint class in style.css makes the light / dark colours from it. */
export function tagHue(tag: string): number {
  let h = 7;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return (h * 137) % 360; // the golden-angle-like step spreads names that differ by one letter
}

export const tagStyle = (tag: string): Record<string, string> => ({ '--th': String(tagHue(tag)) });
