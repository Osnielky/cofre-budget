import { Injectable } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

/**
 * Browsers never reach the API directly: the web service proxies /api/* to it,
 * so every browser request arrives from the web service's address. The web
 * middleware forwards the real client IP in these headers, and the API trusts
 * them only when the shared secret matches — the API URL is public (Plaid and
 * Stripe webhooks call it), so anyone could send the IP header on its own.
 */
export const PROXY_CLIENT_IP_HEADER = 'x-cofre-client-ip';
export const PROXY_KEY_HEADER = 'x-cofre-proxy-key';

// Cloud Run's front end appends the caller's address to X-Forwarded-For; trusting
// exactly one hop makes req.ip that address and ignores anything client-supplied.
export function configureTrustProxy(app: NestExpressApplication): void {
  app.set('trust proxy', 1);
}

function secretMatches(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clientIp(req: Record<string, any>): string {
  const secret = process.env.PROXY_SHARED_SECRET;
  const forwarded = req.headers?.[PROXY_CLIENT_IP_HEADER];
  if (secret && typeof forwarded === 'string' && forwarded && secretMatches(req.headers?.[PROXY_KEY_HEADER], secret)) {
    return forwarded;
  }
  return req.ip;
}

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req);
  }
}
