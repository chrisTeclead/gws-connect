// The escape hatch: a second Cloud project for the case that a foreign
// Workspace administrator blocks the shared unverified app, or the 100-user
// limit is reached.
import { t, currentLang } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as credsets from '../core/credsets.mjs'

function slug (value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'own'
}

export async function credsetsCommand (opts = {}) {
  const { interactive = true, announce = true } = opts

  if (announce) {
    ui.title(t('credsets.title'))
    ui.info(t('credsets.when'))
    ui.dim(t('credsets.guide', { lang: currentLang() }))
    ui.blank()
  }

  if (opts.code) {
    try {
      const set = await credsets.importCode(opts.code)
      ui.ok(t('credsets.saved', { label: set.label }))
      return set
    } catch (error) {
      ui.fail(t(error.messageKey || 'err.code_json'))
      return null
    }
  }

  if (opts.client_id && opts.client_secret) {
    const id = opts.id || 'own'
    if (await credsets.exists(id)) {
      ui.fail(t('credsets.exists'))
      return null
    }
    if (!opts.client_id.endsWith('.apps.googleusercontent.com')) {
      ui.fail(t('err.code_client_id'))
      return null
    }
    const set = await credsets.saveManual({
      id,
      label: opts.label || id,
      audience: opts.audience || 'internal',
      client_id: opts.client_id,
      client_secret: opts.client_secret
    })
    ui.ok(t('credsets.saved', { label: set.label }))
    return set
  }

  if (!interactive) return null

  const how = await ui.choose(t('credsets.how'), [
    { value: 'code', label: t('credsets.by_code') },
    { value: 'hand', label: t('credsets.by_hand') }
  ])

  if (how === 'code') {
    const code = await ui.ask(t('setup.code_prompt'))
    if (!code) {
      ui.fail(t('err.aborted'))
      return null
    }
    return credsetsCommand({ code, announce: false })
  }

  const label = await ui.ask(t('credsets.label_prompt'), { default: 'own' })
  const clientId = await ui.ask(t('credsets.client_id_prompt'))
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    ui.fail(t('err.code_client_id'))
    return null
  }
  const clientSecret = await ui.askSecret(t('credsets.client_secret_prompt'))
  if (!clientSecret) {
    ui.fail(t('err.aborted'))
    return null
  }
  const audience = await ui.choose(t('credsets.audience_prompt'), [
    { value: 'internal', label: 'Internal' },
    { value: 'external', label: 'External' }
  ])

  return credsetsCommand({
    id: slug(label),
    label,
    audience,
    client_id: clientId,
    client_secret: clientSecret,
    interactive: false,
    announce: false
  })
}
