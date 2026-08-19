import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { encode } from '../src/core/setupcode.mjs'

const payload = {
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'test-secret-value'
}

async function fresh () {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-cs-'))
  process.env.GWS_CONNECT_HOME = dir
  process.env.GWS_CONNECT_SECRETS = 'memory'
  const mod = await import(`../src/core/credsets.mjs?${Math.random()}`)
  return { dir, mod }
}

test('importCode stores metadata and secrets separately', async () => {
  const { dir, mod } = await fresh()
  const set = await mod.importCode(encode(payload))
  assert.equal(set.id, 'default')
  assert.equal(set.label, 'Terra One')
  assert.equal(set.audience, 'external')
  assert.equal(set.source, 'setup-code')
  assert.ok(set.createdAt)

  const onDisk = await fs.readFile(path.join(dir, 'credentials', 'default.json'), 'utf8')
  assert.ok(!onDisk.includes('test-secret-value'), 'metadata must not contain the secret')
  assert.ok(!onDisk.includes('123-abc'), 'metadata must not contain the client id')

  const creds = await mod.credentials('default')
  assert.deepEqual(creds, { client_id: payload.client_id, client_secret: payload.client_secret })
  await fs.rm(dir, { recursive: true, force: true })
})

test('list returns default first', async () => {
  const { dir, mod } = await fresh()
  await mod.importCode(encode(payload))
  await mod.saveManual({
    id: 'own', label: 'Aaa own', audience: 'internal',
    client_id: 'zzz.apps.googleusercontent.com', client_secret: 's'
  })
  const ids = (await mod.list()).map(s => s.id)
  assert.deepEqual(ids, ['default', 'own'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('list is empty on a fresh machine', async () => {
  const { dir, mod } = await fresh()
  assert.deepEqual(await mod.list(), [])
  assert.equal(await mod.get('default'), null)
  assert.equal(await mod.exists('default'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('credentials throws when the secret is missing', async () => {
  const { dir, mod } = await fresh()
  await mod.saveManual({
    id: 'half', label: 'Half', audience: 'external',
    client_id: 'x.apps.googleusercontent.com', client_secret: 'y'
  })
  const { backend } = await import('../src/core/secrets/index.mjs')
  const b = await backend()
  await b.removeSet('half')
  await assert.rejects(() => mod.credentials('half'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('remove drops both metadata and secrets', async () => {
  const { dir, mod } = await fresh()
  await mod.importCode(encode(payload))
  await mod.remove('default')
  assert.equal(await mod.exists('default'), false)
  const { backend } = await import('../src/core/secrets/index.mjs')
  assert.equal(await (await backend()).has('default', 'client_secret'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('a bad code propagates CodeError and stores nothing', async () => {
  const { dir, mod } = await fresh()
  await assert.rejects(() => mod.importCode('GWSC1.deadbeef.bm9wZQ'), (e) => e.name === 'CodeError')
  assert.deepEqual(await mod.list(), [])
  await fs.rm(dir, { recursive: true, force: true })
})
