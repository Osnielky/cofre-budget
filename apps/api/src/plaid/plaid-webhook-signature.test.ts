import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { verifyPlaidWebhookSignature, PlaidJWK } from './plaid-webhook-signature';

function makeSignedWebhook(bodyObj: object, overrides: { iat?: number } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const kid = 'test-key-1';
  const rawBody = Buffer.from(JSON.stringify(bodyObj));
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const iat = overrides.iat ?? Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { request_body_sha256: bodyHash, iat },
    privateKey,
    { algorithm: 'ES256', header: { kid, alg: 'ES256' } },
  );
  const jwkPublic = publicKey.export({ format: 'jwk' }) as { x: string; y: string; crv: string; kty: string };
  const jwk: PlaidJWK = { kty: jwkPublic.kty, crv: jwkPublic.crv, x: jwkPublic.x, y: jwkPublic.y, expired_at: null };
  return { token, rawBody, jwk };
}

describe('verifyPlaidWebhookSignature', () => {
  it('accepts a correctly signed webhook with a matching body hash', async () => {
    const { token, rawBody, jwk } = makeSignedWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' });
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => jwk);
    expect(result).toBe(true);
  });

  it('rejects when the raw body does not match the signed hash', async () => {
    const { token, jwk } = makeSignedWebhook({ webhook_type: 'TRANSACTIONS', webhook_code: 'SYNC_UPDATES_AVAILABLE' });
    const tamperedBody = Buffer.from(JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'HISTORICAL_UPDATE' }));
    const result = await verifyPlaidWebhookSignature(token, tamperedBody, async () => jwk);
    expect(result).toBe(false);
  });

  it('rejects a token signed by a different key than the one Plaid returns', async () => {
    const { token, rawBody } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    const { jwk: otherJwk } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => otherJwk);
    expect(result).toBe(false);
  });

  it('rejects a token older than 5 minutes', async () => {
    const staleIat = Math.floor(Date.now() / 1000) - 400;
    const { token, rawBody, jwk } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' }, { iat: staleIat });
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => jwk);
    expect(result).toBe(false);
  });

  it('rejects when the fetched key is expired', async () => {
    const { token, rawBody, jwk } = makeSignedWebhook({ webhook_type: 'ITEM', webhook_code: 'ERROR' });
    const expiredJwk: PlaidJWK = { ...jwk, expired_at: Math.floor(Date.now() / 1000) - 10 };
    const result = await verifyPlaidWebhookSignature(token, rawBody, async () => expiredJwk);
    expect(result).toBe(false);
  });
});
