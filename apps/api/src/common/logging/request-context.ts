import { AsyncLocalStorage } from 'async_hooks';

/** Per-request fields every log entry written during the request carries. */
export interface RequestContext {
  requestId: string;
  trace?: string;
  userId?: string;
  /** Message of a handled 4xx, added to the request's log line. */
  error?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setRequestUser(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}
