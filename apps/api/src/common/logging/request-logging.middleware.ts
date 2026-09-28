import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { log, Severity } from './log';
import { runWithRequestContext, RequestContext } from './request-context';
import { clientIp } from '../client-ip-throttler.guard';

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const slowMs = () => Number(process.env.SLOW_REQUEST_MS) || 1000;

/** Cloud Run's X-Cloud-Trace-Context is "TRACE_ID/SPAN_ID;o=1". */
export function traceField(header: unknown, project: string | undefined): string | undefined {
  if (typeof header !== 'string' || !project) return undefined;
  const traceId = header.split('/')[0];
  return traceId ? `projects/${project}/traces/${traceId}` : undefined;
}

/**
 * Opens the per-request log context and writes one line per request when the
 * response finishes. Registered first in main.ts so everything after it runs
 * inside the context.
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);

  const ctx: RequestContext = {
    requestId,
    trace: traceField(req.headers['x-cloud-trace-context'], process.env.GOOGLE_CLOUD_PROJECT),
  };
  const start = process.hrtime.bigint();
  res.on('finish', () => runWithRequestContext(ctx, () => logRequest(req, res, ctx, start)));
  runWithRequestContext(ctx, next);
}

function logRequest(req: Request, res: Response, ctx: RequestContext, start: bigint): void {
  const path = (req.originalUrl ?? req.url).split('?')[0];
  const status = res.statusCode;
  if (path === '/api/health' && status < 400) return;

  const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
  const route = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : undefined;
  const slow = latencyMs >= slowMs();
  const severity: Severity = status >= 500 ? 'ERROR' : status >= 400 || slow ? 'WARNING' : 'INFO';

  log(severity, `${req.method} ${route ?? path} ${status} ${Math.round(latencyMs)}ms`, {
    httpRequest: {
      requestMethod: req.method,
      requestUrl: path,
      status,
      latency: `${(latencyMs / 1000).toFixed(3)}s`,
      userAgent: req.headers['user-agent'],
      remoteIp: clientIp(req),
    },
    route,
    latencyMs: Math.round(latencyMs),
    ...(slow ? { slow: true } : {}),
    ...(ctx.error ? { error: ctx.error } : {}),
  });
}
