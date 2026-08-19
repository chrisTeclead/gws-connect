import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'
import { encode } from '../src/core/setupcode.mjs'

async function loadAll () {
  const stamp = Math.random()
  const i18n = await import(`../src/core/i18n.mjs?${stamp}`)
  await i18n.initI18n('en')
  return {
    setup: await import(`../src/commands/setup.mjs?${stamp}`),
    add: await import(`../src/commands/add.mjs?${stamp}`),
    accounts: await import(`../src/core/accounts.mjs?${stamp}`),
    credsets: await import(`../src/core/credsets.mjs?${stamp}`)
  }
}

const CODE = encode({
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'test-secret-value'
})

test('setupCommand imports a code non-interactively', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await loadAll()
  assert.equal(await setup.setupCommand({ code: CODE }), true)
  assert.equal((await credsets.get('default')).label, 'Terra One')
  await box.cleanup()
})

test('setupCommand reports a bad code and stores nothing', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await loadAll()
  assert.equal(await setup.setupCommand({ code: 'GWSC1.00000000.bm9wZQ' }), false)
  assert.deepEqual(await credsets.list(), [])
  await box.cleanup()
})

test('add connects an account, verifies identity, writes meta and a wrapper', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  const meta = await add.addCommand({
    email: 'tony@terra-one.de',
    credSet: 'default',
    services: ['gmail', 'drive', 'calendar'],
    interactive: false
  })
  assert.ok(meta)
  assert.equal(meta.email, 'tony@terra-one.de')
  assert.equal((await accounts.list()).length, 1)

  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 2), ['auth', 'login'])
  await box.cleanup()
})

test('add refuses a duplicate before opening a browser', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { add } = await loadAll()
  await add.addCommand({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false })
  const callsBefore = (await box.calls()).length
  const second = await add.addCommand({ email: 'TONY@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false })
  assert.equal(second, null)
  assert.equal((await box.calls()).length, callsBefore, 'no gws call for a duplicate')
  await box.cleanup()
})

test('add rejects a wrong account, logs out and records nothing', async () => {
  const box = await sandbox({ identity: 'someone-else@x.de' })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  const meta = await add.addCommand({
    email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false
  })
  assert.equal(meta, null)
  assert.deepEqual(await accounts.list(), [])
  const calls = await box.calls()
  assert.ok(calls.some(c => c.args.join(' ') === 'auth logout'), 'must log out after a mismatch')
  await box.cleanup()
})

test('add stops when login itself fails', async () => {
  const box = await sandbox({ loginFails: true })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  assert.equal(await add.addCommand({
    email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], interactive: false
  }), null)
  assert.deepEqual(await accounts.list(), [])
  await box.cleanup()
})

test('add refuses without a credential set', async () => {
  const box = await sandbox({})
  const { add } = await loadAll()
  assert.equal(await add.addCommand({
    email: 'tony@terra-one.de', services: ['gmail'], interactive: false
  }), null)
  await box.cleanup()
})

test('add refuses a malformed address', async () => {
  const box = await sandbox({})
  await seedCredSet()
  const { add } = await loadAll()
  assert.equal(await add.addCommand({ email: 'nonsense', credSet: 'default', services: ['gmail'], interactive: false }), null)
  await box.cleanup()
})

test('add records the account even when one service API is off', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de', driveFails: true })
  await seedCredSet()
  const { add, accounts } = await loadAll()
  const meta = await add.addCommand({
    email: 'tony@terra-one.de', credSet: 'default',
    services: ['gmail', 'drive'], interactive: false
  })
  assert.ok(meta, 'identity matched, so the account is usable for what does work')
  assert.equal((await accounts.list()).length, 1)
  await box.cleanup()
})
