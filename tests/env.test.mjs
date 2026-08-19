import { test } from 'node:test'
import assert from 'node:assert/strict'

test('nodeOk is true on the running interpreter', async () => {
  const env = await import('../src/core/env.mjs')
  assert.equal(env.NODE_MIN, 20)
  assert.match(env.nodeVersion(), /^v?\d+\./)
  assert.equal(env.nodeOk(), true)
})

test('packageManager returns a known value or null', async () => {
  const env = await import('../src/core/env.mjs')
  const pm = await env.packageManager()
  assert.ok(pm === null || ['brew', 'winget', 'npm'].includes(pm))
})

test('reachable is false for an unroutable address and does not throw', async () => {
  const env = await import('../src/core/env.mjs')
  assert.equal(await env.reachable('https://127.0.0.1:1/', 300), false)
})

test('confirm accepts German and English affirmatives', async () => {
  const ui = await import('../src/core/ui.mjs')
  assert.equal(ui.parseConfirm('j', true), true)
  assert.equal(ui.parseConfirm('ja', true), true)
  assert.equal(ui.parseConfirm('y', true), true)
  assert.equal(ui.parseConfirm('yes', true), true)
  assert.equal(ui.parseConfirm('n', true), false)
  assert.equal(ui.parseConfirm('nein', true), false)
  assert.equal(ui.parseConfirm('no', true), false)
  assert.equal(ui.parseConfirm('', true), true)
  assert.equal(ui.parseConfirm('', false), false)
  assert.equal(ui.parseConfirm('nonsense', false), false)
})

test('parseMultiChoice maps numbers to values and ignores junk', async () => {
  const ui = await import('../src/core/ui.mjs')
  const options = [{ value: 'gmail' }, { value: 'drive' }, { value: 'calendar' }]
  assert.deepEqual(ui.parseMultiChoice('1,3', options, ['gmail']), ['gmail', 'calendar'])
  assert.deepEqual(ui.parseMultiChoice(' 2 ', options, ['gmail']), ['drive'])
  assert.deepEqual(ui.parseMultiChoice('', options, ['gmail']), ['gmail'])
  assert.deepEqual(ui.parseMultiChoice('9,abc', options, ['gmail']), [])
})
