import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

async function fresh () {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-acc-'))
  process.env.GWS_CONNECT_HOME = dir
  const mod = await import(`../src/core/accounts.mjs?${Math.random()}`)
  return { dir, mod }
}

test('idFromEmail slugifies', async () => {
  const { dir, mod } = await fresh()
  assert.equal(mod.idFromEmail('tony@terra-one.de'), 'tony-terra-one-de')
  assert.equal(mod.idFromEmail('Tony.Test+x@Gmail.com'), 'tony-test-x-gmail-com')
  assert.equal(mod.idFromEmail('--a--@b.de--'), 'a-b-de')
  await fs.rm(dir, { recursive: true, force: true })
})

test('isEmail accepts plausible addresses and rejects junk', async () => {
  const { dir, mod } = await fresh()
  assert.equal(mod.isEmail('a@b.de'), true)
  assert.equal(mod.isEmail('tony@terra-one.de'), true)
  assert.equal(mod.isEmail('nope'), false)
  assert.equal(mod.isEmail('a@b'), false)
  assert.equal(mod.isEmail('a b@c.de'), false)
  assert.equal(mod.isEmail(''), false)
  await fs.rm(dir, { recursive: true, force: true })
})

test('create writes meta.json and the gws directory', async () => {
  const { dir, mod } = await fresh()
  const meta = await mod.create({
    email: 'tony@terra-one.de',
    credSet: 'default',
    services: ['gmail', 'calendar'],
    accountType: 'workspace'
  })
  assert.equal(meta.id, 'tony-terra-one-de')
  assert.equal(meta.verifiedAt, null)
  assert.ok(meta.connectedAt)
  const st = await fs.stat(path.join(dir, 'accounts', 'tony-terra-one-de', 'gws'))
  assert.ok(st.isDirectory())
  const back = await mod.get('tony-terra-one-de')
  assert.deepEqual(back.services, ['gmail', 'calendar'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('the account list is the directory listing, sorted by email', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'zoe@b.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  await mod.create({ email: 'anna@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  assert.deepEqual((await mod.list()).map(a => a.email), ['anna@a.de', 'zoe@b.de'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('a directory without valid meta.json is skipped, not fatal', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'ok@a.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  await fs.mkdir(path.join(dir, 'accounts', 'broken'), { recursive: true })
  await fs.writeFile(path.join(dir, 'accounts', 'broken', 'meta.json'), '{ not json')
  const list = await mod.list()
  assert.deepEqual(list.map(a => a.email), ['ok@a.de'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('findByEmail is case-insensitive', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'tony@terra-one.de', credSet: 'default', services: ['gmail'], accountType: 'workspace' })
  assert.ok(await mod.findByEmail('TONY@Terra-One.de'))
  assert.equal(await mod.findByEmail('other@x.de'), null)
  await fs.rm(dir, { recursive: true, force: true })
})

test('markVerified records the timestamp', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'a@b.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  const when = new Date('2026-09-01T10:00:00.000Z')
  const meta = await mod.markVerified('a-b-de', when)
  assert.equal(meta.verifiedAt, when.toISOString())
  assert.equal((await mod.get('a-b-de')).verifiedAt, when.toISOString())
  await fs.rm(dir, { recursive: true, force: true })
})

test('remove deletes the whole account directory', async () => {
  const { dir, mod } = await fresh()
  await mod.create({ email: 'a@b.de', credSet: 'default', services: ['gmail'], accountType: 'privat' })
  await mod.remove('a-b-de')
  assert.equal(await mod.get('a-b-de'), null)
  await assert.rejects(() => fs.stat(path.join(dir, 'accounts', 'a-b-de')))
  await fs.rm(dir, { recursive: true, force: true })
})
