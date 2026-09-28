/**
 * Copies only the listed keys from a request body. Bodies are plain client
 * objects (no validation layer strips unknown keys), so spreading one onto an
 * entity lets the caller set any column — `id` makes save() UPDATE another
 * user's row. Every create/update that takes a DTO goes through this.
 * Keys absent from the body are left out, so it also works for PATCH.
 */
export function pickFields<T extends object, K extends keyof T>(body: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  if (!body || typeof body !== 'object') return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) out[key] = body[key];
  }
  return out;
}
