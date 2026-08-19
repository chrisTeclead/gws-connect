// The setup code is transport packaging, not encryption. It IS the secret.
// The checksum exists so a truncated paste fails here, loudly, instead of
// surfacing later as an opaque OAuth error - the most expensive failure mode
// for a non-technical user.
import { createHash } from 'node:crypto'

export const PREFIX = 'GWSC1'
export const VERSION = 1

const REQUIRED = ['id', 'label', 'audience', 'client_id', 'client_secret']

export class CodeError extends Error {
  constructor (reason) {
    super(`setup code rejected: ${reason}`)
    this.name = 'CodeError'
    this.reason = reason
    this.messageKey = `err.code_${reason}`
  }
}

function checksum (body) {
  return createHash('sha256').update(body).digest('hex').slice(0, 8)
}

export function encode (payload) {
  const body = Buffer.from(JSON.stringify({ v: VERSION, ...payload }), 'utf8')
    .toString('base64url')
  return `${PREFIX}.${checksum(body)}.${body}`
}

export function decode (code) {
  const parts = String(code ?? '').trim().split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX || parts[1].length !== 8 || !parts[2]) {
    throw new CodeError('format')
  }
  const [, sum, body] = parts
  if (checksum(body) !== sum.toLowerCase()) throw new CodeError('checksum')

  let payload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    throw new CodeError('json')
  }
  if (payload?.v !== VERSION) throw new CodeError('version')
  for (const field of REQUIRED) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new CodeError('fields')
    }
  }
  if (!payload.client_id.endsWith('.apps.googleusercontent.com')) {
    throw new CodeError('client_id')
  }
  return payload
}
