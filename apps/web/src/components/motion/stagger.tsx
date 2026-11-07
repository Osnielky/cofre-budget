import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { springs } from '@/lib/motion/tokens';

/* Page entry motion: the pieces of a page rise into place one after another
   (stat row, then each panel). Wrap the page body in <Stagger> and each piece
   in <StaggerItem>; a variant-aware component such as the Reports Card can
   also take `riseVariants` directly and will join the same sequence.

   Fade and a 14px rise on the app's soft spring (lib/motion/tokens, the same
   travel as fadeUp), no blur: a filter on a wrapper turns off the glass
   backdrop-filter inside it for the whole animation. Key the <Stagger> by the
   active tab when switching tabs should replay it. No 'use client' here on
   purpose: the file is only imported by client components (see ask-cofre/motion.tsx).

   Reduced motion: everything is in place at once. */

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: springs.soft },
};

export function Stagger({ children, className, style, step = 0.045, delay = 0.04, ...rest }: {
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
