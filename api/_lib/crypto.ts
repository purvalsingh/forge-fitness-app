import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM for users' Gemini keys. The secret (FORGE_KEY_SECRET, 32 bytes base64) exists only
 * in the server environment. The user id is bound in as associated data, so a ciphertext copied
 * into another account's row fails to decrypt instead of lending that account the keys.
 */
function secret(): Buffer {
  const raw = process.env.FORGE_KEY_SECRET ?? ''
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('FORGE_KEY_SECRET must be 32 bytes, base64-encoded')
  return key
}

export function encryptKeys(userId: string, keys: string[]): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', secret(), iv)
  c.setAAD(Buffer.from(userId))
  const data = Buffer.concat([c.update(JSON.stringify(keys), 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function decryptKeys(userId: string, blob: string): string[] {
  const [v, iv, tag, data] = blob.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('bad ciphertext')
  const d = createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'base64'))
  d.setAAD(Buffer.from(userId))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  const plain = Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
  const keys = JSON.parse(plain)
  if (!Array.isArray(keys) || !keys.every(k => typeof k === 'string')) throw new Error('bad payload')
  return keys
}
