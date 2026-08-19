import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function loadAll () {
  const stamp = Math.random()
  const i18n = await import(`../src/core/i18n.mjs?${stamp}`)
  await i18n.initI18n('en')
  return {
    remove: await import(`../src/commands/remove.mjs?${stamp}`),
    accounts: await import(`../src/core/accounts.mjs?${stamp}`),
    wrappers: await import(`../src/core/wrappers.mjs?${stamp}`)
  }
}

test('remove revokes at Google BEFORE deleting the files', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { remove, accounts, wrappers } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  const wrapper = await wrappers.write('tony-terra-one-de')

  assert.equal(await remove.removeCommand({ email: 'tony@terra-one.de', force: true }), true)

  const calls = await box.calls()
  assert.ok(calls.some(c => c.args.join(' ') === 'auth logout'), 'must revoke')
  assert.equal(await accounts.get('tony-terra-one-de'), null)
  await assert.rejects(() => fs.stat(wrapper))
  await box.cleanup()
})

test('remove still deletes when the revoke fails, and says so', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de', logoutFails: true })
  await seedCredSet()
  const { remove, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  assert.equal(await remove.removeCommand({ email: 'tony@terra-one.de', force: true }), true)
  assert.equal(await accounts.get('tony-terra-one-de'), null)
  await box.cleanup()
})

test('remove reports an unknown address', async () => {
  const box = await sandbox({ identity: 'a@a.de' })
  await seedCredSet()
  const { remove, accounts } = await loadAll()
  await accounts.create({ email: 'a@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  assert.equal(await remove.removeCommand({ email: 'nobody@x.de', force: true }), false)
  await box.cleanup()
})
