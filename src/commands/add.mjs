// The order of the guards in here is the whole value of this command.
// Nothing is written to disk until Google confirms the expected address.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as credsets from '../core/credsets.mjs'
import * as gws from '../core/gws.mjs'
import * as wrappers from '../core/wrappers.mjs'
import { detect } from '../core/accounttype.mjs'

const SERVICE_LABEL = { gmail: 'service.gmail', drive: 'service.drive', calendar: 'service.calendar' }
const SERVICE_API = { gmail: 'service.gmail_api', drive: 'service.drive_api', calendar: 'service.calendar_api' }

async function pickCredSet (sets, interactive) {
  // A single set is the normal case; never make the user answer a question
  // that has only one possible answer.
  if (sets.length === 1 || !interactive) return sets[0].id
  return ui.choose(t('add.pick_credset'), sets.map(s => ({ value: s.id, label: s.label })))
}

async function pickServices (interactive) {
  if (!interactive) return [...accounts.SERVICES]
  ui.info(t('add.services_default'))
  return ui.multiChoose(
    t('add.pick_services'),
    accounts.SERVICES.map(s => ({ value: s, label: t(SERVICE_LABEL[s]) })),
    { preselected: [...accounts.SERVICES] }
  )
}

export async function addCommand ({ email, credSet, services, interactive = true } = {}) {
  ui.title(t('add.title'))

  const sets = await credsets.list()
  if (sets.length === 0) {
    ui.fail(t('err.no_credsets'))
    return null
  }

  let address = email
  if (!address && interactive) {
    ui.info(t('add.which_email'))
    address = await ui.ask(t('common.email_prompt'))
  }
  if (!accounts.isEmail(address)) {
    ui.fail(t('err.bad_email', { value: address ?? '' }))
    return null
  }
  address = String(address).trim()

  // Before anything opens a browser: is this already connected?
  if (await accounts.findByEmail(address)) {
    ui.warn(t('add.duplicate', { email: address }))
    return null
  }

  const { type, domain } = await detect(address)
  if (type === 'privat') ui.info(t('add.type_private', { domain }))
  else if (type === 'workspace') ui.info(t('add.type_workspace', { domain }))
  else ui.warn(t('add.type_unknown', { domain }))

  const chosenSet = credSet || await pickCredSet(sets, interactive)
  const chosenServices = services && services.length ? [...services] : await pickServices(interactive)

  const id = accounts.idFromEmail(address)

  if (interactive) {
    ui.blank()
    ui.warn(t('add.logout_first'))
    ui.dim(t('add.logout_why'))
    ui.blank()
    ui.info(t('add.browser_opens'))
    ui.info(t('add.choose_account', { email: address }))
    ui.info(t('add.readonly_note'))
    ui.blank()
    ui.warn(t('add.unverified_warning'))
    ui.dim(t('add.unverified_normal'))
    await ui.pause()
  }

  if (!await gws.login(id, chosenSet, chosenServices)) {
    ui.fail(t('add.login_failed'))
    return null
  }

  ui.blank()
  ui.info(t('add.checking'))
  const actual = await gws.identity(id, chosenSet, chosenServices)

  if (!actual) {
    ui.fail(t('add.no_identity'))
    await gws.logout(id, chosenSet)
    return null
  }
  if (actual.toLowerCase() !== address.toLowerCase()) {
    ui.fail(t('add.wrong_account', { actual, expected: address }))
    ui.info(t('add.wrong_account_fix'))
    await gws.logout(id, chosenSet)
    return null
  }
  ui.ok(t('add.connected', { email: actual }))

  for (const service of chosenServices) {
    if (await gws.probe(id, chosenSet, service)) {
      ui.ok(t('add.service_ok', { service: t(SERVICE_LABEL[service]) }))
    } else {
      ui.warn(t('add.service_fail', {
        service: t(SERVICE_LABEL[service]),
        api: t(SERVICE_API[service])
      }))
    }
  }

  const meta = await accounts.create({
    email: address,
    credSet: chosenSet,
    services: chosenServices,
    accountType: type
  })
  const wrapper = await wrappers.write(meta.id)

  ui.blank()
  ui.ok(t('add.done', { email: address, wrapper }))
  return meta
}
