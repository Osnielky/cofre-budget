/**
 * Next's hook for errors thrown during server rendering, route handlers, or
 * server actions. Logged via console.error so Cloud Run forwards it to Cloud
 * Logging, where GCP Error Reporting auto-detects and groups the stack trace.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string; routePath: string },
) {
  console.error(
    `[${context.routeType}] ${request.method} ${request.path} (${context.routePath})`,
    error instanceof Error ? error.stack : error,
  );
}
