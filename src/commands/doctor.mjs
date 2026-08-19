import fs from 'node:fs/promises'
import { t } from '../core/i18n.mjs'
import * as ui from '../core/ui.mjs'
import * as env from '../core/env.mjs'
import * as credsets from '../core/credsets.mjs'
import * as gws from '../core/gws.mjs'
import { backend } from '../core/secrets/index.mjs'
import { homeDir, ensureDir } from '../core/paths.mjs'

export async function doctorCommand ({ interactive = true } = {}) {
  ui.title(t('doctor.title'))

  let problems = 0
  let warnings = 0

  if (env.nodeOk()) {
    ui.ok(t('doctor.node_ok', { version: env.nodeVersion() }))
  } else {
    ui.fail(t('doctor.node_old', { version: env.nodeVersion() }))
    ui.info(t('doctor.node_install'))
    problems += 1
  }

  const cli = await gws.installed()
  if (cli.ok) {
    ui.ok(t('doctor.gws_ok', { version: cli.version }))
  } else {
    ui.warn(t('doctor.gws_missing'))
    const wanted = interactive && await ui.confirm(t('doctor.gws_install_offer'))
    if (wanted) {
      ui.info(t('doctor.gws_installing'))
      const installed = await env.installGws() && (await gws.installed()).ok
      if (installed) {
        ui.ok(t('doctor.gws_ok', { version: (await gws.installed()).version }))
      } else {
        ui.fail(t('doctor.gws_install_failed'))
        ui.info(t('doctor.gws_install_manual'))
        problems += 1
      }
    } else {
      ui.info(t('doctor.gws_install_manual'))
      problems += 1
    }
  }

  const store = await backend()
  if (await store.selfTest()) {
    ui.ok(t('doctor.secrets_ok', { backend: store.name }))
  } else {
    ui.fail(t('doctor.secrets_fail', { backend: store.name }))
    problems += 1
  }

  try {
    await ensureDir(homeDir())
    await fs.access(homeDir())
    ui.ok(t('doctor.state_ok', { dir: homeDir() }))
  } catch {
    ui.fail(t('doctor.state_fail', { dir: homeDir() }))
    problems += 1
  }

  const sets = await credsets.list()
  if (sets.length === 0) {
    ui.warn(t('doctor.creds_missing'))
    warnings += 1
  } else {
    for (const set of sets) ui.ok(t('doctor.creds_ok', { label: set.label }))
  }

  if (await env.reachable('https://accounts.google.com', 8000)) {
    ui.ok(t('doctor.net_ok'))
  } else {
    ui.warn(t('doctor.net_fail'))
    warnings += 1
  }

  ui.blank()
  if (problems > 0) ui.fail(t('doctor.problems', { count: problems }))
  else if (warnings > 0) ui.warn(t('doctor.warnings', { count: warnings }))
  else ui.ok(t('doctor.all_good'))

  return { problems, warnings }
}
