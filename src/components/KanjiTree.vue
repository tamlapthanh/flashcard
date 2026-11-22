<script setup lang="ts">
import { computed, ref } from 'vue';
import { t } from '../i18n';
import type { KanjiPart } from '../types';

const props = defineProps<{ literal: string; edges: string[]; names: KanjiPart[]; rootHv?: string | null }>();
const emit = defineEmits<{ open: [literal: string] }>();

const R = 22; // circle radius
const GX = 70; // column spacing
const GY = 84; // row spacing
const PAD_X = 36;
const PAD_TOP = 30;

/* KanjiVG sometimes names a part by an ID ("CDP-8BC4") or a composition ("⿱日隹") instead of a character: it cannot be drawn, so it shows as a dashed "?". */
const drawable = (ch: string): boolean => [...ch].length === 1;
const shownAs = (ch: string): string => (drawable(ch) ? ch : '?');

interface Node { ch: string; x: number; y: number; row: number; hv: string; root: boolean; link: boolean }

/* "part>compound" edges drawn bottom-up like LCT: strokes/leaves on the top row, the kanji itself at the bottom.
   Row = longest way down from a leaf; x = leaves in reading order, a compound centred over its parts. */
const graph = computed(() => {
  const kids = new Map<string, string[]>();
  for (const e of props.edges) {
    const [part, whole] = e.split('>');
    if (!part || !whole || part === whole) continue;
    const list = kids.get(whole) ?? [];
    if (!list.includes(part)) list.push(part);
    kids.set(whole, list);
  }
  const height = new Map<string, number>();
  const xs = new Map<string, number>();
  let next = 0;
  const visit = (ch: string, trail: Set<string>): void => {
    if (xs.has(ch)) return;
    const children = (kids.get(ch) ?? []).filter((c) => !trail.has(c));
    trail.add(ch);
    for (const c of children) visit(c, trail);
    trail.delete(ch);
    if (children.length === 0) {
      height.set(ch, 0);
      xs.set(ch, next++);
    } else {
      height.set(ch, 1 + Math.max(...children.map((c) => height.get(c) ?? 0)));
      xs.set(ch, children.reduce((sum, c) => sum + (xs.get(c) ?? 0), 0) / children.length);
    }
  };
  visit(props.literal, new Set());
  if (xs.size < 2) return null;

  const hvOf = new Map(props.names.map((n) => [n.Literal, n.HanViet ?? '']));
  const known = new Set(props.names.filter((n) => n.Known).map((n) => n.Literal));
  const top = height.get(props.literal) ?? 0;
  const nodes: Node[] = [...xs.keys()].map((ch) => ({
    ch,
    row: height.get(ch) ?? 0,
    x: PAD_X + (xs.get(ch) ?? 0) * GX,
    y: PAD_TOP + (height.get(ch) ?? 0) * GY,
    hv: ((ch === props.literal ? props.rootHv : hvOf.get(ch)) ?? '').toUpperCase(),
    root: ch === props.literal,
    link: ch !== props.literal && drawable(ch) && known.has(ch)
  }));
  const at = new Map(nodes.map((n) => [n.ch, n]));
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const [whole, parts] of kids) {
    const w = at.get(whole);
    if (!w) continue;
    for (const p of parts) {
      const a = at.get(p);
      if (!a) continue;
      const dx = w.x - a.x, dy = w.y - a.y, len = Math.hypot(dx, dy) || 1;
      lines.push({ x1: a.x + (dx / len) * (R + 2), y1: a.y + (dy / len) * (R + 2), x2: w.x - (dx / len) * (R + 7), y2: w.y - (dy / len) * (R + 7) });
    }
  }
  const leaves = nodes.filter((n) => n.row === 0).sort((a, b) => a.x - b.x).map((n) => shownAs(n.ch));
  return { nodes, lines, leaves, w: PAD_X * 2 + (next - 1) * GX, h: PAD_TOP + top * GY + R + 26 };
});
</script>

<template>
  <div v-if="graph" class="tree">
    <!-- Only the line of leaf components; the graph (circles and arrows) is no longer shown. -->
    <div class="label tree-toggle">
      <v-icon icon="mdi-graph-outline" size="14" />{{ t('kanji.components') }}<span class="jp leaves">{{ graph.leaves.join(' ') }}</span>
    </div>
  </div>
</template>

<style scoped>
.tree {
  margin-top: 4px;
  padding: 4px 0;
}
.tree-toggle {
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  cursor: default;
}
.leaves {
  font-weight: 700;
  margin-left: 10px;
  font-size: 1.8rem;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: none;
}
svg {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 6px auto 0;
}
.part { stroke-width: 2.5; fill-opacity: 0.22; }
/* one colour per level (the kanji itself is always the green one) */
.lvl0 { fill: #e08a1e; stroke: #e08a1e; }
.lvl1 { fill: #2f93d6; stroke: #2f93d6; }
.lvl2 { fill: #9b6bd6; stroke: #9b6bd6; }
.lvl3 { fill: #d6557a; stroke: #d6557a; }
.whole { fill: rgb(var(--v-theme-primary)); stroke: rgb(var(--v-theme-primary)); stroke-width: 2; }
.ch { font-weight: 700; font-size: 22px; fill: currentColor; }
.whole + .ch { fill: #fff; }
.hv-label { font-size: 10px; font-weight: 700; fill: currentColor; stroke: var(--paper); stroke-width: 5px; stroke-linejoin: round; paint-order: stroke; }
.odd { stroke-dasharray: 4 3; }
.link { cursor: pointer; }
.link:hover .part, .link:focus-visible .part { fill-opacity: 0.45; }
.link:focus { outline: none; }
.edge { stroke: currentColor; stroke-opacity: 0.6; stroke-width: 1.2; }
.arrow { fill: currentColor; fill-opacity: 0.7; }
</style>
