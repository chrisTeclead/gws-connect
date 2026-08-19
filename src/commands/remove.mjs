// Revoke first, delete second. Deleting only the files would leave a live
// refresh token at Google that nobody can see, check or withdraw.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as gws from '../core/gws.mjs'
import * as wrappers from '../core/wrappers.mjs'

export async function removeCommand ({ email, force = false } = {}) {
  ui.title(t('remove.title'))

  const all = await accounts.list()
  if (all.length === 0) {
    ui.info(t('list.empty'))
    return false
  }

  let target = null
  if (email) {
    target = all.find(a => a.email.toLowerCase() === String(email).toLowerCase()) || null
    if (!target) {
      ui.fail(t('err.no_such_account', { email }))
      return false
    }
  } else {
    const id = await ui.choose(t('remove.which'), all.map(a => ({ value: a.id, label: a.email })))
    target = all.find(a => a.id === id)
  }

  if (!force && !await ui.confirm(t('remove.confirm', { email: target.email }), { default: false })) {
    ui.info(t('remove.aborted'))
    return false
  }

  ui.info(t('remove.revoking'))
  if (await gws.logout(target.id, target.credSet)) {
    ui.ok(t('remove.revoked'))
  } else {
    ui.warn(t('remove.revoke_failed'))
    ui.info(t('remove.revoke_manual'))
  }

  await wrappers.removeFor(target.id)
  await accounts.remove(target.id)
  ui.ok(t('remove.deleted', { email: target.email }))
  return true
}
