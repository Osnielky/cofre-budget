import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { durations } from '@/lib/motion/tokens';

/* Page entry motion: the pieces of a page rise into place one after another
   (stat row, then each panel). Wrap the page body in <Stagger> and each piece
   in <StaggerItem>; a variant-aware component such as the Reports Card can
   also take `riseVariants` directly and will join the same sequence.

   Kept fast on purpose: a short fade with an 8px rise (durations.fast from
   lib/motion/tokens) and 25ms between pieces, so a dashboard of twenty panels
   is fully in place well under half a second. A longer step with the soft
   spring read as "the charts are slow to load". No blur: a filter on a wrapper
   turns off the glass backdrop-filter inside it for the whole animation. Key
   the <Stagger> by the active tab only where the content really is swapped
   (Settings, Reports), never on a filter that re-renders the same list. No
   'use client' here on purpose: the file is only imported by client components.

   Reduced motion: everything is in place at once. */

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: durations.base, ease: [0.2, 0.8, 0.2, 1] } },
};

export function Stagger({ children, className, style, step = 0.025, delay = 0, ...rest }: {
  children: ReactNode; className?: string; style?: CSSProperties; step?: number; delay?: number;
  [data: `data-${string}`]: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div {...rest} className={className} style={style} initial={reduce ? false : 'hidden'} animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: step, delayChildren: delay } } }}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <motion.div className={className} style={style} variants={riseVariants}>
      {children}
    </motion.div>
  );
}
