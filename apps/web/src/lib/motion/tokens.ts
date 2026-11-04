/* Shared motion vocabulary for the app (Motion / Framer Motion). Every animated surface —
   the Cards deck, the chat, sheets, stat tiles — reads its springs and travel from here so
   the whole app moves with one feel. Pass `reduce` (from useReducedMotion) to the helpers
   to collapse travel to zero and keep only the fade. */

export const springs = {
  /* Rows and panels settling into place (same feel as the chat). */
  soft: { type: 'spring', stiffness: 260, damping: 22, mass: 0.9 } as const,
  /* Controls reacting to a tap: dots, chips, buttons. */
  snappy: { type: 'spring', stiffness: 520, damping: 32, mass: 0.6 } as const,
};

export const durations = { fast: 0.18, base: 0.28, slow: 0.45 } as const;

/* Horizontal slide used when content is swapped by a left/right choice (a picker, tabs). */
export function slideVariants(direction: 1 | -1, reduce = false) {
  const travel = reduce ? 0 : 36 * direction;
  return {
    initial: { x: travel, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: -travel + 0, opacity: 0 },
  };
}

/* Rise-in for the i-th item of a list (stat tiles, facts). */
export function fadeUp(i: number, reduce = false) {
  return {
    initial: { y: reduce ? 0 : 14, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { ...springs.soft, delay: reduce ? 0 : Math.min(i, 8) * 0.045 },
  };
}

/* Pagination dots: the active one stretches into a pill. */
export const DOT_WIDTH = { idle: 6, active: 20 } as const;
