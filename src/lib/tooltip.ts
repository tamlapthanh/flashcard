/*
 * Tooltips for a real mouse (web only; touch screens have no hover): hold the pointer over any button for a moment and a small
 * label appears. The text is the button's `data-tip` or, failing that, its `aria-label`; both come from t(), so they are in
 * the language chosen in Settings (the text is read at hover time, so a language change applies at once).
 */
import { settings } from '../settings';

const SELECTOR = '[data-tip], button, [role="button"], [role="radio"], .v-btn';
const DELAY_MS = 450;

export function installTooltips(): void {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Element | null = null;

  const textOf = (el: Element): string => el.getAttribute('data-tip') || el.getAttribute('aria-label') || '';

  function hide(): void {
    clearTimeout(timer);
    current = null;
    tip.classList.remove('show');
  }

  function show(el: Element): void {
    const text = textOf(el);
    if (!settings.showTooltips || !text || !el.isConnected) return; // switched off in Settings
    tip.textContent = text;
    tip.classList.add('show');
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const above = r.top - h - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${above >= 8 ? above : r.bottom + 8}px`; // below the button when there is no room above it
  }

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element | null)?.closest?.(SELECTOR) ?? null;
    if (!el || el === current) return;
    hide();
    current = el;
    timer = setTimeout(() => show(el), DELAY_MS);
  });
  document.addEventListener('pointerout', (e) => {
    if (current && !current.contains(e.relatedTarget as Node | null)) hide();
  });
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'scroll']) document.addEventListener(ev, hide, true);
}
