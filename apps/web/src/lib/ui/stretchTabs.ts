/* The stretching tab highlight. One indicator element spans a tab strip and is
   positioned by two insets, `l` from the strip's left edge and `r` from its right
   edge. On a change the edge facing the new tab (the lead) gets there first with
   a sharp ease-out, and the edge left behind (the trail) follows more slowly with
   an ease-in-out, so the highlight stretches across the gap and settles to the
   new tab's width instead of jumping. Pure helpers here; the hook in
   components/ui/useStretchIndicator.ts drives the DOM. */

export type Edges = { l: number; r: number };
export type Edge = keyof Edges;

/** Box of the strip's content wrapper and of one tab, both as offsets within that wrapper. */
export type TabBox = { left: number; width: number };

/** Insets that frame `tab` inside a wrapper `wrapperWidth` wide, shrunk by `pad` on each side. */
export function measureEdges(wrapperWidth: number, tab: TabBox, pad = 0): Edges {
  return {
    l: tab.left + pad,
    r: Math.max(0, wrapperWidth - (tab.left + tab.width) + pad),
  };
}

/** Which inset leads and which trails for a move from `from` to `to`.
    Moving right means the right inset shrinks first; moving left, the left inset. */
export function leadTrail(from: Edges, to: Edges): { lead: Edge; trail: Edge } {
  const centreFrom = from.l - from.r;
  const centreTo = to.l - to.r;
  const right = centreTo === centreFrom ? to.l >= from.l : centreTo > centreFrom;
  return right ? { lead: 'r', trail: 'l' } : { lead: 'l', trail: 'r' };
}

/** Matches GSAP's power3.out and power3.inOut, the curves the effect was designed with. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Seconds. The lead arrives in 0.36s, the trail catches up in 0.55s. */
export const STRETCH = {
  lead: { duration: 0.36, ease: easeOutCubic },
  trail: { duration: 0.55, ease: easeInOutCubic },
} as const;

/** A plain slide (both edges together) for reduced motion or a non-stretch strip. */
export const SLIDE = { duration: 0.3, ease: easeOutCubic } as const;

/** Position at a moment `t` seconds after a move started, for tests and for
    anyone who wants to drive the tween without the animation library. */
export function edgesAt(from: Edges, to: Edges, t: number): Edges {
  const { lead, trail } = leadTrail(from, to);
  const at = (edge: Edge, spec: { duration: number; ease: (p: number) => number }) => {
    const p = spec.duration <= 0 ? 1 : Math.min(1, Math.max(0, t / spec.duration));
    return from[edge] + (to[edge] - from[edge]) * spec.ease(p);
  };
  return { [lead]: at(lead, STRETCH.lead), [trail]: at(trail, STRETCH.trail) } as Edges;
}
