import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const read = (f) => fs.readFile(new URL(`../install/${f}`, import.meta.url), 'utf8')
const doc = await read('INSTALL.md')

// Each script's header names its own one-liner; the doc must repeat it exactly.
async function oneLiner (script) {
  const body = await read(script)
  const line = body.split('\n').find(l => /^#\s+(curl|powershell)/.test(l))
  assert.ok(line, `${script} has no one-liner in its header`)
  return line.replace(/^#\s+/, '').trim()
}

test('INSTALL.md gives exactly the commands the scripts document', async () => {
  assert.ok(doc.includes(await oneLiner('install.sh')))
  assert.ok(doc.includes(await oneLiner('install.ps1')))
})

test('INSTALL.md walks the fixed order with the fixed launcher', () => {
  const order = ['<launcher> doctor --yes', '<launcher> setup --dialog', '<launcher> add ']
  const at = order.map(s => doc.indexOf(s))
  assert.ok(at.every(i => i !== -1), `missing one of ${order}`)
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'steps out of order')
  assert.ok(doc.includes('~/.gws-connect/gws-connect'))
  assert.ok(doc.includes('gws-connect.cmd'))
})

// Claude Code on Windows runs Git Bash or PowerShell. Neither expands
// %USERPROFILE%, and `start ""` breaks under both.
const WIN_LAUNCHER_PS = 'Start-Process "$env:USERPROFILE\\.gws-connect\\gws-connect.cmd"'

test('INSTALL.md gives Windows commands that work in Git Bash and PowerShell', () => {
  assert.ok(doc.includes('~/.gws-connect/gws-connect.cmd'), 'Git Bash and PowerShell both accept this form')
  assert.ok(doc.includes(WIN_LAUNCHER_PS), 'window fallback for PowerShell')
  assert.ok(doc.includes(`powershell.exe -NoProfile -Command '${WIN_LAUNCHER_PS}'`), 'window fallback from Git Bash')
  assert.ok(!doc.includes('%USERPROFILE%'))
  assert.ok(!doc.includes('start ""'))
})

test('guides and skill name Windows paths a PowerShell window understands', async () => {
  for (const f of ['../docs/en/GUIDE.md', '../docs/de/ANLEITUNG.md', '../skills/gws-konten/SKILL.md']) {
    const body = await fs.readFile(new URL(f, import.meta.url), 'utf8')
    assert.ok(!body.includes('%USERPROFILE%'), `${f} still names %USERPROFILE%`)
  }
})

test('INSTALL.md forbids other installers and guards the code', () => {
  assert.match(doc, /npm/)
  assert.match(doc, /brew/)
  assert.match(doc, /winget/)
  assert.match(doc, /never ask/i)
  assert.match(doc, /exit code 3|exits with 3/i)
  assert.ok(!doc.includes('GWSC1.'), 'no code, not even one that looks real')
})
