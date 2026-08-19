import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'

function flatten (obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out.add(key)
  }
  return out
}

test('de and en have identical key sets', async () => {
  const de = JSON.parse(await fs.readFile(new URL('../locales/de.json', import.meta.url), 'utf8'))
  const en = JSON.parse(await fs.readFile(new URL('../locales/en.json', import.meta.url), 'utf8'))
  // The `test` group holds deliberate fixtures for the fallback behaviour.
  delete de.test
  delete en.test
  const dk = flatten(de)
  const ek = flatten(en)
  const missingInEn = [...dk].filter(k => !ek.has(k))
  const missingInDe = [...ek].filter(k => !dk.has(k))
  assert.deepEqual(missingInEn, [], `missing in en: ${missingInEn}`)
  assert.deepEqual(missingInDe, [], `missing in de: ${missingInDe}`)
})

test('t resolves dotted keys and interpolates', async () => {
  const i18n = await import('../src/core/i18n.mjs?1')
  await i18n.initI18n('de')
  assert.equal(typeof i18n.t('common.yes'), 'string')
  assert.ok(i18n.t('common.yes').length > 0)
  assert.equal(i18n.t('test.interpolate', { name: 'Tony' }), 'Hallo Tony')
})

test('t falls back to English for a key missing in de', async () => {
  const i18n = await import('../src/core/i18n.mjs?2')
  await i18n.initI18n('de')
  assert.equal(i18n.t('test.enOnly'), 'English only')
})

test('t returns the key when absent everywhere', async () => {
  const i18n = await import('../src/core/i18n.mjs?3')
  await i18n.initI18n('de')
  assert.equal(i18n.t('nope.nothing.here'), 'nope.nothing.here')
})

test('detectLang prefers GWS_CONNECT_LANG, then LANG', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-lang-'))
  process.env.GWS_CONNECT_HOME = root
  process.env.GWS_CONNECT_LANG = 'en'
  let i18n = await import('../src/core/i18n.mjs?4')
  assert.equal(i18n.detectLang(), 'en')
  delete process.env.GWS_CONNECT_LANG
  process.env.LANG = 'de_DE.UTF-8'
  i18n = await import('../src/core/i18n.mjs?5')
  assert.equal(i18n.detectLang(), 'de')
  await fs.rm(root, { recursive: true, force: true })
})

test('setLang persists and detectLang reads it back', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gwsc-lang2-'))
  process.env.GWS_CONNECT_HOME = root
  delete process.env.GWS_CONNECT_LANG
  process.env.LANG = 'en_US.UTF-8'
  const i18n = await import('../src/core/i18n.mjs?6')
  await i18n.setLang('de')
  assert.equal(i18n.detectLang(), 'de')
  await fs.rm(root, { recursive: true, force: true })
})
