'use client';

/* Touch-first carousel on Embla: swipe with inertia on phones, drag with the mouse and
   trackpad / wheel on desktop, snap to the centre, optional loop. Controlled by `index`
   so the parent owns the selection (arrows, dots, keyboard all just set the index).

   `tween(diff)` poses each slide from its distance to the centre in slide widths
   (0 = centred, ±1 = a neighbour) and is applied straight to the slide's inner node on
   every scroll frame, so the pose follows the finger mid-drag. Reusable: pass any items
   and renderer (suggested prompts, project strips, theme cards…). */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { useReducedMotion } from 'motion/react';

export interface SlidePose { scale?: number; rotateY?: number; opacity?: number; origin?: 'left' | 'center' | 'right' }

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  index: number;
  onIndexChange: (index: number) => void;
  renderItem: (item: T, index: number, active: boolean) => ReactNode;
  /** Width of one slide, as classes on the slide wrapper (e.g. `basis-[78%] sm:basis-[360px]`). */
  slideClassName: string;
  tween?: (diff: number) => SlidePose;
  loop?: boolean;
  ariaLabel: string;
  className?: string;
}

export default function Carousel<T>({ items, keyOf, index, onIndexChange, renderItem, slideClassName, tween, loop = true, ariaLabel, className }: Props<T>) {
  const reduce = useReducedMotion();
  const [viewportRef, api] = useEmblaCarousel(
    { align: 'center', loop, skipSnaps: false, duration: reduce ? 0 : 22, containScroll: false },
    [WheelGesturesPlugin({ forceWheelAxis: 'x' })],
  );
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  /* Pose every slide from its distance to the centre, loop-aware (Embla's own recipe). */
  const pose = useCallback(() => {
    if (!api || !tween) return;
    const engine = api.internalEngine();
    const progress = api.scrollProgress();
    const snaps = api.scrollSnapList();
    const spacing = snaps.length > 1 ? snaps[1] - snaps[0] : 1;
    const nodes = api.slideNodes();
    snaps.forEach((snap, snapIndex) => {
      let diff = snap - progress;
      const slides = engine.slideRegistry[snapIndex];
      slides.forEach((slideIndex) => {
        if (engine.options.loop) {
          engine.slideLooper.loopPoints.forEach((loopItem) => {
            const target = loopItem.target();
            if (slideIndex === loopItem.index && target !== 0) {
              if (Math.sign(target) === -1) diff = snap - (1 + progress);
              if (Math.sign(target) === 1) diff = snap + (1 - progress);
            }
          });
        }
        const node = nodes[slideIndex];
        const inner = node?.firstElementChild as HTMLElement | null;
        if (!inner) return;
        const p = tween(diff / spacing);
        /* The nearest-to-centre slide paints on top. */
        node.style.zIndex = String(10 - Math.min(Math.round(Math.abs(diff / spacing) * 4), 9));
        inner.style.transformOrigin = `${p.origin ?? 'center'} center`;
        inner.style.transform = `scale(${p.scale ?? 1}) rotateY(${p.rotateY ?? 0}deg)`;
        inner.style.opacity = String(p.opacity ?? 1);
      });
    });
  }, [api, tween]);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => onIndexChangeRef.current(api.selectedScrollSnap());
    pose();
    api.on('select', onSelect).on('scroll', pose).on('reInit', pose);
    return () => { api.off('select', onSelect).off('scroll', pose).off('reInit', pose); };
  }, [api, pose]);

  /* The parent moved the index (arrow, dot, keyboard): scroll there. */
  useEffect(() => {
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index);
  }, [api, index]);

  return (
    <div ref={viewportRef} className={`overflow-hidden ${className ?? ''}`} role="group" aria-roledescription="carousel" aria-label={ariaLabel}>
      <div className="flex touch-pan-y">
        {items.map((item, i) => (
          <div key={keyOf(item)} className={`relative shrink-0 min-w-0 ${slideClassName}`} style={{ perspective: '1000px' }}
            role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            <div style={{ transition: reduce ? 'none' : undefined, willChange: 'transform, opacity' }}>
              {renderItem(item, i, i === index)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
