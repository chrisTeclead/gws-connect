import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const { zip } = await import('../tools/bundle/zip.mjs')

async function box () {
  return fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-zip-'))
}

// The point of a hand-written writer is that a real unzip accepts it. Asserting
// on our own bytes would only prove we can read what we wrote.
test('a system unzip reads back every entry', async () => {
  const dir = await box()
  const file = path.join(dir, 'a.zip')
  await fs.writeFile(file, zip([
    { name: 'READ-ME.txt', data: Buffer.from('hallo\n') },
    { name: 'src/deep/one.mjs', data: Buffer.from('export const x = 1\n') }
  ]))

  const r = spawnSync('unzip', ['-o', '-q', file, '-d', path.join(dir, 'out')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(await fs.readFile(path.join(dir, 'out', 'READ-ME.txt'), 'utf8'), 'hallo\n')
  assert.equal(await fs.readFile(path.join(dir, 'out', 'src', 'deep', 'one.mjs'), 'utf8'), 'export const x = 1\n')
  await fs.rm(dir, { recursive: true, force: true })
})

test('the executable bit survives, because a bundled binary needs it', async () => {
  const dir = await box()
  const file = path.join(dir, 'b.zip')
  await fs.writeFile(file, zip([
    { name: 'runtime/gws/gws', data: Buffer.from('#!/bin/sh\n'), mode: 0o755 },
    { name: 'CLAUDE.md', data: Buffer.from('# hi\n') }
  ]))

  const r = spawnSync('unzip', ['-Z', file], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /-rwxr-xr-x.*runtime\/gws\/gws/)
  assert.match(r.stdout, /-rw-r--r--.*CLAUDE\.md/)
  await fs.rm(dir, { recursive: true, force: true })
})

test('the same input produces the same bytes twice', () => {
  const entries = [{ name: 'a.txt', data: Buffer.from('x') }]
  assert.deepEqual(zip(entries), zip(entries))
})

test('large entries survive compression', async () => {
  const dir = await box()
  const file = path.join(dir, 'c.zip')
  const big = Buffer.from('abcdefgh'.repeat(200_000))
  await fs.writeFile(file, zip([{ name: 'big.bin', data: big }]))

  const r = spawnSync('unzip', ['-o', '-q', file, '-d', path.join(dir, 'out')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(await fs.readFile(path.join(dir, 'out', 'big.bin')), big)
  await fs.rm(dir, { recursive: true, force: true })
})
