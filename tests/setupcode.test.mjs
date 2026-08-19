import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { encode, decode, CodeError, PREFIX } from '../src/core/setupcode.mjs'

const payload = {
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'test-secret-value'
}

test('encode produces a three-part code with the version prefix', () => {
  const code = encode(payload)
  const parts = code.split('.')
  assert.equal(parts.length, 3)
  assert.equal(parts[0], PREFIX)
  assert.equal(parts[1].length, 8)
})

test('round trip preserves every field', () => {
  assert.deepEqual(decode(encode(payload)), { v: 1, ...payload })
})

test('whitespace around a pasted code is tolerated', () => {
  const code = `  ${encode(payload)}\n`
  assert.equal(decode(code).client_id, payload.client_id)
})

test('a truncated code fails on the checksum, not later', () => {
  const code = encode(payload)
  const truncated = code.slice(0, code.length - 6)
  assert.throws(() => decode(truncated), (e) => {
    assert.ok(e instanceof CodeError)
    assert.equal(e.reason, 'checksum')
    assert.equal(e.messageKey, 'err.code_checksum')
    return true
  })
})

test('a wrong prefix fails on format', () => {
  assert.throws(() => decode('NOPE.aaaaaaaa.eyJ2IjoxfQ'), (e) => e.reason === 'format')
})

test('a two-part code fails on format', () => {
  assert.throws(() => decode('GWSC1.deadbeef'), (e) => e.reason === 'format')
})

test('a client_id that is not a Google client fails', () => {
  const bad = { ...payload, client_id: 'not-a-client' }
  assert.throws(() => decode(encode(bad)), (e) => {
    assert.equal(e.reason, 'client_id')
    return true
  })
})

test('a missing field fails on fields', () => {
  const { client_secret, ...rest } = payload
  assert.throws(() => decode(encode(rest)), (e) => e.reason === 'fields')
})

test('an unknown version fails on version', () => {
  const body = Buffer.from(JSON.stringify({ v: 99, ...payload }), 'utf8').toString('base64url')
  const sum = createHash('sha256').update(body).digest('hex').slice(0, 8)
  assert.throws(() => decode(`GWSC1.${sum}.${body}`), (e) => e.reason === 'version')
})
