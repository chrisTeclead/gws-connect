import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function loadAll () {
  const stamp = Math.random()
  const i18n = await import(`../src/core/i18n.mjs?${stamp}`)
  await i18n.initI18n('en')
  return {
    verify: await import(`../src/commands/verify.mjs?${stamp}`),
    list: await import(`../src/commands/list.mjs?${stamp}`),
    accounts: await import(`../src/core/accounts.mjs?${stamp}`)
  }
}

test('verify marks a healthy account verified', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail', 'drive'], accountType: 'workspace' })

  const when = new Date('2026-09-20T09:00:00.000Z')
  const r = await verify.verifyCommand({ now: when })
  assert.deepEqual(r, { ok: 1, total: 1 })
  assert.equal((await accounts.get('tony-terra-one-de')).verifiedAt, when.toISOString())
  await box.cleanup()
})

test('verify does not mark an account whose identity no longer matches', async () => {
  const box = await sandbox({ identity: 'stranger@x.de' })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  const r = await verify.verifyCommand({})
  assert.equal(r.ok, 0)
  assert.equal((await accounts.get('tony-terra-one-de')).verifiedAt, null)
  await box.cleanup()
})

test('a partial success is not proof', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de', driveFails: true })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail', 'drive'], accountType: 'workspace' })
  const r = await verify.verifyCommand({})
  assert.equal(r.ok, 0)
  assert.equal((await accounts.get('tony-terra-one-de')).verifiedAt, null)
  await box.cleanup()
})

test('verify can target a single address', async () => {
  const box = await sandbox({ identity: 'a@a.de' })
  await seedCredSet()
  const { verify, accounts } = await loadAll()
  await accounts.create({ email: 'a@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  await accounts.create({ email: 'b@b.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  const r = await verify.verifyCommand({ email: 'a@a.de' })
  assert.equal(r.total, 1)
  assert.ok((await accounts.get('a-a-de')).verifiedAt)
  assert.equal((await accounts.get('b-b-de')).verifiedAt, null)
  await box.cleanup()
})

test('verify on an empty machine reports nothing to do', async () => {
  const box = await sandbox({})
  const { verify } = await loadAll()
  assert.deepEqual(await verify.verifyCommand({}), { ok: 0, total: 0 })
  await box.cleanup()
})

test('list counts connected accounts', async () => {
  const box = await sandbox({ identity: 'a@a.de' })
  await seedCredSet()
  const { list, accounts } = await loadAll()
  await accounts.create({ email: 'a@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  const r = await list.listCommand()
  assert.equal(r.total, 1)
  await box.cleanup()
})
