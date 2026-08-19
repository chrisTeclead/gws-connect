import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

test('homeDir honours GWS_CONNECT_HOME', async () => {
  process.env.GWS_CONNECT_HOME = path.join(os.tmpdir(), 'gwsc-test-home')
  const paths = await import('../src/core/paths.mjs?1')
  assert.equal(paths.homeDir(), path.join(os.tmpdir(), 'gwsc-test-home'))
})

test('paths derive from the state root', async () => {
  const root = path.join(os.tmpdir(), 'gwsc-test-home')
  process.env.GWS_CONNECT_HOME = root
  const p = await import('../src/core/paths.mjs?2')
  assert.equal(p.accountsDir(), path.join(root, 'accounts'))
  assert.equal(p.accountDir('a-b-de'), path.join(root, 'accounts', 'a-b-de'))
  assert.equal(p.accountMetaFile('a-b-de'), path.join(root, 'accounts', 'a-b-de', 'meta.json'))
  assert.equal(p.accountGwsDir('a-b-de'), path.join(root, 'accounts', 'a-b-de', 'gws'))
  assert.equal(p.credentialsDir(), path.join(root, 'credentials'))
  assert.equal(p.credSetFile('default'), path.join(root, 'credentials', 'default.json'))
  assert.equal(p.binDir(), path.join(root, 'bin'))
  assert.equal(p.configFile(), path.join(root, 'config.json'))
  assert.equal(p.secretsFile(), path.join(root, 'secrets.dat'))
})

test('platform honours GWS_CONNECT_PLATFORM', async () => {
  process.env.GWS_CONNECT_PLATFORM = 'win32'
  const p = await import('../src/core/paths.mjs?3')
  assert.equal(p.platform(), 'win32')
  delete process.env.GWS_CONNECT_PLATFORM
})

test('ensureDir creates recursively and is idempotent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-ensure-'))
  process.env.GWS_CONNECT_HOME = root
  const p = await import('../src/core/paths.mjs?4')
  const target = path.join(root, 'a', 'b', 'c')
  await p.ensureDir(target)
  await p.ensureDir(target)
  const st = await fs.stat(target)
  assert.ok(st.isDirectory())
  await fs.rm(root, { recursive: true, force: true })
})
