import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const RELEASE = 'https://github.com/chrisTeclead/gws-connect/releases/latest/download'
const read = (f) => fs.readFile(new URL(`../install/${f}`, import.meta.url), 'utf8')
const sh = await read('install.sh')
const ps1 = await read('install.ps1')

// The part of each script that becomes the launcher file.
function launcher (script, start, end) {
  const from = script.indexOf(start)
  const to = script.indexOf(end, from + start.length)
  assert.ok(from !== -1 && to !== -1, 'launcher body not found')
  return script.slice(from, to)
}

for (const [name, body] of [['install.sh', sh], ['install.ps1', ps1]]) {
  test(`${name} defaults to the public release and honours the overrides`, () => {
    assert.ok(body.includes(RELEASE))
    for (const v of ['GWS_CONNECT_RELEASE_URL', 'GWS_CONNECT_HOME', 'CLAUDE_CONFIG_DIR']) {
      assert.ok(body.includes(v), `${name} must honour ${v}`)
    }
  })

  test(`${name} installs nothing system-wide`, () => {
    for (const word of ['sudo', 'npm ', 'brew ', 'winget', 'choco ']) {
      assert.ok(!body.includes(word), `${name} must not use ${word.trim()}`)
    }
  })

  test(`${name} checks the checksum, relinks, installs the skill`, () => {
    assert.ok(body.includes('SHA256SUMS'))
    assert.match(body, /relink/)
    assert.match(body, /skills/)
    assert.match(body, /gws-konten/)
    assert.match(body, /doctor --yes/)
  })
}

test('install.sh tells Apple Silicon from Intel, even under Rosetta', () => {
  assert.match(sh, /hw\.optional\.arm64/)
  assert.match(sh, /mac-arm64/)
  assert.match(sh, /mac-x64/)
  assert.match(sh, /com\.apple\.quarantine/)
})

test('install.ps1 refuses ARM Windows and enables TLS 1.2 before downloading', () => {
  assert.match(ps1, /ARM64/)
  const tls = ps1.indexOf('Tls12')
  const firstDownload = ps1.indexOf('Invoke-WebRequest -')
  assert.ok(tls !== -1 && tls < firstDownload, 'PowerShell 5.1 needs TLS 1.2 switched on first')
})

test('install.ps1 never exits the caller\'s shell', () => {
  // A user who pasted it into their own PowerShell window would lose it.
  assert.ok(!/^\s*exit\b/m.test(ps1))
})

test('the launchers carry no absolute path, so umlauts and spaces in the user name are harmless', () => {
  const posix = launcher(sh, "<<'EOF'", '\nEOF')
  assert.match(posix, /dirname "\$0"/)
  assert.ok(!posix.includes('$HOME_DIR'), 'resolved at run time, not baked in')
  const cmd = launcher(ps1, "@'", "'@")
  assert.match(cmd, /%~dp0app\\runtime\\node\\node\.exe/)
  assert.match(cmd, /%~dp0app\\runtime\\gws\\gws\.exe/)
  assert.ok(!/[A-Z]:\\/.test(cmd))
  assert.match(ps1, /Encoding\]::ASCII/)
})
