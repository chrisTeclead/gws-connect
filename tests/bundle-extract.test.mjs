import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const { extractOne } = await import('../tools/bundle/extract.mjs')
const { zip } = await import('../tools/bundle/zip.mjs')

async function box () { return fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-ext-')) }

test('one named file is pulled out of a zip', async () => {
  const dir = await box()
  const archive = path.join(dir, 'node.zip')
  await fs.writeFile(archive, zip([
    { name: 'node-v1.2.3-win-x64/node.exe', data: Buffer.from('I am the binary') },
    { name: 'node-v1.2.3-win-x64/npm', data: Buffer.from('not wanted') }
  ]))

  const got = await extractOne(archive, 'node-v1.2.3-win-x64/node.exe', dir)
  assert.deepEqual(got, Buffer.from('I am the binary'))
  await fs.rm(dir, { recursive: true, force: true })
})

test('one named file is pulled out of a tar.gz', async () => {
  const dir = await box()
  const stage = path.join(dir, 'stage', 'node-v1.2.3-darwin-arm64', 'bin')
  await fs.mkdir(stage, { recursive: true })
  await fs.writeFile(path.join(stage, 'node'), 'mach-o here')
  const archive = path.join(dir, 'node.tar.gz')
  const made = spawnSync('tar', ['-czf', 'node.tar.gz', '-C', path.join(dir, 'stage'), 'node-v1.2.3-darwin-arm64'],
    { encoding: 'utf8', cwd: dir })
  assert.equal(made.status, 0, made.stderr)

  const got = await extractOne(archive, 'node-v1.2.3-darwin-arm64/bin/node', dir)
  assert.equal(got.toString(), 'mach-o here')
  await fs.rm(dir, { recursive: true, force: true })
})

test('a missing entry fails loudly instead of returning nothing', async () => {
  const dir = await box()
  const archive = path.join(dir, 'a.zip')
  await fs.writeFile(archive, zip([{ name: 'other.txt', data: Buffer.from('x') }]))
  await assert.rejects(() => extractOne(archive, 'node.exe', dir), /node\.exe/)
  await fs.rm(dir, { recursive: true, force: true })
})
