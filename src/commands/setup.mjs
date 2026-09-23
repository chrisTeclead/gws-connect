import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as credsets from '../core/credsets.mjs'
import { askDialog } from '../core/dialog.mjs'

// A truncated paste is the usual failure. Three tries covers "copied it
// again"; beyond that something else is wrong and a human should look.
export const DIALOG_TRIES = 3

function reason (error) {
  // CodeError carries the exact i18n key for what was wrong with the paste.
  return t(error.messageKey || 'err.code_json')
}

function imported (set) {
  ui.ok(t('setup.imported', { label: set.label }))
  ui.dim(t('setup.code_discarded'))
  ui.blank()
  ui.info(t('setup.next'))
}

async function fromDialog (prompt) {
  ui.info(t('setup.dialog_opening'))
  let text = t('setup.dialog_prompt')
  for (let attempt = 1; attempt <= DIALOG_TRIES; attempt += 1) {
    const answer = await prompt({
      title: t('setup.dialog_title'),
      prompt: text,
      ok: t('common.ok'),
      cancel: t('setup.dialog_cancel')
    })
    if (answer.status === 'unavailable') {
      ui.fail(t('setup.dialog_unavailable'))
      return 'unavailable'
    }
    if (answer.status !== 'ok' || !answer.value) {
      ui.fail(t('err.aborted'))
      return false
    }
    try {
      imported(await credsets.importCode(answer.value))
      return true
    } catch (error) {
      ui.fail(reason(error))
      text = `${reason(error)}\n\n${t('setup.dialog_retry')}`
    }
  }
  ui.fail(t('setup.dialog_gave_up'))
  return false
}

export async function setupCommand ({ code, dialog = false, prompt = askDialog } = {}) {
  ui.title(t('setup.title'))
  if (!code && dialog) return fromDialog(prompt)

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
    imported(await credsets.importCode(value))
    return true
  } catch (error) {
    ui.fail(reason(error))
    return false
  }
}
