import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { verifyPlaidWebhookSignature, PlaidJWK } from './plaid-webhook-signature';

const POSITIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  /* null = a prior lookup for this kid failed; cached briefly so a bogus kid retried
     repeatedly (e.g. by an attacker probing the endpoint) doesn't cause a fresh Plaid
     API call on every attempt. */
  jwk: PlaidJWK | null;
  expiresAt: number;
}

@Injectable()
export class PlaidWebhookVerifierService {
  private readonly client: PlaidApi;
  private keyCache = new Map<string, CacheEntry>();

  constructor(private config: ConfigService) {
    const env = this.config.get<string>('PLAID_ENV', 'sandbox');
    const cfg = new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.config.get<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.config.get<string>('PLAID_SECRET'),
        },
      },
    });
    this.client = new PlaidApi(cfg);
  }

  async verify(token: string, rawBody: Buffer): Promise<boolean> {
    return verifyPlaidWebhookSignature(token, rawBody, (kid) => this.fetchKey(kid));
  }

  private async fetchKey(kid: string): Promise<PlaidJWK> {
    const cached = this.keyCache.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.jwk) throw new Error('Cached lookup failure for this key id');
      return cached.jwk;
    }

    try {
      const res = await this.client.webhookVerificationKeyGet({ key_id: kid });
      const jwk: PlaidJWK = {
        kty: res.data.key.kty,
        crv: res.data.key.crv,
        x: res.data.key.x,
        y: res.data.key.y,
        expired_at: res.data.key.expired_at,
      };
      this.keyCache.set(kid, { jwk, expiresAt: Date.now() + POSITIVE_CACHE_TTL_MS });
      return jwk;
    } catch (err) {
      this.keyCache.set(kid, { jwk: null, expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
      throw err;
    }
  }
}
