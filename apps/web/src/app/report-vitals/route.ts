import { parseVital } from '@/lib/web-vitals';
import { writeLog } from '@/lib/log';

/** Real-user Core Web Vitals from WebVitals.tsx (sendBeacon, text body). */
export async function POST(request: Request) {
  const text = await request.text().catch(() => '');
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON — dropped by parseVital below
  }
  const vital = parseVital(body);
  if (vital) {
    writeLog(vital.rating === 'poor' ? 'WARNING' : 'INFO', `web-vital ${vital.name} ${Math.round(vital.value)} ${vital.page}`, {
      webVital: vital,
    });
  }
  return new Response(null, { status: 204 });
}
