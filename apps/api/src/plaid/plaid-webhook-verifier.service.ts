import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { verifyPlaidWebhookSignature, PlaidJWK } from './plaid-webhook-signature';

@Injectable()
export class PlaidWebhookVerifierService {
  private readonly client: PlaidApi;
  private keyCache = new Map<string, PlaidJWK>();

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
    if (cached) return cached;
    const res = await this.client.webhookVerificationKeyGet({ key_id: kid });
    const jwk: PlaidJWK = {
      kty: res.data.key.kty,
      crv: res.data.key.crv,
      x: res.data.key.x,
      y: res.data.key.y,
      expired_at: res.data.key.expired_at,
    };
    this.keyCache.set(kid, jwk);
    return jwk;
  }
}
