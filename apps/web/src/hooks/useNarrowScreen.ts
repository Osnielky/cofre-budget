'use client';

import { useEffect, useState } from 'react';

/** True below Tailwind's `sm` (640px); false during server rendering and the first paint. */
export function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow;
}
