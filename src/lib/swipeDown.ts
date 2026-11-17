/*
 * "Drag down to close" for a bottom sheet. The sheet closes only when the finger moved clearly downwards and the
 * scrollable content (if any) was already at its top, so scrolling a long sheet back up never closes it by accident.
 */
export function swipeDown(close: () => void, scroller?: () => HTMLElement | null | undefined) {
  let startX = 0;
  let startY = 0;
  let atTop = true;

  return {
    onTouchstart(e: TouchEvent): void {
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
      atTop = (scroller?.()?.scrollTop ?? 0) <= 0;
    },
    onTouchend(e: TouchEvent): void {
      const dx = (e.changedTouches[0]?.clientX ?? 0) - startX;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - startY;
      if (atTop && dy > 70 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
    }
  };
}
