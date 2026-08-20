import { test } from 'node:test'
import assert from 'node:assert/strict'

const targets = await import('../tools/bundle/targets.mjs')

test('a Windows target names the .exe binaries and both source archives', () => {
  const t = targets.resolveTarget('win-x64')
  assert.equal(t.node.url, `https://nodejs.org/dist/v${targets.NODE_VERSION}/node-v${targets.NODE_VERSION}-win-x64.zip`)
  assert.equal(t.node.shasums, `https://nodejs.org/dist/v${targets.NODE_VERSION}/SHASUMS256.txt`)
  assert.equal(t.node.entry, `node-v${targets.NODE_VERSION}-win-x64/node.exe`)
  assert.equal(t.node.dest, 'runtime/node/node.exe')
  assert.match(t.gws.url, /google-workspace-cli-x86_64-pc-windows-msvc\.zip$/)
  assert.equal(t.gws.sha, `${t.gws.url}.sha256`)
  assert.equal(t.gws.dest, 'runtime/gws/gws.exe')
})

test('a macOS target keeps the binaries executable', () => {
  const t = targets.resolveTarget('mac-arm64')
  assert.match(t.node.url, /node-v.*-darwin-arm64\.tar\.gz$/)
  assert.equal(t.node.entry, `node-v${targets.NODE_VERSION}-darwin-arm64/bin/node`)
  assert.equal(t.node.dest, 'runtime/node/bin/node')
  assert.match(t.gws.url, /google-workspace-cli-aarch64-apple-darwin\.tar\.gz$/)
  assert.equal(t.gws.dest, 'runtime/gws/gws')
  assert.equal(t.mode, 0o755)
})

test('versions can be overridden so a rebuild is reproducible', () => {
  const t = targets.resolveTarget('win-x64', { nodeVersion: '20.11.0', gwsVersion: '0.9.9' })
  assert.match(t.node.url, /v20\.11\.0/)
  assert.match(t.gws.url, /v0\.9\.9/)
})

test('ARM Windows is refused with the reason, not a guess', () => {
  assert.throws(() => targets.resolveTarget('win-arm64'), /no ARM Windows build/i)
})

test('an unknown platform lists the ones that exist', () => {
  assert.throws(() => targets.resolveTarget('atari'), /win-x64/)
})
