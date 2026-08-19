import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as credsets from '../core/credsets.mjs'
import * as wrappers from '../core/wrappers.mjs'
import { isProven } from '../core/staleness.mjs'

function date (iso) {
  if (!iso) return t('common.never')
  return new Date(iso).toISOString().slice(0, 10)
}

export async function listCommand () {
  ui.title(t('list.title'))

  const all = await accounts.list()
  if (all.length === 0) {
    ui.info(t('list.empty'))
    ui.info(t('list.empty_next'))
    return { total: 0, usable: 0 }
  }

  const sets = await credsets.list()
  const labelOf = (id) => sets.find(s => s.id === id)?.label || id
  let usable = 0

  for (const meta of all) {
    ui.line(meta.email)
    ui.dim(t('list.services', { services: meta.services.join(', ') }))
    ui.dim(t('list.credset', { label: labelOf(meta.credSet) }))
    ui.dim(t('list.connected_at', { date: date(meta.connectedAt) }))
    if (isProven(meta)) {
      ui.ok(t('stale.proven'))
    } else {
      if (meta.verifiedAt) ui.dim(t('list.verified_at', { date: date(meta.verifiedAt) }))
      ui.warn(t('list.not_verified'))
    }
    usable += 1
    ui.dim(wrappers.wrapperPath(meta.id))
    ui.blank()
  }

  ui.info(t('list.summary', { usable, total: all.length }))
  return { total: all.length, usable }
}
