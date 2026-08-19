import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domainOf, detect } from '../src/core/accounttype.mjs'

test('domainOf lowercases and strips the local part', () => {
  assert.equal(domainOf('Tony@Terra-One.DE'), 'terra-one.de')
})

test('gmail addresses are private without any DNS lookup', async () => {
  const r = await detect('tony@gmail.com')
  assert.deepEqual(r, { type: 'privat', domain: 'gmail.com' })
  const r2 = await detect('tony@googlemail.com')
  assert.equal(r2.type, 'privat')
})

test('a domain whose MX is Google is a workspace domain', async () => {
  const resolver = async () => [{ exchange: 'aspmx.l.google.com', priority: 1 }]
  const r = await detect('a@example.org', { resolveMx: resolver })
  assert.deepEqual(r, { type: 'workspace', domain: 'example.org' })
})

test('a domain whose MX is elsewhere is unclear', async () => {
  const resolver = async () => [{ exchange: 'mx.mailbox.org', priority: 10 }]
  const r = await detect('a@example.org', { resolveMx: resolver })
  assert.equal(r.type, 'unklar')
})

test('a DNS failure yields unclear and does not throw', async () => {
  const resolver = async () => { throw new Error('ENOTFOUND') }
  const r = await detect('a@example.org', { resolveMx: resolver })
  assert.equal(r.type, 'unklar')
})
