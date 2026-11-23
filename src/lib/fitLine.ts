import type { Directive } from 'vue';

/*
 * v-fit-line (mobile only): the text stays on ONE line, whatever size is set for it. When it is wider than the card it is shrunk (zoomed out)
 * just enough to fit; when there is room it keeps the size that was set. Measured again when the word, the size or the window changes.
 * `v-fit-line.always` (the main kanji of the card) does it on a desktop too: a big font size must never break the word over several lines.
 * Used on the word, the Sino-Vietnamese line, the Vietnamese meaning and the English meaning. A text that has line breaks of its own
 * (the meaning keeps them: white-space pre-line) keeps those breaks, and the widest of its lines decides the size.
 */
const watchers = new WeakMap<HTMLElement, ResizeObserver>();

/* Only on a phone or tablet (touch): with a mouse (desktop) the card is wide, the word wraps as before and keeps its size. */
const desktop = (): boolean => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function fit(el: HTMLElement): void {
  el.style.zoom = ''; // back to the size that was set, then measure
  el.style.whiteSpace = ''; // back to the stylesheet's own value (read below)
  if (desktop() && el.dataset.fitAlways !== '1') return;
  // a text whose style keeps its own line breaks (pre-line) must keep them: `pre` does that without wrapping; the rest is `nowrap`
  el.style.whiteSpace = getComputedStyle(el).whiteSpace.startsWith('pre') ? 'pre' : 'nowrap';
  const area = el.closest<HTMLElement>('.wordarea') ?? el.parentElement;
  if (!area) return;
  const cs = getComputedStyle(area);
  const room = area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const need = Math.max(el.scrollWidth, el.getBoundingClientRect().width);
  if (room > 0 && need > room) el.style.zoom = String(Math.max(0.05, Math.floor((room / need) * 100) / 100)); // never 0: a very long line at the biggest size would vanish
}

export const vFitLine: Directive<HTMLElement> = {
  mounted(el, binding) {
    if (binding.modifiers.always) el.dataset.fitAlways = '1';
    fit(el);
    const area = el.closest<HTMLElement>('.wordarea') ?? el.parentElement;
    if (area && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => fit(el));
      ro.observe(area);
      watchers.set(el, ro);
    }
    void document.fonts?.ready.then(() => fit(el)); // the Japanese font arrives late: measure again
  },
  updated(el) {
    fit(el);
  },
  unmounted(el) {
    watchers.get(el)?.disconnect();
    watchers.delete(el);
  }
};
