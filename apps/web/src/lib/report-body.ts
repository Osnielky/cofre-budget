import { REPORTED_ERROR_TYPE } from './log';
import { pagePath } from './web-vitals';

/**
 * /report-error and /report-vitals are public, so anyone can post to them. Read
 * at most `maxBytes` and drop anything larger or not JSON — unbounded input
 * would turn into multi-MB log lines billed per GiB.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

const cap = (s: string, n: number) => s.slice(0, n);

/** Log message and fields for a browser error report, every field capped. */
export function browserErrorFields(body: unknown): { message: string; fields: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object') return null;
  const { message, stack, digest, url } = body as Record<string, unknown>;
  const page = pagePath(url);
  const shortPage = page ? cap(page, 200) : undefined;
  return {
    message: cap(`[browser] ${shortPage ?? 'unknown page'} — ${typeof message === 'string' ? message : 'unknown error'}`, 500),
    fields: {
      '@type': REPORTED_ERROR_TYPE,
      ...(typeof stack === 'string' ? { stack_trace: cap(stack, 8000) } : {}),
      ...(typeof digest === 'string' ? { digest: cap(digest, 100) } : {}),
      page: shortPage,
      source: 'browser',
    },
  };
}
