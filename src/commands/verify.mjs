// The real check. Nothing here trusts a stored value - every answer comes
// from Google. Only a fully healthy account is marked verified, because the
// 7-day cutoff removes the whole grant at once: a half-working account means
// something else is broken and must not silence the reminder.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as gws from '../core/gws.mjs'

const SERVICE_LABEL = { gmail: 'service.gmail', drive: 'service.drive', calendar: 'service.calendar' }
const SERVICE_API = { gmail: 'service.gmail_api', drive: 'service.drive_api', calendar: 'service.calendar_api' }

export async function verifyCommand ({ email, now = new Date() } = {}) {
  ui.title(t('verify.title'))

  let targets = await accounts.list()
  if (email) targets = targets.filter(a => a.email.toLowerCase() === String(email).toLowerCase())

  if (targets.length === 0) {
    ui.info(t('verify.none'))
    return { ok: 0, total: 0 }
  }

  let ok = 0
  for (const meta of targets) {
    ui.info(t('verify.checking', { email: meta.email }))

    const actual = await gws.identity(meta.id, meta.credSet, meta.services)
    if (!actual) {
      ui.fail(t('verify.no_access', { email: meta.email }))
      ui.info(t('verify.no_access_why'))
      ui.info(t('verify.publishing_hint'))
      ui.info(t('verify.admin_hint'))
      ui.blank()
      continue
    }
    if (actual.toLowerCase() !== meta.email.toLowerCase()) {
      ui.fail(t('add.wrong_account', { actual, expected: meta.email }))
      ui.blank()
      continue
    }

    let allServices = true
    for (const service of meta.services) {
      if (await gws.probe(meta.id, meta.credSet, service)) {
        ui.ok(t('add.service_ok', { service: t(SERVICE_LABEL[service]) }))
      } else {
        allServices = false
        ui.fail(t('add.service_fail', {
          service: t(SERVICE_LABEL[service]),
          api: t(SERVICE_API[service])
        }))
      }
    }

    if (allServices) {
      await accounts.markVerified(meta.id, now)
      ui.ok(t('verify.ok', { email: meta.email }))
      ok += 1
    }
    ui.blank()
  }

  ui.info(t('verify.summary', { ok, total: targets.length }))
  return { ok, total: targets.length }
}
