import * as crypto from 'crypto';

/** Derive a 32-byte AES key from an arbitrary secret (e.g. JWT_SECRET). */
export function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt a token/secret for at-rest storage. Format: iv:authTag:ciphertext (all hex). */
export function encryptToken(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

/** Decrypt a token encrypted by encryptToken(). Returns '' on malformed/undecryptable input. */
export function decryptToken(text: string, key: Buffer): string {
  if (!text || !text.includes(':')) return '';
  const parts = text.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, dataHex] = parts;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
