import { NextResponse } from 'next/server';

/**
 * Client-side errors (thrown in the browser after hydration) never reach
 * onRequestError in instrumentation.ts, so the error/global-error boundaries
 * POST here to get them into server logs → Cloud Logging → GCP Error Reporting.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body && typeof body === 'object') {
    const { message, stack, digest, url } = body as Record<string, unknown>;
    console.error(`[client] ${url ?? 'unknown url'} — ${message ?? 'unknown error'}`, stack ?? digest ?? '');
  }
  return NextResponse.json({ ok: true });
}
