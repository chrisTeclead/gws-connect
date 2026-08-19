import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

async function freshBackend (dir) {
  process.env.GWS_CONNECT_HOME = dir
  process.env.GWS_CONNECT_SECRETS = 'memory'
  const { backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`)
  return backend()
}

test('memory backend stores, reads, reports and removes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec-'))
  const b = await freshBackend(dir)
  assert.equal(b.name, 'memory')
  assert.equal(await b.has('default', 'client_id'), false)
  assert.equal(await b.get('default', 'client_id'), null)
  await b.set('default', 'client_id', 'abc.apps.googleusercontent.com')
  await b.set('default', 'client_secret', 'test-value')
  assert.equal(await b.has('default', 'client_id'), true)
  assert.equal(await b.get('default', 'client_secret'), 'test-value')
  await b.removeSet('default')
  assert.equal(await b.has('default', 'client_id'), false)
  assert.equal(await b.has('default', 'client_secret'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('sets are isolated from each other', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec2-'))
  const b = await freshBackend(dir)
  await b.set('default', 'client_id', 'one')
  await b.set('own', 'client_id', 'two')
  assert.equal(await b.get('default', 'client_id'), 'one')
  assert.equal(await b.get('own', 'client_id'), 'two')
  await b.removeSet('default')
  assert.equal(await b.get('own', 'client_id'), 'two')
  await fs.rm(dir, { recursive: true, force: true })
})

test('selfTest succeeds and leaves nothing behind', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec3-'))
  const b = await freshBackend(dir)
  assert.equal(await b.selfTest(), true)
  assert.equal(await b.has('__selftest__', 'probe'), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('backend selection follows the platform when not overridden', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec4-'))
  process.env.GWS_CONNECT_HOME = dir
  delete process.env.GWS_CONNECT_SECRETS
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  let { backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`)
  assert.equal((await backend()).name, 'macos')
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  ;({ backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`))
  assert.equal((await backend()).name, 'windows')
  delete process.env.GWS_CONNECT_PLATFORM
  process.env.GWS_CONNECT_SECRETS = 'memory'
  await fs.rm(dir, { recursive: true, force: true })
})

test('windows backend round-trips through its own file format', async (t) => {
  if (process.platform !== 'win32') return t.skip('DPAPI is Windows-only')
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-sec5-'))
  process.env.GWS_CONNECT_HOME = dir
  delete process.env.GWS_CONNECT_SECRETS
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  const { backend } = await import(`../src/core/secrets/index.mjs?${Math.random()}`)
  const b = await backend()
  await b.set('default', 'client_secret', 'round-trip-value')
  assert.equal(await b.get('default', 'client_secret'), 'round-trip-value')
  await b.removeSet('default')
  assert.equal(await b.has('default', 'client_secret'), false)
  delete process.env.GWS_CONNECT_PLATFORM
  process.env.GWS_CONNECT_SECRETS = 'memory'
  await fs.rm(dir, { recursive: true, force: true })
})
