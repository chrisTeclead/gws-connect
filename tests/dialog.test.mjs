import { test } from 'node:test'
import assert from 'node:assert/strict'

const dialog = await import('../src/core/dialog.mjs')
const TEXTS = { title: 'gws-connect', prompt: 'Einrichtungs-Code einfügen:', ok: 'OK', cancel: 'Abbrechen' }

function decodePs (args) {
  const i = args.indexOf('-EncodedCommand')
  return Buffer.from(args[i + 1], 'base64').toString('utf16le')
}

test('macOS asks through osascript with a hidden answer', () => {
  const cmd = dialog.dialogCommand('darwin', TEXTS)
  assert.equal(cmd.file, 'osascript')
  const script = cmd.args[cmd.args.indexOf('-e') + 1]
  assert.match(script, /display dialog "Einrichtungs-Code einfügen:"/)
  assert.match(script, /with hidden answer/)
  assert.match(script, /cancel button "Abbrechen"/)
})

test('AppleScript strings are escaped so a quote cannot end them', () => {
  const cmd = dialog.dialogCommand('darwin', { ...TEXTS, prompt: 'say "hi" \\ bye' })
  assert.match(cmd.args.join(' '), /"say \\"hi\\" \\\\ bye"/)
})

test('Windows asks through a WinForms box with a password field', () => {
  const cmd = dialog.dialogCommand('win32', TEXTS)
  assert.equal(cmd.file, 'powershell.exe')
  assert.ok(cmd.args.includes('-NoProfile'))
  const script = decodePs(cmd.args)
  assert.match(script, /System\.Windows\.Forms/)
  assert.match(script, /UseSystemPasswordChar = \$true/)
  assert.match(script, /'Einrichtungs-Code einfügen:'/)
})

test('PowerShell strings double their single quotes', () => {
  const script = decodePs(dialog.dialogCommand('win32', { ...TEXTS, prompt: "it's" }).args)
  assert.match(script, /'it''s'/)
})

test('other platforms have no dialog', () => {
  assert.equal(dialog.dialogCommand('linux', TEXTS), null)
})

test('classify: exit 0 is the answer, trimmed', () => {
  assert.deepEqual(dialog.classify('darwin', { status: 0, stdout: '  GWSC1.x\n', stderr: '' }), { status: 'ok', value: 'GWSC1.x' })
})

test('classify: user cancel is recognised on both systems', () => {
  assert.deepEqual(dialog.classify('darwin', { status: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' }), { status: 'cancel' })
  assert.deepEqual(dialog.classify('win32', { status: 1, stdout: '', stderr: '' }), { status: 'cancel' })
})

test('classify: anything else means no dialog could be shown', () => {
  assert.deepEqual(dialog.classify('darwin', { status: 1, stdout: '', stderr: 'no user interaction allowed (-1713)' }), { status: 'unavailable' })
  assert.deepEqual(dialog.classify('win32', { error: new Error('ENOENT') }), { status: 'unavailable' })
})

test('askDialog runs the built command and classifies its result', async () => {
  let seen = null
  const r = await dialog.askDialog(TEXTS, {
    platform: 'darwin',
    run: async (cmd) => { seen = cmd; return { status: 0, stdout: 'GWSC1.abc\n', stderr: '' } }
  })
  assert.equal(seen.file, 'osascript')
  assert.deepEqual(r, { status: 'ok', value: 'GWSC1.abc' })
})

test('askDialog on a platform without a dialog never runs anything', async () => {
  const r = await dialog.askDialog(TEXTS, { platform: 'linux', run: async () => { throw new Error('ran') } })
  assert.deepEqual(r, { status: 'unavailable' })
})
