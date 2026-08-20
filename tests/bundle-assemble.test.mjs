import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const { collectPayload, bundleEntries, bundleName } = await import('../tools/bundle/assemble.mjs')
const { resolveTarget } = await import('../tools/bundle/targets.mjs')

const find = (entries, suffix) => entries.find(e => e.name.endsWith(suffix))

test('the bundle unpacks into one folder, not loose over the desktop', () => {
  assert.equal(bundleName('win-x64'), 'gws-connect-win-x64')
  const entries = bundleEntries({
    target: resolveTarget('win-x64'),
    nodeBin: Buffer.from('node'),
    gwsBin: Buffer.from('gws'),
    payload: []
  })
  assert.ok(entries.every(e => e.name.startsWith('gws-connect-win-x64/')), entries.map(e => e.name).join(', '))
})

test('both binaries land where the starter looks for them', () => {
  const target = resolveTarget('mac-arm64')
  const entries = bundleEntries({ target, nodeBin: Buffer.from('N'), gwsBin: Buffer.from('G'), payload: [] })
  assert.deepEqual(find(entries, 'runtime/node/bin/node').data, Buffer.from('N'))
  assert.deepEqual(find(entries, 'runtime/gws/gws').data, Buffer.from('G'))
})

test('on macOS the binaries and the starter arrive executable', () => {
  const target = resolveTarget('mac-arm64')
  const entries = bundleEntries({ target, nodeBin: Buffer.from('N'), gwsBin: Buffer.from('G'), payload: [] })
  assert.equal(find(entries, 'runtime/node/bin/node').mode, 0o755)
  assert.equal(find(entries, 'runtime/gws/gws').mode, 0o755)
  assert.equal(find(entries, 'START-HIER.command').mode, 0o755)
  assert.equal(find(entries, 'CLAUDE.md').mode, 0o644)
})

test('the three recipient-facing files are present', () => {
  const entries = bundleEntries({
    target: resolveTarget('win-x64'), nodeBin: Buffer.alloc(1), gwsBin: Buffer.alloc(1), payload: []
  })
  assert.ok(find(entries, 'START-HIER.cmd'))
  assert.ok(find(entries, 'CLAUDE.md'))
  assert.ok(find(entries, 'LIESMICH.txt'))
})

test('payload files keep their relative path inside the bundle', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-asm-'))
  await fs.mkdir(path.join(dir, 'src', 'core'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src', 'core', 'paths.mjs'), 'export const x = 1')
  await fs.writeFile(path.join(dir, 'package.json'), '{}')

  const payload = await collectPayload(dir, ['src', 'package.json'])
  const names = payload.map(e => e.name).sort()
  assert.deepEqual(names, ['package.json', 'src/core/paths.mjs'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('collecting skips the noise a bundle must never carry', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-asm-'))
  await fs.mkdir(path.join(dir, 'src', 'node_modules'), { recursive: true })
  await fs.writeFile(path.join(dir, 'src', 'node_modules', 'junk.js'), 'x')
  await fs.writeFile(path.join(dir, 'src', '.DS_Store'), 'x')
  await fs.writeFile(path.join(dir, 'src', 'real.mjs'), 'x')

  const payload = await collectPayload(dir, ['src'])
  assert.deepEqual(payload.map(e => e.name), ['src/real.mjs'])
  await fs.rm(dir, { recursive: true, force: true })
})

test('a missing payload entry is an error, not a silently thinner bundle', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-asm-'))
  await assert.rejects(() => collectPayload(dir, ['src']), /src/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('internal plans and specs never reach a recipient', async () => {
  const { PAYLOAD } = await import('../tools/bundle/files.mjs')
  const payload = await collectPayload(process.cwd(), PAYLOAD)
  const leaked = payload.map(e => e.name).filter(n => n.includes('superpowers'))
  assert.deepEqual(leaked, [], `internal documents in the bundle: ${leaked.join(', ')}`)
  assert.ok(payload.some(e => e.name === 'docs/de/ANLEITUNG.md'), 'the user guide must still be there')
})
