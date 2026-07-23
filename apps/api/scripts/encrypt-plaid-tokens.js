#!/usr/bin/env node
/**
 * One-off remediation script: encrypts any plaintext plaid_items.accessToken
 * rows left over from before PlaidService started encrypting tokens at rest
 * (see apps/api/src/common/token-crypto.util.ts for the same AES-256-GCM
 * scheme already used for Gmail tokens).
 *
 * Run once against each environment (local + prod) after deploying the
 * encryption fix:
 *   node -r dotenv/config apps/api/scripts/encrypt-plaid-tokens.js
 *
 * Safe to re-run: rows already in "iv:tag:ciphertext" hex format are skipped.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ENCRYPTED_FORMAT = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i;

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(text, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

// Mirrors apps/api/src/config/database.config.ts's SSL resolution so this
// script connects exactly the way the API itself does.
function resolveSsl() {
  if (!process.env.DB_HOST?.includes('supabase.co')) return false;
  const caPath = ['supabase-ca.crt.crt', 'supabase-ca.crt']
    .map((f) => path.resolve(process.cwd(), f))
    .find((p) => fs.existsSync(p));
  if (caPath) return { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() };
  return { rejectUnauthorized: false };
}

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET must be set in the environment');
  const key = deriveKey(secret);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'cofre_budget',
    ssl: resolveSsl(),
  });
  await client.connect();

  try {
    const { rows } = await client.query('SELECT id, "accessToken" FROM plaid_items');
    let encrypted = 0;
    let skipped = 0;

    for (const row of rows) {
      if (ENCRYPTED_FORMAT.test(row.accessToken)) {
        skipped++;
        continue;
      }
      const cipherText = encryptToken(row.accessToken, key);
      await client.query('UPDATE plaid_items SET "accessToken" = $1 WHERE id = $2', [cipherText, row.id]);
      encrypted++;
    }

    console.log(`plaid_items: ${encrypted} token(s) encrypted, ${skipped} already encrypted (skipped), ${rows.length} total.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
