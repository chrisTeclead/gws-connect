// Account launchers carry absolute paths to node and the runner. After an
// update, or after someone moved the unzipped folder, those paths lead nowhere
// and every account fails silently. Rewriting them is cheap and touches
// neither tokens nor Google.
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as accounts from '../core/accounts.mjs'
import * as wrappers from '../core/wrappers.mjs'

export async function relinkCommand () {
  const all = await accounts.list()
  for (const account of all) await wrappers.write(account.id)
  ui.ok(t('relink.done', { count: all.length }))
  return all.length
}
