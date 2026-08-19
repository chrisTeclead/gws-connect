import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))

test('both language document sets exist and are non-trivial', async () => {
  const files = [
    'docs/de/ANLEITUNG.md', 'docs/en/GUIDE.md',
    'docs/de/ADMIN-CLOUD-PROJEKT.md', 'docs/en/ADMIN-CLOUD-PROJECT.md',
    'docs/de/EIGENES-PROJEKT.md', 'docs/en/OWN-PROJECT.md',
    'docs/de/PROBLEME.md', 'docs/en/TROUBLESHOOTING.md'
  ]
  for (const file of files) {
    const body = await fs.readFile(path.join(root, file), 'utf8')
    assert.ok(body.length > 400, `${file} is too short to be useful`)
  }
})

test('the admin documents state the load-bearing Cloud settings', async () => {
  for (const file of ['docs/de/ADMIN-CLOUD-PROJEKT.md', 'docs/en/ADMIN-CLOUD-PROJECT.md']) {
    const body = await fs.readFile(path.join(root, file), 'utf8')
    for (const needle of [
      'External', 'In production',
      'gmail.readonly', 'drive.readonly', 'calendar.readonly',
      '100'
    ]) {
      assert.ok(body.includes(needle), `${file} must mention ${needle}`)
    }
  }
})

test('no shipped file contains a real-looking client secret or client id', async () => {
  const dirs = ['docs', 'skills', 'tools', 'src', 'bin', 'locales']
  const walk = async (p) => {
    for (const entry of await fs.readdir(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name)
      if (entry.isDirectory()) { await walk(full); continue }
      const body = await fs.readFile(full, 'utf8')
      assert.ok(!/GOCSPX-[A-Za-z0-9_-]{10,}/.test(body), `${full} looks like it contains a real secret`)
      assert.ok(
        !/[0-9]{10,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com/.test(body),
        `${full} looks like it contains a real client id`
      )
    }
  }
  for (const dir of dirs) await walk(path.join(root, dir))
})

test('the skill tells Claude where the accounts live and not to mix them', async () => {
  const body = await fs.readFile(path.join(root, 'skills/gws-konten/SKILL.md'), 'utf8')
  assert.ok(body.startsWith('---'), 'skill needs frontmatter')
  assert.ok(body.includes('name:'))
  assert.ok(body.includes('description:'))
  assert.ok(body.includes('meta.json'))
  assert.ok(body.includes('gws-'))
  assert.ok(/One account per call/i.test(body))
  assert.ok(/read-only/i.test(body))
})

test('the example skills discover accounts instead of hardcoding them', async () => {
  for (const name of ['belege-finden', 'termine-finden']) {
    const body = await fs.readFile(path.join(root, `skills/examples/${name}/SKILL.md`), 'utf8')
    assert.ok(body.includes('~/.gws-connect/accounts/'), `${name} must discover accounts`)
    assert.ok(!/gws-ts(privat|terra|teclead)/.test(body), `${name} must not hardcode the old account ids`)
  }
})

test('make-setup-code produces a code the decoder accepts', async () => {
  const tool = path.join(root, 'tools/make-setup-code.mjs')
  const r = spawnSync(process.execPath, [
    tool,
    '--id', 'default',
    '--label', 'Terra One',
    '--audience', 'external',
    '--client-id', '123-abc.apps.googleusercontent.com',
    '--client-secret', 'test-secret-value'
  ], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const code = r.stdout.trim().split('\n').filter(Boolean).pop()
  const { decode } = await import('../src/core/setupcode.mjs')
  assert.equal(decode(code).label, 'Terra One')
  assert.equal(decode(code).client_secret, 'test-secret-value')
})

test('make-setup-code refuses an implausible client id', async () => {
  const tool = path.join(root, 'tools/make-setup-code.mjs')
  const r = spawnSync(process.execPath, [
    tool, '--client-id', 'nope', '--client-secret', 'x'
  ], { encoding: 'utf8' })
  assert.notEqual(r.status, 0)
})

test('make-setup-code warns on stderr that the code is a secret', async () => {
  const tool = path.join(root, 'tools/make-setup-code.mjs')
  const r = spawnSync(process.execPath, [
    tool,
    '--client-id', '123-abc.apps.googleusercontent.com',
    '--client-secret', 'test-secret-value'
  ], { encoding: 'utf8' })
  assert.match(r.stderr, /password/i)
})
