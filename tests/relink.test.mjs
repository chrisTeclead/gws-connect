import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

test('relink points every stale wrapper at the running runtime', async () => {
  const box = await sandbox({})
  process.env.GWS_CONNECT_PLATFORM = 'darwin'
  await seedCredSet()
  const accounts = await import(`../src/core/accounts.mjs?${Math.random()}`)
  const paths = await import(`../src/core/paths.mjs?${Math.random()}`)
  for (const email of ['anna@a.de', 'tony@terra-one.de']) {
    await accounts.create({ email, credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  }
  // What an update or a moved folder leaves behind: launchers into nowhere.
  await fs.mkdir(paths.binDir(), { recursive: true })
  for (const a of await accounts.list()) {
    await fs.writeFile(path.join(paths.binDir(), `gws-${a.id}`), 'exec /gone/node /gone/gws-run.mjs\n')
  }

  const { relinkCommand } = await import(`../src/commands/relink.mjs?${Math.random()}`)
  assert.equal(await relinkCommand(), 2)

  for (const a of await accounts.list()) {
    const body = await fs.readFile(path.join(paths.binDir(), `gws-${a.id}`), 'utf8')
    assert.ok(!body.includes('/gone/'), `${a.id} still points at the old runtime`)
    assert.ok(body.includes(process.execPath))
    assert.ok(body.includes('gws-run.mjs'))
    assert.ok(body.includes(process.env.GWS_CONNECT_GWS_BIN), 'the bundled gws path must be carried')
  }
  delete process.env.GWS_CONNECT_PLATFORM
  await box.cleanup()
})

test('relink on a machine without accounts does nothing and succeeds', async () => {
  const box = await sandbox({})
  const { relinkCommand } = await import(`../src/commands/relink.mjs?${Math.random()}`)
  assert.equal(await relinkCommand(), 0)
  await box.cleanup()
})
