import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const f = await import('../tools/bundle/fetch.mjs')

const sha = (b) => createHash('sha256').update(b).digest('hex')

test('a SHASUMS256 listing yields the sum for the one file we want', () => {
  const text = [
    'aaaa1111  node-v22.23.2-darwin-arm64.tar.gz',
    'bbbb2222  node-v22.23.2-win-x64.zip',
    'cccc3333  node-v22.23.2-linux-x64.tar.xz'
  ].join('\n')
  assert.equal(f.shaFromListing(text, 'node-v22.23.2-win-x64.zip'), 'bbbb2222')
})

test('a file missing from the listing is an error, not an undefined', () => {
  assert.throws(
    () => f.shaFromListing('aaaa1111  something-else.zip', 'node-v22.23.2-win-x64.zip'),
    /node-v22\.23\.2-win-x64\.zip/
  )
})

test('a lone .sha256 file yields its first field', () => {
  assert.equal(f.shaFromListing('dddd4444  gws.zip\n', 'gws.zip'), 'dddd4444')
})

test('a matching checksum passes quietly', () => {
  const data = Buffer.from('payload')
  assert.doesNotThrow(() => f.verify(data, sha(data), 'node.zip'))
})

test('a mismatched checksum names the artifact and both sums', () => {
  const data = Buffer.from('payload')
  assert.throws(
    () => f.verify(data, 'f'.repeat(64), 'node-v22.23.2-win-x64.zip'),
    (e) => /node-v22\.23\.2-win-x64\.zip/.test(e.message) && /ffffffff/.test(e.message) && e.message.includes(sha(data).slice(0, 8))
  )
})

test('a checksum comparison ignores case, because the two sources differ', () => {
  const data = Buffer.from('payload')
  assert.doesNotThrow(() => f.verify(data, sha(data).toUpperCase(), 'gws.zip'))
})

test('a failed download says which URL and status, not just "failed"', async () => {
  const fake = async () => ({ ok: false, status: 404, statusText: 'Not Found' })
  await assert.rejects(
    () => f.download('https://example.test/thing.zip', { fetchImpl: fake }),
    /thing\.zip.*404/s
  )
})

test('a successful download returns the bytes', async () => {
  const fake = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('hi').buffer })
  assert.deepEqual(await f.download('https://example.test/a', { fetchImpl: fake }), Buffer.from('hi'))
})
