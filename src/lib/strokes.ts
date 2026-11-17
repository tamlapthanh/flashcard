/* Where a KanjiVG stroke starts ("M31.5,37.5c..." / "M 31.5 37.5 ..."): used to place the stroke number. */
export function strokeStart(path: string): { x: number; y: number } | null {
  const m = /^\s*[Mm]\s*(-?\d*\.?\d+)[\s,]*(-?\d*\.?\d+)/.exec(path);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}
