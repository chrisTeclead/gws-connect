import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandbox, seedCredSet } from './helpers/sandbox.mjs'
// Deliberately the unsuffixed module: this is the same i18n instance that
// menu.mjs imports, so initI18n here actually affects what t() returns there.
// A query-suffixed import would create a second, independent copy.
import * as i18n from '../src/core/i18n.mjs'
import * as menu from '../src/menu.mjs'

test('the menu offers a way to enter the setup code', async () => {
  const box = await sandbox({})
  await i18n.initI18n('en')
  const labels = menu.menuItems().map(i => i.label)
  assert.ok(
    labels.includes(i18n.t('menu.setup')),
    `menu must offer setup; got: ${labels.join(' | ')}`
  )
  await box.cleanup()
})

test('every menu item has a unique key and a runnable action', async () => {
  const box = await sandbox({})
  await i18n.initI18n('en')
  const items = menu.menuItems()
  const keys = items.map(i => i.key)
  assert.equal(new Set(keys).size, keys.length, `duplicate menu keys: ${keys.join(',')}`)
  assert.ok(!keys.includes('q'), 'q is reserved for quit')
  for (const item of items) {
    assert.equal(typeof item.run, 'function', `${item.key} has no action`)
    assert.ok(item.label && !item.label.startsWith('menu.'), `${item.key} has no translated label`)
  }
  await box.cleanup()
})

test('needsSetup is true on a fresh machine and false once credentials exist', async () => {
  const box = await sandbox({})
  assert.equal(await menu.needsSetup(), true)
  await seedCredSet()
  assert.equal(await menu.needsSetup(), false)
  await box.cleanup()
})

test('the labels resolve in German too', async () => {
  const box = await sandbox({})
  await i18n.initI18n('de')
  const labels = menu.menuItems().map(i => i.label)
  assert.ok(labels.includes('Einrichtungs-Code eingeben'), labels.join(' | '))
  assert.ok(labels.includes('Konto hinzufuegen'), labels.join(' | '))
  await i18n.initI18n('en')
  await box.cleanup()
})
