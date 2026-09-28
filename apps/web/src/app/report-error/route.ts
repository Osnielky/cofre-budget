import { NextResponse } from 'next/server';
import { writeLog, REPORTED_ERROR_TYPE } from '@/lib/log';
import { pagePath } from '@/lib/web-vitals';

/**
 * Client-side errors (thrown in the browser after hydration) never reach
 * onRequestError in instrumentation.ts, so the error/global-error boundaries
 * POST here to get them into Cloud Logging → GCP Error Reporting.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body && typeof body === 'object') {
    const { message, stack, digest, url } = body as Record<string, unknown>;
    const page = pagePath(url);
    writeLog('ERROR', `[browser] ${page ?? 'unknown page'} — ${typeof message === 'string' ? message.slice(0, 500) : 'unknown error'}`, {
      '@type': REPORTED_ERROR_TYPE,
      ...(typeof stack === 'string' ? { stack_trace: stack.slice(0, 8000) } : {}),
      ...(typeof digest === 'string' ? { digest } : {}),
      page,
      source: 'browser',
    });
  }
  return NextResponse.json({ ok: true });
}
