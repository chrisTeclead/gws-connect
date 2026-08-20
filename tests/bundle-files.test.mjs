import { test } from 'node:test'
import assert from 'node:assert/strict'

const files = await import('../tools/bundle/files.mjs')

test('the Windows starter uses the bundled node, never the PATH', () => {
  const body = files.starter('win-x64')
  assert.match(body, /@echo off/)
  assert.ok(!/^where node/m.test(body), 'a bundle must not look for a system node')
  assert.match(body, /%~dp0runtime\\node\\node\.exe/)
  assert.match(body, /%~dp0bin\\gws-connect\.mjs/)
})

test('the Windows starter points gws at the bundled binary, absolutely', () => {
  const body = files.starter('win-x64')
  assert.match(body, /set "GWS_CONNECT_GWS_BIN=%~dp0runtime\\gws\\gws\.exe"/)
})

test('the macOS starter resolves its own directory before anything else', () => {
  const body = files.starter('mac-arm64')
  assert.match(body, /^#!\/usr\/bin\/env bash/)
  assert.match(body, /cd "\$\(dirname "\$0"\)"/)
  assert.match(body, /export GWS_CONNECT_GWS_BIN="\$PWD\/runtime\/gws\/gws"/)
  assert.match(body, /runtime\/node\/bin\/node/)
})

test('the starter is named for the platform that can double-click it', () => {
  assert.equal(files.starterName('win-x64'), 'START-HIER.cmd')
  assert.equal(files.starterName('mac-arm64'), 'START-HIER.command')
})

test('CLAUDE.md forbids installing anything and names the two bundled paths', () => {
  const md = files.claudeMd('win-x64')
  assert.match(md, /runtime\\node\\node\.exe/)
  assert.match(md, /runtime\\gws\\gws\.exe/)
  assert.match(md, /npm install/i)
  assert.match(md, /winget|brew/i)
  assert.match(md, /doctor/)
})

test('CLAUDE.md tells Claude never to persist the setup code', () => {
  const md = files.claudeMd('mac-arm64')
  assert.match(md, /never write it to a file|nie in eine Datei/i)
  assert.ok(!md.includes('GWSC1.'), 'no code, not even an example that looks real')
})

test('the payload carries the tool but never the operator tooling or state', () => {
  assert.ok(files.PAYLOAD.includes('bin'))
  assert.ok(files.PAYLOAD.includes('src'))
  assert.ok(files.PAYLOAD.includes('locales'))
  assert.ok(files.PAYLOAD.includes('docs'))
  assert.ok(!files.PAYLOAD.includes('tools'), 'make-setup-code is operator-only')
  assert.ok(!files.PAYLOAD.includes('tests'))
  assert.ok(!files.PAYLOAD.includes('.git'))
})

test('CLAUDE.md hands the user a real terminal window on Windows', () => {
  const md = files.claudeMd('win-x64')
  assert.ok(md.includes('start "" cmd /c START-HIER.cmd'), 'must open the starter in its own window')
})

test('CLAUDE.md hands the user a real terminal window on macOS', () => {
  const md = files.claudeMd('mac-arm64')
  assert.ok(md.includes('open START-HIER.command'), 'must open the starter in its own window')
})

test('the terminal window is offered for the code prompt, not for the doctor', () => {
  const md = files.claudeMd('win-x64')
  const openAt = md.indexOf('start "" cmd /c START-HIER.cmd')
  const codeAt = md.indexOf('## The setup code')
  assert.ok(openAt > codeAt, 'the window belongs with the step that needs a keyboard')
})
