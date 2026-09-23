import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const { sha256Listing } = await import('../tools/bundle/checksums.mjs')

test('the listing has the shasum -a 256 layout the installers parse', () => {
  const data = Buffer.from('hello')
  const hex = createHash('sha256').update(data).digest('hex')
  assert.equal(sha256Listing([{ name: 'a.zip', data }]), `${hex}  a.zip\n`)
})

test('entries are sorted by name so a rebuild produces the same file', () => {
  const out = sha256Listing([
    { name: 'gws-connect-win-x64.zip', data: Buffer.from('w') },
    { name: 'gws-connect-mac-arm64.zip', data: Buffer.from('m') }
  ])
  const names = out.trim().split('\n').map(l => l.split('  ')[1])
  assert.deepEqual(names, ['gws-connect-mac-arm64.zip', 'gws-connect-win-x64.zip'])
})
