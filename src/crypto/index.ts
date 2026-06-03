import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error('ENCRYPTION_KEY is not set')
  }

  const buffer = Buffer.from(key, 'hex')

  if (buffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hex string (64 characters)')
  }

  return buffer
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])

  const tag = cipher.getAuthTag()

  // Store as iv:tag:ciphertext — all hex
  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex')
  ].join(':')
}

export function decrypt(stored: string): string {
  const key = getKey()
  const parts = stored.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format')
  }

  const [ivHex, tagHex, encryptedHex] = parts

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted) + decipher.final('utf8')
}

// Use this once to generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"