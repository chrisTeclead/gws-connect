import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'

async function load () {
  return import(`../src/core/gws.mjs?${Math.random()}`)
}

test('installed reports the fake version', async () => {
  const box = await sandbox({ version: '9.9.9' })
  const gws = await load()
  const r = await gws.installed()
  assert.equal(r.ok, true)
  assert.ok(r.version.includes('9.9.9'))
  await box.cleanup()
})

test('run passes the account config dir and the credentials through the environment', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const accounts = await import(`../src/core/accounts.mjs?${Math.random()}`)
  await accounts.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  const gws = await load()
  await gws.run('tony-terra-one-de', 'default', ['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}'])
  const [call] = await box.calls()
  assert.match(call.configDir, /tony-terra-one-de/)
  assert.equal(call.clientId, '123-abc.apps.googleusercontent.com')
  assert.equal(call.hasSecret, true)
  await box.cleanup()
})

test('identity uses Gmail when Gmail is among the services', async () => {
  const box = await sandbox({ identity: 'tony@terra-one.de' })
  await seedCredSet()
  const gws = await load()
  const who = await gws.identity('x', 'default', ['gmail', 'drive', 'calendar'])
  assert.equal(who, 'tony@terra-one.de')
  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 3), ['gmail', 'users', 'getProfile'])
  await box.cleanup()
})

test('identity falls back to the primary calendar when Gmail is not selected', async () => {
  const box = await sandbox({ identity: 'anna@a.de' })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', ['calendar']), 'anna@a.de')
  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 2), ['calendar', 'calendarList'])
  await box.cleanup()
})

test('identity falls back to Drive when only Drive is selected', async () => {
  const box = await sandbox({ identity: 'zoe@z.de' })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', ['drive']), 'zoe@z.de')
  const calls = await box.calls()
  assert.deepEqual(calls[0].args.slice(0, 2), ['drive', 'about'])
  await box.cleanup()
})

test('identity is null when no service is selected', async () => {
  const box = await sandbox({})
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', []), null)
  await box.cleanup()
})

test('identity is null when the chosen API refuses', async () => {
  const box = await sandbox({ gmailFails: true })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.identity('x', 'default', ['gmail']), null)
  await box.cleanup()
})

test('probe reports each service separately', async () => {
  const box = await sandbox({ driveFails: true })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.probe('x', 'default', 'gmail'), true)
  assert.equal(await gws.probe('x', 'default', 'calendar'), true)
  assert.equal(await gws.probe('x', 'default', 'drive'), false)
  await box.cleanup()
})

test('login returns false when consent fails', async () => {
  const box = await sandbox({ loginFails: true })
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.login('x', 'default', ['gmail']), false)
  await box.cleanup()
})

test('login passes --readonly and the service list', async () => {
  const box = await sandbox({})
  await seedCredSet()
  const gws = await load()
  assert.equal(await gws.login('x', 'default', ['gmail', 'calendar']), true)
  const [call] = await box.calls()
  assert.deepEqual(call.args, ['auth', 'login', '--readonly', '--services', 'gmail,calendar'])
  await box.cleanup()
})
