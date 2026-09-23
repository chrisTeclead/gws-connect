import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox } from './helpers/sandbox.mjs'
import { encode } from '../src/core/setupcode.mjs'

const CODE = encode({
  id: 'default',
  label: 'Terra One',
  audience: 'external',
  client_id: '123-abc.apps.googleusercontent.com',
  client_secret: 'test-secret-value'
})

async function load () {
  const i18n = await import('../src/core/i18n.mjs')
  await i18n.initI18n('en')
  const setup = await import(`../src/commands/setup.mjs?${Math.random()}`)
  const credsets = await import(`../src/core/credsets.mjs?${Math.random()}`)
  return { setup, credsets, i18n }
}

// Answers the dialog from a script and records every prompt it was shown.
function scripted (...answers) {
  const seen = []
  const prompt = async (texts) => { seen.push(texts); return answers.shift() }
  return { prompt, seen }
}

function captureStdout () {
  const chunks = []
  const original = process.stdout.write.bind(process.stdout)
  process.stdout.write = (c) => { chunks.push(String(c)); return true }
  return { text: () => chunks.join(''), restore: () => { process.stdout.write = original } }
}

test('a code pasted with stray whitespace imports, and is never printed', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await load()
  const d = scripted({ status: 'ok', value: `  ${CODE}\n` })
  const out = captureStdout()
  let r
  try { r = await setup.setupCommand({ dialog: true, prompt: d.prompt }) } finally { out.restore() }
  assert.equal(r, true)
  assert.equal(d.seen.length, 1)
  assert.equal((await credsets.list()).length, 1)
  assert.ok(!out.text().includes(CODE), 'the code must not reach our own output')
  assert.ok(!out.text().includes('test-secret-value'))
  await box.cleanup()
})

test('cancel stops at once, imports nothing, asks no second time', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await load()
  const d = scripted({ status: 'cancel' })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), false)
  assert.equal(d.seen.length, 1)
  assert.equal((await credsets.list()).length, 0)
  await box.cleanup()
})

test('an empty OK counts as cancel', async () => {
  const box = await sandbox({})
  const { setup } = await load()
  const d = scripted({ status: 'ok', value: '' })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), false)
  assert.equal(d.seen.length, 1)
  await box.cleanup()
})

test('no dialog available is reported distinctly', async () => {
  const box = await sandbox({})
  const { setup } = await load()
  const d = scripted({ status: 'unavailable' })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), 'unavailable')
  await box.cleanup()
})

test('a truncated code reopens the dialog with the reason, then succeeds', async () => {
  const box = await sandbox({})
  const { setup, credsets, i18n } = await load()
  const cut = CODE.slice(0, -5)
  const d = scripted({ status: 'ok', value: cut }, { status: 'ok', value: cut }, { status: 'ok', value: CODE })
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), true)
  assert.equal(d.seen.length, 3)
  assert.ok(d.seen[1].prompt.includes(i18n.t('setup.dialog_retry')), 'second prompt must say what to do')
  assert.equal((await credsets.list()).length, 1)
  await box.cleanup()
})

test('three bad codes end the attempt', async () => {
  const box = await sandbox({})
  const { setup, credsets } = await load()
  const bad = { status: 'ok', value: 'GWSC1.nope.nope' }
  const d = scripted(bad, bad, bad, bad)
  assert.equal(await setup.setupCommand({ dialog: true, prompt: d.prompt }), false)
  assert.equal(d.seen.length, setup.DIALOG_TRIES)
  assert.equal((await credsets.list()).length, 0)
  await box.cleanup()
})
