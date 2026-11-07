'use client';

import { mutate } from 'swr';

/** Drop every cached API response. Called on logout so the next account never
    paints the previous one's lists while its own are loading. */
export function clearApiCache(): Promise<unknown> {
  return mutate(() => true, undefined, { revalidate: false });
}
