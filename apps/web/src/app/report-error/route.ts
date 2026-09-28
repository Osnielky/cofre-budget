import { NextResponse } from 'next/server';
import { writeLog } from '@/lib/log';
import { readJsonBody, browserErrorFields } from '@/lib/report-body';

/**
 * Client-side errors (thrown in the browser after hydration) never reach
 * onRequestError in instrumentation.ts, so the error/global-error boundaries
 * POST here to get them into Cloud Logging → GCP Error Reporting. Public, so
 * the body is size-capped and every logged field truncated.
 */
export async function POST(request: Request) {
  const report = browserErrorFields(await readJsonBody(request, 16_384));
  if (report) writeLog('ERROR', report.message, report.fields);
  return NextResponse.json({ ok: true });
}
