/* The one way the web app reads the API. Every GET goes through `apiGet`, so
   SWR (hooks/useApi.ts) can key, dedupe and cache by path, and a failed status
   is an error rather than a JSON body that happens to be an object. */

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly path: string) {
    super(`API ${status} on ${path}`);
    this.name = 'ApiError';
  }
}

/** `path` starts with `/` and may carry a query string: `/transactions?from=…`. */
export async function apiGet<T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, path.split('?')[0]);
  return res.json() as Promise<T>;
}
