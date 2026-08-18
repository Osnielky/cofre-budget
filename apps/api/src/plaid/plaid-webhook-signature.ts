import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface PlaidJWK {
  kty: string;
  crv: string;
  x: string;
  y: string;
  expired_at: number | null;
}

const MAX_CLOCK_SKEW_SECONDS = 300;

/* Verifies a Plaid webhook JWT per https://plaid.com/docs/api/webhooks/webhook-verification/ —
   decodes the JWT header for `kid`, fetches the matching public key via `fetchKey`, verifies
   the ES256 signature, rejects stale tokens, and confirms the body-hash claim matches the raw
   request bytes actually received. `fetchKey` is injected so this stays testable without a
   live Plaid API call. */
export async function verifyPlaidWebhookSignature(
  token: string,
  rawBody: Buffer,
  fetchKey: (kid: string) => Promise<PlaidJWK>,
): Promise<boolean> {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') return false;
  const kid = (decoded.header as { kid?: string }).kid;
  if (!kid) return false;

  let jwk: PlaidJWK;
  try {
    jwk = await fetchKey(kid);
  } catch {
    return false;
  }
  if (jwk.expired_at) return false;

  const key = crypto.createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: 'jwk',
  });

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, key, { algorithms: ['ES256'] }) as jwt.JwtPayload;
  } catch {
    return false;
  }

  const iat = payload.iat ?? 0;
  if (Math.abs(Date.now() / 1000 - iat) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expectedHash = payload['request_body_sha256'];
  if (typeof expectedHash !== 'string') return false;
  const actualHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
