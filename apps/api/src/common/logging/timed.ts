import { log, describeError } from './log';

const slowExternalMs = () => Number(process.env.SLOW_EXTERNAL_MS) || 2000;

/** Plaid/Stripe style error codes, when the SDK error carries one. */
function errorCode(err: unknown): string | undefined {
  const e = err as { response?: { data?: { error_code?: unknown } }; code?: unknown };
  const code = e?.response?.data?.error_code ?? e?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Times a call to an outside service and logs it, so slowness can be pinned on
 * our code or theirs. Failures are logged and rethrown untouched. `slowMs`
 * overrides SLOW_EXTERNAL_MS for calls that are slow by nature (streamed AI chat).
 */
export async function timed<T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
  opts: { slowMs?: number } = {},
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    const slow = durationMs >= (opts.slowMs ?? slowExternalMs());
    log(slow ? 'WARNING' : 'INFO', `${service}.${operation} ${durationMs}ms`, {
      external: { service, operation, durationMs, ok: true, ...(slow ? { slow: true } : {}) },
    });
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const code = errorCode(err);
    log('ERROR', `${service}.${operation} failed after ${durationMs}ms: ${describeError(err)}`, {
      external: { service, operation, durationMs, ok: false, error: describeError(err), ...(code ? { errorCode: code } : {}) },
    });
    throw err;
  }
}
