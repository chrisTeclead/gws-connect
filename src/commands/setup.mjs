import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as credsets from '../core/credsets.mjs'

export async function setupCommand ({ code } = {}) {
  ui.title(t('setup.title'))

  let value = code
  if (!value) {
    ui.info(t('setup.need_code'))
    ui.warn(t('setup.code_is_secret'))
    ui.blank()
    value = await ui.ask(t('setup.code_prompt'))
  }
  if (!value) {
    ui.fail(t('err.aborted'))
    return false
  }

  try {
    const set = await credsets.importCode(value)
    ui.ok(t('setup.imported', { label: set.label }))
    ui.dim(t('setup.code_discarded'))
    ui.blank()
    ui.info(t('setup.next'))
    return true
  } catch (error) {
    // CodeError carries the exact i18n key for what was wrong with the paste.
    ui.fail(t(error.messageKey || 'err.code_json'))
    return false
  }
}
