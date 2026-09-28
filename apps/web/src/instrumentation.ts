import type { Instrumentation } from 'next';

/**
 * Next's hook for errors thrown during server rendering, route handlers, or
 * server actions. Written as Cloud Logging JSON in Error Reporting's format so
 * GCP groups the stack trace; the path is logged without its query string.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { writeLog, REPORTED_ERROR_TYPE } = await import('./lib/log');
  const e = err as Error & { digest?: string };
  writeLog('ERROR', `[${context.routeType}] ${request.method} ${request.path.split('?')[0]} — ${e?.message ?? String(err)}`, {
    '@type': REPORTED_ERROR_TYPE,
    ...(e?.stack ? { stack_trace: e.stack } : {}),
    ...(e?.digest ? { digest: e.digest } : {}),
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    source: 'next-server',
  });
};
