import { parseVital } from '@/lib/web-vitals';
import { writeLog } from '@/lib/log';
import { readJsonBody } from '@/lib/report-body';

/** Real-user Core Web Vitals from WebVitals.tsx (sendBeacon, text body). Public, so size-capped. */
export async function POST(request: Request) {
  const vital = parseVital(await readJsonBody(request, 2048));
  if (vital) {
    writeLog(vital.rating === 'poor' ? 'WARNING' : 'INFO', `web-vital ${vital.name} ${Math.round(vital.value)} ${vital.page}`, {
      webVital: vital,
    });
  }
  return new Response(null, { status: 204 });
}
