'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, useReducedMotion, type AnimationPlaybackControls } from 'motion/react';
import { measureEdges, leadTrail, STRETCH, SLIDE, type Edges, type Edge } from '@/lib/ui/stretchTabs';

/* Drives the stretching highlight behind a tab strip.

   Markup contract: `wrapperRef` is a `position: relative` element that holds the
   tab buttons, each carrying `data-tab-key="<id>"`. Render the returned
   `indicatorRef` as an absolutely positioned child of that wrapper (top and
   bottom set by the caller, left and right owned by this hook). The hook moves
   it whenever `activeKey` changes: the edge facing the new tab arrives first,
   the other edge follows, so the highlight stretches across the gap. Resizes and
   font loads re-measure without animating. Reduced motion snaps.

   `pad` shrinks the highlight inside the tab on both sides (the Settings
   underline uses 8px). `stretch: false` slides both edges together. */
export function useStretchIndicator(
  wrapperRef: RefObject<HTMLElement | null>,
  activeKey: string | null,
  { pad = 0, stretch = true }: { pad?: number; stretch?: boolean } = {},
) {
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const edges = useRef<Edges | null>(null);
  const live = useRef<AnimationPlaybackControls[]>([]);
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const wrap = wrapperRef.current, ind = indicatorRef.current;
    if (!wrap || !ind) return;

    const paint = (e: Edges) => { ind.style.left = `${e.l}px`; ind.style.right = `${e.r}px`; };
    const stop = () => { live.current.forEach((c) => c.stop()); live.current = []; };
    const target = (): Edges | null => {
      if (activeKey == null) return null;
      const tab = wrap.querySelector<HTMLElement>(`[data-tab-key="${CSS.escape(activeKey)}"]`);
      if (!tab || tab.offsetWidth === 0) return null; // no such tab, or hidden at this breakpoint
      return measureEdges(wrap.offsetWidth, { left: tab.offsetLeft, width: tab.offsetWidth }, pad);
    };

    /** Snap to the active tab: first paint, resize, font load. */
    const settle = () => {
      stop();
      const to = target();
      if (!to) { ind.style.opacity = '0'; edges.current = null; return; }
      edges.current = to; paint(to); ind.style.opacity = '1';
    };

    /** Animate from wherever the highlight is now to the active tab. */
    const move = () => {
      stop();
      const to = target();
      if (!to) { ind.style.opacity = '0'; edges.current = null; return; }
      const from = edges.current;
      ind.style.opacity = '1';
      if (!from || reduce) { edges.current = to; paint(to); return; }
      const cur: Edges = { ...from };
      edges.current = cur; // a change mid-flight starts from where the pill is, not where it was going
      const run = (edge: Edge, spec: { duration: number; ease: (t: number) => number }) =>
        animate(from[edge], to[edge], { duration: spec.duration, ease: spec.ease, onUpdate: (v) => { cur[edge] = v; paint(cur); } });
      if (stretch) {
        const { lead, trail } = leadTrail(from, to);
        live.current = [run(lead, STRETCH.lead), run(trail, STRETCH.trail)];
      } else {
        live.current = [run('l', SLIDE), run('r', SLIDE)];
      }
    };

    move();
    let first = true; // ResizeObserver reports once on observe; that must not cancel the move
    const ro = new ResizeObserver(() => { if (first) { first = false; return; } settle(); });
    ro.observe(wrap);
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled && live.current.length === 0) settle(); });
    return () => { cancelled = true; ro.disconnect(); stop(); };
  }, [wrapperRef, activeKey, pad, stretch, reduce]);

  return indicatorRef;
}
