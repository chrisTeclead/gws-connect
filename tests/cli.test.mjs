import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'
import { encode } from '../src/core/setupcode.mjs'

const CLI = fileURLToPath(new URL('../bin/gws-connect.mjs', import.meta.url))

function cli (args) {
  return spawnSync(process.execPath, [CLI, ...args], { env: process.env, encoding: 'utf8' })
}

test('parseArgs splits command, positionals and flags', async () => {
  const { parseArgs } = await import('../src/menu.mjs')
  assert.deepEqual(parseArgs(['add', 'a@b.de']), { command: 'add', positional: ['a@b.de'], flags: {} })
  assert.deepEqual(parseArgs(['setup', '--code', 'X']), { command: 'setup', positional: [], flags: { code: 'X' } })
  assert.deepEqual(parseArgs(['--lang', 'de']), { command: null, positional: [], flags: { lang: 'de' } })
  assert.deepEqual(parseArgs(['list', '--force']), { command: 'list', positional: [], flags: { force: true } })
  assert.deepEqual(parseArgs([]), { command: null, positional: [], flags: {} })
})

test('--help exits zero and names the commands', async () => {
  const box = await sandbox({})
  const r = cli(['--help'])
  assert.equal(r.status, 0, r.stderr)
  for (const word of ['setup', 'add', 'list', 'verify', 'remove', 'doctor']) {
    assert.match(r.stdout, new RegExp(word))
  }
  await box.cleanup()
})

test('list on a fresh machine exits zero and says it is empty', async () => {
  const box = await sandbox({})
  const r = cli(['list', '--lang', 'en'])
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /No account connected yet/)
  await box.cleanup()
})

test('setup then add then list works end to end', async () => {
  // Disk-backed secrets: each cli() call is its own process.
  const box = await sandbox({ identity: 'tony@terra-one.de' }, { secrets: 'file' })
  const code = encode({
    id: 'default',
    label: 'Terra One',
    audience: 'external',
    client_id: '123-abc.apps.googleusercontent.com',
    client_secret: 'test-secret-value'
  })
  const setup = cli(['setup', '--code', code, '--lang', 'en'])
  assert.equal(setup.status, 0, setup.stderr)

  const add = cli(['add', 'tony@terra-one.de', '--lang', 'en', '--yes'])
  assert.equal(add.status, 0, add.stderr + add.stdout)
  assert.match(add.stdout, /Connected as tony@terra-one\.de/)

  const list = cli(['list', '--lang', 'en'])
  assert.match(list.stdout, /tony@terra-one\.de/)
  await box.cleanup()
})

test('add exits non-zero when the wrong account answers', async () => {
  const box = await sandbox({ identity: 'stranger@x.de' }, { secrets: 'file' })
  await seedCredSet()
  const r = cli(['add', 'tony@terra-one.de', '--lang', 'en', '--yes'])
  assert.notEqual(r.status, 0)
  assert.match(r.stdout, /WRONG account/)
  await box.cleanup()
})

test('an unknown command exits non-zero', async () => {
  const box = await sandbox({})
  const r = cli(['nonsense'])
  assert.notEqual(r.status, 0)
  await box.cleanup()
})

test('remove exits non-zero for an unknown address', async () => {
  const box = await sandbox({}, { secrets: 'file' })
  await seedCredSet()
  const r = cli(['remove', 'nobody@x.de', '--lang', 'en', '--yes'])
  assert.notEqual(r.status, 0)
  await box.cleanup()
})
